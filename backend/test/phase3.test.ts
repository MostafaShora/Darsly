import assert from "node:assert/strict";
import { once } from "node:events";
import { Server } from "node:http";
import { after, before, test, TestContext } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";

import AttendanceRecordModel from "../src/models/attendance-record.model";
import EnrollmentModel from "../src/models/enrollment.model";
import SessionModel from "../src/models/session.model";
import StudyGroupModel from "../src/models/study-group.model";
import StudentModel from "../src/models/student.model";
import UserModel from "../src/models/user.model";
import WorkspaceMemberModel from "../src/models/workspace-member.model";
import WorkspaceModel from "../src/models/workspace.model";

const TEST_JWT_SECRET = "phase-three-test-secret-with-at-least-32-bytes";
const principalId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();

let baseUrl = "";
let apiServer: Server;

const makeUser = () => ({
    _id: principalId,
    name: "Test Teacher",
    email: "teacher@example.test",
    passwordHash: "",
    status: "active" as const,
    lastLoginAt: null,
});

const makeWorkspace = () => ({
    _id: workspaceId,
    name: "Test Workspace",
    slug: "test-workspace",
    ownerId: principalId,
    status: "active" as const,
    description: "",
    currency: "EGP",
    suspensionType: null,
    suspendedAt: null,
    suspendedBy: null,
    suspensionReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const authCookie = () =>
    `accessToken=${jwt.sign({ userId: principalId.toString() }, TEST_JWT_SECRET, {
        audience: ["user"],
        expiresIn: "5m",
    })}`;

const makeQuery = (value: unknown) => ({
    sort() {
        return this;
    },
    skip() {
        return this;
    },
    limit() {
        return this;
    },
    session() {
        return this;
    },
    then(
        resolve: (result: unknown) => unknown,
        reject: (error: unknown) => unknown
    ) {
        return Promise.resolve(value).then(resolve, reject);
    },
});

const mockWorkspaceAccess = (t: TestContext) => {
    const membership = {
        _id: new Types.ObjectId(),
        workspaceId,
        userId: principalId,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
    };

    t.mock.method(UserModel, "findById", () => makeUser() as never);
    t.mock.method(WorkspaceMemberModel, "findOne", () =>
        membership as never
    );
    t.mock.method(WorkspaceModel, "findById", () =>
        makeWorkspace() as never
    );
};

const makeGroup = () => ({
    _id: new Types.ObjectId(),
    workspaceId,
    subjectId: new Types.ObjectId(),
    name: "Grade 8",
    description: "",
    monthlyFee: Types.Decimal128.fromString("250.50"),
    capacity: 10,
    status: "active" as const,
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
});

const makeStudent = () => ({
    _id: new Types.ObjectId(),
    workspaceId,
    name: "Student One",
    phone: null,
    email: null,
    schoolName: "",
    grade: "",
    status: "active" as const,
    notes: "",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
});

const makeSession = (
    groupId: Types.ObjectId,
    options: {
        status?: "scheduled" | "completed" | "cancelled";
        startsAt?: Date;
        endsAt?: Date;
    } = {}
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    groupId,
    title: "Algebra",
    startsAt: options.startsAt ?? new Date(Date.now() - 60_000),
    endsAt: options.endsAt ?? new Date(Date.now() - 30_000),
    status: options.status ?? ("scheduled" as const),
    notes: "",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    async save() {
        return this;
    },
});

const makeEnrollment = (
    groupId: Types.ObjectId,
    studentId: Types.ObjectId,
    status: "active" | "paused" | "completed" | "cancelled" = "active"
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    groupId,
    studentId,
    enrolledAt: new Date(Date.now() - 86_400_000),
    endedAt: status === "active" || status === "paused" ? null : new Date(),
    status,
    notes: "",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
});

const makeAttendance = (
    sessionId: Types.ObjectId,
    studentId: Types.ObjectId
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    sessionId,
    studentId,
    status: "present" as const,
    lateMinutes: 0,
    notes: "",
    recordedAt: new Date("2026-03-05T12:00:00.000Z"),
    createdAt: new Date("2026-03-05T12:00:00.000Z"),
    updatedAt: new Date("2026-03-05T12:00:00.000Z"),
    async save() {
        return this;
    },
});

