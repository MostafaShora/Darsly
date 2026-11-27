import { randomUUID } from "node:crypto";
import StudentInvitationRateLimitModel from "../models/student-invitation-rate-limit.model";
import { ServiceUnavailableException } from "../utils/app-error";

export interface StudentInvitationRateLimitReservation {
    keyHash: string;
    reservationId: string;
}

const getRecentEvents = (windowMs: number) => ({
    $filter: {
        input: { $ifNull: ["$events", []] },
        as: "event",
        cond: {
            $gt: [
                "$$event.occurredAt",
                { $subtract: ["$$NOW", windowMs] },
            ],
        },
    },
});

const getConditionalUpdate = (
    keyHash: string,
    reservationId: string,
    windowMs: number,
    limit: number
) => ({
    filter: {
        keyHash,
        $expr: {
            $lt: [
                { $size: getRecentEvents(windowMs) },
                limit,
            ],
        },
    },
    update: [
        {
            $set: {
                events: {
                    $concatArrays: [
                        getRecentEvents(windowMs),
                        [
                            {
                                reservationId: { $literal: reservationId },
                                occurredAt: "$$NOW",
                            },
                        ],
                    ],
                },
                expiresAt: { $add: ["$$NOW", windowMs] },
                updatedAt: "$$NOW",
            },
        },
    ],
});

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000;

const limiterUnavailable = (): ServiceUnavailableException =>
    new ServiceUnavailableException(
        "Student verification rate limiting is temporarily unavailable"
    );

export const reserveStudentInvitationRateLimit = async (
    keyHash: string,
    limit: number,
    windowMs: number
): Promise<StudentInvitationRateLimitReservation | null> => {
    const reservationId = randomUUID();
    const { filter, update } = getConditionalUpdate(
        keyHash,
        reservationId,
        windowMs,
        limit
    );

    try {
        try {
            const reserved =
                await StudentInvitationRateLimitModel.findOneAndUpdate(
                    filter,
                    update,
                    {
                        upsert: true,
                        returnDocument: "after",
                        setDefaultsOnInsert: false,
                    }
                );

            return reserved ? { keyHash, reservationId } : null;
        } catch (error) {
            if (!isDuplicateKeyError(error)) {
                throw error;
            }

            const reserved =
                await StudentInvitationRateLimitModel.findOneAndUpdate(
                    filter,
                    update,
                    {
                        upsert: false,
                        returnDocument: "after",
                    }
                );

            return reserved ? { keyHash, reservationId } : null;
        }
    } catch {
        throw limiterUnavailable();
    }
};

export const releaseStudentInvitationRateLimit = async (
    reservation: StudentInvitationRateLimitReservation
): Promise<void> => {
    try {
        await StudentInvitationRateLimitModel.findOneAndUpdate(
            { keyHash: reservation.keyHash },
            [
                {
                    $set: {
                        events: {
                            $filter: {
                                input: { $ifNull: ["$events", []] },
                                as: "event",
                                cond: {
                                    $ne: [
                                        "$$event.reservationId",
                                        {
                                            $literal:
                                                reservation.reservationId,
                                        },
                                    ],
                                },
                            },
                        },
                        updatedAt: "$$NOW",
                    },
                },
            ],
            { returnDocument: "after" }
        );
    } catch {
        throw limiterUnavailable();
    }
};

export interface StudentInvitationRateLimiter {
    reserve(
        keyHash: string,
        limit: number,
        windowMs: number
    ): Promise<StudentInvitationRateLimitReservation | null>;
    release(
        reservation: StudentInvitationRateLimitReservation
    ): Promise<void>;
}

export const mongoStudentInvitationRateLimiter: StudentInvitationRateLimiter =
    {
        reserve: reserveStudentInvitationRateLimit,
        release: releaseStudentInvitationRateLimit,
    };
