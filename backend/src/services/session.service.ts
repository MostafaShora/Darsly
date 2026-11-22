import { Types } from "mongoose";
import AttendanceRecordModel from "../models/attendance-record.model";
import SessionModel, { SessionDocument } from "../models/session.model";
import StudyGroupModel from "../models/study-group.model";
import {
    ConflictException,
    InternalServerException,
    NotFoundException,
} from "../utils/app-error";
import { createPaginationMetadata } from "../utils/pagination";
import {
    CreateSessionInput,
    SessionListQuery,
    UpdateSessionInput,
} from "../validators/session.validation";

const ensureStudyGroupExists = async (
    workspaceId: Types.ObjectId,
    groupId: string | Types.ObjectId
): Promise<void> => {
    const group = await StudyGroupModel.exists({
        _id: groupId,
        workspaceId,
    });

    if (!group) {
        throw new NotFoundException("Study group not found");
    }
};

const assertSessionGroupsExist = async (
    workspaceId: Types.ObjectId,
    sessions: SessionDocument[]
): Promise<void> => {
    if (sessions.length === 0) {
        return;
    }

    const groups = await StudyGroupModel.find({
        workspaceId,
        _id: { $in: sessions.map((session) => session.groupId) },
    });
    const groupIds = new Set(groups.map((group) => group._id.toString()));

    if (sessions.some((session) => !groupIds.has(session.groupId.toString()))) {
        throw new InternalServerException();
    }
};

export const listSessionsService = async (
    workspaceId: Types.ObjectId,
    query: SessionListQuery
) => {
    if (query.groupId) {
        await ensureStudyGroupExists(workspaceId, query.groupId);
    }

    const filter: {
        workspaceId: Types.ObjectId;
        groupId?: string;
        status?: SessionDocument["status"];
        startsAt?: { $gte?: Date; $lte?: Date };
    } = { workspaceId };

    if (query.groupId) {
        filter.groupId = query.groupId;
    }

    if (query.status !== undefined) {
        filter.status = query.status;
    }

    if (query.from !== undefined || query.to !== undefined) {
        filter.startsAt = {
            ...(query.from !== undefined ? { $gte: query.from } : {}),
            ...(query.to !== undefined ? { $lte: query.to } : {}),
        };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        SessionModel.find(filter)
            .sort({ startsAt: 1, _id: 1 })
            .skip(skip)
            .limit(query.pageSize),
        SessionModel.countDocuments(filter),
    ]);

    await assertSessionGroupsExist(workspaceId, items);

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const createSessionService = async (
    workspaceId: Types.ObjectId,
    input: CreateSessionInput
) => {
    await ensureStudyGroupExists(workspaceId, input.groupId);

    return SessionModel.create({
        ...input,
        workspaceId,
    });
};

export const getSessionByIdService = async (
    workspaceId: Types.ObjectId,
    sessionId: string
) => {
    const session = await SessionModel.findOne({
        _id: sessionId,
        workspaceId,
    });

    if (!session) {
        throw new NotFoundException("Session not found");
    }

    await ensureStudyGroupExists(workspaceId, session.groupId);

    return session;
};

export const updateSessionService = async (
    workspaceId: Types.ObjectId,
    sessionId: string,
    input: UpdateSessionInput
) => {
    const session = await SessionModel.findOne({
        _id: sessionId,
        workspaceId,
    });

    if (!session) {
        throw new NotFoundException("Session not found");
    }

    await ensureStudyGroupExists(workspaceId, session.groupId);

    if (input.startsAt !== undefined || input.endsAt !== undefined) {
        const hasAttendance = await AttendanceRecordModel.exists({
            workspaceId,
            sessionId: session._id,
        });
        const nextStartsAt = input.startsAt ?? session.startsAt;

        if (hasAttendance && nextStartsAt.getTime() > Date.now()) {
            throw new ConflictException(
                "An attended session cannot be moved into the future"
            );
        }
    }

    if (input.title !== undefined) {
        session.title = input.title;
    }

    if (input.startsAt !== undefined) {
        session.startsAt = input.startsAt;
    }

    if (input.endsAt !== undefined) {
        session.endsAt = input.endsAt;
    }

    if (input.status !== undefined) {
        session.status = input.status;
    }

    if (input.notes !== undefined) {
        session.notes = input.notes;
    }

    return session.save();
};