const mockSessionLookup = (
    t: TestContext,
    session: ReturnType<typeof makeSession> | null,
    groupExists = true
) => {
    t.mock.method(SessionModel, "findOne", () =>
        makeQuery(session) as never
    );
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery(groupExists ? { _id: session?.groupId } : null) as never
    );
};

const mockAttendanceReferenceLists = (
    t: TestContext,
    session: ReturnType<typeof makeSession>,
    student: ReturnType<typeof makeStudent>,
    enrollment: ReturnType<typeof makeEnrollment>
) => {
    t.mock.method(SessionModel, "find", () =>
        makeQuery([session]) as never
    );
    t.mock.method(StudentModel, "find", () =>
        makeQuery([student]) as never
    );
    t.mock.method(StudyGroupModel, "find", () =>
        makeQuery([makeGroupWithId(session.groupId)]) as never
    );
    t.mock.method(EnrollmentModel, "find", () =>
        makeQuery([enrollment]) as never
    );
};

const makeGroupWithId = (groupId: Types.ObjectId) => ({
    ...makeGroup(),
    _id: groupId,
});

const startServer = async (app: express.Express) => {
    const server = app.listen(0);
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    return {
        server,
        url: `http://127.0.0.1:${address.port}`,
    };
};

const closeServer = async (server: Server) => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
};

before(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = TEST_JWT_SECRET;
    process.env.MONGO_URI = "unused-in-tests";
    process.env.PORT = "0";
    process.env.FRONTEND_ORIGIN = "http://localhost:4200";

    const { createApp } = await import("../src/app");
    const started = await startServer(createApp());
    apiServer = started.server;
    baseUrl = started.url;
});

after(async () => {
    await closeServer(apiServer);
});

