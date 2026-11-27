import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { TestContext, test } from "node:test";
import mongoose, { Types } from "mongoose";
import StudentAccountLinkModel from "../src/models/student-account-link.model";
import StudentInvitationModel from "../src/models/student-invitation.model";
import StudentInvitationRedemptionModel from "../src/models/student-invitation-redemption.model";
import StudentModel from "../src/models/student.model";
import UserModel from "../src/models/user.model";
import WorkspaceModel from "../src/models/workspace.model";
import {
    createStudentInvitationClaimTokenHash,
    createStudentInvitationEmailHash,
    createStudentInvitationOtpHash,
    createStudentInvitationSecretHash,
} from "../src/services/student-invitation-otp.crypto";
import {
    approveStudentInvitationRedemptionService,
    rejectStudentInvitationRedemptionService,
} from "../src/services/student-invitation-approval.service";
import { StudentInvitationEmailProvider } from "../src/services/student-invitation-email.service";
import {
    finalizeStudentInvitationRedemption,
    completeStudentInvitationRegistrationService,
    requestStudentInvitationOtpService,
    startStudentInvitationRedemptionService,
    verifyStudentInvitationOtpService,
} from "../src/services/student-invitation-redemption.service";
import {
    BadRequestException,
    ConflictException,
    ServiceUnavailableException,
} from "../src/utils/app-error";

const userId = new Types.ObjectId();
const workspaceId = new Types.ObjectId();
const studentId = new Types.ObjectId();
const invitationId = new Types.ObjectId();
const redemptionId = new Types.ObjectId();
const now = new Date("2026-04-04T10:00:00.000Z");
const claimToken = "b".repeat(64);
const invitationSecret = "a".repeat(64);
const testJwtSecret = "phase8-test-jwt-secret-with-32-bytes-minimum";
let rateReservationId = 0;
const testRateLimiter = {
    reserve: async (keyHash: string) => ({
        keyHash,
        reservationId: `test-reservation-${++rateReservationId}`,
    }),
    release: async () => undefined,
};

const withOtpSecret = async <T>(callback: () => Promise<T>): Promise<T> => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = testJwtSecret;
    try {
        return await callback();
    } finally {
        if (previous === undefined) {
            delete process.env.JWT_SECRET;
        } else {
            process.env.JWT_SECRET = previous;
        }
    }
};

const makeQuery = <T>(value: T, sessions: unknown[] = []) => {
    const query = {
        select: () => query,
        session: (session: unknown) => {
            sessions.push(session);
            return Promise.resolve(value);
        },
        sort: () => query,
        skip: () => query,
        limit: () => Promise.resolve(value),
        then: (
            resolve: (result: T) => unknown,
            reject: (error: unknown) => unknown
        ) => Promise.resolve(value).then(resolve, reject),
    };
    return query;
};

const makeInvitation = (overrides: Record<string, unknown> = {}) => ({
    _id: invitationId,
    workspaceId,
    studentId,
    secretHash: createStudentInvitationSecretHash(invitationSecret),
    expiresAt: new Date(now.getTime() + 60_000),
    revokedAt: null,
    consumedAt: null,
    ...overrides,
});

const makeStudent = (overrides: Record<string, unknown> = {}) => ({
    _id: studentId,
    workspaceId,
    name: "Student One",
    email: "student@example.test",
    status: "active",
    ...overrides,
});

const makeRedemption = (overrides: Record<string, unknown> = {}) => ({
    _id: redemptionId,
    invitationId,
    workspaceId,
    studentId,
    claimTokenHash: createStudentInvitationClaimTokenHash(claimToken),
    userId: null,
    state: "claimed",
    otpStatus: "none",
    otpHash: null,
    otpEmailHash: null,
    verifiedEmailHash: null,
    otpExpiresAt: null,
    otpAttempts: 0,
    otpSendTimes: [],
    otpChallengeVersion: 0,
    otpVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
});

