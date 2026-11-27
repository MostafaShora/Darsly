import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TestContext, test } from "node:test";
import { Types } from "mongoose";

import StudentAccountLinkModel from "../src/models/student-account-link.model";
import StudentInvitationModel, {
    StudentInvitationDocument,
} from "../src/models/student-invitation.model";
import StudentModel from "../src/models/student.model";
import UserModel from "../src/models/user.model";
import WorkspaceMemberModel from "../src/models/workspace-member.model";
import {
    createStudentInvitationController,
    listStudentInvitationsController,
} from "../src/controllers/student-invitation.controller";
import {
    getStudentInvitationStatus,
    toStudentInvitationDto,
} from "../src/dtos/student-invitation.dto";
import { requireWorkspaceAccess } from "../src/middlewares/workspace-access.middleware";
import {
    createStudentInvitationService,
    getStudentInvitationService,
    listStudentInvitationsService,
    revokeStudentInvitationService,
} from "../src/services/student-invitation.service";
import {
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "../src/utils/app-error";
import { createStudentInvitationSchema } from "../src/validators/student-invitation.validation";

const userId = new Types.ObjectId();
const otherUserId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();
const otherWorkspaceId = new Types.ObjectId();
const studentId = new Types.ObjectId();
const invitationId = new Types.ObjectId();
const createdAt = new Date("2026-03-01T10:00:00.000Z");
const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);

const makeStudent = () => ({
    _id: studentId,
    workspaceId,
    name: "Student One",
    status: "active" as const,
});

const makeInvitation = (
    overrides: Record<string, unknown> = {}
) => ({
    _id: invitationId,
    workspaceId,
    studentId,
    secretHash: "a".repeat(64),
    createdBy: userId,
    expiresAt,
    revokedAt: null,
    revokedBy: null,
    consumedAt: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
}) as StudentInvitationDocument;

const makeResponse = () => {
    const response: {
        statusCode: number;
        body: unknown;
        status: (code: number) => typeof response;
        json: (body: unknown) => void;
    } = {
        statusCode: 0,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
        },
    };

    return response;
};

test("Workspace authorization rejects student-only Users and teachers without active membership", async (t: TestContext) => {
    let capabilities = ["student"];
    t.mock.method(
        UserModel,
        "findById",
        (() => ({ _id: userId, status: "active", capabilities })) as never
    );
    const membershipLookup = t.mock.method(
        WorkspaceMemberModel,
        "findOne",
        (async () => null) as never
    );
    const middleware = requireWorkspaceAccess();
    const request = {
        user: { _id: userId },
        params: { workspaceId: workspaceId.toString() },
    } as never;
    const invokeMiddleware = async () => {
        let nextError: unknown;
        await middleware(request, {} as never, (error?: unknown) => {
            nextError = error;
        });
        return nextError;
    };

    assert.ok((await invokeMiddleware()) instanceof ForbiddenException);
    assert.equal(membershipLookup.mock.callCount(), 0);

    capabilities = ["teacher"];
    assert.ok((await invokeMiddleware()) instanceof ForbiddenException);
    assert.equal(membershipLookup.mock.callCount(), 1);
});

test("creation uses trusted Workspace context, stores only a hashed secret, and expires after seven days", async (t) => {
    let studentFilter: Record<string, unknown> | undefined;
    let persisted: Record<string, unknown> | undefined;
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            studentFilter = filter;
            return makeStudent();
        }) as never
    );
    t.mock.method(
        StudentInvitationModel,
        "create",
        (async (documents: Array<Record<string, unknown>>) => {
            persisted = documents[0];
            return [
                {
                    ...persisted,
                    _id: invitationId,
                    createdAt: persisted.createdAt,
                    updatedAt: persisted.updatedAt,
                },
            ];
        }) as never
    );
    const linkCreate = t.mock.method(
        StudentAccountLinkModel,
        "create",
        (async () => {
            throw new Error("Invitation creation must not create a Student link");
        }) as never
    );
    const before = Date.now();
    const result = await createStudentInvitationService(
        workspaceId,
        userId.toString(),
        studentId.toString()
    );
    const after = Date.now();

    assert.deepEqual(studentFilter, {
        _id: studentId.toString(),
        workspaceId,
        status: "active",
    });
    assert.equal(persisted?.workspaceId, workspaceId);
    assert.equal(persisted?.studentId?.toString(), studentId.toString());
    assert.equal(persisted?.createdBy?.toString(), userId.toString());
    assert.ok((persisted?.createdAt as Date).getTime() >= before);
    assert.ok((persisted?.createdAt as Date).getTime() <= after);
    assert.equal(
        (persisted?.expiresAt as Date).getTime() -
            (persisted?.createdAt as Date).getTime(),
        7 * 24 * 60 * 60 * 1000
    );
    assert.match(result.invitationSecret, /^[a-f0-9]{64}$/);
    assert.equal(
        persisted?.secretHash,
        createHash("sha256").update(result.invitationSecret).digest("hex")
    );
    assert.equal("invitationSecret" in (persisted ?? {}), false);
    assert.equal("secret" in (persisted ?? {}), false);
    assert.equal(linkCreate.mock.callCount(), 0);
});