test("sessions support workspace-scoped create, list, read, and update", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const session = makeSession(group._id);
    let createPayload: Record<string, unknown> | undefined;
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery({ _id: group._id }) as never
    );
    t.mock.method(SessionModel, "create", ((payload: Record<string, unknown>) => {
        createPayload = payload;
        return session;
    }) as never);

    const createResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                groupId: group._id,
                title: "Algebra",
                startsAt: "2026-03-05T12:00:00.000Z",
                endsAt: "2026-03-05T13:00:00.000Z",
            }),
        }
    );
    assert.equal(createResponse.status, 201);
    assert.equal((await createResponse.json()).data.status, "scheduled");
    assert.equal(createPayload?.workspaceId, workspaceId);
    assert.equal(createPayload?.groupId, group._id.toString());

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const listSession = makeSession(group._id);
    let listFilter: Record<string, unknown> | undefined;
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery({ _id: group._id }) as never
    );
    t.mock.method(SessionModel, "find", ((filter: Record<string, unknown>) => {
        listFilter = filter;
        return makeQuery([listSession]);
    }) as never);
    t.mock.method(SessionModel, "countDocuments", () => makeQuery(1) as never);
    t.mock.method(StudyGroupModel, "find", () =>
        makeQuery([group]) as never
    );

    const listResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions?groupId=${group._id}&status=scheduled&from=2026-03-05T00%3A00%3A00.000Z&to=2026-03-06T00%3A00%3A00.000Z&page=2&pageSize=5`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.equal(listBody.data.pagination.page, 2);
    assert.equal(listBody.data.pagination.pageSize, 5);
    assert.equal(listFilter?.workspaceId, workspaceId);
    assert.equal(listFilter?.groupId, group._id.toString());
    assert.equal(listFilter?.status, "scheduled");
    assert.deepEqual(listFilter?.startsAt, {
        $gte: new Date("2026-03-05T00:00:00.000Z"),
        $lte: new Date("2026-03-06T00:00:00.000Z"),
    });

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockSessionLookup(t, session);
    const getResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(getResponse.status, 200);
    assert.equal((await getResponse.json()).data.id, session._id.toString());

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const editableSession = makeSession(group._id);
    t.mock.method(SessionModel, "findOne", () =>
        makeQuery(editableSession) as never
    );
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery({ _id: group._id }) as never
    );
    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${editableSession._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                title: "Updated lesson",
                status: "completed",
            }),
        }
    );
    assert.equal(updateResponse.status, 200);
    const updateBody = await updateResponse.json();
    assert.equal(updateBody.data.title, "Updated lesson");
    assert.equal(updateBody.data.status, "completed");
});

test("session inputs reject invalid dates, unsupported states, and foreign groups", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const createSession = t.mock.method(
        SessionModel,
        "create",
        (() => makeSession(group._id)) as never
    );
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery({ _id: group._id }) as never
    );

    const invalidRange = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                groupId: group._id,
                startsAt: "2026-03-05T13:00:00.000Z",
                endsAt: "2026-03-05T12:00:00.000Z",
            }),
        }
    );
    assert.equal(invalidRange.status, 400);
    assert.equal(createSession.mock.callCount(), 0);

    const invalidTimezone = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                groupId: group._id,
                startsAt: "2026-03-05T12:00:00",
                endsAt: "2026-03-05T13:00:00.000Z",
            }),
        }
    );
    assert.equal(invalidTimezone.status, 400);

    const invalidState = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${new Types.ObjectId()}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ status: "archived" }),
        }
    );
    assert.equal(invalidState.status, 400);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const createForeignGroup = t.mock.method(
        SessionModel,
        "create",
        (() => makeSession(group._id)) as never
    );
    t.mock.method(StudyGroupModel, "exists", () => makeQuery(null) as never);
    const foreignGroup = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                groupId: group._id,
                startsAt: "2026-03-05T12:00:00.000Z",
                endsAt: "2026-03-05T13:00:00.000Z",
            }),
        }
    );
    assert.equal(foreignGroup.status, 404);
    assert.equal(createForeignGroup.mock.callCount(), 0);
});

test("sessions from another workspace are not readable and group changes are rejected", async (t) => {
    mockWorkspaceAccess(t);
    const session = makeSession(new Types.ObjectId());
    t.mock.method(SessionModel, "findOne", () => makeQuery(null) as never);

    const missing = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(missing.status, 404);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const foreignGroupId = new Types.ObjectId();
    const findSession = t.mock.method(SessionModel, "findOne", () =>
        makeQuery(makeSession(new Types.ObjectId())) as never
    );
    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ groupId: foreignGroupId }),
        }
    );
    assert.equal(updateResponse.status, 400);
    assert.equal(findSession.mock.callCount(), 0);
});

test("session group association cannot be changed after creation", async (t) => {
    mockWorkspaceAccess(t);
    const originalGroup = makeGroup();
    const targetGroup = makeGroup();
    const session = makeSession(originalGroup._id);
    const findSession = t.mock.method(SessionModel, "findOne", () =>
        makeQuery(session) as never
    );

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ groupId: targetGroup._id }),
        }
    );

    assert.equal(response.status, 400);
    assert.equal(findSession.mock.callCount(), 0);
    assert.equal(session.groupId, originalGroup._id);
});

test("attended sessions cannot be moved into the future, but safe past date changes are allowed", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const attendedSession = makeSession(group._id);
    let attendanceFilter:
        | { workspaceId: Types.ObjectId; sessionId: Types.ObjectId }
        | undefined;
    mockSessionLookup(t, attendedSession);
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery({ _id: group._id }) as never
    );
    t.mock.method(
        AttendanceRecordModel,
        "exists",
        ((filter: NonNullable<typeof attendanceFilter>) => {
            attendanceFilter = filter;
            return makeQuery({ _id: new Types.ObjectId() });
        }) as never
    );
    const saveAttendedSession = t.mock.method(
        attendedSession,
        "save",
        (() => attendedSession) as never
    );
    const futureStartsAt = new Date(Date.now() + 60_000);
    const futureEndsAt = new Date(futureStartsAt.getTime() + 60_000);

    const rejected = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${attendedSession._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                startsAt: futureStartsAt.toISOString(),
                endsAt: futureEndsAt.toISOString(),
            }),
        }
    );

    assert.equal(rejected.status, 409);
    assert.equal(saveAttendedSession.mock.callCount(), 0);
    assert.equal(attendanceFilter?.workspaceId, workspaceId);
    assert.equal(attendanceFilter?.sessionId, attendedSession._id);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const safelyMovedSession = makeSession(group._id);
    mockSessionLookup(t, safelyMovedSession);
    t.mock.method(StudyGroupModel, "exists", () =>
        makeQuery({ _id: group._id }) as never
    );
    t.mock.method(AttendanceRecordModel, "exists", () =>
        makeQuery({ _id: new Types.ObjectId() }) as never
    );
    const saveSafeSession = t.mock.method(
        safelyMovedSession,
        "save",
        (() => safelyMovedSession) as never
    );
    const startsAt = new Date(Date.now() - 120_000);
    const endsAt = new Date(Date.now() + 60_000);
    const accepted = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${safelyMovedSession._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                startsAt: startsAt.toISOString(),
                endsAt: endsAt.toISOString(),
            }),
        }
    );

    assert.equal(accepted.status, 200);
    assert.equal(saveSafeSession.mock.callCount(), 1);
    const body = await accepted.json();
    assert.equal(body.data.startsAt, startsAt.toISOString());
    assert.equal(body.data.endsAt, endsAt.toISOString());
});

test("session date patches preserve endsAt after startsAt", async (t) => {
    mockWorkspaceAccess(t);
    const sessionId = new Types.ObjectId();
    const invalidPatch = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${sessionId}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                startsAt: "2026-03-05T12:00:00.000Z",
                endsAt: "2026-03-05T11:00:00.000Z",
            }),
        }
    );
    assert.equal(invalidPatch.status, 400);

    const session = new SessionModel({
        workspaceId,
        groupId: new Types.ObjectId(),
        startsAt: new Date("2026-03-05T12:00:00.000Z"),
        endsAt: new Date("2026-03-05T13:00:00.000Z"),
    });
    session.endsAt = new Date("2026-03-05T11:00:00.000Z");
    await assert.rejects(
        session.validate(),
        (error: unknown) => error instanceof mongoose.Error.ValidationError
    );
});

test("attendance creation requires a started non-cancelled session and active in-group enrollment", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id);
    const enrollment = makeEnrollment(group._id, student._id);
    let enrollmentFilter:
        | {
              workspaceId: Types.ObjectId;
              groupId: Types.ObjectId;
              studentId: string;
              status: string;
              enrolledAt: { $lte: Date };
          }
        | undefined;
    mockSessionLookup(t, session);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(
        EnrollmentModel,
        "exists",
        ((filter: NonNullable<typeof enrollmentFilter>) => {
            enrollmentFilter = filter;
            return makeQuery(enrollment);
        }) as never
    );
    const record = {
        ...makeAttendance(session._id, student._id),
        status: "late" as const,
        lateMinutes: 3,
        notes: "Traffic",
    };
    let createPayload: Record<string, unknown> | undefined;
    const createRecord = t.mock.method(
        AttendanceRecordModel,
        "create",
        ((payload: Record<string, unknown>) => {
            createPayload = payload;
            return record;
        }) as never
    );

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                studentId: student._id,
                status: "late",
                lateMinutes: 3,
                notes: "Traffic",
            }),
        }
    );

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.sessionId, session._id.toString());
    assert.equal(body.data.studentId, student._id.toString());
    assert.equal(body.data.status, "late");
    assert.equal(body.data.lateMinutes, 3);
    assert.equal(createRecord.mock.callCount(), 1);
    assert.equal(createPayload?.workspaceId, workspaceId);
    assert.equal(createPayload?.sessionId, session._id);
    assert.equal(createPayload?.studentId, student._id.toString());
    assert.equal(enrollmentFilter?.workspaceId, workspaceId);
    assert.equal(enrollmentFilter?.groupId, group._id);
    assert.equal(enrollmentFilter?.studentId, student._id.toString());
    assert.equal(enrollmentFilter?.status, "active");
    assert.equal(
        enrollmentFilter?.enrolledAt.$lte.getTime(),
        session.startsAt.getTime()
    );
});

test("attendance can be recorded for a completed session", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id, { status: "completed" });
    const enrollment = makeEnrollment(group._id, student._id);
    mockSessionLookup(t, session);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "exists", () =>
        makeQuery(enrollment) as never
    );
    const record = makeAttendance(session._id, student._id);
    const createRecord = t.mock.method(
        AttendanceRecordModel,
        "create",
        (() => record) as never
    );

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );

    assert.equal(response.status, 201);
    assert.equal(createRecord.mock.callCount(), 1);
});

test("attendance is allowed exactly at startsAt", async (t) => {
    mockWorkspaceAccess(t);
    const startsAt = new Date("2026-11-22T09:00:00.000Z");
    t.mock.method(Date, "now", () => startsAt.getTime());
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id, {
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60_000),
    });
    mockSessionLookup(t, session);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "exists", () =>
        makeQuery(makeEnrollment(group._id, student._id)) as never
    );
    t.mock.method(AttendanceRecordModel, "create", (() =>
        makeAttendance(session._id, student._id)) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );

    assert.equal(response.status, 201);
});

test("attendance rejects future and cancelled sessions and students without an active group enrollment", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const futureSession = makeSession(group._id, {
        startsAt: new Date(Date.now() + 60_000),
        endsAt: new Date(Date.now() + 120_000),
    });
    mockSessionLookup(t, futureSession);
    const futureCreate = t.mock.method(
        AttendanceRecordModel,
        "create",
        (() => makeAttendance(futureSession._id, student._id)) as never
    );
    const futureResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${futureSession._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );
    assert.equal(futureResponse.status, 409);
    assert.equal(futureCreate.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const cancelledSession = makeSession(group._id, { status: "cancelled" });
    mockSessionLookup(t, cancelledSession);
    const cancelledCreate = t.mock.method(
        AttendanceRecordModel,
        "create",
        (() => makeAttendance(cancelledSession._id, student._id)) as never
    );
    const cancelledResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${cancelledSession._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );
    assert.equal(cancelledResponse.status, 409);
    assert.equal(cancelledCreate.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const session = makeSession(group._id);
    mockSessionLookup(t, session);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    let enrollmentFilter: { status?: string; groupId?: Types.ObjectId } = {};
    t.mock.method(
        EnrollmentModel,
        "exists",
        ((filter: { status?: string; groupId?: Types.ObjectId }) => {
            enrollmentFilter = filter;
            return makeQuery(null);
        }) as never
    );
    const nonMemberCreate = t.mock.method(
        AttendanceRecordModel,
        "create",
        (() => makeAttendance(session._id, student._id)) as never
    );
    const nonMemberResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );
    assert.equal(nonMemberResponse.status, 404);
    assert.equal(enrollmentFilter.status, "active");
    assert.equal(enrollmentFilter.groupId, group._id);
    assert.equal(nonMemberCreate.mock.callCount(), 0);
});

test("paused, completed, and cancelled enrollments cannot create attendance", async (t) => {
    const group = makeGroup();
    const student = makeStudent();

    for (const status of ["paused", "completed", "cancelled"] as const) {
        t.mock.restoreAll();
        mockWorkspaceAccess(t);
        const session = makeSession(group._id);
        mockSessionLookup(t, session);
        t.mock.method(StudentModel, "exists", () =>
            makeQuery({ _id: student._id }) as never
        );
        const inactiveEnrollment = makeEnrollment(
            group._id,
            student._id,
            status
        );
        let enrollmentFilter: { status?: string } = {};
        t.mock.method(
            EnrollmentModel,
            "exists",
            ((filter: { status?: string }) => {
                enrollmentFilter = filter;
                return makeQuery(
                    filter.status === inactiveEnrollment.status
                        ? inactiveEnrollment
                        : null
                );
            }) as never
        );
        const createRecord = t.mock.method(
            AttendanceRecordModel,
            "create",
            (() => makeAttendance(session._id, student._id)) as never
        );

        const response = await fetch(
            `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
            {
                method: "POST",
                headers: {
                    cookie: authCookie(),
                    "content-type": "application/json",
                },
                body: JSON.stringify({ studentId: student._id }),
            }
        );

        assert.equal(response.status, 404, `${status} enrollment is ineligible`);
        assert.equal(enrollmentFilter.status, "active");
        assert.equal(createRecord.mock.callCount(), 0);
    }
});

