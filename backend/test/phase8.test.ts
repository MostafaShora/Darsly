import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { TestContext, test } from "node:test";
import mongoose, { Types } from "mongoose";

import StudentAccountLinkModel from "../src/models/student-account-link.model";
import StudentModel from "../src/models/student.model";
import UserModel, { UserCapability } from "../src/models/user.model";
import WorkspaceMemberModel from "../src/models/workspace-member.model";
import WorkspaceModel from "../src/models/workspace.model";
import { registerSchema } from "../src/validators/auth.validation";
import { ForbiddenException, NotFoundException } from "../src/utils/app-error";
import {
    createStudentAccountLinkService,
    listActiveStudentAccountAccessesService,
    resolveStudentAccountAccessService,
} from "../src/services/student-account-link.service";
import {
    grantUserCapabilityService,
    hasUserCapability,
} from "../src/services/user-capability.service";
import {
    activateWorkspaceService,
    createWorkspaceService,
    getMyWorkspacesService,
} from "../src/services/workspace.service";
import { resolveWorkspaceAccess } from "../src/services/workspace-access.service";
import { registerService } from "../src/services/auth.service";

const userId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();
const studentId = new Types.ObjectId();

const makeUser = (
    capabilities?: UserCapability[],
    id: Types.ObjectId = userId
) => ({
    _id: id,
    name: "Test User",
    email: "student@example.test",
    passwordHash: "hashed",
    capabilities,
    status: "active" as const,
    lastLoginAt: null,
});