test("redemption start stores only a claim-token hash and enforces one redemption per invitation", async (t: TestContext) => {
    const invitation = makeInvitation();
    const persisted: Record<string, unknown>[] = [];
    t.mock.method(
        StudentInvitationModel,
        "findOne",
        (() => makeQuery(invitation)) as never
    );
    t.mock.method(
        StudentModel,
        "findOne",
        (async () => makeStudent()) as never
    );
    t.mock.method(
        StudentInvitationRedemptionModel,
        "create",
        (async (document: Record<string, unknown>) => {
            persisted.push(document);
            return { ...document, _id: redemptionId };
        }) as never
    );

    const result = await startStudentInvitationRedemptionService(
        invitationSecret,
        now
    );

    assert.equal(result.redemptionId, redemptionId.toString());
    assert.match(result.claimToken, /^[a-f0-9]{64}$/);
    assert.equal(
        persisted[0].claimTokenHash,
        createStudentInvitationClaimTokenHash(result.claimToken)
    );
    assert.equal("claimToken" in persisted[0], false);
    assert.equal("invitationSecret" in persisted[0], false);
    const invitationIndexes = StudentInvitationRedemptionModel.schema.indexes();
    assert.equal(
        invitationIndexes.find(([keys]) => keys.invitationId === 1)?.[1].unique,
        true
    );
});

test("OTP delivery is fail-closed when no provider is configured", async (t: TestContext) => {
    const lookup = t.mock.method(
        StudentInvitationRedemptionModel,
        "findOne",
        (() => {
            throw new Error("Must not query when delivery is unavailable");
        }) as never
    );

    await assert.rejects(
        requestStudentInvitationOtpService(
            redemptionId.toString(),
            claimToken,
            "192.0.2.10",
            {
                available: false,
                async sendOtpEmail() {
                    throw new Error("Unavailable provider must not be called");
                },
            }
        ),
        ServiceUnavailableException
    );
    assert.equal(lookup.mock.callCount(), 0);
});

test("OTP requests reserve a hashed challenge, enforce cooldown limits, and never return the code", async (t: TestContext) => {
    await withOtpSecret(async () => {
        const redemption = makeRedemption();
        const reserved = makeRedemption({
            state: "otp_pending",
            otpStatus: "sending",
            otpChallengeVersion: 1,
        });
        const updates: Array<Record<string, unknown>> = [];
        let updateCount = 0;
        let deliveredMessage: { recipient: string; code: string; expiresAt: Date } | undefined;

        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOne",
            (() => makeQuery(redemption)) as never
        );
        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOneAndUpdate",
            ((filter: Record<string, unknown>, update: Record<string, unknown>) => {
                updates.push({ filter, update });
                updateCount += 1;
                return updateCount === 1
                    ? makeQuery(reserved)
                    : Promise.resolve({ ...reserved, otpStatus: "sent" });
            }) as never
        );
        t.mock.method(
            StudentInvitationModel,
            "findOne",
            (async () => makeInvitation()) as never
        );
        t.mock.method(
            StudentModel,
            "findOne",
            (async () => makeStudent({ email: " Student@Example.test " })) as never
        );
        t.mock.method(
            WorkspaceModel,
            "findOne",
            (async () => ({ _id: workspaceId, status: "active" })) as never
        );

        const provider: StudentInvitationEmailProvider = {
            available: true,
            async sendOtpEmail(message) {
                deliveredMessage = message;
            },
        };
        const result = await requestStudentInvitationOtpService(
            redemptionId.toString(),
            claimToken,
            "192.0.2.10",
            provider,
            now,
            testRateLimiter
        );

        assert.equal(result, undefined);
        assert.equal(deliveredMessage?.recipient, "student@example.test");
        assert.match(deliveredMessage?.code ?? "", /^\d{6}$/);
        assert.equal(
            deliveredMessage?.expiresAt.getTime(),
            now.getTime() + 5 * 60 * 1000
        );
        const reservationUpdate = updates[0].update as Record<string, unknown>;
        const set = reservationUpdate.$set as Record<string, unknown>;
        assert.equal(typeof set.otpHash, "string");
        assert.equal(String(set.otpHash).length, 64);
        assert.notEqual(set.otpHash, deliveredMessage?.code);
        assert.equal(typeof set.otpEmailHash, "string");
        assert.equal(
            (
                reservationUpdate.$push as {
                    otpSendTimes: { $slice: number };
                }
            ).otpSendTimes.$slice,
            -10
        );
        const limit = updates[0].filter as Record<string, unknown>;
        assert.ok("$expr" in limit);
    });
});

