import assert from "node:assert/strict";
import { once } from "node:events";
import { Server } from "node:http";
import { after, before, test, TestContext } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";

import EnrollmentModel from "../src/models/enrollment.model";
import StudyGroupModel from "../src/models/study-group.model";
import StudentModel from "../src/models/student.model";
import SubjectModel from "../src/models/subject.model";
import UserModel from "../src/models/user.model";
import WorkspaceMemberModel from "../src/models/workspace-member.model";
import WorkspaceModel from "../src/models/workspace.model";

const TEST_JWT_SECRET = "phase-two-test-secret-with-at-least-32-bytes";
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

const makeWorkspace = (status: "active" | "suspended" = "active") => ({
    _id: workspaceId,
    name: "Test Workspace",
    slug: "test-workspace",
    ownerId: principalId,
    status,
    description: "",
    currency: "EGP",
    suspensionType: status === "suspended" ? "owner" : null,
    suspendedAt: status === "suspended" ? new Date() : null,
    suspendedBy: status === "suspended" ? principalId : null,
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

const mockWorkspaceAccess = (
    t: TestContext,
    options: { status?: "active" | "suspended"; member?: boolean } = {}
) => {
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
        options.member === false ? (null as never) : (membership as never)
    );
    t.mock.method(WorkspaceModel, "findById", () =>
        makeWorkspace(options.status) as never
    );
};

const makeSubject = () => ({
    _id: new Types.ObjectId(),
    workspaceId,
    name: "Mathematics",
    description: "Core mathematics",
    status: "active",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
});

const makeGroup = (capacity: number | null = 10) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    subjectId: new Types.ObjectId(),
    name: "Grade 8",
    description: "",
    monthlyFee: Types.Decimal128.fromString("250.50"),
    capacity,
    status: "active",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
});

const makeStudent = () => ({
    _id: new Types.ObjectId(),
    workspaceId,
    name: "Student One",
});

const makeEnrollment = (
    status: "active" | "paused" | "completed" | "cancelled" = "active"
) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    studentId: new Types.ObjectId(),
    groupId: new Types.ObjectId(),
    enrolledAt: new Date("2026-03-01T00:00:00.000Z"),
    endedAt: null as Date | null,
    status,
    notes: "",
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-02T00:00:00.000Z"),
    async save() {
        return this;
    },
});

const makeSession = () => ({
    withTransaction: async <T>(callback: () => Promise<T>) => callback(),
    endSession: async () => undefined,
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

test("subjects require authentication, active membership, and an active workspace", async (t) => {
    const unauthenticated = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects`
    );
    assert.equal(unauthenticated.status, 401);

    mockWorkspaceAccess(t, { member: false });
    const nonMember = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(nonMember.status, 403);

    t.mock.restoreAll();
    mockWorkspaceAccess(t, { status: "suspended" });
    const suspended = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(suspended.status, 404);
});

test("subjects support workspace-owned create, read, update, search, and pagination", async (t) => {
    mockWorkspaceAccess(t);
    const subject = makeSubject();
    const updatedSubject = { ...subject, name: "Advanced Mathematics" };
    const createSubject = t.mock.method(
        SubjectModel,
        "create",
        (() => subject) as never
    );
    t.mock.method(SubjectModel, "findOne", (() => subject) as never);
    t.mock.method(
        SubjectModel,
        "findOneAndUpdate",
        (() => updatedSubject) as never
    );
    t.mock.method(SubjectModel, "find", () => makeQuery([subject]) as never);
    t.mock.method(SubjectModel, "countDocuments", () => makeQuery(1) as never);

    const protectedFieldResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "Mathematics",
                workspaceId: new Types.ObjectId(),
            }),
        }
    );
    assert.equal(protectedFieldResponse.status, 400);
    assert.equal(createSubject.mock.callCount(), 0);

    const createResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "Mathematics",
                description: "Core mathematics",
            }),
        }
    );
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    const createPayload = createSubject.mock.calls[0].arguments[0] as {
        workspaceId: Types.ObjectId;
    };
    assert.equal(createPayload.workspaceId, workspaceId);
    assert.equal(created.data.id, subject._id.toString());
    assert.equal("workspaceId" in created.data, false);

    const listResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects?page=1&pageSize=10&search=math&status=active`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.data.items[0].name, "Mathematics");
    assert.deepEqual(listed.data.pagination, {
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
    });

    const readResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects/${subject._id}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(readResponse.status, 200);
    assert.equal((await readResponse.json()).data.status, "active");

    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects/${subject._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ name: "Advanced Mathematics" }),
        }
    );
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.name, "Advanced Mathematics");

    const emptyUpdate = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects/${subject._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({}),
        }
    );
    assert.equal(emptyUpdate.status, 400);
});

