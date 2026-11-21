import { Types } from "mongoose";
import StudentModel, { StudentDocument } from "../models/student.model";
import { createPaginationMetadata } from "../utils/pagination";
import {
    CreateStudentInput,
    StudentListQuery,
    UpdateStudentInput,
} from "../validators/student.validation";
import { NotFoundException } from "../utils/app-error";

const escapeRegex = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listStudentsService = async (
    workspaceId: Types.ObjectId,
    query: StudentListQuery
) => {
    const search = query.search
        ? new RegExp(escapeRegex(query.search), "i")
        : undefined;
    const filter: {
        workspaceId: Types.ObjectId;
        status?: StudentDocument["status"];
        $or?: Array<
            | { name: RegExp }
            | { phone: RegExp }
            | { email: RegExp }
            | { schoolName: RegExp }
            | { grade: RegExp }
        >;
    } = { workspaceId };

    if (query.status !== undefined) {
        filter.status = query.status;
    }

    if (search) {
        filter.$or = [
            { name: search },
            { phone: search },
            { email: search },
            { schoolName: search },
            { grade: search },
        ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        StudentModel.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        StudentModel.countDocuments(filter),
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

export const createStudentService = async (
    workspaceId: Types.ObjectId,
    input: CreateStudentInput
) =>
    StudentModel.create({
        ...input,
        workspaceId,
    });

export const getStudentByIdService = async (
    workspaceId: Types.ObjectId,
    studentId: string
) => {
    const student = await StudentModel.findOne({
        _id: studentId,
        workspaceId,
    });

    if (!student) {
        throw new NotFoundException("Student not found");
    }

    return student;
};

export const updateStudentService = async (
    workspaceId: Types.ObjectId,
    studentId: string,
    input: UpdateStudentInput
) => {
    const student = await StudentModel.findOneAndUpdate(
        {
            _id: studentId,
            workspaceId,
        },
        { $set: input },
        {
            returnDocument: "after",
            runValidators: true,
        }
    );

    if (!student) {
        throw new NotFoundException("Student not found");
    }

    return student;
};