test("attendance rejects active enrollment that began after the session", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id);
    const enrollment = makeEnrollment(group._id, student._id);
    enrollment.enrolledAt = new Date(session.startsAt.getTime() + 1);
    let enrollmentFilter:
        | {
              workspaceId: Types.ObjectId;
              groupId: Types.ObjectId;
              studentId: string;
              status: string;
              enrolledAt: { $lte: Date };
          }
        | undefined;
    mockSessionLookup(t, session);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(
        EnrollmentModel,
        "exists",
        ((filter: NonNullable<typeof enrollmentFilter>) => {
            enrollmentFilter = filter;
            return makeQuery(
                enrollment.enrolledAt <= filter.enrolledAt.$lte
                    ? enrollment
                    : null
            );
        }) as never
    );
    const createRecord = t.mock.method(
        AttendanceRecordModel,
        "create",
        (() => makeAttendance(session._id, student._id)) as never
    );

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );

    assert.equal(response.status, 404);
    assert.equal(enrollmentFilter?.workspaceId, workspaceId);
    assert.equal(enrollmentFilter?.groupId, group._id);
    assert.equal(enrollmentFilter?.studentId, student._id.toString());
    assert.equal(enrollmentFilter?.status, "active");
    assert.equal(
        enrollmentFilter?.enrolledAt.$lte.getTime(),
        session.startsAt.getTime()
    );
    assert.equal(createRecord.mock.callCount(), 0);
});

