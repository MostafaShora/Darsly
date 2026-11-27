import { getEnv } from "../utils/get-env";

const MAX_RATE_LIMIT = 100;
const ONE_HOUR_MS = 60 * 60 * 1000;

const readLimit = (name: string, defaultValue: number): number => {
    const raw = getEnv(name, String(defaultValue));
    if (!/^[1-9]\d*$/.test(raw)) {
        throw new Error(`Invalid student invitation rate limit: ${name}`);
    }

    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > MAX_RATE_LIMIT) {
        throw new Error(`Invalid student invitation rate limit: ${name}`);
    }

    return value;
};

export interface StudentInvitationRateLimitConfig {
    windowMs: number;
    sendsPerStudentEmail: number;
    sendsPerIp: number;
    verificationFailuresPerStudentEmail: number;
    verificationAttemptsPerIp: number;
}

export const getStudentInvitationRateLimitConfig =
    (): StudentInvitationRateLimitConfig => ({
        windowMs: ONE_HOUR_MS,
        sendsPerStudentEmail: readLimit(
            "STUDENT_INVITATION_OTP_SUBJECT_SEND_LIMIT_PER_HOUR",
            3
        ),
        sendsPerIp: readLimit(
            "STUDENT_INVITATION_OTP_IP_SEND_LIMIT_PER_HOUR",
            15
        ),
        verificationFailuresPerStudentEmail: readLimit(
            "STUDENT_INVITATION_OTP_SUBJECT_FAILURE_LIMIT_PER_HOUR",
            5
        ),
        verificationAttemptsPerIp: readLimit(
            "STUDENT_INVITATION_OTP_IP_ATTEMPT_LIMIT_PER_HOUR",
            25
        ),
    });
