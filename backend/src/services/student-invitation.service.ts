import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import StudentInvitationModel, {
    StudentInvitationDocument,
} from "../models/student-invitation.model";
import StudentModel from "../models/student.model";
import { ConflictException, NotFoundException } from "../utils/app-error";
import { createPaginationMetadata } from "../utils/pagination";
import { assertValidObjectId } from "./workspace-access.service";
import {
    StudentInvitationListQuery,
} from "../validators/student-invitation.validation";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000;

export interface CreatedStudentInvitation {
    invitation: StudentInvitationDocument;
    invitationSecret: string;
}

export const createStudentInvitationService = async (
    workspaceId: Types.ObjectId,
    creatorUserId: string,
    studentId: string
): Promise<CreatedStudentInvitation> => {
    assertValidObjectId(studentId, "student ID");

    const student = await StudentModel.findOne({
        _id: studentId,
        workspaceId,
        status: "active",
    });

    if (!student) {
        throw new NotFoundException("Student not found");
    }

    const createdAt = new Date();
    const expiresAt = new Date(
        createdAt.getTime() + INVITATION_LIFETIME_MS
    );
    const invitationSecret = randomBytes(32).toString("hex");
    const secretHash = createHash("sha256")
        .update(invitationSecret, "utf8")
        .digest("hex");

    try {
        const [invitation] = await StudentInvitationModel.create([
            {
                workspaceId,
                studentId: new Types.ObjectId(studentId),
                secretHash,
                createdBy: new Types.ObjectId(creatorUserId),
                expiresAt,
                revokedAt: null,
                revokedBy: null,
                createdAt,
                updatedAt: createdAt,
            },
        ]);

        return { invitation, invitationSecret };
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw new ConflictException("Unable to create invitation");
        }

        throw error;
    }
};

export const listStudentInvitationsService = async (
    workspaceId: Types.ObjectId,
    query: StudentInvitationListQuery
) => {
    const filter = {
        workspaceId,
        ...(query.studentId
            ? { studentId: new Types.ObjectId(query.studentId) }
            : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        StudentInvitationModel.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        StudentInvitationModel.countDocuments(filter),
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

export const getStudentInvitationService = async (
    workspaceId: Types.ObjectId,
    invitationId: string
): Promise<StudentInvitationDocument> => {
    const invitation = await StudentInvitationModel.findOne({
        _id: invitationId,
        workspaceId,
    });

    if (!invitation) {
        throw new NotFoundException("Invitation not found");
    }

    return invitation;
};

export const revokeStudentInvitationService = async (
    workspaceId: Types.ObjectId,
    invitationId: string,
    revokingUserId: string
): Promise<StudentInvitationDocument> => {
    const now = new Date();
    const invitation = await StudentInvitationModel.findOneAndUpdate(
        {
            _id: invitationId,
            workspaceId,
            revokedAt: null,
            consumedAt: null,
            expiresAt: { $gt: now },
        },
        {
            $set: {
                revokedAt: now,
                revokedBy: new Types.ObjectId(revokingUserId),
            },
        },
        {
            returnDocument: "after",
            runValidators: true,
        }
    );

    if (invitation) {
        return invitation;
    }

    const existing = await StudentInvitationModel.findOne({
        _id: invitationId,
        workspaceId,
    });

    if (!existing) {
        throw new NotFoundException("Invitation not found");
    }

    throw new ConflictException(
        "Invitation is expired, revoked, or already consumed"
    );
};