test("creation rejects inactive or foreign-Workspace Students", async (t) => {
    let creates = 0;
    const filters: Record<string, unknown>[] = [];
    t.mock.method(
        StudentModel,
        "findOne",
        ((filter: Record<string, unknown>) => {
            filters.push(filter);
            return null;
        }) as never
    );
    t.mock.method(
        StudentInvitationModel,
        "create",
        (async () => {
            creates += 1;
            return [makeInvitation()];
        }) as never
    );

    await assert.rejects(
        createStudentInvitationService(
            workspaceId,
            userId.toString(),
            studentId.toString()
        ),
        NotFoundException
    );

    assert.deepEqual(filters[0], {
        _id: studentId.toString(),
        workspaceId,
        status: "active",
    });
    assert.equal(creates, 0);
});

test("controller derives creator and Workspace from authorized request context and returns the raw secret only at creation", async (t) => {
    let persisted: Record<string, unknown> | undefined;
    t.mock.method(StudentModel, "findOne", (async () => makeStudent()) as never);
    t.mock.method(
        StudentInvitationModel,
        "create",
        (async (documents: Array<Record<string, unknown>>) => {
            persisted = documents[0];
            return [
                {
                    ...persisted,
                    _id: invitationId,
                    createdAt: persisted.createdAt,
                    updatedAt: persisted.updatedAt,
                },
            ];
        }) as never
    );

    const response = makeResponse();
    let nextError: unknown;
    await createStudentInvitationController(
        {
            workspaceContext: {
                userId: userId.toString(),
                workspace: { _id: workspaceId },
            },
            validated: {
                body: {
                    studentId: studentId.toString(),
                    createdBy: otherUserId.toString(),
                    expiresAt: "2099-01-01T00:00:00.000Z",
                },
            },
        } as never,
        response as never,
        (error?: unknown) => {
            nextError = error;
        }
    );

    assert.equal(nextError, undefined);
    assert.equal(response.statusCode, 201);
    assert.equal(persisted?.createdBy?.toString(), userId.toString());
    assert.equal(persisted?.workspaceId, workspaceId);
    const body = response.body as { data: Record<string, unknown> };
    assert.match(String(body.data.invitationSecret), /^[a-f0-9]{64}$/);
    assert.equal("secretHash" in body.data, false);
    assert.equal("expiresAt" in body.data, true);
    assert.equal(
        createStudentInvitationSchema.parse({
            studentId: studentId.toString(),
            expiresAt: "2099-01-01T00:00:00.000Z",
        }).studentId,
        studentId.toString()
    );
});

test("list query is Workspace-scoped and DTO metadata never includes the hash", async (t) => {
    const listedInvitation = makeInvitation();
    let findFilter: Record<string, unknown> | undefined;
    let countFilter: Record<string, unknown> | undefined;
    const query = {
        sort: () => query,
        skip: () => query,
        limit: async () => [listedInvitation],
    };
    t.mock.method(
        StudentInvitationModel,
        "find",
        ((filter: Record<string, unknown>) => {
            findFilter = filter;
            return query;
        }) as never
    );
    t.mock.method(
        StudentInvitationModel,
        "countDocuments",
        (async (filter: Record<string, unknown>) => {
            countFilter = filter;
            return 1;
        }) as never
    );

    const result = await listStudentInvitationsService(workspaceId, {
        page: 1,
        pageSize: 20,
        studentId: studentId.toString(),
    });
    const dto = toStudentInvitationDto(listedInvitation, createdAt);

    assert.deepEqual(findFilter, {
        workspaceId,
        studentId,
    });
    assert.deepEqual(countFilter, findFilter);
    assert.equal(result.items.length, 1);
    assert.equal("secretHash" in dto, false);
    assert.equal("createdBy" in dto, false);
    assert.equal(dto.status, "active");

    const response = makeResponse();
    let nextError: unknown;
    await listStudentInvitationsController(
        {
            workspaceContext: {
                userId: userId.toString(),
                workspace: { _id: workspaceId },
            },
            validated: {
                query: {
                    page: 1,
                    pageSize: 20,
                    studentId: studentId.toString(),
                },
            },
        } as never,
        response as never,
        (error?: unknown) => {
            nextError = error;
        }
    );

    assert.equal(nextError, undefined);
    const responseBody = response.body as {
        data: { items: Array<Record<string, unknown>> };
    };
    assert.equal(responseBody.data.items.length, 1);
    assert.equal("secretHash" in responseBody.data.items[0], false);
    assert.equal("invitationSecret" in responseBody.data.items[0], false);
});