const makeStudent = (
    id: Types.ObjectId = studentId,
    tenantId: Types.ObjectId = workspaceId,
    status: "active" | "inactive" | "archived" = "active"
) => ({
    _id: id,
    workspaceId: tenantId,
    name: "Student One",
    phone: null,
    email: null,
    schoolName: "",
    grade: "",
    status,
    notes: "",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const makeWorkspace = (
    id: Types.ObjectId = workspaceId,
    status: "active" | "suspended" = "active"
) => ({
    _id: id,
    name: "Test Workspace",
    slug: "test-workspace",
    ownerId: userId,
    status,
    description: "",
    currency: "EGP" as const,
    suspensionType: status === "suspended" ? "owner" as const : null,
    suspendedAt: status === "suspended" ? new Date() : null,
    suspendedBy: status === "suspended" ? userId : null,
    suspensionReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
});

const mockWorkspaceCreation = (
    t: TestContext,
    user: ReturnType<typeof makeUser>
) => {
    const workspace = makeWorkspace();
    const session = {
        withTransaction: async <T>(callback: () => Promise<T>) => callback(),
        endSession: async () => undefined,
    };

    t.mock.method(UserModel, "findById", (() => user) as never);
    t.mock.method(WorkspaceModel, "exists", (() => null) as never);
    t.mock.method(
        mongoose,
        "startSession",
        (() => session) as never
    );
    t.mock.method(
        WorkspaceModel,
        "create",
        (async () => [workspace]) as never
    );
    t.mock.method(
        WorkspaceMemberModel,
        "create",
        (async () => [{}]) as never
    );
    t.mock.method(
        WorkspaceModel,
        "findById",
        (async () => workspace) as never
    );

    return workspace;
};

test("capabilities preserve legacy teacher access and support teacher, student, and both", () => {
    assert.equal(hasUserCapability({ capabilities: undefined }, "teacher"), true);
    assert.equal(hasUserCapability({ capabilities: undefined }, "student"), false);
    assert.equal(hasUserCapability({ capabilities: ["teacher"] }, "teacher"), true);
    assert.equal(hasUserCapability({ capabilities: ["teacher"] }, "student"), false);
    assert.equal(hasUserCapability({ capabilities: ["student"] }, "teacher"), false);
    assert.equal(hasUserCapability({ capabilities: ["student"] }, "student"), true);
    assert.equal(
        hasUserCapability({ capabilities: ["teacher", "student"] }, "teacher"),
        true
    );
    assert.equal(
        hasUserCapability({ capabilities: ["teacher", "student"] }, "student"),
        true
    );
});

test("granting student capability to a legacy User preserves teacher capability", async (t) => {
    let updatedCapabilities: UserCapability[] | undefined;
    t.mock.method(
        UserModel,
        "findOneAndUpdate",
        ((filter: { capabilities?: { $exists: boolean } }, update: { $set?: { capabilities: UserCapability[] } }) => {
            assert.deepEqual(filter, {
                _id: userId.toString(),
                capabilities: { $exists: false },
            });
            updatedCapabilities = update.$set?.capabilities;
            return { ...makeUser(updatedCapabilities), capabilities: updatedCapabilities } as never;
        }) as never
    );

    const result = await grantUserCapabilityService(userId.toString(), "student");

    assert.deepEqual(updatedCapabilities, ["teacher", "student"]);
    assert.equal(hasUserCapability(result, "teacher"), true);
    assert.equal(hasUserCapability(result, "student"), true);
});

test("granting teacher capability does not remove an existing student capability", async (t) => {
    t.mock.method(UserModel, "findOneAndUpdate", (() => null) as never);
    let update: unknown;
    t.mock.method(
        UserModel,
        "findByIdAndUpdate",
        ((id: string, value: unknown) => {
            assert.equal(id, userId.toString());
            update = value;
            return makeUser(["student", "teacher"]) as never;
        }) as never
    );

    const result = await grantUserCapabilityService(userId.toString(), "teacher");

    assert.deepEqual(update, { $addToSet: { capabilities: "teacher" } });
    assert.equal(hasUserCapability(result, "student"), true);
    assert.equal(hasUserCapability(result, "teacher"), true);
});

test("public registration strips requested capabilities and creates a teacher User", async (t) => {
    const createBody = {
        name: "Test User",
        email: "student@example.test",
        password: "a-secure-password",
        capabilities: ["student"],
    };
    const parsedBody = registerSchema.parse(createBody);
    let createdCapabilities: UserCapability[] | undefined;

    assert.deepEqual(Object.keys(parsedBody).sort(), ["email", "name", "password"]);

    t.mock.method(UserModel, "findOne", (async () => null) as never);
    t.mock.method(bcrypt, "hash", (async () => "hashed-password") as never);
    t.mock.method(
        UserModel,
        "create",
        ((data: { capabilities?: UserCapability[] }) => {
            createdCapabilities = data.capabilities;
            return makeUser(createdCapabilities) as never;
        }) as never
    );

    await registerService(parsedBody);

    assert.deepEqual(createdCapabilities, ["teacher"]);
});

test("student-only accounts cannot create Workspaces", async (t) => {
    t.mock.method(UserModel, "findById", (() => makeUser(["student"])) as never);
    const workspaceLookup = t.mock.method(
        WorkspaceModel,
        "exists",
        (() => null) as never
    );
    const startSession = t.mock.method(
        mongoose,
        "startSession",
        (() => {
            throw new Error("Workspace creation must not start");
        }) as never
    );

    await assert.rejects(
        createWorkspaceService(userId.toString(), { name: "Test Workspace" }),
        ForbiddenException
    );

    assert.equal(workspaceLookup.mock.callCount(), 0);
    assert.equal(startSession.mock.callCount(), 0);
});

test("legacy teacher accounts can create Workspaces", async (t) => {
    const legacyUser = makeUser(undefined);
    const workspace = mockWorkspaceCreation(t, legacyUser);
    const result = await createWorkspaceService(userId.toString(), {
        name: "Test Workspace",
    });

    assert.equal(result, workspace);
});

test("teacher-capable accounts, including dual-capability accounts, can create Workspaces", async (t) => {
    const teacherUser = makeUser(["teacher", "student"]);
    const workspace = mockWorkspaceCreation(t, teacherUser);
    const result = await createWorkspaceService(userId.toString(), {
        name: "Test Workspace",
    });

    assert.equal(result, workspace);
});

test("student-only accounts cannot use Workspace membership authorization", async (t) => {
    t.mock.method(UserModel, "findById", (() => makeUser(["student"])) as never);
    const membershipLookup = t.mock.method(
        WorkspaceMemberModel,
        "findOne",
        (() => ({
            role: "owner",
            status: "active",
        })) as never
    );

    await assert.rejects(
        resolveWorkspaceAccess(userId.toString(), workspaceId.toString()),
        ForbiddenException
    );
    assert.equal(membershipLookup.mock.callCount(), 0);
});

test("teacher capability does not replace active Workspace membership", async (t) => {
    t.mock.method(UserModel, "findById", (() => makeUser(["teacher"])) as never);
    t.mock.method(WorkspaceMemberModel, "findOne", (() => null) as never);
    const workspaceLookup = t.mock.method(
        WorkspaceModel,
        "findById",
        (() => {
            throw new Error("Workspace lookup must not run");
        }) as never
    );

    await assert.rejects(
        resolveWorkspaceAccess(userId.toString(), workspaceId.toString()),
        ForbiddenException
    );
    assert.equal(workspaceLookup.mock.callCount(), 0);
});

test("student-only accounts cannot activate a Workspace", async (t) => {
    t.mock.method(UserModel, "findById", (() => makeUser(["student"])) as never);
    const membershipLookup = t.mock.method(
        WorkspaceMemberModel,
        "findOne",
        (() => ({
            role: "owner",
            status: "active",
        })) as never
    );
    const workspaceLookup = t.mock.method(
        WorkspaceModel,
        "findById",
        (() => {
            throw new Error("Workspace lookup must not run");
        }) as never
    );

    await assert.rejects(
        activateWorkspaceService(userId.toString(), workspaceId.toString()),
        ForbiddenException
    );
    assert.equal(membershipLookup.mock.callCount(), 0);
    assert.equal(workspaceLookup.mock.callCount(), 0);
});

test("student-only accounts cannot list teacher Workspaces", async (t) => {
    t.mock.method(UserModel, "findById", (() => makeUser(["student"])) as never);
    const membershipLookup = t.mock.method(
        WorkspaceMemberModel,
        "find",
        (() => []) as never
    );

    await assert.rejects(
        getMyWorkspacesService(userId.toString()),
        ForbiddenException
    );
    assert.equal(membershipLookup.mock.callCount(), 0);
});

test("creating a Student link verifies tenant ownership and defaults it to pending", async (t) => {
    const user = makeUser(["student"]);
    let createdLink: Record<string, unknown> | undefined;

    t.mock.method(UserModel, "findById", (() => user) as never);
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: { _id: string; workspaceId: string; status: string }) => {
            assert.deepEqual(filter, {
                _id: studentId.toString(),
                workspaceId: workspaceId.toString(),
                status: "active",
            });
            return makeStudent() as never;
        }) as never
    );
    t.mock.method(StudentAccountLinkModel, "findOne", (async () => null) as never);
    t.mock.method(
        StudentAccountLinkModel,
        "create",
        ((data: Record<string, unknown>) => {
            createdLink = data;
            return data as never;
        }) as never
    );

    await createStudentAccountLinkService(
        user._id.toString(),
        workspaceId.toString(),
        studentId.toString()
    );

    assert.equal(createdLink?.status, "pending");
    assert.equal(createdLink?.userId?.toString(), user._id.toString());
    assert.equal(createdLink?.workspaceId?.toString(), workspaceId.toString());
    assert.equal(createdLink?.studentId?.toString(), studentId.toString());
});

