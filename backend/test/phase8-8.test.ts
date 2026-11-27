import assert from "node:assert/strict";
import { Request, Response, NextFunction } from "express";
import { TestContext, test } from "node:test";
import { Types } from "mongoose";
import { authStatusController } from "../src/controllers/auth.controller";
import { requireStudentAccess } from "../src/middlewares/student-access.middleware";
import StudentAccountLinkModel from "../src/models/student-account-link.model";
import StudentModel from "../src/models/student.model";
import UserModel from "../src/models/user.model";
import WorkspaceMemberModel from "../src/models/workspace-member.model";
import WorkspaceModel from "../src/models/workspace.model";
import {
    listActiveStudentContextsService,
    resolveStudentAccessContextService,
    toStudentContextDto,
} from "../src/services/student-context.service";
import {
    getAccountCapabilitiesService,
    hasUserCapability,
} from "../src/services/user-capability.service";
import {
    NotFoundException,
    UnauthorizedException,
} from "../src/utils/app-error";

const userId = new Types.ObjectId();
const otherUserId = new Types.ObjectId();
const linkId = new Types.ObjectId();
const studentId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();

const makeQuery = <T>(value: T) => {
    const query = {
        select: () => query,
        sort: () => query,
        then: (
            resolve: (result: T) => unknown,
            reject: (error: unknown) => unknown
        ) => Promise.resolve(value).then(resolve, reject),
    };
    return query;
};

const makeUser = (
    id = userId,
    capabilities: string[] | undefined = ["student"]
) => ({
    _id: id,
    status: "active",
    capabilities,
});

const makeLink = (overrides: Record<string, unknown> = {}) => ({
    _id: linkId,
    userId,
    studentId,
    workspaceId,
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
});

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
    _id: studentId,
    workspaceId,
    name: "Student One",
    email: "private@example.test",
    phone: "01000000000",
    schoolName: "Private School",
    grade: "Private Grade",
    notes: "Teacher-only note",
    status: "active",
    ...overrides,
});

const makeWorkspace = (overrides: Record<string, unknown> = {}) => ({
    _id: workspaceId,
    ownerId: userId,
    name: "Workspace One",
    slug: "workspace-one",
    description: "Private workspace description",
    status: "active",
    ...overrides,
});

const mockActiveAccess = (
    t: TestContext,
    overrides: {
        user?: ReturnType<typeof makeUser>;
        link?: ReturnType<typeof makeLink> | null;
        student?: ReturnType<typeof makeStudent> | null;
        workspace?: ReturnType<typeof makeWorkspace> | null;
    } = {}
) => {
    t.mock.method(
        UserModel,
        "findById",
        (async () => overrides.user ?? makeUser()) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        (() => makeQuery(overrides.link === undefined ? makeLink() : overrides.link)) as never
    );
    t.mock.method(
        StudentModel,
        "findOne",
        (() => makeQuery(overrides.student === undefined ? makeStudent() : overrides.student)) as never
    );
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (() => makeQuery(overrides.workspace === undefined ? makeWorkspace() : overrides.workspace)) as never
    );
};

test("active contexts are limited to the authenticated user's active links and safe DTO fields", async (t: TestContext) => {
    let capturedFilter: Record<string, unknown> | undefined;
    t.mock.method(
        UserModel,
        "findById",
        (async () => makeUser()) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "find",
        ((filter: Record<string, unknown>) => {
            capturedFilter = filter;
            return makeQuery([makeLink()]);
        }) as never
    );
    t.mock.method(
        StudentModel,
        "findOne",
        (() => makeQuery(makeStudent())) as never
    );
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (() => makeQuery(makeWorkspace())) as never
    );

    const contexts = await listActiveStudentContextsService(userId.toString());

    assert.deepEqual(capturedFilter, {
        userId: userId.toString(),
        status: "active",
    });
    assert.deepEqual(contexts, [
        {
            studentAccountLinkId: linkId.toString(),
            studentName: "Student One",
            workspaceName: "Workspace One",
        },
    ]);
    assert.deepEqual(Object.keys(contexts[0]).sort(), [
        "studentAccountLinkId",
        "studentName",
        "workspaceName",
    ]);
    assert.equal(JSON.stringify(contexts).includes("Teacher-only note"), false);
    assert.equal(JSON.stringify(contexts).includes("Private workspace description"), false);
});

