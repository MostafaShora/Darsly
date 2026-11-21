import assert from "node:assert/strict";
import { once } from "node:events";
import { Server } from "node:http";
import { after, before, test, TestContext } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";

import GuardianModel from "../src/models/guardian.model";
import StudentGuardianModel from "../src/models/student-guardian.model";
import StudentModel from "../src/models/student.model";
import UserModel from "../src/models/user.model";
import WorkspaceMemberModel from "../src/models/workspace-member.model";
import WorkspaceModel from "../src/models/workspace.model";

const TEST_JWT_SECRET = "phase-one-test-secret-with-at-least-32-bytes";
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

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    name: "Student One",
    phone: null,
    email: null,
    schoolName: "",
    grade: "",
    status: "active",
    notes: "",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-02T00:00:00.000Z"),
    ...overrides,
});

const makeGuardian = (overrides: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    workspaceId,
    name: "Guardian One",
    phone: "01000000000",
    alternatePhone: null,
    email: null,
    relationship: "other",
    notes: "",
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-02T00:00:00.000Z"),
    ...overrides,
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

test("student endpoints enforce workspace membership, status, IDs, and input validation", async (t) => {
    mockWorkspaceAccess(t);
    let lookupWorkspaceId: Types.ObjectId | undefined;
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: { workspaceId: Types.ObjectId }) => {
            lookupWorkspaceId = filter.workspaceId;
            return null;
        }) as never
    );
    const createStudent = t.mock.method(
        StudentModel,
        "create",
        (() => makeStudent()) as never
    );

    const invalidIdResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/not-an-object-id`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(invalidIdResponse.status, 400);

    const invalidBodyResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ name: "x", phone: 17 }),
        }
    );
    assert.equal(invalidBodyResponse.status, 400);
    assert.equal(createStudent.mock.callCount(), 0);

    const crossWorkspaceResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${new Types.ObjectId()}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(crossWorkspaceResponse.status, 404);
    assert.equal(lookupWorkspaceId, workspaceId);

    t.mock.restoreAll();
    mockWorkspaceAccess(t, { member: false });
    const notMemberResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(notMemberResponse.status, 403);

    t.mock.restoreAll();
    mockWorkspaceAccess(t, { status: "suspended" });
    const suspendedResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(suspendedResponse.status, 404);
});

test("student create and list use workspace-scoped storage, DTOs, search, and pagination", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent({ name: "Mariam" });
    const updatedStudent = makeStudent({ name: "Mariam Updated" });
    const createStudent = t.mock.method(
        StudentModel,
        "create",
        (() => student) as never
    );
    t.mock.method(StudentModel, "findOne", (() => student) as never);
    t.mock.method(
        StudentModel,
        "findOneAndUpdate",
        (() => updatedStudent) as never
    );
    t.mock.method(StudentModel, "find", () => makeQuery([student]) as never);
    t.mock.method(StudentModel, "countDocuments", () => 21 as never);

    const createResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "Mariam",
                workspaceId: new Types.ObjectId().toString(),
            }),
        }
    );
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    const createPayload = createStudent.mock.calls[0].arguments[0] as {
        workspaceId: Types.ObjectId;
    };
    assert.equal(createPayload.workspaceId, workspaceId);
    assert.equal(created.data.name, "Mariam");
    assert.equal("workspaceId" in created.data, false);

    const listResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students?page=2&pageSize=10&search=Mariam`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json();
    assert.equal(listed.data.items[0].name, "Mariam");
    assert.deepEqual(listed.data.pagination, {
        page: 2,
        pageSize: 10,
        totalItems: 21,
        totalPages: 3,
    });

    const detailResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(detailResponse.status, 200);
    assert.equal((await detailResponse.json()).data.id, student._id.toString());

    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ name: "Mariam Updated" }),
        }
    );
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.name, "Mariam Updated");
});

test("guardian creation and update validate and serialize workspace-owned records", async (t) => {
    mockWorkspaceAccess(t);
    const guardian = makeGuardian({ name: "Parent One" });
    const createGuardian = t.mock.method(
        GuardianModel,
        "create",
        (() => guardian) as never
    );
    const updatedGuardian = makeGuardian({ name: "Parent Updated" });
    t.mock.method(GuardianModel, "find", () => makeQuery([guardian]) as never);
    t.mock.method(GuardianModel, "countDocuments", () => 1 as never);
    t.mock.method(GuardianModel, "findOne", () => guardian as never);
    t.mock.method(GuardianModel, "findOneAndUpdate", () => updatedGuardian as never);

    const createResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/guardians`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                name: "Parent One",
                phone: "01000000000",
                workspaceId: new Types.ObjectId().toString(),
            }),
        }
    );
    assert.equal(createResponse.status, 201);
    const createPayload = createGuardian.mock.calls[0].arguments[0] as {
        workspaceId: Types.ObjectId;
    };
    assert.equal(createPayload.workspaceId, workspaceId);

    const listResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/guardians`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).data.items[0].name, "Parent One");

    const detailResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/guardians/${guardian._id}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(detailResponse.status, 200);
    assert.equal((await detailResponse.json()).data.id, guardian._id.toString());

    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/guardians/${guardian._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ name: "Parent Updated" }),
        }
    );
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.name, "Parent Updated");
});

