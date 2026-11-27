import assert from "node:assert/strict";
import { TestContext, test } from "node:test";
import { Types } from "mongoose";
import {
    createRequestStudentInvitationOtpController,
} from "../src/controllers/student-invitation-redemption.controller";
import StudentInvitationModel from "../src/models/student-invitation.model";
import StudentInvitationRedemptionModel from "../src/models/student-invitation-redemption.model";
import StudentModel from "../src/models/student.model";
import WorkspaceModel from "../src/models/workspace.model";
import {
    ResendEmailSender,
    ResendStudentInvitationEmailProvider,
    StudentInvitationEmailConfigurationError,
    StudentInvitationEmailDeliveryError,
    StudentInvitationOtpEmail,
} from "../src/services/student-invitation-email.service";
import {
    requestStudentInvitationOtpService,
} from "../src/services/student-invitation-redemption.service";
import {
    createStudentInvitationClaimTokenHash,
    createStudentInvitationOtpHash,
} from "../src/services/student-invitation-otp.crypto";
import { ServiceUnavailableException } from "../src/utils/app-error";

const workspaceId = new Types.ObjectId();
const studentId = new Types.ObjectId();
const invitationId = new Types.ObjectId();
const redemptionId = new Types.ObjectId();
const claimToken = "c".repeat(64);
const now = new Date("2026-04-04T10:00:00.000Z");
const otpSecret = "phase8-test-jwt-secret-with-32-bytes-minimum";
const resendApiKey = "re_test_secret_that_must_not_be_exposed";
const senderEmail = "no-reply@example.test";
const studentEmail = "student@example.test";
let rateReservationId = 0;
const testRateLimiter = {
    reserve: async (keyHash: string) => ({
        keyHash,
        reservationId: `test-reservation-${++rateReservationId}`,
    }),
    release: async () => undefined,
};

const message: StudentInvitationOtpEmail = {
    recipient: studentEmail,
    code: "031729",
    expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
};

const makeQuery = <T>(value: T) => {
    const query = {
        select: () => query,
        then: (
            resolve: (result: T) => unknown,
            reject: (error: unknown) => unknown
        ) => Promise.resolve(value).then(resolve, reject),
    };
    return query;
};

const makeStudentInvitationRedemption = () => ({
    _id: redemptionId,
    invitationId,
    workspaceId,
    studentId,
    claimTokenHash: createStudentInvitationClaimTokenHash(claimToken),
    state: "claimed",
    otpStatus: "none",
    otpChallengeVersion: 0,
});

