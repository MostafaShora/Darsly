import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { Server } from "node:http";
import { after, before, mock, test } from "node:test";
import bcrypt from "bcrypt";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose, { Types } from "mongoose";
import { z } from "zod";

import UserModel from "../src/models/user.model";
import WorkspaceMemberModel from "../src/models/workspace-member.model";
import WorkspaceModel from "../src/models/workspace.model";
import { requireWorkspaceAccess } from "../src/middlewares/workspace-access.middleware";
import { validateRequest } from "../src/middlewares/validate-request.middleware";
import { errorHandler } from "../src/middlewares/errorHandler.middleware";
import { getJwtSecret } from "../src/config/jwt-secret.config";
import { objectIdSchema, paginationQuerySchema } from "../src/validators/common.validation";
import { createPaginationMetadata } from "../src/utils/pagination";
import { serializeDate, serializeDecimal128 } from "../src/utils/serialization";

const TEST_JWT_SECRET = randomBytes(32).toString("hex");
const principalId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();
const secondWorkspaceId = new Types.ObjectId();

let baseUrl = "";
let apiServer: Server;

const makeUser = (id: Types.ObjectId = principalId) => ({
    _id: id,
    name: "Test Teacher",
    email: "teacher@example.test",
    passwordHash: "",
    status: "active" as const,
    lastLoginAt: null,
    save: async () => undefined,
});

const makeWorkspace = (
    id: Types.ObjectId = workspaceId,
    status: "active" | "suspended" = "active"
) => ({
    _id: id,
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

const authCookie = (userId = principalId.toString()) =>
    `accessToken=${jwt.sign({ userId }, TEST_JWT_SECRET, {
        audience: ["user"],
        expiresIn: "5m",
    })}`;

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

test("JWT configuration requires an explicit sufficiently long secret", () => {
    assert.throws(() => getJwtSecret(undefined), /JWT_SECRET/);
    assert.throws(() => getJwtSecret("short"), /at least 32 bytes/);
    assert.throws(() => getJwtSecret(" ".repeat(32)), /JWT_SECRET/);
    assert.throws(() => getJwtSecret(` ${TEST_JWT_SECRET}`), /surrounding whitespace/);
    assert.equal(getJwtSecret(TEST_JWT_SECRET), TEST_JWT_SECRET);
});

test("authentication routes preserve successful contracts and reject invalid input safely", async (t) => {
    const user = makeUser();
    user.passwordHash = await bcrypt.hash("correct-horse-battery", 4);

    let loginLookup = false;
    t.mock.method(UserModel, "findOne", () => {
        if (!loginLookup) {
            return null as never;
        }

        return { select: () => user } as never;
    });
    t.mock.method(UserModel, "create", () => user as never);
    t.mock.method(UserModel, "findById", () => user as never);

    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            name: user.name,
            email: user.email,
            password: "correct-horse-battery",
        }),
    });
    const registered = await registerResponse.json();

    assert.equal(registerResponse.status, 201);
    assert.deepEqual(Object.keys(registered.user).sort(), [
        "email",
        "id",
        "lastLoginAt",
        "name",
        "status",
    ]);
    assert.match(registerResponse.headers.get("set-cookie") ?? "", /HttpOnly/i);

    loginLookup = true;
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            email: user.email,
            password: "correct-horse-battery",
        }),
    });

    assert.equal(loginResponse.status, 200);
    assert.equal((await loginResponse.json()).user.email, user.email);
    assert.match(loginResponse.headers.get("set-cookie") ?? "", /HttpOnly/i);

    const statusResponse = await fetch(`${baseUrl}/api/auth/status`, {
        headers: { cookie: authCookie() },
    });
    assert.equal(statusResponse.status, 200);
    assert.equal((await statusResponse.json()).user.id, principalId.toString());

    const missingAuthResponse = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(missingAuthResponse.status, 401);

    const invalidAuthResponse = await fetch(`${baseUrl}/api/auth/status`, {
        headers: { cookie: "accessToken=invalid" },
    });
    assert.equal(invalidAuthResponse.status, 401);

    const invalidBodyResponse = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email", password: "x" }),
    });
    const invalidBody = await invalidBodyResponse.json();
    assert.equal(invalidBodyResponse.status, 400);
    assert.equal(invalidBody.errorCode, "ERR_BAD_REQUEST");
    assert.ok(Array.isArray(invalidBody.details));
    assert.equal("stack" in invalidBody, false);

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
    });
    assert.equal(logoutResponse.status, 200);
    assert.equal(typeof (await logoutResponse.json()).message, "string");
    assert.match(logoutResponse.headers.get("set-cookie") ?? "", /accessToken=;/);
});