test("subject duplicate names use the existing workspace-scoped unique index conflict response", async (t) => {
    mockWorkspaceAccess(t);
    t.mock.method(SubjectModel, "create", (() => {
        throw { code: 11000 };
    }) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ name: "Mathematics" }),
        }
    );

    assert.equal(response.status, 409);
    assert.equal((await response.json()).errorCode, "ERR_CONFLICT");
});

test("subjects outside the current workspace are returned as not found", async (t) => {
    mockWorkspaceAccess(t);
    let lookupWorkspaceId: Types.ObjectId | undefined;
    t.mock.method(
        SubjectModel,
        "findOne",
        ((filter: { workspaceId: Types.ObjectId }) => {
            lookupWorkspaceId = filter.workspaceId;
            return null;
        }) as never
    );

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/subjects/${new Types.ObjectId()}`,
        { headers: { cookie: authCookie() } }
    );

    assert.equal(response.status, 404);
    assert.equal(lookupWorkspaceId, workspaceId);
});

test("study groups verify workspace subjects and serialize Decimal128 as a string", async (t) => {
    mockWorkspaceAccess(t);
    const subject = makeSubject();
    const group = { ...makeGroup(12), subjectId: subject._id };
    const updatedGroup = { ...group, name: "Grade 8 Advanced" };
    t.mock.method(SubjectModel, "exists", () => makeQuery({ _id: subject._id }) as never);
    const createGroup = t.mock.method(
        StudyGroupModel,
        "create",
        (() => group) as never
    );
    t.mock.method(StudyGroupModel, "findOne", (() => group) as never);
    t.mock.method(
        StudyGroupModel,
        "findOneAndUpdate",
        (() => updatedGroup) as never
    );
    t.mock.method(StudyGroupModel, "find", () => makeQuery([group]) as never);
    t.mock.method(StudyGroupModel, "countDocuments", () => makeQuery(1) as never);
    t.mock.method(SubjectModel, "find", () => makeQuery([subject]) as never);

    const malformedSubject = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectId: "not-an-object-id",
                name: "Grade 8",
                monthlyFee: "250.50",
            }),
        }
    );
    assert.equal(malformedSubject.status, 400);

    const invalidFee = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectId: subject._id,
                name: "Grade 8",
                monthlyFee: "-1",
            }),
        }
    );
    assert.equal(invalidFee.status, 400);

    const createResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectId: subject._id,
                name: "Grade 8",
                monthlyFee: "250.50",
                capacity: 12,
            }),
        }
    );
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    const createPayload = createGroup.mock.calls[0].arguments[0] as {
        workspaceId: Types.ObjectId;
        monthlyFee: Types.Decimal128;
    };
    assert.equal(createPayload.workspaceId, workspaceId);
    assert.equal(createPayload.monthlyFee.toString(), "250.50");
    assert.equal(created.data.monthlyFee, "250.50");
    assert.equal(created.data.capacity, 12);
    assert.equal("__v" in created.data, false);

    const listResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups?subjectId=${subject._id}&status=active&pageSize=10`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.data.items[0].subjectId, subject._id.toString());
    assert.equal(listed.data.pagination.totalItems, 1);

    const readResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(readResponse.status, 200);
    assert.equal((await readResponse.json()).data.id, group._id.toString());

    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ name: "Grade 8 Advanced" }),
        }
    );
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.name, "Grade 8 Advanced");
});

