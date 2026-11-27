import type { AttendanceRecordDocument } from "../models/attendance-record.model";
import type { StudentDocument } from "../models/student.model";
import { serializeDate } from "../utils/serialization";

export interface StudentProfileDto {
    name: string;
    email: string | null;
    phone: string | null;
    schoolName: string | null;
    grade: string | null;
}

export interface StudentPortalGroupDto {
    name: string;
    subjectName: string | null;
    enrolledAt: string;
    status: "active";
}

export interface StudentOverviewDto {
    studentName: string;
    activeGroupCount: number;
    upcomingSessionCount: number;
    upcomingSessions: Array<{
        title: string;
        groupName: string;
        startsAt: string;
    }>;
    attendanceSummary: {
        total: number;
        present: number;
        absent: number;
        late: number;
        excused: number;
    };
    recentAttendance: Array<{
        status: AttendanceRecordDocument["status"];
        recordedAt: string;
    }>;
}

const nullableText = (value: string | null | undefined): string | null =>
    value?.trim() || null;

export const toStudentProfileDto = (
    student: Pick<
        StudentDocument,
        "name" | "email" | "phone" | "schoolName" | "grade"
    >
): StudentProfileDto => ({
    name: student.name,
    email: nullableText(student.email),
    phone: nullableText(student.phone),
    schoolName: nullableText(student.schoolName),
    grade: nullableText(student.grade),
});

export const toStudentRecentAttendanceDto = (
    record: Pick<AttendanceRecordDocument, "status" | "recordedAt">
): StudentOverviewDto["recentAttendance"][number] => ({
    status: record.status,
    recordedAt: serializeDate(record.recordedAt),
});
