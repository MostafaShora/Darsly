import StudentAccountLinkModel from "../models/student-account-link.model";
import StudentModel from "../models/student.model";
import WorkspaceModel from "../models/workspace.model";
import {
    getActiveUser,
} from "./workspace-access.service";
import {
    hasUserCapability,
    requireUserCapability,
} from "./user-capability.service";
import { isValidObjectId } from "../utils/object-id";
import { NotFoundException } from "../utils/app-error";

export interface StudentContextDto {
    studentAccountLinkId: string;
    studentName: string;
    workspaceName: string;
}

export interface StudentAccessContext extends StudentContextDto {
    userId: string;
    studentId: string;
    workspaceId: string;
}

const STUDENT_ACCESS_NOT_FOUND = "Student access not found";

const resolveContextForLink = async (
    userId: string,
    link: {
        _id: { toString(): string };
        studentId: { toString(): string };
        workspaceId: { toString(): string };
    }
): Promise<StudentAccessContext | null> => {
    const studentId = link.studentId.toString();
    const workspaceId = link.workspaceId.toString();
    const [student, workspace] = await Promise.all([
        StudentModel.findOne({
            _id: studentId,
            workspaceId,
            status: "active",
        }).select("_id name"),
        WorkspaceModel.findOne({
            _id: workspaceId,
            status: "active",
        }).select("_id name"),
    ]);

    if (!student || !workspace) {
        return null;
    }

    return {
        studentAccountLinkId: link._id.toString(),
        userId,
        studentId,
        workspaceId,
        studentName: student.name,
        workspaceName: workspace.name,
    };
};

const requireActiveStudentUser = async (userId: string): Promise<void> => {
    const user = await getActiveUser(userId);
    requireUserCapability(user, "student");
};

export const listActiveStudentContextsService = async (
    userId: string
): Promise<StudentContextDto[]> => {
    const user = await getActiveUser(userId);
    if (!hasUserCapability(user, "student")) {
        return [];
    }

    const links = await StudentAccountLinkModel.find({
        userId,
        status: "active",
    })
        .select("_id studentId workspaceId")
        .sort({ createdAt: 1, _id: 1 });
    const contexts: StudentContextDto[] = [];

    for (const link of links) {
        const context = await resolveContextForLink(userId, link);
        if (context) {
            contexts.push({
                studentAccountLinkId: context.studentAccountLinkId,
                studentName: context.studentName,
                workspaceName: context.workspaceName,
            });
        }
    }

    return contexts;
};

export const resolveStudentAccessContextService = async (
    userId: string,
    studentAccountLinkId: string
): Promise<StudentAccessContext> => {
    await requireActiveStudentUser(userId);

    if (!isValidObjectId(studentAccountLinkId)) {
        throw new NotFoundException(STUDENT_ACCESS_NOT_FOUND);
    }

    const link = await StudentAccountLinkModel.findOne({
        _id: studentAccountLinkId,
        userId,
        status: "active",
    }).select("_id studentId workspaceId");

    if (!link) {
        throw new NotFoundException(STUDENT_ACCESS_NOT_FOUND);
    }

    const context = await resolveContextForLink(userId, link);
    if (!context) {
        throw new NotFoundException(STUDENT_ACCESS_NOT_FOUND);
    }

    return context;
};

export const toStudentContextDto = (
    context: StudentAccessContext
): StudentContextDto => ({
    studentAccountLinkId: context.studentAccountLinkId,
    studentName: context.studentName,
    workspaceName: context.workspaceName,
});