test("study groups reject foreign or missing subjects and do not expose foreign groups", async (t) => {
    mockWorkspaceAccess(t);
    let subjectLookupWorkspaceId: Types.ObjectId | undefined;
    const foreignSubjectId = new Types.ObjectId();
    t.mock.method(
        SubjectModel,
        "exists",
        ((filter: { workspaceId: Types.ObjectId }) => {
            subjectLookupWorkspaceId = filter.workspaceId;
            return null;
        }) as never
    );
    const createGroup = t.mock.method(
        StudyGroupModel,
        "create",
        (() => makeGroup()) as never
    );
    let groupLookupWorkspaceId: Types.ObjectId | undefined;
    t.mock.method(
        StudyGroupModel,
        "findOne",
        ((filter: { workspaceId: Types.ObjectId }) => {
            groupLookupWorkspaceId = filter.workspaceId;
            return null;
        }) as never
    );

    const foreignSubject = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                subjectId: foreignSubjectId,
                name: "Grade 8",
                monthlyFee: "250.50",
            }),
        }
    );
    assert.equal(foreignSubject.status, 404);
    assert.equal(subjectLookupWorkspaceId, workspaceId);
    assert.equal(createGroup.mock.callCount(), 0);

    const foreignGroup = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${new Types.ObjectId()}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(foreignGroup.status, 404);
    assert.equal(groupLookupWorkspaceId, workspaceId);
});

test("capacity reductions cannot go below active enrollment count", async (t) => {
    mockWorkspaceAccess(t);
    const group = makeGroup(4);
    const session = makeSession();
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(
        StudyGroupModel,
        "findOneAndUpdate",
        () => makeQuery({ ...group, capacity: 2 }) as never
    );
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(
        EnrollmentModel,
        "countDocuments",
        () => makeQuery(3) as never
    );
    t.mock.method(mongoose, "startSession", (() => session) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ capacity: 2 }),
        }
    );

    assert.equal(response.status, 409);
    assert.equal((await response.json()).errorCode, "ERR_CONFLICT");
});

