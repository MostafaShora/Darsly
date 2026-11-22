import type { EnrollmentDocument } from "../models/enrollment.model";
import { serializeDate } from "../utils/serialization";

export interface EnrollmentDto {
    id: string;
    studentId: string;
    groupId: string;
    enrolledAt: string;
    endedAt: string | null;
    status: EnrollmentDocument["status"];
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export const toEnrollmentDto = (
    enrollment: EnrollmentDocument
): EnrollmentDto => ({
    id: enrollment._id.toString(),
    studentId: enrollment.studentId.toString(),
    groupId: enrollment.groupId.toString(),
    enrolledAt: serializeDate(enrollment.enrolledAt),
    endedAt: enrollment.endedAt
        ? serializeDate(enrollment.endedAt)
        : null,
    status: enrollment.status,
    notes: enrollment.notes,
    createdAt: serializeDate(enrollment.createdAt),
    updatedAt: serializeDate(enrollment.updatedAt),
});
