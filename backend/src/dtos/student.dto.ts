import type { StudentDocument } from "../models/student.model";
import { serializeDate } from "../utils/serialization";

export interface StudentDto {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    schoolName: string;
    grade: string;
    status: StudentDocument["status"];
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export const toStudentDto = (student: StudentDocument): StudentDto => ({
    id: student._id.toString(),
    name: student.name,
    phone: student.phone ?? null,
    email: student.email ?? null,
    schoolName: student.schoolName ?? "",
    grade: student.grade ?? "",
    status: student.status,
    notes: student.notes ?? "",
    createdAt: serializeDate(student.createdAt),
    updatedAt: serializeDate(student.updatedAt),
});