test("attendance duplicate records are rejected by the existing unique index", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id);
    mockSessionLookup(t, session);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(EnrollmentModel, "exists", () =>
        makeQuery(makeEnrollment(group._id, student._id)) as never
    );
    t.mock.method(AttendanceRecordModel, "create", (() => {
        throw { code: 11000 };
    }) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );

    assert.equal(response.status, 409);
});

test("session attendance list and student history are paginated and workspace-scoped", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id);
    const enrollment = makeEnrollment(group._id, student._id);
    const record = makeAttendance(session._id, student._id);
    mockSessionLookup(t, session);
    let sessionAttendanceFilter:
        | { workspaceId: Types.ObjectId; sessionId: string; status?: string }
        | undefined;
    t.mock.method(
        AttendanceRecordModel,
        "find",
        ((filter: NonNullable<typeof sessionAttendanceFilter>) => {
            sessionAttendanceFilter = filter;
            return makeQuery([record]);
        }) as never
    );
    t.mock.method(AttendanceRecordModel, "countDocuments", () =>
        makeQuery(1) as never
    );
    mockAttendanceReferenceLists(t, session, student, enrollment);

    const sessionList = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance?status=present&page=2&pageSize=5`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(sessionList.status, 200);
    assert.equal(
        (await sessionList.json()).data.pagination.pageSize,
        5
    );
    assert.equal(sessionAttendanceFilter?.workspaceId, workspaceId);
    assert.equal(sessionAttendanceFilter?.sessionId, session._id.toString());
    assert.equal(sessionAttendanceFilter?.status, "present");

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    let studentHistoryFilter:
        | {
              workspaceId: Types.ObjectId;
              studentId: string;
              status?: string;
              recordedAt?: { $gte?: Date; $lte?: Date };
          }
        | undefined;
    t.mock.method(
        AttendanceRecordModel,
        "find",
        ((filter: NonNullable<typeof studentHistoryFilter>) => {
            studentHistoryFilter = filter;
            return makeQuery([record]);
        }) as never
    );
    t.mock.method(AttendanceRecordModel, "countDocuments", () =>
        makeQuery(1) as never
    );
    mockAttendanceReferenceLists(t, session, student, enrollment);

    const history = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}/attendance?from=2026-03-01T00%3A00%3A00.000Z&to=2026-03-10T00%3A00%3A00.000Z&status=present`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(history.status, 200);
    assert.equal(studentHistoryFilter?.workspaceId, workspaceId);
    assert.equal(studentHistoryFilter?.studentId, student._id.toString());
    assert.equal(studentHistoryFilter?.status, "present");
    assert.deepEqual(studentHistoryFilter?.recordedAt, {
        $gte: new Date("2026-03-01T00:00:00.000Z"),
        $lte: new Date("2026-03-10T00:00:00.000Z"),
    });
});

