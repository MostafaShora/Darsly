import assert from "node:assert/strict";
import { TestContext, test } from "node:test";
import StudentInvitationRateLimitModel from "../src/models/student-invitation-rate-limit.model";
import StudentInvitationRedemptionModel from "../src/models/student-invitation-redemption.model";
import {
    createStudentInvitationRateLimitKeyHash,
} from "../src/services/student-invitation-otp.crypto";
import {
    requestStudentInvitationOtpService,
} from "../src/services/student-invitation-redemption.service";
import {
    reserveStudentInvitationRateLimit,
} from "../src/services/student-invitation-rate-limit.service";
import { ServiceUnavailableException } from "../src/utils/app-error";

const oneHourMs = 60 * 60 * 1000;
const studentId = "student-record-42";
const normalizedEmail = "student@example.test";
const clientIp = "192.0.2.42";
const previousJwtSecret = process.env.JWT_SECRET;

test.before(() => {
    process.env.JWT_SECRET = "phase8-6-test-jwt-secret-with-32-bytes-minimum";
});

test.after(() => {
    if (previousJwtSecret === undefined) {
        delete process.env.JWT_SECRET;
    } else {
        process.env.JWT_SECRET = previousJwtSecret;
    }
});

const installAtomicCounterMock = (
    t: TestContext,
    capacity?: number
) => {
    const counts = new Map<string, number>();
    const calls: Array<{
        filter: Record<string, unknown>;
        update: unknown;
        options: Record<string, unknown>;
    }> = [];
    t.mock.method(
        StudentInvitationRateLimitModel,
        "findOneAndUpdate",
        ((
            filter: Record<string, unknown>,
            update: unknown,
            options: Record<string, unknown> = {}
        ) => {
            calls.push({ filter, update, options });
            const keyHash = String(filter.keyHash);
            const expression = filter.$expr as {
                $lt: [unknown, number];
            };
            const limit = capacity ?? expression.$lt[1];
            const count = counts.get(keyHash) ?? 0;
            if (count >= limit) {
                if (options.upsert) {
                    const duplicate = new Error("duplicate limiter key") as Error & {
                        code: number;
                    };
                    duplicate.code = 11000;
                    throw duplicate;
                }
                return Promise.resolve(null);
            }

            counts.set(keyHash, count + 1);
            return Promise.resolve({ keyHash });
        }) as never
    );
    return { calls, counts };
};

test("shared subject send budgets are independent of redemption identity", async (t: TestContext) => {
    const { counts } = installAtomicCounterMock(t);
    const subjectKeyForRedemption = (_redemptionId: string): string =>
        createStudentInvitationRateLimitKeyHash(
            "subject-send",
            `${studentId}:${normalizedEmail}`
        );
    const firstRedemptionKey = subjectKeyForRedemption("redemption-1");
    const secondRedemptionKey = subjectKeyForRedemption("redemption-2");
    assert.equal(firstRedemptionKey, secondRedemptionKey);

    const reservations = await Promise.all(
        Array.from({ length: 4 }, () =>
            reserveStudentInvitationRateLimit(
                firstRedemptionKey,
                3,
                oneHourMs
            )
        )
    );
    assert.equal(reservations.filter(Boolean).length, 3);
    assert.equal(counts.get(firstRedemptionKey), 3);
});

test("shared failed-verification budget persists across resends", async (t: TestContext) => {
    const { counts } = installAtomicCounterMock(t);
    const subjectKeyForChallenge = (
        _redemptionId: string,
        _challengeVersion: number
    ): string =>
        createStudentInvitationRateLimitKeyHash(
            "subject-verification",
            `${studentId}:${normalizedEmail}`
        );

    for (let attempt = 0; attempt < 5; attempt += 1) {
        const key = subjectKeyForChallenge(
            `redemption-${attempt < 3 ? 1 : 2}`,
            attempt + 1
        );
        assert.ok(
            await reserveStudentInvitationRateLimit(
                key,
                5,
                oneHourMs
            )
        );
    }

    const keyAfterResend = subjectKeyForChallenge("redemption-3", 1);
    assert.equal(
        await reserveStudentInvitationRateLimit(
            keyAfterResend,
            5,
            oneHourMs
        ),
        null
    );
    assert.equal(counts.get(keyAfterResend), 5);
});