test("successful OTP verification consumes the challenge and a replay is rejected", async (t: TestContext) => {
    await withOtpSecret(async () => {
        const otp = "123456";
        const otpHash = createStudentInvitationOtpHash(
            redemptionId.toString(),
            otp
        );
        const emailHash = createStudentInvitationEmailHash(
            "student@example.test"
        );
        const attempt = makeRedemption({
            state: "otp_pending",
            otpStatus: "sent",
            otpHash,
            otpEmailHash: emailHash,
            otpExpiresAt: new Date(now.getTime() + 60_000),
            otpAttempts: 1,
            otpChallengeVersion: 2,
        });
        const updates: Array<Record<string, unknown>> = [];
        let updateCount = 0;
        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOne",
            (() =>
                makeQuery(
                    makeRedemption({
                        state: "otp_pending",
                        otpStatus: "sent",
                        otpExpiresAt: new Date(now.getTime() + 60_000),
                    })
                )) as never
        );
        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOneAndUpdate",
            ((filter: Record<string, unknown>, update: Record<string, unknown>) => {
                updates.push({ filter, update });
                updateCount += 1;
                if (updateCount === 1) {
                    return makeQuery(attempt);
                }
                return makeQuery(
                    updateCount === 2
                        ? makeRedemption({ state: "otp_verified" })
                        : null
                );
            }) as never
        );
        t.mock.method(
            StudentInvitationModel,
            "findOne",
            (async () => makeInvitation()) as never
        );
        t.mock.method(
            StudentModel,
            "findOne",
            (async () => makeStudent()) as never
        );
        t.mock.method(
            WorkspaceModel,
            "findOne",
            (async () => ({ _id: workspaceId, status: "active" })) as never
        );
        const createLink = t.mock.method(
            StudentAccountLinkModel,
            "create",
            (async () => {
                throw new Error("OTP verification must not activate access");
            }) as never
        );

        await verifyStudentInvitationOtpService(
            redemptionId.toString(),
            claimToken,
            otp,
            "192.0.2.10",
            now,
            testRateLimiter
        );
        const verificationUpdate = (
            updates[1].update as Record<string, unknown>
        ).$set as Record<string, unknown>;
        assert.equal(verificationUpdate.state, "otp_verified");
        assert.equal(verificationUpdate.otpStatus, "verified");
        assert.equal(verificationUpdate.otpHash, null);
        assert.equal(verificationUpdate.verifiedEmailHash, emailHash);
        assert.equal(createLink.mock.callCount(), 0);

        await assert.rejects(
            verifyStudentInvitationOtpService(
                redemptionId.toString(),
                claimToken,
                otp,
                "192.0.2.10",
                now,
                testRateLimiter
            ),
            ConflictException
        );
    });
});