test("workspace create, list, read, and update retain their response envelopes", async (t) => {
    const user = makeUser();
    const workspace = makeWorkspace();
    const membership = {
        _id: new Types.ObjectId(),
        workspaceId,
        userId: principalId,
        role: "owner",
        status: "active",
        joinedAt: new Date(),
    };
    const suspendedWorkspace = makeWorkspace(secondWorkspaceId, "suspended");
    const updatedWorkspace = { ...workspace, description: "Updated" };

    t.mock.method(UserModel, "findById", () => user as never);
    t.mock.method(WorkspaceMemberModel, "findOne", (query: { workspaceId: unknown }) =>
        ({ ...membership, workspaceId: query.workspaceId }) as never
    );
    t.mock.method(WorkspaceMemberModel, "find", () =>
        ({ select: () => [{ workspaceId }] }) as never
    );
    t.mock.method(WorkspaceMemberModel, "create", () => [membership] as never);
    t.mock.method(WorkspaceModel, "exists", () => null as never);
    t.mock.method(WorkspaceModel, "create", () => [workspace] as never);
    t.mock.method(WorkspaceModel, "findById", (id: unknown) =>
        String(id) === secondWorkspaceId.toString()
            ? suspendedWorkspace as never
            : workspace as never
    );
    t.mock.method(WorkspaceModel, "findOne", () => workspace as never);
    t.mock.method(WorkspaceModel, "findOneAndUpdate", () => updatedWorkspace as never);
    t.mock.method(WorkspaceModel, "find", () =>
        ({ sort: () => [workspace] }) as never
    );

    const session = {
        withTransaction: async (callback: () => Promise<void>) => callback(),
        endSession: async () => undefined,
    };
    t.mock.method(mongoose, "startSession", () => session as never);

    const createResponse = await fetch(`${baseUrl}/api/workspaces`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            cookie: authCookie(),
        },
        body: JSON.stringify({ name: "Test Workspace" }),
    });
    assert.equal(createResponse.status, 201);
    assert.equal((await createResponse.json()).data.name, workspace.name);

    const listResponse = await fetch(`${baseUrl}/api/workspaces/mine`, {
        headers: { cookie: authCookie() },
    });
    assert.equal(listResponse.status, 200);
    assert.equal((await listResponse.json()).data.length, 1);

    const readResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId.toString()}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(readResponse.status, 200);
    assert.equal((await readResponse.json()).data.slug, workspace.slug);

    const suspendedRead = await fetch(
        `${baseUrl}/api/workspaces/${secondWorkspaceId.toString()}`,
        { headers: { cookie: authCookie() } }
    );
    assert.equal(suspendedRead.status, 200);
    assert.equal((await suspendedRead.json()).data.status, "suspended");

    const updateResponse = await fetch(
        `${baseUrl}/api/workspaces/${workspaceId.toString()}`,
        {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                cookie: authCookie(),
            },
            body: JSON.stringify({ description: "Updated" }),
        }
    );
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.description, "Updated");
});

test("workspace access middleware supplies a principal-derived context and enforces membership/status", async (t) => {
    const user = makeUser();
    const activeWorkspace = makeWorkspace();
    const suspendedWorkspace = makeWorkspace(secondWorkspaceId, "suspended");
    const membership = {
        _id: new Types.ObjectId(),
        workspaceId,
        userId: principalId,
        role: "teacher",
        status: "active",
        joinedAt: new Date(),
    };

    t.mock.method(UserModel, "findById", () => user as never);
    t.mock.method(WorkspaceMemberModel, "findOne", (query: { workspaceId: unknown }) =>
        String(query.workspaceId) === workspaceId.toString() ||
        String(query.workspaceId) === secondWorkspaceId.toString()
            ? { ...membership, workspaceId: query.workspaceId } as never
            : null as never
    );
    t.mock.method(WorkspaceModel, "findById", (id: Types.ObjectId) =>
        id.toString() === secondWorkspaceId.toString()
            ? suspendedWorkspace as never
            : activeWorkspace as never
    );

    const accessApp = express();
    accessApp.use(express.json());
    accessApp.use((req, _res, next) => {
        if (req.header("x-test-principal")) {
            Object.assign(req, { user });
        }
        next();
    });
    accessApp.post(
        "/workspaces/:workspaceId",
        requireWorkspaceAccess(),
        (req, res) => {
            res.json({
                userId: req.workspaceContext?.userId,
                workspaceId: req.workspaceContext?.workspace._id.toString(),
            });
        }
    );
    accessApp.get(
        "/suspended/:workspaceId",
        requireWorkspaceAccess({ allowSuspended: true }),
        (req, res) => res.json({ status: req.workspaceContext?.workspace.status })
    );
    accessApp.use(errorHandler);

    const started = await startServer(accessApp);
    try {
        const activeResponse = await fetch(
            `${started.url}/workspaces/${workspaceId.toString()}`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-test-principal": "present",
                },
                body: JSON.stringify({ userId: secondWorkspaceId.toString() }),
            }
        );
        assert.equal(activeResponse.status, 200);
        assert.deepEqual(await activeResponse.json(), {
            userId: principalId.toString(),
            workspaceId: workspaceId.toString(),
        });

        const noPrincipal = await fetch(
            `${started.url}/workspaces/${workspaceId.toString()}`,
            { method: "POST" }
        );
        assert.equal(noPrincipal.status, 401);

        const nonMember = await fetch(
            `${started.url}/workspaces/${new Types.ObjectId().toString()}`,
            {
                method: "POST",
                headers: { "x-test-principal": "present" },
            }
        );
        assert.equal(nonMember.status, 403);

        const malformedId = await fetch(`${started.url}/workspaces/not-an-id`, {
            method: "POST",
            headers: { "x-test-principal": "present" },
        });
        assert.equal(malformedId.status, 400);

        const suspended = await fetch(
            `${started.url}/workspaces/${secondWorkspaceId.toString()}`,
            {
                method: "POST",
                headers: { "x-test-principal": "present" },
            }
        );
        assert.equal(suspended.status, 404);

        const suspendedRead = await fetch(
            `${started.url}/suspended/${secondWorkspaceId.toString()}`,
            { headers: { "x-test-principal": "present" } }
        );
        assert.equal(suspendedRead.status, 200);
        assert.deepEqual(await suspendedRead.json(), { status: "suspended" });
    } finally {
        await closeServer(started.server);
    }
});

