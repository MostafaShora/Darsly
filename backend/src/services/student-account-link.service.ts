import { Types } from "mongoose";
import StudentAccountLinkModel from "../models/student-account-link.model";
import StudentModel, { StudentDocument } from "../models/student.model";
import WorkspaceModel, { WorkspaceDocument } from "../models/workspace.model";
import {
    ConflictException,
    NotFoundException,
} from "../utils/app-error";
import { assertValidObjectId, getActiveUser } from "./workspace-access.service";
import { requireUserCapability } from "./user-capability.service";

export interface StudentAccountAccess {
    student: StudentDocument;
    workspace: WorkspaceDocument;
}

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000;

const getActiveStudentUser = async (userId: string) => {
    const user = await getActiveUser(userId);
    requireUserCapability(user, "student");
    return user;
};

export const createStudentAccountLinkService = async (
    userId: string,
    workspaceId: string,
    studentId: string
): Promise<void> => {
    assertValidObjectId(workspaceId, "workspace ID");
    assertValidObjectId(studentId, "student ID");
    await getActiveStudentUser(userId);

    const student = await StudentModel.findOne({
        _id: studentId,
        workspaceId,
        status: "active",
    });

    if (!student) {
        throw new NotFoundException("Student not found");
    }

    const existingLink = await StudentAccountLinkModel.findOne({
        $or: [
            { workspaceId, studentId },
            { userId, studentId },
        ],
    });

    if (existingLink) {
        throw new ConflictException("Student account link already exists");
    }

    try {
        await StudentAccountLinkModel.create({
            userId: new Types.ObjectId(userId),
            workspaceId: new Types.ObjectId(workspaceId),
            studentId: new Types.ObjectId(studentId),
            status: "pending",
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw new ConflictException("Student account link already exists");
        }

        throw error;
    }
};

export const resolveStudentAccountAccessService = async (
    userId: string,
    workspaceId: string,
    studentId: string
): Promise<StudentAccountAccess> => {
    assertValidObjectId(workspaceId, "workspace ID");
    assertValidObjectId(studentId, "student ID");
    await getActiveStudentUser(userId);

    const link = await StudentAccountLinkModel.findOne({
        userId,
        workspaceId,
        studentId,
        status: "active",
    });

    if (!link) {
        throw new NotFoundException("Student access not found");
    }

    const student = await StudentModel.findOne({
        _id: link.studentId,
        workspaceId: link.workspaceId,
        status: "active",
    });
    const workspace = await WorkspaceModel.findOne({
        _id: link.workspaceId,
        status: "active",
    });

    if (
        !student ||
        student.status !== "active" ||
        !workspace ||
        workspace.status !== "active"
    ) {
        throw new NotFoundException("Student access not found");
    }

    return { student, workspace };
};

export const listActiveStudentAccountAccessesService = async (
    userId: string
): Promise<StudentAccountAccess[]> => {
    await getActiveStudentUser(userId);

    const links = await StudentAccountLinkModel.find({
        userId,
        status: "active",
    });
    const accesses: StudentAccountAccess[] = [];

    for (const link of links) {
        const student = await StudentModel.findOne({
            _id: link.studentId,
            workspaceId: link.workspaceId,
            status: "active",
        });
        const workspace = await WorkspaceModel.findOne({
            _id: link.workspaceId,
            status: "active",
        });

        if (
            student?.status === "active" &&
            workspace?.status === "active"
        ) {
            accesses.push({ student, workspace });
        }
    }

    return accesses;
};
