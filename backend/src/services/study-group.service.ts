import mongoose, { Types } from "mongoose";
import EnrollmentModel from "../models/enrollment.model";
import StudyGroupModel, {
    StudyGroupDocument,
} from "../models/study-group.model";
import SubjectModel from "../models/subject.model";
import {
    ConflictException,
    InternalServerException,
    NotFoundException,
} from "../utils/app-error";
import { createPaginationMetadata } from "../utils/pagination";
import {
    CreateStudyGroupInput,
    StudyGroupListQuery,
    UpdateStudyGroupInput,
} from "../validators/study-group.validation";

const ensureSubjectExists = async (
    workspaceId: Types.ObjectId,
    subjectId: string
): Promise<void> => {
    const subject = await SubjectModel.exists({
        _id: subjectId,
        workspaceId,
    });

    if (!subject) {
        throw new NotFoundException("Subject not found");
    }
};

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listStudyGroupsService = async (
    workspaceId: Types.ObjectId,
    query: StudyGroupListQuery
) => {
    if (query.subjectId) {
        await ensureSubjectExists(workspaceId, query.subjectId);
    }

    const filter: {
        workspaceId: Types.ObjectId;
        subjectId?: string;
        status?: StudyGroupDocument["status"];
        $or?: Array<{ name: RegExp } | { description: RegExp }>;
    } = { workspaceId };

    if (query.subjectId) {
        filter.subjectId = query.subjectId;
    }

    if (query.status !== undefined) {
        filter.status = query.status;
    }

    if (query.search) {
        const search = new RegExp(escapeRegex(query.search), "i");
        filter.$or = [{ name: search }, { description: search }];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        StudyGroupModel.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        StudyGroupModel.countDocuments(filter),
    ]);

    if (items.length > 0) {
        const subjects = await SubjectModel.find({
            workspaceId,
            _id: { $in: items.map((item) => item.subjectId) },
        });
        const subjectIds = new Set(
            subjects.map((subject) => subject._id.toString())
        );

        if (
            items.some((item) => !subjectIds.has(item.subjectId.toString()))
        ) {
            throw new InternalServerException();
        }
    }

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const createStudyGroupService = async (
    workspaceId: Types.ObjectId,
    input: CreateStudyGroupInput
) => {
    await ensureSubjectExists(workspaceId, input.subjectId);

    return StudyGroupModel.create({
        ...input,
        monthlyFee: Types.Decimal128.fromString(input.monthlyFee),
        workspaceId,
    });
};

export const getStudyGroupByIdService = async (
    workspaceId: Types.ObjectId,
    groupId: string
) => {
    const group = await StudyGroupModel.findOne({
        _id: groupId,
        workspaceId,
    });

    if (!group) {
        throw new NotFoundException("Study group not found");
    }

    const subject = await SubjectModel.exists({
        _id: group.subjectId,
        workspaceId,
    });

    if (!subject) {
        throw new NotFoundException("Study group not found");
    }

    return group;
};

export const updateStudyGroupService = async (
    workspaceId: Types.ObjectId,
    groupId: string,
    input: UpdateStudyGroupInput
) => {
    if (input.subjectId) {
        await ensureSubjectExists(workspaceId, input.subjectId);
    } else if (input.capacity === undefined || input.capacity === null) {
        await getStudyGroupByIdService(workspaceId, groupId);
    }

    const update = {
        ...input,
        ...(input.monthlyFee !== undefined
            ? {
                  monthlyFee: Types.Decimal128.fromString(input.monthlyFee),
              }
            : {}),
    };

    if (input.capacity === undefined || input.capacity === null) {
        const group = await StudyGroupModel.findOneAndUpdate(
            {
                _id: groupId,
                workspaceId,
            },
            { $set: update },
            {
                returnDocument: "after",
                runValidators: true,
            }
        );

        if (!group) {
            throw new NotFoundException("Study group not found");
        }

        return group;
    }

    const capacity = input.capacity;
    const session = await mongoose.startSession();

    try {
        const group = await session.withTransaction(async () => {
            const currentGroup = await StudyGroupModel.findOne({
                _id: groupId,
                workspaceId,
            }).session(session);

            if (!currentGroup) {
                throw new NotFoundException("Study group not found");
            }

            const subject = await SubjectModel.exists({
                _id: currentGroup.subjectId,
                workspaceId,
            }).session(session);

            if (!subject) {
                throw new NotFoundException("Study group not found");
            }

            const updatedGroup = await StudyGroupModel.findOneAndUpdate(
                {
                    _id: groupId,
                    workspaceId,
                },
                { $set: update },
                {
                    returnDocument: "after",
                    runValidators: true,
                    session,
                }
            );

            if (!updatedGroup) {
                throw new NotFoundException("Study group not found");
            }

            const activeEnrollmentCount = await EnrollmentModel.countDocuments({
                workspaceId,
                groupId: currentGroup._id,
                status: "active",
            }).session(session);

            if (activeEnrollmentCount > capacity) {
                throw new ConflictException(
                    "Capacity cannot be lower than the active enrollment count"
                );
            }

            return updatedGroup;
        });

        if (!group) {
            throw new InternalServerException();
        }

        return group;
    } finally {
        await session.endSession();
    }
};