test("Student links reject a Student from another Workspace", async (t) => {
    t.mock.method(UserModel, "findById", (() => makeUser(["student"])) as never);
    t.mock.method(StudentModel, "findOne", (async () => null) as never);
    const linkCreate = t.mock.method(
        StudentAccountLinkModel,
        "create",
        (async () => {
            throw new Error("A link must not be created");
        }) as never
    );

    await assert.rejects(
        createStudentAccountLinkService(
            userId.toString(),
            workspaceId.toString(),
            studentId.toString()
        ),
        NotFoundException
    );
    assert.equal(linkCreate.mock.callCount(), 0);
});

test("Student link creation rejects an existing claim by another User", async (t) => {
    const otherUserId = new Types.ObjectId();
    const claimedByUserIds: string[] = [];
    const duplicateQueries: Record<string, unknown>[] = [];
    let hasExistingLink = false;
    let creates = 0;

    t.mock.method(UserModel, "findById", ((id: Types.ObjectId) =>
        makeUser(["student"], id)) as never);
    t.mock.method(StudentModel, "findOne", (async () => makeStudent()) as never);
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            duplicateQueries.push(filter);
            return hasExistingLink
                ? { userId: new Types.ObjectId(claimedByUserIds[0]) }
                : null;
        }) as never
    );
    t.mock.method(
        StudentAccountLinkModel,
        "create",
        ((data: { userId: Types.ObjectId }) => {
            creates += 1;
            claimedByUserIds.push(data.userId.toString());
            hasExistingLink = true;
            return data as never;
        }) as never
    );

    await createStudentAccountLinkService(
        userId.toString(),
        workspaceId.toString(),
        studentId.toString()
    );
    await assert.rejects(
        createStudentAccountLinkService(
            otherUserId.toString(),
            workspaceId.toString(),
            studentId.toString()
        ),
        /already exists/
    );

    assert.equal(creates, 1);
    assert.equal(claimedByUserIds[0], userId.toString());
    assert.deepEqual(duplicateQueries[0], {
        $or: [
            { workspaceId: workspaceId.toString(), studentId: studentId.toString() },
            { userId: userId.toString(), studentId: studentId.toString() },
        ],
    });
    assert.deepEqual(duplicateQueries[1], {
        $or: [
            { workspaceId: workspaceId.toString(), studentId: studentId.toString() },
            { userId: otherUserId.toString(), studentId: studentId.toString() },
        ],
    });
});

