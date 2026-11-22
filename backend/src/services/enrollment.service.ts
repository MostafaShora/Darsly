import mongoose, { Types } from "mongoose";
import EnrollmentModel, {
    EnrollmentDocument,
} from "../models/enrollment.model";
import StudyGroupModel from "../models/study-group.model";
import StudentModel from "../models/student.model";
import SubjectModel from "../models/subject.model";
import {
    ConflictException,
    InternalServerException,
    NotFoundException,
} from "../utils/app-error";
import { createPaginationMetadata } from "../utils/pagination";
import {
    CreateEnrollmentInput,
    GroupEnrollmentListQuery,
    EnrollmentListQuery,
    UpdateEnrollmentInput,
} from "../validators/enrollment.validation";

const ensureStudentExists = async (
    workspaceId: Types.ObjectId,
    studentId: string,
    session?: mongoose.ClientSession
): Promise<void> => {
    const query = StudentModel.exists({
        _id: studentId,
        workspaceId,
    });
    const student = session ? await query.session(session) : await query;

    if (!student) {
        throw new NotFoundException("Student not found");
    }
};

const getStudyGroup = async (
    workspaceId: Types.ObjectId,
    groupId: string,
    session?: mongoose.ClientSession
) => {
    const query = StudyGroupModel.findOne({
        _id: groupId,
        workspaceId,
    });
    const group = session ? await query.session(session) : await query;

    if (!group) {
        throw new NotFoundException("Study group not found");
    }

    const subjectQuery = SubjectModel.exists({
        _id: group.subjectId,
        workspaceId,
    });
    const subject = session
        ? await subjectQuery.session(session)
        : await subjectQuery;

    if (!subject) {
        throw new NotFoundException("Study group not found");
    }

    return group;
};

const lockGroupAndCountActiveEnrollments = async (
    workspaceId: Types.ObjectId,
    group: Awaited<ReturnType<typeof getStudyGroup>>,
    session: mongoose.ClientSession
): Promise<number> => {
    const lockedGroup = await StudyGroupModel.findOneAndUpdate(
        {
            _id: group._id,
            workspaceId,
            updatedAt: group.updatedAt,
        },
        {
            $set: {
                updatedAt: new Date(
                    Math.max(Date.now(), group.updatedAt.getTime() + 1)
                ),
            },
        },
        {
            returnDocument: "after",
            session,
            timestamps: false,
        }
    );

    if (!lockedGroup) {
        throw new NotFoundException("Study group not found");
    }

    return EnrollmentModel.countDocuments({
        workspaceId,
        groupId: group._id,
        status: "active",
    }).session(session);
};

const assertCapacityAvailable = (
    capacity: number | null,
    activeEnrollmentCount: number
): void => {
    if (capacity !== null && activeEnrollmentCount >= capacity) {
        throw new ConflictException("Study group is at capacity");
    }
};

const ensureEnrollmentReferences = async (
    workspaceId: Types.ObjectId,
    enrollment: EnrollmentDocument,
    session?: mongoose.ClientSession
): Promise<Awaited<ReturnType<typeof getStudyGroup>>> => {
    const studentQuery = StudentModel.exists({
        _id: enrollment.studentId,
        workspaceId,
    });
    const groupQuery = StudyGroupModel.findOne({
        _id: enrollment.groupId,
        workspaceId,
    });
    const [student, group] = await Promise.all([
        session ? studentQuery.session(session) : studentQuery,
        session ? groupQuery.session(session) : groupQuery,
    ]);

    if (!student || !group) {
        throw new NotFoundException("Enrollment not found");
    }

    const subjectQuery = SubjectModel.exists({
        _id: group.subjectId,
        workspaceId,
    });
    const subject = session
        ? await subjectQuery.session(session)
        : await subjectQuery;

    if (!subject) {
        throw new NotFoundException("Enrollment not found");
    }

    return group;
};

const assertPageReferences = async (
    workspaceId: Types.ObjectId,
    enrollments: EnrollmentDocument[]
): Promise<void> => {
    if (enrollments.length === 0) {
        return;
    }

    const [students, groups] = await Promise.all([
        StudentModel.find({
            workspaceId,
            _id: {
                $in: enrollments.map((enrollment) => enrollment.studentId),
            },
        }),
        StudyGroupModel.find({
            workspaceId,
            _id: { $in: enrollments.map((enrollment) => enrollment.groupId) },
        }),
    ]);
    const subjects =
        groups.length > 0
            ? await SubjectModel.find({
                  workspaceId,
                  _id: { $in: groups.map((group) => group.subjectId) },
              })
            : [];
    const studentIds = new Set(
        students.map((student) => student._id.toString())
    );
    const groupIds = new Set(groups.map((group) => group._id.toString()));
    const subjectIds = new Set(
        subjects.map((subject) => subject._id.toString())
    );

    if (
        enrollments.some(
            (enrollment) =>
                !studentIds.has(enrollment.studentId.toString()) ||
                !groupIds.has(enrollment.groupId.toString())
        ) ||
        groups.some((group) => !subjectIds.has(group.subjectId.toString()))
    ) {
        throw new InternalServerException();
    }
};

