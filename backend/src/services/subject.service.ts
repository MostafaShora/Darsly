import { Types } from "mongoose";
import SubjectModel, { SubjectDocument } from "../models/subject.model";
import { createPaginationMetadata } from "../utils/pagination";
import { NotFoundException } from "../utils/app-error";
import {
    CreateSubjectInput,
    SubjectListQuery,
    UpdateSubjectInput,
} from "../validators/subject.validation";

export const listSubjectsService = async (
    workspaceId: Types.ObjectId,
    query: SubjectListQuery
) => {
    const filter: {
        workspaceId: Types.ObjectId;
        status?: SubjectDocument["status"];
        $or?: Array<{ name: RegExp } | { description: RegExp }>;
    } = { workspaceId };

    if (query.status !== undefined) {
        filter.status = query.status;
    }

    if (query.search) {
        const search = new RegExp(
            query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i"
        );
        filter.$or = [{ name: search }, { description: search }];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        SubjectModel.find(filter)
            .sort({ name: 1, _id: 1 })
            .skip(skip)
            .limit(query.pageSize),
        SubjectModel.countDocuments(filter),
    ]);

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const createSubjectService = (
    workspaceId: Types.ObjectId,
    input: CreateSubjectInput
) =>
    SubjectModel.create({
        ...input,
        workspaceId,
    });

export const getSubjectByIdService = async (
    workspaceId: Types.ObjectId,
    subjectId: string
) => {
    const subject = await SubjectModel.findOne({
        _id: subjectId,
        workspaceId,
    });

    if (!subject) {
        throw new NotFoundException("Subject not found");
    }

    return subject;
};

export const updateSubjectService = async (
    workspaceId: Types.ObjectId,
    subjectId: string,
    input: UpdateSubjectInput
) => {
    const subject = await SubjectModel.findOneAndUpdate(
        {
            _id: subjectId,
            workspaceId,
        },
        { $set: input },
        {
            returnDocument: "after",
            runValidators: true,
        }
    );

    if (!subject) {
        throw new NotFoundException("Subject not found");
    }

    return subject;
};