test("duplicate User/Student links are rejected before insertion", async (t) => {
    const user = makeUser(["student"]);
    const linkCreate = t.mock.method(
        StudentAccountLinkModel,
        "create",
        (async () => {
            throw new Error("A duplicate link must not be inserted");
        }) as never
    );

    t.mock.method(UserModel, "findById", (() => user) as never);
    t.mock.method(StudentModel, "findOne", (async () => makeStudent()) as never);
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        (async () => ({ userId: user._id, studentId })) as never
    );

    await assert.rejects(
        createStudentAccountLinkService(
            user._id.toString(),
            workspaceId.toString(),
            studentId.toString()
        ),
        /already exists/
    );
    assert.equal(linkCreate.mock.callCount(), 0);
});

test("duplicate index errors are rejected", async (t) => {
    t.mock.method(UserModel, "findById", (() => makeUser(["student"])) as never);
    t.mock.method(StudentModel, "findOne", (async () => makeStudent()) as never);
    t.mock.method(StudentAccountLinkModel, "findOne", (async () => null) as never);
    t.mock.method(
        StudentAccountLinkModel,
        "create",
        (async () => {
            const error = new Error("duplicate key") as Error & { code: number };
            error.code = 11000;
            throw error;
        }) as never
    );

    await assert.rejects(
        createStudentAccountLinkService(
            userId.toString(),
            workspaceId.toString(),
            studentId.toString()
        ),
        /already exists/
    );
});