export const listEnrollmentsService = async (
    workspaceId: Types.ObjectId,
    query: EnrollmentListQuery
) => {
    if (query.studentId) {
        await ensureStudentExists(workspaceId, query.studentId);
    }

    if (query.groupId) {
        await getStudyGroup(workspaceId, query.groupId);
    }

    const filter: {
        workspaceId: Types.ObjectId;
        studentId?: string;
        groupId?: string;
        status?: EnrollmentDocument["status"];
    } = { workspaceId };

    if (query.studentId) {
        filter.studentId = query.studentId;
    }

    if (query.groupId) {
        filter.groupId = query.groupId;
    }

    if (query.status !== undefined) {
        filter.status = query.status;
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        EnrollmentModel.find(filter)
            .sort({ enrolledAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        EnrollmentModel.countDocuments(filter),
    ]);

    await assertPageReferences(workspaceId, items);

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const listGroupEnrollmentsService = async (
    workspaceId: Types.ObjectId,
    groupId: string,
    query: GroupEnrollmentListQuery
) => {
    return listEnrollmentsService(workspaceId, {
        ...query,
        groupId,
    });
};

export const createEnrollmentService = async (
    workspaceId: Types.ObjectId,
    groupId: string,
    input: CreateEnrollmentInput
) => {
    const session = await mongoose.startSession();

    try {
        const enrollment = await session.withTransaction(async () => {
            const group = await getStudyGroup(workspaceId, groupId, session);
            await ensureStudentExists(workspaceId, input.studentId, session);

            const status = input.status ?? "active";
            if (status === "active") {
                const activeEnrollmentCount =
                    await lockGroupAndCountActiveEnrollments(
                        workspaceId,
                        group,
                        session
                    );
                assertCapacityAvailable(group.capacity, activeEnrollmentCount);
            }

            const [created] = await EnrollmentModel.create(
                [
                    {
                        workspaceId,
                        studentId: new Types.ObjectId(input.studentId),
                        groupId: group._id,
                        ...(input.enrolledAt !== undefined
                            ? { enrolledAt: input.enrolledAt }
                            : {}),
                        ...(input.notes !== undefined
                            ? { notes: input.notes }
                            : {}),
                        status,
                    },
                ],
                { session }
            );

            if (!created) {
                throw new InternalServerException();
            }

            return created;
        });

        if (!enrollment) {
            throw new InternalServerException();
        }

        return enrollment;
    } finally {
        await session.endSession();
    }
};

export const getEnrollmentByIdService = async (
    workspaceId: Types.ObjectId,
    enrollmentId: string
) => {
    const enrollment = await EnrollmentModel.findOne({
        _id: enrollmentId,
        workspaceId,
    });

    if (!enrollment) {
        throw new NotFoundException("Enrollment not found");
    }

    await ensureEnrollmentReferences(workspaceId, enrollment);

    return enrollment;
};

export const updateEnrollmentService = async (
    workspaceId: Types.ObjectId,
    enrollmentId: string,
    input: UpdateEnrollmentInput
) => {
    const session = await mongoose.startSession();

    try {
        const enrollment = await session.withTransaction(async () => {
            const query = EnrollmentModel.findOne({
                _id: enrollmentId,
                workspaceId,
            });
            const currentEnrollment = await query.session(session);

            if (!currentEnrollment) {
                throw new NotFoundException("Enrollment not found");
            }

            const group = await ensureEnrollmentReferences(
                workspaceId,
                currentEnrollment,
                session
            );

            const nextStatus = input.status ?? currentEnrollment.status;
            if (
                currentEnrollment.status !== "active" &&
                nextStatus === "active"
            ) {
                const activeEnrollmentCount =
                    await lockGroupAndCountActiveEnrollments(
                        workspaceId,
                        group,
                        session
                    );
                assertCapacityAvailable(group.capacity, activeEnrollmentCount);
            }

            if (input.status !== undefined) {
                currentEnrollment.status = input.status;
            }

            if (input.endedAt !== undefined) {
                currentEnrollment.endedAt = input.endedAt;
            }

            if (input.notes !== undefined) {
                currentEnrollment.notes = input.notes;
            }

            return currentEnrollment.save({ session });
        });

        if (!enrollment) {
            throw new InternalServerException();
        }

        return enrollment;
    } finally {
        await session.endSession();
    }
};
