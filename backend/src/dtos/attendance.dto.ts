import type { AttendanceRecordDocument } from "../models/attendance-record.model";
import { serializeDate } from "../utils/serialization";

export interface AttendanceRecordDto {
    id: string;
    sessionId: string;
    studentId: string;
    status: AttendanceRecordDocument["status"];
    lateMinutes: number;
    notes: string;
    recordedAt: string;
    createdAt: string;
    updatedAt: string;
}

export const toAttendanceRecordDto = (
    record: AttendanceRecordDocument
): AttendanceRecordDto => ({
    id: record._id.toString(),
    sessionId: record.sessionId.toString(),
    studentId: record.studentId.toString(),
    status: record.status,
    lateMinutes: record.lateMinutes,
    notes: record.notes,
    recordedAt: serializeDate(record.recordedAt),
    createdAt: serializeDate(record.createdAt),
    updatedAt: serializeDate(record.updatedAt),
});