test("enrollment creation verifies both references, serializes capacity, and returns a DTO", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(1);
    const enrollment = {
        ...makeEnrollment(),
        studentId: student._id,
        groupId: group._id,
        enrolledAt: new Date("2026-03-05T12:00:00.000Z"),
    };
    const session = makeSession();
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(
        StudentModel,
        "exists",
        () => makeQuery({ _id: student._id }) as never
    );
    let groupLockWorkspaceId: Types.ObjectId | undefined;
    let groupLockFilter:
        | { workspaceId: Types.ObjectId; updatedAt: Date }
        | undefined;
    let groupLockUpdate: { $set: { updatedAt: Date } } | undefined;
    let groupLockOptions:
        | { timestamps?: boolean; session?: unknown }
        | undefined;
    const groupLock = t.mock.method(
        StudyGroupModel,
        "findOneAndUpdate",
        ((
            filter: {
                workspaceId: Types.ObjectId;
                updatedAt: Date;
            },
            update: { $set: { updatedAt: Date } },
            options: { timestamps?: boolean; session?: unknown }
        ) => {
            groupLockWorkspaceId = filter.workspaceId;
            groupLockFilter = filter;
            groupLockUpdate = update;
            groupLockOptions = options;
            return makeQuery(group);
        }) as never
    );
    let capacityFilter: {
        status?: string;
        workspaceId?: Types.ObjectId;
        groupId?: Types.ObjectId;
    } = {};
    t.mock.method(
        EnrollmentModel,
        "countDocuments",
        ((filter: {
            status?: string;
            workspaceId?: Types.ObjectId;
            groupId?: Types.ObjectId;
        }) => {
            capacityFilter = filter;
            return makeQuery(0);
        }) as never
    );
    const createEnrollment = t.mock.method(
        EnrollmentModel,
        "create",
        ((_documents: unknown[], options: { session?: unknown }) => {
            assert.equal(options.session, session);
            return [enrollment];
        }) as never
    );
    t.mock.method(mongoose, "startSession", (() => session) as never);

    const invalidDate = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                studentId: student._id,
                enrolledAt: "not-a-date",
            }),
        }
    );
    assert.equal(invalidDate.status, 400);

    const invalidStudentId = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: "not-an-object-id" }),
        }
    );
    assert.equal(invalidStudentId.status, 400);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                studentId: student._id,
                enrolledAt: "2026-03-05T12:00:00.000Z",
                notes: "Initial enrollment",
            }),
        }
    );

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.studentId, student._id.toString());
    assert.equal(body.data.groupId, group._id.toString());
    assert.equal(body.data.enrolledAt, "2026-03-05T12:00:00.000Z");
    assert.equal("workspaceId" in body.data, false);
    assert.equal(groupLock.mock.callCount(), 1);
    assert.equal(groupLockWorkspaceId, workspaceId);
    assert.ok(groupLockFilter);
    assert.ok(groupLockUpdate);
    assert.ok(groupLockOptions);
    assert.equal(
        groupLockFilter.updatedAt.getTime(),
        group.updatedAt.getTime()
    );
    assert.equal(groupLockFilter.workspaceId, workspaceId);
    assert.ok(
        groupLockUpdate.$set.updatedAt.getTime() >
            group.updatedAt.getTime()
    );
    assert.equal(groupLockOptions.timestamps, false);
    assert.equal(groupLockOptions.session, session);
    assert.equal(capacityFilter.status, "active");
    assert.equal(capacityFilter.workspaceId, workspaceId);
    assert.equal(capacityFilter.groupId, group._id);
    const createPayload = createEnrollment.mock.calls[0].arguments[0] as Array<{
        workspaceId: Types.ObjectId;
        studentId: Types.ObjectId;
        groupId: Types.ObjectId;
        enrolledAt: Date;
        status: string;
    }>;
    assert.equal(createPayload[0].workspaceId, workspaceId);
    assert.equal(createPayload[0].studentId.toString(), student._id.toString());
    assert.equal(createPayload[0].groupId.toString(), group._id.toString());
    assert.equal(
        createPayload[0].enrolledAt.toISOString(),
        "2026-03-05T12:00:00.000Z"
    );
    assert.equal(createPayload[0].status, "active");
});

test("paused enrollment creation does not reserve capacity", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(1);
    const pausedEnrollment = {
        ...makeEnrollment("paused"),
        studentId: student._id,
        groupId: group._id,
    };
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    const capacityLock = t.mock.method(
        StudyGroupModel,
        "findOneAndUpdate",
        (() => makeQuery(group)) as never
    );
    const capacityCount = t.mock.method(
        EnrollmentModel,
        "countDocuments",
        (() => makeQuery(1)) as never
    );
    const createEnrollment = t.mock.method(
        EnrollmentModel,
        "create",
        (() => [pausedEnrollment]) as never
    );
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id, status: "paused" }),
        }
    );

    assert.equal(response.status, 201);
    assert.equal((await response.json()).data.status, "paused");
    assert.equal(capacityLock.mock.callCount(), 0);
    assert.equal(capacityCount.mock.callCount(), 0);
    const createPayload = createEnrollment.mock.calls[0].arguments[0] as Array<{
        status: string;
    }>;
    assert.equal(createPayload[0].status, "paused");

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudyGroupModel, "findOneAndUpdate", () =>
        makeQuery(group) as never
    );
    let activeCountFilter: { status?: string } = {};
    t.mock.method(
        EnrollmentModel,
        "countDocuments",
        ((filter: { status?: string }) => {
            activeCountFilter = filter;
            return makeQuery(0);
        }) as never
    );
    t.mock.method(
        EnrollmentModel,
        "create",
        (() => [makeEnrollment()]) as never
    );
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);

    const activeResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id, status: "active" }),
        }
    );

    assert.equal(activeResponse.status, 201);
    assert.equal(activeCountFilter.status, "active");
});