const withOtpSecret = async <T>(callback: () => Promise<T>): Promise<T> => {
    const previous = process.env.JWT_SECRET;
    process.env.JWT_SECRET = otpSecret;
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

test("Resend provider sends a minimal OTP email with an abort timeout", async (t: TestContext) => {
    let captured:
        | {
              apiKey: string;
              payload: Parameters<ResendEmailSender>[1];
              signal: AbortSignal;
          }
        | undefined;
    const sendEmail: ResendEmailSender = async (apiKey, payload, signal) => {
        captured = { apiKey, payload, signal };
        return { id: "resend-message-id" };
    };
    const provider = new ResendStudentInvitationEmailProvider(sendEmail, () => ({
        RESEND_API_KEY: resendApiKey,
        RESEND_FROM_EMAIL: senderEmail,
    }));
    const log = t.mock.method(console, "log", () => undefined);
    const error = t.mock.method(console, "error", () => undefined);
    const warning = t.mock.method(console, "warn", () => undefined);

    assert.equal(provider.available, true);
    await provider.sendOtpEmail(message);

    assert.equal(captured?.apiKey, resendApiKey);
    assert.equal(captured?.payload.from, `Darsly <${senderEmail}>`);
    assert.deepEqual(captured?.payload.to, [studentEmail]);
    assert.match(captured?.payload.subject ?? "", /verification code/i);
    assert.ok(captured?.payload.html.includes(message.code));
    assert.ok(captured?.payload.text.includes(message.code));
    assert.match(captured?.payload.text ?? "", /expires in five minutes/i);
    assert.match(captured?.payload.text ?? "", /do not share/i);
    assert.ok(captured?.signal instanceof AbortSignal);
    assert.equal(JSON.stringify(captured?.payload).includes("Workspace"), false);
    assert.equal(log.mock.callCount(), 0);
    assert.equal(error.mock.callCount(), 0);
    assert.equal(warning.mock.callCount(), 0);
});

test("accepted Resend email advances the existing OTP challenge to sent without returning the code", async (t: TestContext) => {
    await withOtpSecret(async () => {
        const redemption = makeStudentInvitationRedemption();
        const reserved = {
            ...redemption,
            state: "otp_pending",
            otpStatus: "sending",
            otpChallengeVersion: 1,
        };
        const updates: Array<Record<string, unknown>> = [];
        let updateCount = 0;
        let deliveredPayload: Parameters<ResendEmailSender>[1] | undefined;
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
            (async () => ({ _id: invitationId })) as never
        );
        t.mock.method(
            StudentModel,
            "findOne",
            (async () => ({
                _id: studentId,
                workspaceId,
                email: studentEmail,
                status: "active",
            })) as never
        );
        t.mock.method(
            WorkspaceModel,
            "findOne",
            (async () => ({ _id: workspaceId, status: "active" })) as never
        );

        const provider = new ResendStudentInvitationEmailProvider(
            async (_apiKey, payload) => {
                deliveredPayload = payload;
                return { id: "resend-message-id" };
            },
            () => ({
                RESEND_API_KEY: resendApiKey,
                RESEND_FROM_EMAIL: senderEmail,
            })
        );
        const result = await requestStudentInvitationOtpService(
            redemptionId.toString(),
            claimToken,
            "192.0.2.10",
            provider,
            now,
            testRateLimiter
        );

        assert.equal(result, undefined);
        assert.equal(deliveredPayload?.to[0], studentEmail);
        assert.equal(updateCount, 2);
        const reservationSet = (
            updates[0].update as Record<string, unknown>
        ).$set as Record<string, unknown>;
        const deliveredSet = (
            updates[1].update as Record<string, unknown>
        ).$set as Record<string, unknown>;
        assert.equal(
            reservationSet.otpStatus,
            "sending"
        );
        assert.equal(deliveredSet.otpStatus, "sent");
        const code = deliveredPayload?.text.match(
            /Your verification code is: (\d{6})/
        )?.[1];
        const storedHash = reservationSet.otpHash;
        assert.ok(code);
        assert.equal(
            storedHash,
            createStudentInvitationOtpHash(redemptionId.toString(), code)
        );
        assert.notEqual(storedHash, code);
    });
});

test("missing Resend API key fails configuration validation without calling the client", async () => {
    let calls = 0;
    const provider = new ResendStudentInvitationEmailProvider(
        async () => {
            calls += 1;
            return { id: "unexpected" };
        },
        () => ({ RESEND_FROM_EMAIL: senderEmail })
    );

    assert.equal(provider.available, false);
    await assert.rejects(
        provider.sendOtpEmail(message),
        (error: unknown) =>
            error instanceof StudentInvitationEmailConfigurationError &&
            error.message.includes("RESEND_API_KEY")
    );
    assert.equal(calls, 0);
});

test("missing sender configuration fails closed without calling the client", async () => {
    let calls = 0;
    const provider = new ResendStudentInvitationEmailProvider(
        async () => {
            calls += 1;
            return { id: "unexpected" };
        },
        () => ({ RESEND_API_KEY: resendApiKey })
    );

    assert.equal(provider.available, false);
    await assert.rejects(
        provider.sendOtpEmail(message),
        (error: unknown) =>
            error instanceof StudentInvitationEmailConfigurationError &&
            error.message.includes("RESEND_FROM_EMAIL")
    );
    assert.equal(calls, 0);
});

test("runtime configuration failure is explicit and occurs before database access", async (t: TestContext) => {
    const lookup = t.mock.method(
        StudentInvitationRedemptionModel,
        "findOne",
        (() => {
            throw new Error("Must not query when Resend configuration is missing");
        }) as never
    );
    const provider = new ResendStudentInvitationEmailProvider(
        async () => ({ id: "unexpected" }),
        () => ({})
    );

    await assert.rejects(
        requestStudentInvitationOtpService(
            redemptionId.toString(),
            claimToken,
            "192.0.2.10",
            provider
        ),
        (error: unknown) =>
            error instanceof ServiceUnavailableException &&
            error.message.includes("RESEND_API_KEY") &&
            error.message.includes("RESEND_FROM_EMAIL")
    );
    assert.equal(lookup.mock.callCount(), 0);
});

test("Resend rejection details are sanitized", async () => {
    const provider = new ResendStudentInvitationEmailProvider(
        async () => ({
            error: {
                message: `rejected ${resendApiKey} otp ${message.code}`,
            },
        }),
        () => ({
            RESEND_API_KEY: resendApiKey,
            RESEND_FROM_EMAIL: senderEmail,
        })
    );

    await assert.rejects(
        provider.sendOtpEmail(message),
        (error: unknown) =>
            error instanceof StudentInvitationEmailDeliveryError &&
            !error.message.includes(resendApiKey) &&
            !error.message.includes(message.code)
    );
});