test("one User can create multiple pending links across Workspaces", async (t) => {
    const secondWorkspaceId = new Types.ObjectId();
    const secondStudentId = new Types.ObjectId();
    const students = new Map([
        [studentId.toString(), makeStudent()],
        [
            secondStudentId.toString(),
            makeStudent(secondStudentId, secondWorkspaceId),
        ],
    ]);
    const createdLinks: Array<{
        studentId: string;
        workspaceId: string;
        status: string;
    }> = [];

    t.mock.method(UserModel, "findById", (() => makeUser(["student"])) as never);
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: { _id: string }) => students.get(filter._id)) as never
    );
    t.mock.method(StudentAccountLinkModel, "findOne", (async () => null) as never);
    t.mock.method(
        StudentAccountLinkModel,
        "create",
        ((data: Record<string, unknown>) => {
            createdLinks.push({
                studentId: data.studentId!.toString(),
                workspaceId: data.workspaceId!.toString(),
                status: String(data.status),
            });
            return data as never;
        }) as never
    );

    await createStudentAccountLinkService(
        userId.toString(),
        workspaceId.toString(),
        studentId.toString()
    );
    await createStudentAccountLinkService(
        userId.toString(),
        secondWorkspaceId.toString(),
        secondStudentId.toString()
    );

    assert.deepEqual(createdLinks, [
        {
            studentId: studentId.toString(),
            workspaceId: workspaceId.toString(),
            status: "pending",
        },
        {
            studentId: secondStudentId.toString(),
            workspaceId: secondWorkspaceId.toString(),
            status: "pending",
        },
    ]);
    const indexes = StudentAccountLinkModel.schema.indexes();
    assert.ok(
        indexes.some(
            ([keys, options]) =>
                keys.workspaceId === 1 &&
                keys.studentId === 1 &&
                options.unique === true
        )
    );
    assert.ok(
        indexes.some(
            ([keys, options]) =>
                keys.userId === 1 &&
                keys.studentId === 1 &&
                options.unique === true
        )
    );
    const userStatusIndex = indexes.find(
        ([keys]) => keys.userId === 1 && keys.status === 1
    );
    assert.ok(userStatusIndex);
    assert.notEqual(userStatusIndex[1].unique, true);
});

test("one User can resolve multiple active links across Workspaces", async (t) => {
    const user = makeUser(["student"]);
    const secondWorkspaceId = new Types.ObjectId();
    const secondStudentId = new Types.ObjectId();
    const links = [
        {
            userId: user._id,
            workspaceId,
            studentId,
            status: "active",
        },
        {
            userId: user._id,
            workspaceId: secondWorkspaceId,
            studentId: secondStudentId,
            status: "active",
        },
    ];
    const students = new Map([
        [studentId.toString(), makeStudent()],
        [
            secondStudentId.toString(),
            makeStudent(secondStudentId, secondWorkspaceId),
        ],
    ]);
    const workspaces = new Map([
        [workspaceId.toString(), makeWorkspace()],
        [
            secondWorkspaceId.toString(),
            makeWorkspace(secondWorkspaceId),
        ],
    ]);

    t.mock.method(UserModel, "findById", (() => user) as never);
    t.mock.method(
        StudentAccountLinkModel,
        "find",
        ((filter: Record<string, unknown>) => {
            assert.deepEqual(filter, {
                userId: user._id.toString(),
                status: "active",
            });
            return links;
        }) as never
    );
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: { _id: Types.ObjectId }) =>
            students.get(filter._id.toString())) as never
    );
    t.mock.method(
        WorkspaceModel,
        "findOne",
        ((filter: { _id: Types.ObjectId }) =>
            workspaces.get(filter._id.toString())) as never
    );

    const accesses = await listActiveStudentAccountAccessesService(
        user._id.toString()
    );

    assert.equal(accesses.length, 2);
    assert.deepEqual(
        accesses.map((access) => access.workspace._id.toString()),
        [workspaceId.toString(), secondWorkspaceId.toString()]
    );
    const indexes = StudentAccountLinkModel.schema.indexes();
    const workspaceStudentIndex = indexes.find(
        ([keys]) => keys.workspaceId === 1 && keys.studentId === 1
    );
    const userStudentIndex = indexes.find(
        ([keys]) => keys.userId === 1 && keys.studentId === 1
    );
    const userStatusIndex = indexes.find(
        ([keys]) => keys.userId === 1 && keys.status === 1
    );

    assert.equal(workspaceStudentIndex?.[1].unique, true);
    assert.equal(userStudentIndex?.[1].unique, true);
    assert.notEqual(userStatusIndex?.[1].unique, true);
});

