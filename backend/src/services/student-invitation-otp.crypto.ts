import {
    createHash,
    createHmac,
    hkdfSync,
    randomBytes,
    randomInt,
    timingSafeEqual,
} from "node:crypto";
import { getJwtSecret } from "../config/jwt-secret.config";

const OTP_LIFETIME_MS = 5 * 60 * 1000;

export const getStudentInvitationOtpLifetimeMs = (): number =>
    OTP_LIFETIME_MS;

export const createStudentInvitationSecretHash = (secret: string): string =>
    createHash("sha256").update(secret, "utf8").digest("hex");

export const createStudentInvitationClaimToken = (): string =>
    randomBytes(32).toString("hex");

export const createStudentInvitationClaimTokenHash = (
    token: string
): string => createStudentInvitationSecretHash(token);

export const createStudentInvitationOtp = (): string =>
    randomInt(0, 1_000_000).toString().padStart(6, "0");

const getOtpHmacKey = (): Buffer => {
    const secret = getJwtSecret(process.env.JWT_SECRET);
    return Buffer.from(
        hkdfSync(
            "sha256",
            Buffer.from(secret, "utf8"),
            Buffer.from("darsly-student-invitation-otp-v1", "utf8"),
            Buffer.from("otp-and-email-binding", "utf8"),
            32
        )
    );
};

const getRateLimitHmacKey = (): Buffer => {
    const secret = getJwtSecret(process.env.JWT_SECRET);
    return Buffer.from(
        hkdfSync(
            "sha256",
            Buffer.from(secret, "utf8"),
            Buffer.from("darsly-student-invitation-rate-limits-v1", "utf8"),
            Buffer.from("subject-and-ip-identifiers", "utf8"),
            32
        )
    );
};

const hmacHex = (value: string): string =>
    createHmac("sha256", getOtpHmacKey()).update(value, "utf8").digest("hex");

const rateLimitHmacHex = (value: string): string =>
    createHmac("sha256", getRateLimitHmacKey())
        .update(value, "utf8")
        .digest("hex");

export const createStudentInvitationOtpHash = (
    redemptionId: string,
    otp: string
): string => hmacHex(`otp:${redemptionId}:${otp}`);

export const createStudentInvitationEmailHash = (email: string): string =>
    hmacHex(`email:${email.trim().toLowerCase()}`);

export const createStudentInvitationRateLimitKeyHash = (
    scope: "subject-send" | "ip-send" | "subject-verification" | "ip-verification",
    identifier: string
): string => rateLimitHmacHex(`rate-limit:${scope}:${identifier}`);

export const matchesStudentInvitationHash = (
    expected: string | null | undefined,
    candidate: string
): boolean => {
    if (
        !expected ||
        !/^[a-f0-9]{64}$/i.test(expected) ||
        !/^[a-f0-9]{64}$/i.test(candidate)
    ) {
        return false;
    }

    return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(candidate, "hex")
    );
};

export const matchesStudentInvitationClaimToken = (
    storedHash: string | null | undefined,
    token: string
): boolean =>
    matchesStudentInvitationHash(
        storedHash,
        createStudentInvitationClaimTokenHash(token)
    );
