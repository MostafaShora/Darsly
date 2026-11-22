import type { StudyGroupDocument } from "../models/study-group.model";
import { serializeDate, serializeDecimal128 } from "../utils/serialization";

export interface StudyGroupDto {
    id: string;
    subjectId: string;
    name: string;
    description: string;
    monthlyFee: string;
    capacity: number | null;
    status: StudyGroupDocument["status"];
    createdAt: string;
    updatedAt: string;
}

export const toStudyGroupDto = (group: StudyGroupDocument): StudyGroupDto => ({
    id: group._id.toString(),
    subjectId: group.subjectId.toString(),
    name: group.name,
    description: group.description,
    monthlyFee: serializeDecimal128(group.monthlyFee),
    capacity: group.capacity,
    status: group.status,
    createdAt: serializeDate(group.createdAt),
    updatedAt: serializeDate(group.updatedAt),
});
