import type { SessionDocument } from "../models/session.model";
import { serializeDate } from "../utils/serialization";

export interface SessionDto {
    id: string;
    groupId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    status: SessionDocument["status"];
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export const toSessionDto = (session: SessionDocument): SessionDto => ({
    id: session._id.toString(),
    groupId: session.groupId.toString(),
    title: session.title,
    startsAt: serializeDate(session.startsAt),
    endsAt: serializeDate(session.endsAt),
    status: session.status,
    notes: session.notes,
    createdAt: serializeDate(session.createdAt),
    updatedAt: serializeDate(session.updatedAt),
});