test("only an active link owned by the authenticated student resolves", async (t) => {
    const ownerId = new Types.ObjectId();
    const link = {
        userId: ownerId,
        workspaceId,
        studentId,
        status: "active",
    };
    let linkFilter: Record<string, unknown> | undefined;

    t.mock.method(UserModel, "findById", (() => makeUser(["student"], ownerId)) as never);
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            linkFilter = filter;
            return link as never;
        }) as never
    );
    t.mock.method(StudentModel, "findOne", (async () => makeStudent()) as never);
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (async () => makeWorkspace()) as never
    );

    const access = await resolveStudentAccountAccessService(
        ownerId.toString(),
        workspaceId.toString(),
        studentId.toString()
    );

    assert.equal(linkFilter?.userId, ownerId.toString());
    assert.equal(linkFilter?.status, "active");
    assert.equal(access.student._id, studentId);
    assert.equal(access.workspace._id, workspaceId);
});

test("pending or foreign Student links do not resolve", async (t) => {
    const ownerId = new Types.ObjectId();
    const otherUserId = new Types.ObjectId();
    const queries: Record<string, unknown>[] = [];

    t.mock.method(UserModel, "findById", ((id: string) =>
        makeUser(["student"], new Types.ObjectId(id))) as never);
    t.mock.method(
        StudentAccountLinkModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            queries.push(filter);
            return null;
        }) as never
    );

    await assert.rejects(
        resolveStudentAccountAccessService(
            ownerId.toString(),
            workspaceId.toString(),
            studentId.toString()
        ),
        NotFoundException
    );
    await assert.rejects(
        resolveStudentAccountAccessService(
            otherUserId.toString(),
            workspaceId.toString(),
            studentId.toString()
        ),
        NotFoundException
    );

    assert.equal(queries.length, 2);
    assert.equal(queries[0].userId, ownerId.toString());
    assert.equal(queries[1].userId, otherUserId.toString());
    assert.equal(queries[0].status, "active");
});

test("inactive Students and suspended Workspaces do not grant Student access", async (t) => {
    const user = makeUser(["student"]);
    const activeLink = {
        userId: user._id,
        workspaceId,
        studentId,
        status: "active",
    };
    t.mock.method(UserModel, "findById", (() => user) as never);
    t.mock.method(StudentAccountLinkModel, "findOne", (() => activeLink) as never);

    let studentStatus: "active" | "inactive" = "inactive";
    let workspaceStatus: "active" | "suspended" = "active";
    t.mock.method(StudentModel, "findOne", (async () =>
        makeStudent(studentId, workspaceId, studentStatus)) as never);
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (async () => makeWorkspace(workspaceId, workspaceStatus)) as never
    );
    await assert.rejects(
        resolveStudentAccountAccessService(
            user._id.toString(),
            workspaceId.toString(),
            studentId.toString()
        ),
        NotFoundException
    );

    studentStatus = "active";
    workspaceStatus = "suspended";
    await assert.rejects(
        resolveStudentAccountAccessService(
            user._id.toString(),
            workspaceId.toString(),
            studentId.toString()
        ),
        NotFoundException
    );
});

test("active Student access listing excludes suspended and inactive records", async (t) => {
    const user = makeUser(["student"]);
    const link = {
        userId: user._id,
        workspaceId,
        studentId,
        status: "active",
    };

    t.mock.method(UserModel, "findById", (() => user) as never);
    t.mock.method(StudentAccountLinkModel, "find", (async () => [link]) as never);
    t.mock.method(StudentModel, "findOne", (async () => makeStudent()) as never);
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (async () => makeWorkspace(workspaceId, "suspended")) as never
    );

    const accesses = await listActiveStudentAccountAccessesService(
        user._id.toString()
    );

    assert.deepEqual(accesses, []);
});