test("a StudentAccountLink owned by another User cannot be selected", async (t: TestContext) => {
    let capturedFilter: Record<string, unknown> | undefined;
    t.mock.method(
        UserModel,
        "findById",
        (async () => makeUser()) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            capturedFilter = filter;
            return makeQuery(null);
        }) as never
    );

    await assert.rejects(
        resolveStudentAccessContextService(userId.toString(), linkId.toString()),
        (error: unknown) =>
            error instanceof NotFoundException &&
            error.message === "Student access not found"
    );
    assert.deepEqual(capturedFilter, {
        _id: linkId.toString(),
        userId: userId.toString(),
        status: "active",
    });
});

test("a Student capability is not required to receive an empty context list", async (t: TestContext) => {
    const linkLookup = t.mock.method(
        StudentAccountLinkModel,
        "find",
        (() => makeQuery([])) as never
    );
    t.mock.method(
        UserModel,
        "findById",
        (async () => makeUser(userId, ["teacher"])) as never
    );

    assert.deepEqual(
        await listActiveStudentContextsService(userId.toString()),
        []
    );
    assert.equal(linkLookup.mock.callCount(), 0);
});

test("inactive links are rejected by the active-link lookup", async (t: TestContext) => {
    let capturedFilter: Record<string, unknown> | undefined;
    t.mock.method(
        UserModel,
        "findById",
        (async () => makeUser()) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            capturedFilter = filter;
            return makeQuery(null);
        }) as never
    );

    await assert.rejects(
        resolveStudentAccessContextService(userId.toString(), linkId.toString()),
        NotFoundException
    );
    assert.equal(capturedFilter?.status, "active");
});

test("a link to an inactive Student is omitted from the context list and cannot be selected", async (t: TestContext) => {
    mockActiveAccess(t, { student: null });
    t.mock.method(
        StudentAccountLinkModel,
        "find",
        (() => makeQuery([makeLink()])) as never
    );

    assert.deepEqual(
        await listActiveStudentContextsService(userId.toString()),
        []
    );

    await assert.rejects(
        resolveStudentAccessContextService(userId.toString(), linkId.toString()),
        NotFoundException
    );
});

test("a link to an inactive Workspace is omitted from the context list and cannot be selected", async (t: TestContext) => {
    mockActiveAccess(t, { workspace: null });
    t.mock.method(
        StudentAccountLinkModel,
        "find",
        (() => makeQuery([makeLink()])) as never
    );

    assert.deepEqual(
        await listActiveStudentContextsService(userId.toString()),
        []
    );

    await assert.rejects(
        resolveStudentAccessContextService(userId.toString(), linkId.toString()),
        NotFoundException
    );
});

test("context selection is revalidated on later requests after link revocation", async (t: TestContext) => {
    let linkLookupCount = 0;
    t.mock.method(
        UserModel,
        "findById",
        (async () => makeUser()) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        (() => makeQuery(++linkLookupCount === 1 ? makeLink() : null)) as never
    );
    t.mock.method(
        StudentModel,
        "findOne",
        (() => makeQuery(makeStudent())) as never
    );
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (() => makeQuery(makeWorkspace())) as never
    );

    const selected = await resolveStudentAccessContextService(
        userId.toString(),
        linkId.toString()
    );
    assert.equal(selected.studentId, studentId.toString());

    await assert.rejects(
        resolveStudentAccessContextService(userId.toString(), linkId.toString()),
        NotFoundException
    );
    assert.equal(linkLookupCount, 2);
});

