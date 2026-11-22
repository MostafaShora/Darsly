import type { SubjectDocument } from "../models/subject.model";
import { serializeDate } from "../utils/serialization";

export interface SubjectDto {
    id: string;
    name: string;
    description: string;
    status: SubjectDocument["status"];
    createdAt: string;
    updatedAt: string;
}

export const toSubjectDto = (subject: SubjectDocument): SubjectDto => ({
    id: subject._id.toString(),
    name: subject.name,
    description: subject.description,
    status: subject.status,
    createdAt: serializeDate(subject.createdAt),
    updatedAt: serializeDate(subject.updatedAt),
});