test("request validation and API helpers normalize input and serialization", async () => {
    const validationApp = express();
    validationApp.use(express.json());
    validationApp.get(
        "/items/:itemId",
        validateRequest({
            params: z.object({ itemId: objectIdSchema }),
            query: paginationQuerySchema,
        }),
        (req, res) => res.json(req.validated)
    );
    validationApp.post(
        "/items",
        validateRequest({ body: z.object({ name: z.string().min(2) }) }),
        (req, res) => res.json(req.validated)
    );
    validationApp.get("/duplicate", (_req, _res, next) =>
        next(Object.assign(new Error("database detail"), { code: 11000 }))
    );
    validationApp.post("/malformed-json", (_req, res) => res.json({ ok: true }));
    validationApp.get("/unexpected", () => {
        throw new Error("internal detail");
    });
    validationApp.use(errorHandler);

    const started = await startServer(validationApp);
    try {
        const valid = await fetch(
            `${started.url}/items/${workspaceId.toString()}?page=2&pageSize=10`
        );
        assert.equal(valid.status, 200);
        assert.deepEqual(await valid.json(), {
            params: { itemId: workspaceId.toString() },
            query: { page: 2, pageSize: 10 },
        });

        const invalidQuery = await fetch(
            `${started.url}/items/${workspaceId.toString()}?pageSize=1000`
        );
        assert.equal(invalidQuery.status, 400);
        assert.equal((await invalidQuery.json()).details[0].path, "query.pageSize");

        const invalidId = await fetch(`${started.url}/items/not-an-id`);
        assert.equal(invalidId.status, 400);

        const invalidBody = await fetch(`${started.url}/items`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "" }),
        });
        assert.equal(invalidBody.status, 400);

        const malformedJson = await fetch(`${started.url}/malformed-json`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: '{"name":',
        });
        assert.equal(malformedJson.status, 400);

        const duplicate = await fetch(`${started.url}/duplicate`);
        assert.equal(duplicate.status, 409);
        assert.equal((await duplicate.json()).errorCode, "ERR_CONFLICT");

        const log = mock.method(console, "error", () => undefined);
        const unexpected = await fetch(`${started.url}/unexpected`);
        const unexpectedBody = await unexpected.json();
        assert.equal(unexpected.status, 500);
        assert.equal(unexpectedBody.message, "Internal Server Error");
        assert.equal("error" in unexpectedBody, false);
        assert.equal(log.mock.calls.length, 1);
        assert.equal(JSON.stringify(log.mock.calls[0].arguments).includes("internal detail"), false);
        log.mock.restore();
    } finally {
        await closeServer(started.server);
    }

    assert.deepEqual(createPaginationMetadata(2, 10, 21), {
        page: 2,
        pageSize: 10,
        totalItems: 21,
        totalPages: 3,
    });
    assert.equal(serializeDate(new Date("2026-05-01T12:30:00.000Z")), "2026-05-01T12:30:00.000Z");
    assert.equal(
        serializeDecimal128(Types.Decimal128.fromString("12345678901234567890.1234")),
        "12345678901234567890.1234"
    );
    assert.equal(objectIdSchema.safeParse(workspaceId.toString()).success, true);
});