test("enrollments reject foreign students or groups and conflicts at capacity", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(1);
    const session = makeSession();
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(StudentModel, "exists", () => makeQuery(null) as never);
    const createEnrollment = t.mock.method(
        EnrollmentModel,
        "create",
        (() => [makeEnrollment()]) as never
    );
    t.mock.method(mongoose, "startSession", (() => session) as never);

    const foreignStudent = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
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
    assert.equal(createEnrollment.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(null) as never);
    const noGroupEnrollment = t.mock.method(
        EnrollmentModel,
        "create",
        (() => [makeEnrollment()]) as never
    );
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);
    const foreignGroup = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );
    assert.equal(foreignGroup.status, 404);
    assert.equal(noGroupEnrollment.mock.callCount(), 0);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudyGroupModel, "findOneAndUpdate", () =>
        makeQuery(group) as never
    );
    t.mock.method(EnrollmentModel, "countDocuments", () => makeQuery(1) as never);
    const fullGroupCreate = t.mock.method(
        EnrollmentModel,
        "create",
        (() => [makeEnrollment()]) as never
    );
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);
    const atCapacity = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ studentId: student._id }),
        }
    );
    assert.equal(atCapacity.status, 409);
    assert.equal(fullGroupCreate.mock.callCount(), 0);
});

test("enrollment list, detail, and update use scoped references and preserve model status/date rules", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const subject = makeSubject();
    const group = { ...makeGroup(null), subjectId: subject._id };
    const enrollment = {
        ...makeEnrollment(),
        studentId: student._id,
        groupId: group._id,
    };
    const session = makeSession();
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudentModel, "find", () => makeQuery([student]) as never);
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(StudyGroupModel, "find", () => makeQuery([group]) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: subject._id }) as never
    );
    t.mock.method(SubjectModel, "find", () => makeQuery([subject]) as never);
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(enrollment) as never
    );
    t.mock.method(EnrollmentModel, "find", () =>
        makeQuery([enrollment]) as never
    );
    t.mock.method(EnrollmentModel, "countDocuments", () => makeQuery(1) as never);
    t.mock.method(mongoose, "startSession", (() => session) as never);

    const listResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/enrollments?studentId=${student._id}&groupId=${group._id}&status=active`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).data.items[0].status, "active");

    const groupListResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments?status=active`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(groupListResponse.status, 200);
    assert.equal(
        (await groupListResponse.json()).data.items[0].groupId,
        group._id.toString()
    );

    const getResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/enrollments/${enrollment._id}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(getResponse.status, 200);
    assert.equal((await getResponse.json()).data.id, enrollment._id.toString());

    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/enrollments/${enrollment._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                status: "completed",
                endedAt: "2026-03-10T12:00:00.000Z",
                notes: "Completed",
            }),
        }
    );
    assert.equal(updateResponse.status, 200);
    const updated = await updateResponse.json();
    assert.equal(updated.data.status, "completed");
    assert.equal(updated.data.endedAt, "2026-03-10T12:00:00.000Z");
    assert.equal(updated.data.notes, "Completed");
});