test("student-guardian links enforce workspace ownership, primary transactions, and DTO mapping", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const guardian = makeGuardian();
    const link = {
        _id: new Types.ObjectId(),
        workspaceId,
        studentId: student._id,
        guardianId: guardian._id,
        relationship: "mother",
        isPrimary: true,
        canReceiveNotifications: false,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-02T00:00:00.000Z"),
    };
    const updatedLink = { ...link, canReceiveNotifications: true };
    t.mock.method(StudentModel, "exists", () => ({ _id: student._id }) as never);
    t.mock.method(GuardianModel, "exists", () => ({ _id: guardian._id }) as never);
    const updateMany = t.mock.method(
        StudentGuardianModel,
        "updateMany",
        (() => ({ modifiedCount: 1 })) as never
    );
    const createLink = t.mock.method(
        StudentGuardianModel,
        "create",
        (() => [link]) as never
    );
    t.mock.method(
        StudentGuardianModel,
        "findOneAndUpdate",
        (() => updatedLink) as never
    );
    t.mock.method(
        StudentGuardianModel,
        "findOneAndDelete",
        (() => link) as never
    );
    t.mock.method(StudentGuardianModel, "find", () => makeQuery([link]) as never);
    t.mock.method(GuardianModel, "find", () => [guardian] as never);
    t.mock.method(GuardianModel, "findOne", () => guardian as never);

    const session = {
        withTransaction: async <T>(callback: () => Promise<T>) => callback(),
        endSession: async () => undefined,
    };
    t.mock.method(mongoose, "startSession", (() => session) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}/guardians`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                guardianId: guardian._id,
                relationship: "mother",
                isPrimary: true,
                receivesNotifications: false,
            }),
        }
    );

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.relationship, "mother");
    assert.equal(body.data.isPrimary, true);
    assert.equal(body.data.receivesNotifications, false);
    assert.equal(updateMany.mock.callCount(), 1);
    const createPayload = createLink.mock.calls[0].arguments[0] as Array<{
        workspaceId: Types.ObjectId;
        studentId: Types.ObjectId;
        guardianId: Types.ObjectId;
    }>;
    assert.equal(createPayload[0].workspaceId, workspaceId);
    assert.equal(createPayload[0].studentId.toString(), student._id.toString());
    assert.equal(createPayload[0].guardianId.toString(), guardian._id.toString());

    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}/guardians/${guardian._id}`,
        {
            method: "PATCH",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({
                relationship: "mother",
                receivesNotifications: true,
            }),
        }
    );
    assert.equal(updateResponse.status, 200);
    assert.equal(
        (await updateResponse.json()).data.receivesNotifications,
        true
    );

    const listResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}/guardians`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(listResponse.status, 200);
    assert.equal(
        (await listResponse.json()).data[0].guardian.id,
        guardian._id.toString()
    );

    const unlinkResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}/guardians/${guardian._id}`,
        {
            method: "DELETE",
            headers: { cookie: authCookie() },
        }
    );
    assert.equal(unlinkResponse.status, 200);
    assert.equal(
        (await unlinkResponse.json()).data.guardianId,
        guardian._id.toString()
    );
});

test("duplicate student-guardian links map database uniqueness conflicts to 409", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const guardian = makeGuardian();
    t.mock.method(StudentModel, "exists", () => ({ _id: student._id }) as never);
    t.mock.method(GuardianModel, "exists", () => ({ _id: guardian._id }) as never);
    t.mock.method(StudentGuardianModel, "create", (() => {
        throw { code: 11000 };
    }) as never);

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}/guardians`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ guardianId: guardian._id }),
        }
    );

    assert.equal(response.status, 409);
    assert.equal((await response.json()).errorCode, "ERR_CONFLICT");
});

test("a guardian from another workspace cannot be linked to a student", async (t) => {
    mockWorkspaceAccess(t);
    const student = makeStudent();
    const guardianId = new Types.ObjectId();
    let guardianLookupWorkspaceId: Types.ObjectId | undefined;

    t.mock.method(StudentModel, "exists", () => ({ _id: student._id }) as never);
    t.mock.method(
        GuardianModel,
        "exists",
        ((filter: { workspaceId: Types.ObjectId }) => {
            guardianLookupWorkspaceId = filter.workspaceId;
            return null;
        }) as never
    );
    const createLink = t.mock.method(
        StudentGuardianModel,
        "create",
        (() => []) as never
    );

    const response = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId}/students/${student._id}/guardians`,
        {
            method: "POST",
            headers: {
                cookie: authCookie(),
                "content-type": "application/json",
            },
            body: JSON.stringify({ guardianId }),
        }
    );

    assert.equal(response.status, 404);
    assert.equal(guardianLookupWorkspaceId, workspaceId);
    assert.equal(createLink.mock.callCount(), 0);
});