test("the fifth incorrect OTP attempt locks and clears the challenge", async (t: TestContext) => {
    await withOtpSecret(async () => {
        const attempt = makeRedemption({
            state: "otp_pending",
            otpStatus: "sent",
            otpHash: createStudentInvitationOtpHash(
                redemptionId.toString(),
                "123456"
            ),
            otpEmailHash: createStudentInvitationEmailHash(
                "student@example.test"
            ),
            otpExpiresAt: new Date(now.getTime() + 60_000),
            otpAttempts: 5,
            otpChallengeVersion: 1,
        });
        let lockUpdate: Record<string, unknown> | undefined;
        let calls = 0;
        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOne",
            (() =>
                makeQuery(
                    makeRedemption({
                        state: "otp_pending",
                        otpStatus: "sent",
                        otpExpiresAt: new Date(now.getTime() + 60_000),
                    })
                )) as never
        );
        t.mock.method(
                StudentInvitationModel,
                "findOne",
                (async () => makeInvitation()) as never
        );
        t.mock.method(
                StudentModel,
                "findOne",
                (async () => makeStudent()) as never
        );
        t.mock.method(
                WorkspaceModel,
                "findOne",
                (async () => ({ _id: workspaceId, status: "active" })) as never
        );
        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOneAndUpdate",
            ((filter: Record<string, unknown>, update: Record<string, unknown>) => {
                calls += 1;
                if (calls === 2) {
                    lockUpdate = update;
                }
                return calls === 1
                    ? makeQuery(attempt)
                    : Promise.resolve(null);
            }) as never
        );

        await assert.rejects(
            verifyStudentInvitationOtpService(
                redemptionId.toString(),
                claimToken,
                "654321",
                "192.0.2.10",
                now,
                testRateLimiter
            ),
            BadRequestException
        );
        const set = lockUpdate?.$set as Record<string, unknown>;
        assert.equal(set.otpStatus, "locked");
        assert.equal(set.otpHash, null);
        assert.equal(set.otpEmailHash, null);
    });
});

test("activation requires approval plus OTP verification and uses one transaction session", async (t: TestContext) => {
    await withOtpSecret(async () => {
        const session = {};
        const sessionCalls: unknown[] = [];
        const invitation = makeInvitation();
        const student = makeStudent();
        const user = {
            _id: userId,
            email: "student@example.test",
            status: "active",
            capabilities: undefined,
            save: async () => undefined,
        };
        const redemption = makeRedemption({
            state: "approved",
            otpStatus: "verified",
            userId,
            otpVerifiedAt: now,
            verifiedEmailHash: createStudentInvitationEmailHash(
                "student@example.test"
            ),
        });
        let linkDocuments: Array<Record<string, unknown>> = [];
        let linkOptions: Record<string, unknown> | undefined;
        let consumedInvitationUpdate: Record<string, unknown> | undefined;
        let consumedRedemptionUpdate: Record<string, unknown> | undefined;

        t.mock.method(
            StudentInvitationModel,
            "findOne",
            (() => makeQuery(invitation, sessionCalls)) as never
        );
        t.mock.method(
            StudentModel,
            "findOne",
            (() => makeQuery(student, sessionCalls)) as never
        );
        t.mock.method(
            WorkspaceModel,
            "findOne",
            (() => makeQuery({ _id: workspaceId, status: "active" }, sessionCalls)) as never
        );
        t.mock.method(
            UserModel,
            "findOne",
            (() => makeQuery(user, sessionCalls)) as never
        );
        t.mock.method(
            UserModel,
            "findOneAndUpdate",
            (async () => {
                throw new Error("Legacy capability update must use session save");
            }) as never
        );
        t.mock.method(
            StudentAccountLinkModel,
            "create",
            (async (
                documents: Array<Record<string, unknown>>,
                options: Record<string, unknown>
            ) => {
                linkDocuments = documents;
                linkOptions = options;
                return documents;
            }) as never
        );
        t.mock.method(
            StudentInvitationModel,
            "findOneAndUpdate",
            (async (
                _filter: Record<string, unknown>,
                update: Record<string, unknown>
            ) => {
                consumedInvitationUpdate = update;
                return invitation;
            }) as never
        );
        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOneAndUpdate",
            (async (
                _filter: Record<string, unknown>,
                update: Record<string, unknown>
            ) => {
                consumedRedemptionUpdate = update;
                return redemption;
            }) as never
        );

        await finalizeStudentInvitationRedemption(redemption as never, session as never, now);

        assert.deepEqual(linkDocuments[0], {
            userId,
            workspaceId,
            studentId,
            status: "active",
        });
        assert.equal(linkOptions?.session, session);
        assert.deepEqual(user.capabilities, ["teacher", "student"]);
        assert.deepEqual(
            sessionCalls,
            [session, session, session, session]
        );
        assert.equal(
            (consumedInvitationUpdate?.$set as Record<string, unknown>).consumedAt,
            now
        );
        assert.equal(
            (consumedRedemptionUpdate?.$set as Record<string, unknown>).state,
            "consumed"
        );
    });
});