test("enrollment status transitions enforce capacity and model date invariants", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(1);
    const pausedEnrollment = {
        ...makeEnrollment("paused"),
        studentId: student._id,
        groupId: group._id,
    };
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(pausedEnrollment) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(StudyGroupModel, "findOneAndUpdate", () =>
        makeQuery(group) as never
    );
    t.mock.method(EnrollmentModel, "countDocuments", () => makeQuery(1) as never);
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);

    const fullGroup = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/enrollments/${pausedEnrollment._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ status: "active", endedAt: null }),
        }
    );
    assert.equal(fullGroup.status, 409);

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const availableEnrollment = {
        ...makeEnrollment("paused"),
        studentId: student._id,
        groupId: group._id,
    };
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(availableEnrollment) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(StudyGroupModel, "findOneAndUpdate", () =>
        makeQuery(group) as never
    );
    let activeCountFilter: { status?: string } = {};
    t.mock.method(
        EnrollmentModel,
        "countDocuments",
        ((filter: { status?: string }) => {
            activeCountFilter = filter;
            return makeQuery(0);
        }) as never
    );
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);

    const availableGroup = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/enrollments/${availableEnrollment._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ status: "active", endedAt: null }),
        }
    );
    assert.equal(availableGroup.status, 200);
    assert.equal(activeCountFilter.status, "active");

    t.mock.restoreAll();
    mockWorkspaceAccess(t);
    const invalidTransitionDoc = new EnrollmentModel({
        workspaceId,
        studentId: student._id,
        groupId: group._id,
        enrolledAt: new Date("2026-03-01T00:00:00.000Z"),
        endedAt: null,
        status: "active",
        notes: "",
    });
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(invalidTransitionDoc) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);

    const invalidEndedState = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/enrollments/${invalidTransitionDoc._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ status: "completed" }),
        }
    );
    assert.equal(invalidEndedState.status, 400);
});

test("cancelling an active enrollment frees its capacity without locking a seat", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(1);
    const activeEnrollment = {
        ...makeEnrollment("active"),
        studentId: student._id,
        groupId: group._id,
    };
    t.mock.method(EnrollmentModel, "findOne", () =>
        makeQuery(activeEnrollment) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    const capacityLock = t.mock.method(
        StudyGroupModel,
        "findOneAndUpdate",
        (() => makeQuery(group)) as never
    );
    const capacityCount = t.mock.method(
        EnrollmentModel,
        "countDocuments",
        (() => makeQuery(1)) as never
    );
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/enrollments/${activeEnrollment._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                status: "cancelled",
                endedAt: "2026-03-10T12:00:00.000Z",
            }),
        }
    );

    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.status, "cancelled");
    assert.equal(capacityLock.mock.callCount(), 0);
    assert.equal(capacityCount.mock.callCount(), 0);
});

test("enrollments outside the current workspace are returned as not found", async (t) => {
    mockWorkspaceAccess(t);
    let lookupWorkspaceId: Types.ObjectId | undefined;
    t.mock.method(
        EnrollmentModel,
        "findOne",
        ((filter: { workspaceId: Types.ObjectId }) => {
            lookupWorkspaceId = filter.workspaceId;
            return null;
        }) as never
    );

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/enrollments/${new Types.ObjectId()}`,
        { headers: { cookie: authCookie() } }
    );

    assert.equal(response.status, 404);
    assert.equal(lookupWorkspaceId, workspaceId);
});

test("duplicate active enrollments map the existing partial unique index to 409", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const group = makeGroup(null);
    t.mock.method(StudyGroupModel, "findOne", () => makeQuery(group) as never);
    t.mock.method(SubjectModel, "exists", () =>
        makeQuery({ _id: group.subjectId }) as never
    );
    t.mock.method(StudentModel, "exists", () =>
        makeQuery({ _id: student._id }) as never
    );
    t.mock.method(StudyGroupModel, "findOneAndUpdate", () =>
        makeQuery(group) as never
    );
    t.mock.method(EnrollmentModel, "countDocuments", () => makeQuery(7) as never);
    t.mock.method(EnrollmentModel, "create", (() => {
        throw { code: 11000 };
    }) as never);
    t.mock.method(mongoose, "startSession", (() => makeSession()) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/groups/${group._id}/enrollments`,
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
    assert.equal((await response.json()).errorCode, "ERR_CONFLICT");
});
