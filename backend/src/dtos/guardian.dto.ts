import type { GuardianDocument } from "../models/guardian.model";
import type { StudentGuardianDocument } from "../models/student-guardian.model";
import { serializeDate } from "../utils/serialization";

export interface GuardianDto {
    id: string;
    name: string;
    phone: string;
    alternatePhone: string | null;
    email: string | null;
    relationship: GuardianDocument["relationship"];
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export type GuardianSummaryDto = Omit<GuardianDto, "relationship">;

export interface StudentGuardianDto {
    guardian: GuardianSummaryDto;
    relationship: StudentGuardianDocument["relationship"];
    isPrimary: boolean;
    receivesNotifications: boolean;
    createdAt: string;
    updatedAt: string;
}

export const toGuardianDto = (guardian: GuardianDocument): GuardianDto => ({
    id: guardian._id.toString(),
    name: guardian.name,
    phone: guardian.phone,
    alternatePhone: guardian.alternatePhone ?? null,
    email: guardian.email ?? null,
    relationship: guardian.relationship,
    notes: guardian.notes ?? "",
    createdAt: serializeDate(guardian.createdAt),
    updatedAt: serializeDate(guardian.updatedAt),
});

export const toGuardianSummaryDto = (
    guardian: GuardianDocument
): GuardianSummaryDto => ({
    id: guardian._id.toString(),
    name: guardian.name,
    phone: guardian.phone,
    alternatePhone: guardian.alternatePhone ?? null,
    email: guardian.email ?? null,
    notes: guardian.notes ?? "",
    createdAt: serializeDate(guardian.createdAt),
    updatedAt: serializeDate(guardian.updatedAt),
});

export const toStudentGuardianDto = (
    link: StudentGuardianDocument,
    guardian: GuardianDocument
): StudentGuardianDto => ({
    guardian: toGuardianSummaryDto(guardian),
    relationship: link.relationship,
    isPrimary: link.isPrimary,
    receivesNotifications: link.canReceiveNotifications,
    createdAt: serializeDate(link.createdAt),
    updatedAt: serializeDate(link.updatedAt),
});