test("new registration creates a student-only account and waits for teacher approval", async (t: TestContext) => {
    await withOtpSecret(async () => {
        const session = {
            withTransaction: async (callback: () => Promise<void>) => callback(),
            endSession: async () => undefined,
        };
        const sessions: unknown[] = [];
        const verifiedEmailHash = createStudentInvitationEmailHash(
            "student@example.test"
        );
        const verifiedRedemption = makeRedemption({
            state: "otp_verified",
            otpStatus: "verified",
            otpVerifiedAt: now,
            verifiedEmailHash,
        });
        const createdUsers: Array<Record<string, unknown>> = [];
        let linkCreates = 0;
        t.mock.method(bcrypt, "hash", (async () => "hashed-password") as never);
        t.mock.method(mongoose, "startSession", (() => session) as never);
        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOne",
            (() => makeQuery(verifiedRedemption, sessions)) as never
        );
        t.mock.method(
            StudentInvitationRedemptionModel,
            "findOneAndUpdate",
            ((
                _filter: Record<string, unknown>,
                update: Record<string, unknown>,
                options: Record<string, unknown>
            ) => {
                assert.equal(options.session, session);
                assert.equal(
                    (
                        update.$set as Record<string, unknown>
                    ).userId?.toString(),
                    userId.toString()
                );
                return makeQuery(
                    makeRedemption({
                        state: "otp_verified",
                        otpStatus: "verified",
                        otpVerifiedAt: now,
                        verifiedEmailHash,
                        userId,
                    })
                );
            }) as never
        );
        t.mock.method(
            StudentInvitationModel,
            "findOne",
            (() => makeQuery(makeInvitation(), sessions)) as never
        );
        t.mock.method(
            StudentModel,
            "findOne",
            (() => makeQuery(makeStudent(), sessions)) as never
        );
        t.mock.method(
            WorkspaceModel,
            "findOne",
            (() => makeQuery({ _id: workspaceId, status: "active" }, sessions)) as never
        );
        t.mock.method(
            UserModel,
            "create",
            (async (
                documents: Array<Record<string, unknown>>,
                options: Record<string, unknown>
            ) => {
                assert.equal(options.session, session);
                createdUsers.push(...documents);
                return [{ _id: userId, ...documents[0] }];
            }) as never
        );
        t.mock.method(
            StudentAccountLinkModel,
            "create",
            (async () => {
                linkCreates += 1;
                return [];
            }) as never
        );

        const result = await completeStudentInvitationRegistrationService(
            redemptionId.toString(),
            claimToken,
            "strong-password-123"
        );

        assert.equal(result, "pending_approval");
        assert.deepEqual(createdUsers[0], {
            name: "Student One",
            email: "student@example.test",
            passwordHash: "hashed-password",
            capabilities: ["student"],
            status: "active",
        });
        assert.equal(linkCreates, 0);
    });
});

