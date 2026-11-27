import type { StudentInvitationDocument } from "../models/student-invitation.model";
import { serializeDate } from "../utils/serialization";

export type StudentInvitationStatus =
    | "active"
    | "expired"
    | "revoked"
    | "consumed";

export interface StudentInvitationDto {
    id: string;
    workspaceId: string;
    studentId: string;
    status: StudentInvitationStatus;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export const getStudentInvitationStatus = (
    invitation:     Pick<
        StudentInvitationDocument,
        "expiresAt" | "revokedAt" | "consumedAt"
    >,
    now: Date = new Date()
): StudentInvitationStatus => {
    if (invitation.consumedAt) {
        return "consumed";
    }
    if (invitation.revokedAt) {
        return "revoked";
    }

    return now.getTime() >= invitation.expiresAt.getTime()
        ? "expired"
        : "active";
};

export const toStudentInvitationDto = (
    invitation: StudentInvitationDocument,
    now: Date = new Date()
): StudentInvitationDto => ({
    id: invitation._id.toString(),
    workspaceId: invitation.workspaceId.toString(),
    studentId: invitation.studentId.toString(),
    status: getStudentInvitationStatus(invitation, now),
    expiresAt: serializeDate(invitation.expiresAt),
    revokedAt: invitation.revokedAt
        ? serializeDate(invitation.revokedAt)
        : null,
    createdAt: serializeDate(invitation.createdAt),
    updatedAt: serializeDate(invitation.updatedAt),
});