test("IP budgets aggregate across distinct student identities", async (t: TestContext) => {
    const { counts } = installAtomicCounterMock(t);
    const ipKey = createStudentInvitationRateLimitKeyHash(
        "ip-send",
        clientIp
    );
    const firstSubject = createStudentInvitationRateLimitKeyHash(
        "subject-send",
        `student-1:${normalizedEmail}`
    );
    const secondSubject = createStudentInvitationRateLimitKeyHash(
        "subject-send",
        `student-2:another@example.test`
    );
    assert.notEqual(firstSubject, secondSubject);

    assert.ok(
        await reserveStudentInvitationRateLimit(ipKey, 2, oneHourMs)
    );
    assert.ok(
        await reserveStudentInvitationRateLimit(ipKey, 2, oneHourMs)
    );
    assert.equal(
        await reserveStudentInvitationRateLimit(ipKey, 2, oneHourMs),
        null
    );
    assert.equal(counts.get(ipKey), 2);
});

test("concurrent reservations use one conditional atomic update per allowed attempt", async (t: TestContext) => {
    const { calls } = installAtomicCounterMock(t, 5);
    const keyHash = createStudentInvitationRateLimitKeyHash(
        "ip-verification",
        clientIp
    );
    const reservations = await Promise.all(
        Array.from({ length: 20 }, () =>
            reserveStudentInvitationRateLimit(keyHash, 5, oneHourMs)
        )
    );

    assert.equal(reservations.filter(Boolean).length, 5);
    assert.ok(
        calls.every(
            ({ filter, update }) =>
                "$expr" in filter &&
                Array.isArray(update) &&
                JSON.stringify(update).includes("$$NOW")
        )
    );
});

test("rolling expiry uses MongoDB time and TTL cleanup indexes", async (t: TestContext) => {
    const { calls } = installAtomicCounterMock(t);
    const keyHash = createStudentInvitationRateLimitKeyHash(
        "subject-send",
        `${studentId}:${normalizedEmail}`
    );
    await reserveStudentInvitationRateLimit(keyHash, 3, oneHourMs);

    const pipeline = calls[0].update as Array<Record<string, unknown>>;
    assert.ok(JSON.stringify(pipeline).includes("$$NOW"));
    const indexes = StudentInvitationRateLimitModel.schema.indexes();
    assert.equal(
        indexes.find(([keys]) => keys.keyHash === 1)?.[1].unique,
        true
    );
    assert.equal(
        indexes.find(([keys]) => keys.expiresAt === 1)?.[1].expireAfterSeconds,
        0
    );
});

test("rate-limit storage failures fail closed without leaking identifiers", async (t: TestContext) => {
    const sensitiveEmail = "private.student@example.test";
    const keyHash = createStudentInvitationRateLimitKeyHash(
        "subject-send",
        `${studentId}:${sensitiveEmail}`
    );
    assert.equal(keyHash.includes(sensitiveEmail), false);
    t.mock.method(
        StudentInvitationRateLimitModel,
        "findOneAndUpdate",
        (async () => {
            throw new Error(`database failure for ${sensitiveEmail}`);
        }) as never
    );

    await assert.rejects(
        reserveStudentInvitationRateLimit(keyHash, 3, oneHourMs),
        (error: unknown) =>
            error instanceof ServiceUnavailableException &&
            !error.message.includes(sensitiveEmail)
    );
});

test("missing and invalid client IP fail closed before redemption lookup", async (t: TestContext) => {
    const lookup = t.mock.method(
        StudentInvitationRedemptionModel,
        "findOne",
        (() => {
            throw new Error("Redemption lookup must not run without an IP");
        }) as never
    );

    for (const ip of [undefined, "not-an-ip"]) {
        await assert.rejects(
            requestStudentInvitationOtpService(
                "507f1f77bcf86cd799439011",
                "a".repeat(64),
                ip,
                {
                    available: true,
                    async sendOtpEmail() {
                        throw new Error("Provider must not be called");
                    },
                },
            ),
            ServiceUnavailableException
        );
    }
    assert.equal(lookup.mock.callCount(), 0);
});

test("invalid rate-limit configuration fails closed before redemption lookup", async (t: TestContext) => {
    const variable = "STUDENT_INVITATION_OTP_IP_SEND_LIMIT_PER_HOUR";
    const previousValue = process.env[variable];
    process.env[variable] = "0";
    const lookup = t.mock.method(
        StudentInvitationRedemptionModel,
        "findOne",
        (() => {
            throw new Error("Redemption lookup must not run with invalid limits");
        }) as never
    );

    try {
        await assert.rejects(
            requestStudentInvitationOtpService(
                "507f1f77bcf86cd799439011",
                "a".repeat(64),
                clientIp,
                {
                    available: true,
                    async sendOtpEmail() {
                        throw new Error("Provider must not be called");
                    },
                }
            ),
            (error: unknown) =>
                error instanceof ServiceUnavailableException &&
                error.message.includes("rate limiting")
        );
    } finally {
        if (previousValue === undefined) {
            delete process.env[variable];
        } else {
            process.env[variable] = previousValue;
        }
    }

    assert.equal(lookup.mock.callCount(), 0);
});