test("existing attendance can be corrected after cancellation without changing its links", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id, { status: "cancelled" });
    const enrollment = makeEnrollment(group._id, student._id, "cancelled");
    const record = makeAttendance(session._id, student._id);
    const updatedRecord = {
        ...record,
        status: "excused" as const,
        notes: "Corrected record",
    };
    let updateFilter:
        | {
              _id: string;
              workspaceId: Types.ObjectId;
              sessionId: Types.ObjectId;
          }
        | undefined;
    let updateDocument:
        | { $set: { status?: string; notes?: string } }
        | undefined;
    mockSessionLookup(t, session);
    t.mock.method(AttendanceRecordModel, "findOne", () =>
        makeQuery(record) as never
    );
    t.mock.method(
        AttendanceRecordModel,
        "findOneAndUpdate",
        ((filter: NonNullable<typeof updateFilter>, update: typeof updateDocument) => {
            updateFilter = filter;
            updateDocument = update;
            return makeQuery(updatedRecord);
        }) as never
    );
    mockAttendanceReferenceLists(t, session, student, enrollment);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance/${record._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                status: "excused",
                notes: "Corrected record",
            }),
        }
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.status, "excused");
    assert.equal(body.data.notes, "Corrected record");
    assert.equal(body.data.sessionId, session._id.toString());
    assert.equal(body.data.studentId, student._id.toString());
    assert.equal(updateFilter?._id, record._id.toString());
    assert.equal(updateFilter?.workspaceId, workspaceId);
    assert.equal(updateFilter?.sessionId, session._id);
    assert.deepEqual(updateDocument, {
        $set: { status: "excused", notes: "Corrected record" },
    });
});