test("Resend timeout or network failures are sanitized without retries", async () => {
    let calls = 0;
    const provider = new ResendStudentInvitationEmailProvider(
        async () => {
            calls += 1;
            throw new Error(`network timeout ${resendApiKey} ${message.code}`);
        },
        () => ({
            RESEND_API_KEY: resendApiKey,
            RESEND_FROM_EMAIL: senderEmail,
        })
    );

    await assert.rejects(
        provider.sendOtpEmail(message),
        (error: unknown) =>
            error instanceof StudentInvitationEmailDeliveryError &&
            !error.message.includes(resendApiKey) &&
            !error.message.includes(message.code)
    );
    assert.equal(calls, 1);
});

test("failed Resend delivery leaves the OTP challenge failed and never sent", async (t: TestContext) => {
    await withOtpSecret(async () => {
        const redemption = makeStudentInvitationRedemption();
        const reserved = {
            ...redemption,
            state: "otp_pending",
            otpStatus: "sending",
            otpChallengeVersion: 1,
        };
        const updates: Array<Record<string, unknown>> = [];
        let updateCount = 0;
        const sharedReservations: string[] = [];
        const releasedReservations: string[] = [];
        const failedDeliveryRateLimiter = {
            reserve: async (keyHash: string) => {
                const reservationId = `failed-delivery-${sharedReservations.length}`;
                sharedReservations.push(keyHash);
                return { keyHash, reservationId };
            },
            release: async (reservation: { reservationId: string }) => {
                releasedReservations.push(reservation.reservationId);
            },
        };
        const log = t.mock.method(console, "log", () => undefined);
        const errorLog = t.mock.method(console, "error", () => undefined);
        const warning = t.mock.method(console, "warn", () => undefined);
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
                    : Promise.resolve(null);
            }) as never
        );
        t.mock.method(
            StudentInvitationModel,
            "findOne",
            (async () => ({ _id: invitationId })) as never
        );
        t.mock.method(
            StudentModel,
            "findOne",
            (async () => ({
                _id: studentId,
                workspaceId,
                email: studentEmail,
                status: "active",
            })) as never
        );
        t.mock.method(
            WorkspaceModel,
            "findOne",
            (async () => ({ _id: workspaceId, status: "active" })) as never
        );

        const provider = new ResendStudentInvitationEmailProvider(
            async (_apiKey, payload) => ({
                error: { message: `private provider data: ${payload.text}` },
            }),
            () => ({
                RESEND_API_KEY: resendApiKey,
                RESEND_FROM_EMAIL: senderEmail,
            })
        );

        await assert.rejects(
            requestStudentInvitationOtpService(
                redemptionId.toString(),
                claimToken,
                "192.0.2.10",
                provider,
                now,
                failedDeliveryRateLimiter
            ),
            (error: unknown) =>
                error instanceof ServiceUnavailableException &&
                !error.message.includes(resendApiKey) &&
                !/\d{6}/.test(error.message)
        );

        assert.equal(updateCount, 2);
        const reserveSet = (
            updates[0].update as Record<string, unknown>
        ).$set as Record<string, unknown>;
        assert.equal(
            reserveSet.otpStatus,
            "sending"
        );
        const cleanup = (
            updates[1].update as Record<string, unknown>
        ).$set as Record<string, unknown>;
        assert.equal(cleanup.otpStatus, "failed");
        assert.equal(cleanup.otpHash, null);
        assert.notEqual(cleanup.otpStatus, "sent");
        assert.equal(sharedReservations.length, 2);
        assert.equal(releasedReservations.length, 0);
        assert.equal(log.mock.callCount(), 0);
        assert.equal(errorLog.mock.callCount(), 0);
        assert.equal(warning.mock.callCount(), 0);
    });
});

test("OTP request controller never includes a verification code in its response", async () => {
    const controller = createRequestStudentInvitationOtpController(
        async () => undefined
    );
    const response = {
        statusCode: 0,
        body: undefined as unknown,
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        json(body: unknown) {
            this.body = body;
        },
    };
    let nextError: unknown;

    await controller(
        {
            validated: {
                params: { redemptionId: redemptionId.toString() },
                body: { claimToken },
            },
        } as never,
        response as never,
        (error?: unknown) => {
            nextError = error;
        }
    );

    assert.equal(nextError, undefined);
    assert.equal(response.statusCode, 202);
    assert.equal(
        JSON.stringify(response.body).includes(message.code),
        false
    );
});