test("student middleware resolves identity from the owned link, not request-body IDs", async (t: TestContext) => {
    mockActiveAccess(t);
    const request = {
        user: { _id: userId },
        get: (header: string) =>
            header === "x-student-account-link" ? linkId.toString() : undefined,
        body: { studentId: otherUserId.toString(), workspaceId: otherUserId.toString() },
        params: {
            studentId: otherUserId.toString(),
            workspaceId: otherUserId.toString(),
        },
    };
    let nextError: unknown;

    await requireStudentAccess(
        request as unknown as Request,
        {} as Response,
        ((error?: unknown) => {
            nextError = error;
        }) as NextFunction
    );

    assert.equal(nextError, undefined);
    assert.equal(
        (request as unknown as Request & { studentContext?: { studentId: string } })
            .studentContext?.studentId,
        studentId.toString()
    );
});

test("selected-context DTOs expose only the link ID and safe display names", async (t: TestContext) => {
    mockActiveAccess(t);
    const context = await resolveStudentAccessContextService(
        userId.toString(),
        linkId.toString()
    );
    const dto = toStudentContextDto(context);

    assert.deepEqual(Object.keys(dto).sort(), [
        "studentAccountLinkId",
        "studentName",
        "workspaceName",
    ]);
    assert.equal("studentId" in dto, false);
    assert.equal("workspaceId" in dto, false);
    assert.equal("userId" in dto, false);
});

test("student middleware fails closed when the request is unauthenticated", async () => {
    let nextError: unknown;
    await requireStudentAccess(
        {
            get: () => linkId.toString(),
        } as unknown as Request,
        {} as Response,
        ((error?: unknown) => {
            nextError = error;
        }) as NextFunction
    );

    assert.ok(nextError instanceof UnauthorizedException);
});

test("student capability does not bypass StudentAccountLink ownership checks", async (t: TestContext) => {
    const lookup = t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        (() => makeQuery(null)) as never
    );
    t.mock.method(
        UserModel,
        "findById",
        (async () => makeUser(userId, ["student"])) as never
    );

    await assert.rejects(
        resolveStudentAccessContextService(userId.toString(), linkId.toString()),
        NotFoundException
    );
    assert.equal(lookup.mock.callCount(), 1);
});

test("legacy users still have teacher capability but do not gain student capability", async (t: TestContext) => {
    assert.equal(hasUserCapability({ capabilities: undefined }, "teacher"), true);
    assert.equal(hasUserCapability({ capabilities: undefined }, "student"), false);

    t.mock.method(
        WorkspaceModel,
        "findOne",
        (() => makeQuery(null)) as never
    );
    const capabilities = await getAccountCapabilitiesService({
        _id: userId,
        capabilities: undefined,
    } as never);

    assert.deepEqual(capabilities, {
        teacher: true,
        student: false,
        owner: false,
    });
});

test("authenticated account summary returns trusted capabilities without private User fields", async (t: TestContext) => {
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (() => makeQuery(null)) as never
    );
    let responseBody: Record<string, unknown> | undefined;
    const req = {
        user: {
            _id: userId,
            name: "Teacher One",
            email: "teacher@example.test",
            passwordHash: "must-not-be-returned",
            status: "active",
            lastLoginAt: null,
            capabilities: undefined,
        },
    };
    const res = {
        status: () => res,
        json: (body: Record<string, unknown>) => {
            responseBody = body;
            return res;
        },
    };

    await authStatusController(
        req as unknown as Request,
        res as unknown as Response,
        (() => undefined) as NextFunction
    );

    const returnedUser = responseBody?.user as Record<string, unknown>;
    assert.deepEqual(returnedUser.capabilities, {
        teacher: true,
        student: false,
        owner: false,
    });
    assert.equal("passwordHash" in returnedUser, false);
});

test("owner capability requires an active owned Workspace and active owner membership", async (t: TestContext) => {
    const workspaceQuery = t.mock.method(
        WorkspaceModel,
        "findOne",
        (() => makeQuery(makeWorkspace())) as never
    );
    const membership = t.mock.method(
        WorkspaceMemberModel,
        "exists",
        (async () => ({ _id: new Types.ObjectId() })) as never
    );

    const capabilities = await getAccountCapabilitiesService({
        _id: userId,
        capabilities: ["teacher"],
    } as never);

    assert.equal(workspaceQuery.mock.callCount(), 1);
    assert.equal(membership.mock.callCount(), 1);
    assert.deepEqual(capabilities, {
        teacher: true,
        student: false,
        owner: true,
    });
});