test("attendance rejects unsupported states, invalid late minutes, and cross-workspace references", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id);
    mockSessionLookup(t, session);
    const createRecord = t.mock.method(
        AttendanceRecordModel,
        "create",
        (() => makeAttendance(session._id, student._id)) as never
    );

    const invalidState = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                studentId: student._id,
                status: "tardy",
            }),
        }
    );
    assert.equal(invalidState.status, 400);

    const invalidLateMinutes = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                studentId: student._id,
                lateMinutes: -1,
            }),
        }
    );
    assert.equal(invalidLateMinutes.status, 400);
    assert.equal(createRecord.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockSessionLookup(t, session);
    t.mock.method(StudentModel, "exists", () => makeQuery(null) as never);
    const crossWorkspaceCreate = t.mock.method(
        AttendanceRecordModel,
        "create",
        (() => makeAttendance(session._id, student._id)) as never
    );
    const foreignStudent = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );
    assert.equal(foreignStudent.status, 404);
    assert.equal(crossWorkspaceCreate.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockSessionLookup(t, null);
    const foreignSessionCreate = t.mock.method(
        AttendanceRecordModel,
        "create",
        (() => makeAttendance(session._id, student._id)) as never
    );
    const foreignSession = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );
    assert.equal(foreignSession.status, 404);
    assert.equal(foreignSessionCreate.mock.callCount(), 0);
});

test("attendance patches scope the mutation and reject foreign resources", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup();
    const student = makeStudent();
    const session = makeSession(group._id);
    const record = makeAttendance(session._id, student._id);
    mockSessionLookup(t, session);
    let lookupFilter:
        | {
              _id: string;
              workspaceId: Types.ObjectId;
              sessionId: Types.ObjectId;
          }
        | undefined;
    const findRecord = t.mock.method(
        AttendanceRecordModel,
        "findOne",
        ((filter: NonNullable<typeof lookupFilter>) => {
            lookupFilter = filter;
            return makeQuery(null);
        }) as never
    );
    const mutateRecord = t.mock.method(
        AttendanceRecordModel,
        "findOneAndUpdate",
        (() => makeQuery(record)) as never
    );
    const notFound = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance/${record._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ status: "absent" }),
        }
    );
    assert.equal(notFound.status, 404);
    assert.equal(lookupFilter?._id, record._id.toString());
    assert.equal(lookupFilter?.workspaceId, workspaceId);
    assert.equal(lookupFilter?.sessionId, session._id);
    assert.equal(findRecord.mock.callCount(), 1);
    assert.equal(mutateRecord.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    mockSessionLookup(t, null);
    const attendanceLookup = t.mock.method(
        AttendanceRecordModel,
        "findOne",
        (() => makeQuery(record)) as never
    );
    const foreignSession = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance/${record._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ status: "absent" }),
        }
    );
    assert.equal(foreignSession.status, 404);
    assert.equal(attendanceLookup.mock.callCount(), 0);

    const malformedId = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/sessions/${session._id}/attendance/not-an-object-id`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ status: "absent" }),
        }
    );
    assert.equal(malformedId.status, 400);
});
