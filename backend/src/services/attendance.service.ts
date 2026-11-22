import { Types } from "mongoose";
import AttendanceRecordModel, {
    AttendanceRecordDocument,
} from "../models/attendance-record.model";
import EnrollmentModel from "../models/enrollment.model";
import SessionModel from "../models/session.model";
import StudentModel from "../models/student.model";
import StudyGroupModel from "../models/study-group.model";
import {
    ConflictException,
    InternalServerException,
    NotFoundException,
} from "../utils/app-error";
import { createPaginationMetadata } from "../utils/pagination";
import {
    CreateAttendanceRecordInput,
    SessionAttendanceListQuery,
    StudentAttendanceListQuery,
    UpdateAttendanceRecordInput,
} from "../validators/attendance.validation";

const getSession = async (
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

    const group = await StudyGroupModel.exists({
        _id: session.groupId,
        workspaceId,
    });

    if (!group) {
        throw new NotFoundException("Session not found");
    }

    return session;
};

const ensureStudentExists = async (
    workspaceId: Types.ObjectId,
    studentId: Types.ObjectId | string
): Promise<void> => {
    const student = await StudentModel.exists({
        _id: studentId,
        workspaceId,
    });

    if (!student) {
        throw new NotFoundException("Student not found");
    }
};

const assertAttendanceReferences = async (
    workspaceId: Types.ObjectId,
    records: AttendanceRecordDocument[]
): Promise<void> => {
    if (records.length === 0) {
        return;
    }

    const [sessions, students] = await Promise.all([
        SessionModel.find({
            workspaceId,
            _id: { $in: records.map((record) => record.sessionId) },
        }),
        StudentModel.find({
            workspaceId,
            _id: { $in: records.map((record) => record.studentId) },
        }),
    ]);
    const groups =
        sessions.length > 0
            ? await StudyGroupModel.find({
                  workspaceId,
                  _id: { $in: sessions.map((session) => session.groupId) },
              })
            : [];
    const enrollments =
        groups.length > 0 && students.length > 0
            ? await EnrollmentModel.find({
                  workspaceId,
                  groupId: { $in: groups.map((group) => group._id) },
                  studentId: { $in: students.map((student) => student._id) },
              })
            : [];

    const sessionById = new Map(
        sessions.map((session) => [session._id.toString(), session])
    );
    const sessionGroupIds = new Set(
        groups.map((group) => group._id.toString())
    );
    const studentIds = new Set(
        students.map((student) => student._id.toString())
    );
    const enrollmentPairs = new Set(
        enrollments.map(
            (enrollment) =>
                `${enrollment.groupId.toString()}:${enrollment.studentId.toString()}`
        )
    );

    if (
        records.some((record) => {
            const session = sessionById.get(record.sessionId.toString());

            return (
                !session ||
                !studentIds.has(record.studentId.toString()) ||
                !sessionGroupIds.has(session.groupId.toString()) ||
                !enrollmentPairs.has(
                    `${session.groupId.toString()}:${record.studentId.toString()}`
                )
            );
        })
    ) {
        throw new InternalServerException();
    }
};

const assertAttendanceCanBeRecorded = (
    session: Awaited<ReturnType<typeof getSession>>
): void => {
    if (session.status === "cancelled") {
        throw new ConflictException(
            "Attendance cannot be recorded for a cancelled session"
        );
    }

    if (session.startsAt.getTime() > Date.now()) {
        throw new ConflictException(
            "Attendance cannot be recorded before the session starts"
        );
    }
};

export const listSessionAttendanceService = async (
    workspaceId: Types.ObjectId,
    sessionId: string,
    query: SessionAttendanceListQuery
) => {
    await getSession(workspaceId, sessionId);

    const filter: {
        workspaceId: Types.ObjectId;
        sessionId: string;
        status?: AttendanceRecordDocument["status"];
    } = { workspaceId, sessionId };

    if (query.status !== undefined) {
        filter.status = query.status;
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        AttendanceRecordModel.find(filter)
            .sort({ recordedAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        AttendanceRecordModel.countDocuments(filter),
    ]);

    await assertAttendanceReferences(workspaceId, items);

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const createAttendanceRecordService = async (
    workspaceId: Types.ObjectId,
    sessionId: string,
    input: CreateAttendanceRecordInput
) => {
    const session = await getSession(workspaceId, sessionId);
    assertAttendanceCanBeRecorded(session);
    await ensureStudentExists(workspaceId, input.studentId);

    const enrollment = await EnrollmentModel.exists({
        workspaceId,
        groupId: session.groupId,
        studentId: input.studentId,
        status: "active",
        enrolledAt: { $lte: session.startsAt },
    });

    if (!enrollment) {
        throw new NotFoundException("Active group enrollment not found");
    }

    return AttendanceRecordModel.create({
        ...input,
        workspaceId,
        sessionId: session._id,
    });
};

export const updateAttendanceRecordService = async (
    workspaceId: Types.ObjectId,
    sessionId: string,
    attendanceId: string,
    input: UpdateAttendanceRecordInput
) => {
    const session = await getSession(workspaceId, sessionId);
    if (session.startsAt.getTime() > Date.now()) {
        throw new ConflictException(
            "Attendance cannot be updated before the session starts"
        );
    }

    const recordFilter = {
        _id: attendanceId,
        workspaceId,
        sessionId: session._id,
    };
    const existingRecord = await AttendanceRecordModel.findOne(recordFilter);

    if (!existingRecord) {
        throw new NotFoundException("Attendance record not found");
    }

    await assertAttendanceReferences(workspaceId, [existingRecord]);

    const record = await AttendanceRecordModel.findOneAndUpdate(
        recordFilter,
        { $set: input },
        {
            returnDocument: "after",
            runValidators: true,
        }
    );

    if (!record) {
        throw new NotFoundException("Attendance record not found");
    }

    return record;
};

export const listStudentAttendanceService = async (
    workspaceId: Types.ObjectId,
    studentId: string,
    query: StudentAttendanceListQuery
) => {
    await ensureStudentExists(workspaceId, studentId);

    const filter: {
        workspaceId: Types.ObjectId;
        studentId: string;
        status?: AttendanceRecordDocument["status"];
        recordedAt?: { $gte?: Date; $lte?: Date };
    } = { workspaceId, studentId };

    if (query.status !== undefined) {
        filter.status = query.status;
    }

    if (query.from !== undefined || query.to !== undefined) {
        filter.recordedAt = {
            ...(query.from !== undefined ? { $gte: query.from } : {}),
            ...(query.to !== undefined ? { $lte: query.to } : {}),
        };
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        AttendanceRecordModel.find(filter)
            .sort({ recordedAt: -1, _id: -1 })
            .skip(skip)
            .limit(query.pageSize),
        AttendanceRecordModel.countDocuments(filter),
    ]);

    await assertAttendanceReferences(workspaceId, items);

    return {
        items,
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};