test("teacher approval is Workspace-scoped and conditionally accepts only OTP-verified requests", async (t: TestContext) => {
    const session = {
        withTransaction: async (callback: () => Promise<void>) => callback(),
        endSession: async () => undefined,
    };
    const sessions: unknown[] = [];
    const approvalRequest = makeRedemption({
        state: "otp_verified",
        otpStatus: "verified",
        otpVerifiedAt: now,
    });
    const filters: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    t.mock.method(mongoose, "startSession", (() => session) as never);
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (() => makeQuery({ _id: workspaceId, status: "active" }, sessions)) as never
    );
    t.mock.method(
        StudentInvitationRedemptionModel,
        "findOne",
        (() => makeQuery(approvalRequest, sessions)) as never
    );
    t.mock.method(
        StudentInvitationModel,
        "findOne",
        (() => makeQuery(makeInvitation(), sessions)) as never
    );
    t.mock.method(
        StudentModel,
        "findOne",
        (() => makeQuery(makeStudent(), sessions)) as never
    );
    t.mock.method(
        StudentInvitationRedemptionModel,
        "findOneAndUpdate",
        ((filter: Record<string, unknown>, update: Record<string, unknown>) => {
            filters.push(filter);
            updates.push(update);
            return makeQuery(
                makeRedemption({
                    state: "approved",
                    otpStatus: "verified",
                    otpVerifiedAt: now,
                    approvedBy: userId,
                }),
                sessions
            );
        }) as never
    );

    const state = await approveStudentInvitationRedemptionService(
        workspaceId,
        redemptionId.toString(),
        userId.toString()
    );

    assert.equal(state, "approved");
    assert.equal(filters[0].workspaceId, workspaceId);
    assert.equal(filters[0].state, "otp_verified");
    assert.equal(filters[0].otpStatus, "verified");
    assert.equal(
        ((updates[0].$set as Record<string, unknown>).approvedBy as Types.ObjectId)
            .toString(),
        userId.toString()
    );
    assert.equal(sessions.length, 5);
    assert.ok(sessions.every((usedSession) => usedSession === session));
});

test("teacher rejection is terminal, revokes the invitation, and never creates a link", async (t: TestContext) => {
    const session = {
        withTransaction: async (callback: () => Promise<void>) => callback(),
        endSession: async () => undefined,
    };
    const sessions: unknown[] = [];
    const approvalRequest = makeRedemption({
        state: "otp_verified",
        otpStatus: "verified",
        otpVerifiedAt: now,
    });
    const redemptionUpdates: Array<Record<string, unknown>> = [];
    const invitationUpdates: Array<Record<string, unknown>> = [];
    t.mock.method(mongoose, "startSession", (() => session) as never);
    t.mock.method(
        WorkspaceModel,
        "findOne",
        (() => makeQuery({ _id: workspaceId, status: "active" }, sessions)) as never
    );
    t.mock.method(
        StudentInvitationRedemptionModel,
        "findOne",
        (() => makeQuery(approvalRequest, sessions)) as never
    );
    t.mock.method(
        StudentInvitationRedemptionModel,
        "findOneAndUpdate",
        ((_filter: Record<string, unknown>, update: Record<string, unknown>) => {
            redemptionUpdates.push(update);
            return makeQuery(makeRedemption({ state: "rejected" }), sessions);
        }) as never
    );
    t.mock.method(
        StudentInvitationModel,
        "findOne",
        (() => makeQuery(makeInvitation(), sessions)) as never
    );
    t.mock.method(
        StudentInvitationModel,
        "findOneAndUpdate",
        ((_filter: Record<string, unknown>, update: Record<string, unknown>) => {
            invitationUpdates.push(update);
            return makeQuery(makeInvitation({ revokedAt: now }), sessions);
        }) as never
    );
    const createLink = t.mock.method(
        StudentAccountLinkModel,
        "create",
        (async () => {
            throw new Error("Rejected requests must not create links");
        }) as never
    );

    await rejectStudentInvitationRedemptionService(
        workspaceId,
        redemptionId.toString(),
        userId.toString()
    );

    assert.equal(
        (redemptionUpdates[0].$set as Record<string, unknown>).state,
        "rejected"
    );
    assert.equal(
        (invitationUpdates[0].$set as Record<string, unknown>).revokedBy
            ?.toString(),
        userId.toString()
    );
    assert.equal(createLink.mock.callCount(), 0);
    assert.ok(sessions.every((usedSession) => usedSession === session));
});

test("invitation secret and claim-token hashes are distinct from their raw values", () => {
    assert.notEqual(
        createStudentInvitationSecretHash(invitationSecret),
        invitationSecret
    );
    assert.notEqual(
        createStudentInvitationClaimTokenHash(claimToken),
        claimToken
    );
});