test("invitation indexes support hash lookup and Workspace listings without restricting repeat invitations", () => {
    const indexes = StudentInvitationModel.schema.indexes();
    const hashIndex = indexes.find(([keys]) => keys.secretHash === 1);
    const workspaceIndex = indexes.find(
        ([keys]) => keys.workspaceId === 1 && keys.createdAt === -1
    );
    const studentIndex = indexes.find(
        ([keys]) =>
            keys.workspaceId === 1 &&
            keys.studentId === 1 &&
            keys.createdAt === -1
    );

    assert.equal(hashIndex?.[1].unique, true);
    assert.equal(workspaceIndex?.[1].unique, undefined);
    assert.equal(studentIndex?.[1].unique, undefined);
    assert.equal(
        StudentInvitationModel.schema.path("secretHash").options.select,
        false
    );
    assert.equal(
        indexes.some(
            ([keys, options]) =>
                keys.workspaceId === 1 &&
                keys.studentId === 1 &&
                options.unique === true
        ),
        false
    );
});

test("single invitation lookup cannot cross Workspace boundaries", async (t) => {
    let filter: Record<string, unknown> | undefined;
    t.mock.method(
        StudentInvitationModel,
        "findOne",
        (async (query: Record<string, unknown>) => {
            filter = query;
            return null;
        }) as never
    );

    await assert.rejects(
        getStudentInvitationService(otherWorkspaceId, invitationId.toString()),
        NotFoundException
    );
    assert.deepEqual(filter, {
        _id: invitationId.toString(),
        workspaceId: otherWorkspaceId,
    });
});

test("expiration is inclusive and revoked invitations never become active", () => {
    const invitation = makeInvitation();

    assert.equal(
        getStudentInvitationStatus(invitation, new Date(expiresAt.getTime() - 1)),
        "active"
    );
    assert.equal(getStudentInvitationStatus(invitation, expiresAt), "expired");
    assert.equal(
        getStudentInvitationStatus(
            { ...invitation, revokedAt: new Date() },
            new Date(expiresAt.getTime() - 1)
        ),
        "revoked"
    );
    assert.equal(
        getStudentInvitationStatus(
            { ...invitation, consumedAt: createdAt },
            new Date(expiresAt.getTime() - 1)
        ),
        "consumed"
    );

    const dto = toStudentInvitationDto(
        makeInvitation({ revokedAt: createdAt }),
        new Date(createdAt.getTime() + 1)
    );
    assert.equal(dto.status, "revoked");
});

test("revocation is Workspace-scoped, records the authenticated revoker, and rejects expired or revoked invitations", async (t) => {
    const filters: Record<string, unknown>[] = [];
    let currentInvitation: StudentInvitationDocument = makeInvitation({
        expiresAt: new Date(Date.now() - 1),
    });
    const update = t.mock.method(
        StudentInvitationModel,
        "findOneAndUpdate",
        ((filter: Record<string, unknown>) => {
            filters.push(filter);
            return null;
        }) as never
    );
    t.mock.method(
        StudentInvitationModel,
        "findOne",
        (async (filter: Record<string, unknown>) =>
            filter.workspaceId === currentInvitation.workspaceId
                ? currentInvitation
                : null) as never
    );

    await assert.rejects(
        revokeStudentInvitationService(
            otherWorkspaceId,
            invitationId.toString(),
            userId.toString()
        ),
        NotFoundException
    );
    await assert.rejects(
        revokeStudentInvitationService(
            workspaceId,
            invitationId.toString(),
            userId.toString()
        ),
        ConflictException
    );

    currentInvitation = makeInvitation({
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        revokedBy: otherUserId,
    });
    await assert.rejects(
        revokeStudentInvitationService(
            workspaceId,
            invitationId.toString(),
            userId.toString()
        ),
        ConflictException
    );

    assert.equal(update.mock.callCount(), 3);
    assert.equal(filters[0].workspaceId, otherWorkspaceId);
    assert.equal(filters[1].workspaceId, workspaceId);
    assert.equal(filters[2].workspaceId, workspaceId);
    assert.equal(filters[2].revokedAt, null);
    assert.ok(
        (filters[2].expiresAt as { $gt: Date }).$gt instanceof Date
    );
});

test("successful revocation records actor and duplicate-key conflicts are surfaced safely", async (t) => {
    let updateFilter: Record<string, unknown> | undefined;
    let updateData: Record<string, unknown> | undefined;
    const revoked = makeInvitation({
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        revokedBy: userId,
    });
    t.mock.method(
        StudentInvitationModel,
        "findOneAndUpdate",
        (async (
            filter: Record<string, unknown>,
            update: Record<string, unknown>
        ) => {
            updateFilter = filter;
            updateData = update;
            return revoked;
        }) as never
    );

    const result = await revokeStudentInvitationService(
        workspaceId,
        invitationId.toString(),
        userId.toString()
    );

    assert.equal(updateFilter?.workspaceId, workspaceId);
    assert.equal(
        (
            (updateData?.$set as Record<string, unknown>).revokedBy as Types.ObjectId
        ).toString(),
        userId.toString()
    );
    assert.equal(result.revokedBy?.toString(), userId.toString());

    t.mock.method(StudentModel, "findOne", (async () => makeStudent()) as never);
    t.mock.method(
        StudentInvitationModel,
        "create",
        (async () => {
            const error = new Error("duplicate key") as Error & { code: number };
            error.code = 11000;
            throw error;
        }) as never
    );

    await assert.rejects(
        createStudentInvitationService(
            workspaceId,
            userId.toString(),
            studentId.toString()
        ),
        ConflictException
    );
});
