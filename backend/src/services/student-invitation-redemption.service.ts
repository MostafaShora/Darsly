import bcrypt from "bcrypt";
import mongoose, { ClientSession } from "mongoose";
import StudentAccountLinkModel from "../models/student-account-link.model";
import StudentInvitationModel from "../models/student-invitation.model";
import StudentInvitationRedemptionModel, {
    StudentInvitationRedemptionDocument,
} from "../models/student-invitation-redemption.model";
import StudentModel from "../models/student.model";
import UserModel, { UserCapability } from "../models/user.model";
import WorkspaceModel from "../models/workspace.model";
import {
    BadRequestException,
    ConflictException,
    InternalServerException,
    NotFoundException,
    ServiceUnavailableException,
} from "../utils/app-error";
import {
    createStudentInvitationClaimToken,
    createStudentInvitationClaimTokenHash,
    createStudentInvitationEmailHash,
    createStudentInvitationOtp,
    createStudentInvitationOtpHash,
    createStudentInvitationSecretHash,
    getStudentInvitationOtpLifetimeMs,
    matchesStudentInvitationHash,
} from "./student-invitation-otp.crypto";
import {
    StudentInvitationEmailProvider,
    resendStudentInvitationEmailProvider,
} from "./student-invitation-email.service";

const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
const OTP_SEND_LIMIT = 3;
const OTP_ATTEMPT_LIMIT = 5;

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000;

const invalidRedemption = (): ConflictException =>
    new ConflictException("Unable to continue this student invitation");

const isUsableState = (
    state: StudentInvitationRedemptionDocument["state"]
): boolean =>
    state === "claimed" ||
    state === "otp_pending" ||
    state === "otp_verified" ||
    state === "approved";

export const ensureActiveInvitationAndStudent = async (
    redemption: Pick<
        StudentInvitationRedemptionDocument,
        "invitationId" | "workspaceId" | "studentId"
    >,
    now: Date,
    session?: ClientSession
) => {
    const invitationQuery = StudentInvitationModel.findOne({
        _id: redemption.invitationId,
        workspaceId: redemption.workspaceId,
        studentId: redemption.studentId,
        revokedAt: null,
        consumedAt: null,
        expiresAt: { $gt: now },
    });
    const studentQuery = StudentModel.findOne({
        _id: redemption.studentId,
        workspaceId: redemption.workspaceId,
        status: "active",
    });
    const workspaceQuery = WorkspaceModel.findOne({
        _id: redemption.workspaceId,
        status: "active",
    });
    let invitation;
    let student;
    let workspace;
    if (session) {
        invitation = await invitationQuery.session(session);
        student = await studentQuery.session(session);
        workspace = await workspaceQuery.session(session);
    } else {
        [invitation, student, workspace] = await Promise.all([
            invitationQuery,
            studentQuery,
            workspaceQuery,
        ]);
    }

    if (!invitation || !student || !workspace) {
        throw invalidRedemption();
    }

    return { invitation, student };
};

const getRedemptionByToken = async (
    redemptionId: string,
    claimToken: string,
    states?: StudentInvitationRedemptionDocument["state"][]
) => {
    const filter = {
        _id: redemptionId,
        claimTokenHash: createStudentInvitationClaimTokenHash(claimToken),
        ...(states ? { state: { $in: states } } : {}),
    };
    const redemption = await StudentInvitationRedemptionModel.findOne(filter)
        .select("+verifiedEmailHash");

    if (!redemption || !isUsableState(redemption.state)) {
        throw invalidRedemption();
    }

    return redemption;
};

export interface StartedStudentInvitationRedemption {
    redemptionId: string;
    claimToken: string;
}

export const startStudentInvitationRedemptionService = async (
    invitationSecret: string,
    now: Date = new Date()
): Promise<StartedStudentInvitationRedemption> => {
    if (!/^[a-f0-9]{64}$/i.test(invitationSecret)) {
        throw invalidRedemption();
    }

    const secretHash = createStudentInvitationSecretHash(invitationSecret);
    const invitationQuery = StudentInvitationModel.findOne({
        secretHash,
        revokedAt: null,
        consumedAt: null,
        expiresAt: { $gt: now },
    }).select("+secretHash");
    const invitation = await invitationQuery;

    if (
        !invitation ||
        !matchesStudentInvitationHash(invitation.secretHash, secretHash)
    ) {
        throw invalidRedemption();
    }

    const student = await StudentModel.findOne({
        _id: invitation.studentId,
        workspaceId: invitation.workspaceId,
        status: "active",
    });
    if (!student) {
        throw invalidRedemption();
    }

    const claimToken = createStudentInvitationClaimToken();
    try {
        const redemption = await StudentInvitationRedemptionModel.create({
            invitationId: invitation._id,
            workspaceId: invitation.workspaceId,
            studentId: invitation.studentId,
            claimTokenHash: createStudentInvitationClaimTokenHash(claimToken),
            state: "claimed",
            otpStatus: "none",
        });

        return {
            redemptionId: redemption._id.toString(),
            claimToken,
        };
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw invalidRedemption();
        }

        throw error;
    }
};

export const requestStudentInvitationOtpService = async (
    redemptionId: string,
    claimToken: string,
    provider: StudentInvitationEmailProvider =
        resendStudentInvitationEmailProvider,
    now: Date = new Date()
): Promise<void> => {
    if (!provider.available) {
        throw new ServiceUnavailableException(
            "Student email delivery configuration is incomplete or invalid. Check RESEND_API_KEY and RESEND_FROM_EMAIL."
        );
    }

    const redemption = await getRedemptionByToken(
        redemptionId,
        claimToken,
        ["claimed", "otp_pending"]
    );
    const { student } = await ensureActiveInvitationAndStudent(redemption, now);
    const recipient = student.email?.trim().toLowerCase();
    if (!recipient) {
        throw new BadRequestException(
            "Unable to continue. Ask your teacher to review the Student email on record."
        );
    }

    const otp = createStudentInvitationOtp();
    const otpHash = createStudentInvitationOtpHash(redemptionId, otp);
    const otpEmailHash = createStudentInvitationEmailHash(recipient);
    const expiresAt = new Date(now.getTime() + getStudentInvitationOtpLifetimeMs());
    const oneHourAgo = new Date(now.getTime() - OTP_SEND_WINDOW_MS);
    const cooldownBefore = new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS);
    const sentTimes = { $ifNull: ["$otpSendTimes", []] };
    const recentSentTimes = {
        $filter: {
            input: sentTimes,
            as: "sentAt",
            cond: { $gt: ["$$sentAt", oneHourAgo] },
        },
    };
    const reserved = await StudentInvitationRedemptionModel.findOneAndUpdate(
        {
            _id: redemption._id,
            claimTokenHash: createStudentInvitationClaimTokenHash(claimToken),
            state: { $in: ["claimed", "otp_pending"] },
            $expr: {
                $and: [
                    { $lt: [{ $size: recentSentTimes }, OTP_SEND_LIMIT] },
                    {
                        $or: [
                            { $eq: [{ $size: sentTimes }, 0] },
                            {
                                $lte: [
                                    { $arrayElemAt: [sentTimes, -1] },
                                    cooldownBefore,
                                ],
                            },
                        ],
                    },
                ],
            },
        },
        {
            $set: {
                state: "otp_pending",
                otpStatus: "sending",
                otpHash,
                otpEmailHash,
                otpExpiresAt: expiresAt,
                otpAttempts: 0,
                otpVerifiedAt: null,
                verifiedEmailHash: null,
                updatedAt: now,
            },
            $inc: { otpChallengeVersion: 1 },
            $push: {
                otpSendTimes: {
                    $each: [now],
                    $slice: -10,
                },
            },
        },
        { returnDocument: "after" }
    ).select("+otpHash +otpEmailHash +claimTokenHash");

    if (!reserved) {
        throw invalidRedemption();
    }

    const challengeVersion = reserved.otpChallengeVersion;
    try {
        await provider.sendOtpEmail({
            recipient,
            code: otp,
            expiresAt,
        });
    } catch {
        await StudentInvitationRedemptionModel.findOneAndUpdate(
            {
                _id: reserved._id,
                otpChallengeVersion: challengeVersion,
                otpStatus: "sending",
            },
            {
                $set: {
                    otpStatus: "failed",
                    otpHash: null,
                    otpEmailHash: null,
                    updatedAt: new Date(),
                },
            },
            { returnDocument: "after" }
        );
        const unavailable = new ServiceUnavailableException(
            "Student verification email could not be delivered"
        );
        throw unavailable;
    }

    const delivered = await StudentInvitationRedemptionModel.findOneAndUpdate(
        {
            _id: reserved._id,
            otpChallengeVersion: challengeVersion,
            otpStatus: "sending",
        },
        { $set: { otpStatus: "sent", updatedAt: new Date() } },
        { returnDocument: "after" }
    );

    if (!delivered) {
        throw invalidRedemption();
    }
};

export const verifyStudentInvitationOtpService = async (
    redemptionId: string,
    claimToken: string,
    submittedOtp: string,
    now: Date = new Date()
): Promise<void> => {
    const attempt = await StudentInvitationRedemptionModel.findOneAndUpdate(
        {
            _id: redemptionId,
            claimTokenHash: createStudentInvitationClaimTokenHash(claimToken),
            state: "otp_pending",
            otpStatus: "sent",
            otpExpiresAt: { $gt: now },
            otpAttempts: { $lt: OTP_ATTEMPT_LIMIT },
        },
        { $inc: { otpAttempts: 1 }, $set: { updatedAt: now } },
        { returnDocument: "after" }
    ).select("+otpHash +otpEmailHash +claimTokenHash");

    if (!attempt?.otpHash || !attempt.otpEmailHash) {
        throw invalidRedemption();
    }

    const expectedOtpHash = createStudentInvitationOtpHash(
        redemptionId,
        submittedOtp
    );
    const otpMatches = matchesStudentInvitationHash(
        attempt.otpHash,
        expectedOtpHash
    );

    if (!otpMatches) {
        if (attempt.otpAttempts >= OTP_ATTEMPT_LIMIT) {
            await StudentInvitationRedemptionModel.findOneAndUpdate(
                {
                    _id: attempt._id,
                    claimTokenHash:
                        createStudentInvitationClaimTokenHash(claimToken),
                    otpChallengeVersion: attempt.otpChallengeVersion,
                    otpStatus: "sent",
                    otpAttempts: { $gte: OTP_ATTEMPT_LIMIT },
                },
                {
                    $set: {
                        otpStatus: "locked",
                        otpHash: null,
                        otpEmailHash: null,
                        updatedAt: now,
                    },
                }
            );
        }
        throw new BadRequestException("Unable to verify this code");
    }

    const { student } = await ensureActiveInvitationAndStudent(attempt, now);
    const currentEmailHash = student.email
        ? createStudentInvitationEmailHash(student.email)
        : "";
    if (!matchesStudentInvitationHash(attempt.otpEmailHash, currentEmailHash)) {
        await StudentInvitationRedemptionModel.findOneAndUpdate(
            {
                _id: attempt._id,
                claimTokenHash:
                    createStudentInvitationClaimTokenHash(claimToken),
                otpChallengeVersion: attempt.otpChallengeVersion,
                otpStatus: "sent",
            },
            {
                $set: {
                    state: "claimed",
                    otpStatus: "failed",
                    otpHash: null,
                    otpEmailHash: null,
                    otpExpiresAt: null,
                    otpAttempts: 0,
                    updatedAt: now,
                },
            }
        );
        throw invalidRedemption();
    }

    const verified = await StudentInvitationRedemptionModel.findOneAndUpdate(
        {
            _id: attempt._id,
            claimTokenHash: createStudentInvitationClaimTokenHash(claimToken),
            state: "otp_pending",
            otpStatus: "sent",
            otpChallengeVersion: attempt.otpChallengeVersion,
            otpExpiresAt: { $gt: now },
            otpAttempts: attempt.otpAttempts,
        },
        {
            $set: {
                state: "otp_verified",
                otpStatus: "verified",
                otpHash: null,
                verifiedEmailHash: attempt.otpEmailHash,
                otpVerifiedAt: now,
                updatedAt: now,
            },
        },
        { returnDocument: "after" }
    );

    if (!verified) {
        throw invalidRedemption();
    }
};

export const finalizeStudentInvitationRedemption = async (
    redemption: StudentInvitationRedemptionDocument,
    session: ClientSession,
    now: Date
): Promise<void> => {
    if (
        redemption.state !== "approved" ||
        !redemption.userId ||
        !redemption.otpVerifiedAt ||
        redemption.otpStatus !== "verified" ||
        !redemption.verifiedEmailHash
    ) {
        throw invalidRedemption();
    }

    const { invitation, student } = await ensureActiveInvitationAndStudent(
        redemption,
        now,
        session
    );
    const email = student.email?.trim().toLowerCase();
    if (
        !email ||
        !matchesStudentInvitationHash(
            redemption.verifiedEmailHash,
            createStudentInvitationEmailHash(email)
        )
    ) {
        throw invalidRedemption();
    }

    const userQuery = UserModel.findOne({
        _id: redemption.userId,
        email,
        status: "active",
    });
    const user = await userQuery.session(session);
    if (!user) {
        throw invalidRedemption();
    }

    const capabilities: UserCapability[] =
        user.capabilities === undefined
            ? ["teacher", "student"]
            : Array.from(new Set([...user.capabilities, "student"]));
    if (
        user.capabilities === undefined ||
        !user.capabilities.includes("student")
    ) {
        user.capabilities = capabilities;
        await user.save({ session });
    }

    await StudentAccountLinkModel.create(
        [
            {
                userId: user._id,
                workspaceId: redemption.workspaceId,
                studentId: redemption.studentId,
                status: "active",
            },
        ],
        { session }
    );

    const consumedInvitation = await StudentInvitationModel.findOneAndUpdate(
        {
            _id: invitation._id,
            workspaceId: redemption.workspaceId,
            revokedAt: null,
            consumedAt: null,
            expiresAt: { $gt: now },
        },
        { $set: { consumedAt: now, updatedAt: now } },
        { session, returnDocument: "after" }
    );
    if (!consumedInvitation) {
        throw invalidRedemption();
    }

    const consumedRedemption =
        await StudentInvitationRedemptionModel.findOneAndUpdate(
            {
                _id: redemption._id,
                workspaceId: redemption.workspaceId,
                state: "approved",
                userId: user._id,
                otpVerifiedAt: { $ne: null },
            },
            {
                $set: {
                    state: "consumed",
                    otpHash: null,
                    otpEmailHash: null,
                    verifiedEmailHash: null,
                    updatedAt: now,
                },
            },
            { session, returnDocument: "after" }
        );
    if (!consumedRedemption) {
        throw invalidRedemption();
    }
};

export const bindStudentInvitationToExistingAccountService = async (
    redemptionId: string,
    claimToken: string,
    authenticatedUserId: string
): Promise<"pending_approval" | "active"> => {
    const session = await mongoose.startSession();
    const now = new Date();
    let accessState: "pending_approval" | "active" = "pending_approval";
    try {
        await session.withTransaction(async () => {
            const query = StudentInvitationRedemptionModel.findOne({
                _id: redemptionId,
                claimTokenHash:
                    createStudentInvitationClaimTokenHash(claimToken),
                state: { $in: ["claimed", "otp_pending", "otp_verified", "approved"] },
            }).select("+verifiedEmailHash");
            const redemption = await query.session(session);
            if (!redemption) {
                throw invalidRedemption();
            }

            const userQuery = UserModel.findById(authenticatedUserId);
            const user = await userQuery.session(session);
            if (!user || user.status !== "active") {
                throw invalidRedemption();
            }

            const { student } = await ensureActiveInvitationAndStudent(
                redemption,
                now,
                session
            );
            const email = student.email?.trim().toLowerCase();
            if (!email || email !== user.email.trim().toLowerCase()) {
                throw new BadRequestException(
                    "Unable to continue this student invitation"
                );
            }

            if (
                redemption.userId &&
                redemption.userId.toString() !== authenticatedUserId
            ) {
                throw invalidRedemption();
            }

            if (!redemption.userId) {
                const bound =
                    await StudentInvitationRedemptionModel.findOneAndUpdate(
                        {
                            _id: redemption._id,
                            claimTokenHash:
                                createStudentInvitationClaimTokenHash(
                                    claimToken
                                ),
                            userId: null,
                            state: {
                                $in: [
                                    "claimed",
                                    "otp_pending",
                                    "otp_verified",
                                    "approved",
                                ],
                            },
                        },
                        {
                            $set: {
                                userId: user._id,
                                updatedAt: now,
                            },
                        },
                        { session, returnDocument: "after" }
                    );
                if (!bound) {
                    throw invalidRedemption();
                }
                Object.assign(redemption, bound.toObject());
            }

            if (redemption.state === "approved") {
                await finalizeStudentInvitationRedemption(
                    redemption,
                    session,
                    now
                );
                accessState = "active";
            }
        });
        return accessState;
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw invalidRedemption();
        }
        throw error;
    } finally {
        await session.endSession();
    }
};

export const completeStudentInvitationRegistrationService = async (
    redemptionId: string,
    claimToken: string,
    password: string
): Promise<"pending_approval" | "active"> => {
    const preflight = await getRedemptionByToken(
        redemptionId,
        claimToken,
        ["otp_verified", "approved"]
    );
    if (preflight.userId || !preflight.otpVerifiedAt) {
        throw invalidRedemption();
    }
    const { student } = await ensureActiveInvitationAndStudent(
        preflight,
        new Date()
    );
    const email = student.email?.trim().toLowerCase();
    if (
        !email ||
        !preflight.verifiedEmailHash ||
        !matchesStudentInvitationHash(
            preflight.verifiedEmailHash,
            createStudentInvitationEmailHash(email)
        )
    ) {
        throw invalidRedemption();
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const session = await mongoose.startSession();
    const now = new Date();
    let accessState: "pending_approval" | "active" = "pending_approval";
    try {
        await session.withTransaction(async () => {
            const redemptionQuery = StudentInvitationRedemptionModel.findOne({
                _id: redemptionId,
                claimTokenHash:
                    createStudentInvitationClaimTokenHash(claimToken),
                userId: null,
                state: { $in: ["otp_verified", "approved"] },
                otpStatus: "verified",
                otpVerifiedAt: { $ne: null },
            }).select("+verifiedEmailHash");
            const redemption = await redemptionQuery.session(session);
            if (!redemption || !redemption.verifiedEmailHash) {
                throw invalidRedemption();
            }

            const { student: currentStudent } =
                await ensureActiveInvitationAndStudent(
                    redemption,
                    now,
                    session
                );
            const currentEmail = currentStudent.email?.trim().toLowerCase();
            if (
                !currentEmail ||
                !matchesStudentInvitationHash(
                    redemption.verifiedEmailHash,
                    createStudentInvitationEmailHash(currentEmail)
                )
            ) {
                throw invalidRedemption();
            }

            const [user] = await UserModel.create(
                [
                    {
                        name: currentStudent.name,
                        email: currentEmail,
                        passwordHash,
                        capabilities: ["student"],
                        status: "active",
                    },
                ],
                { session }
            );
            if (!user) {
                throw new InternalServerException();
            }

            const bound =
                await StudentInvitationRedemptionModel.findOneAndUpdate(
                    {
                        _id: redemption._id,
                        userId: null,
                        state: { $in: ["otp_verified", "approved"] },
                        otpStatus: "verified",
                    },
                    {
                        $set: {
                            userId: user._id,
                            updatedAt: now,
                        },
                    },
                    { session, returnDocument: "after" }
                ).select("+verifiedEmailHash");
            if (!bound) {
                throw invalidRedemption();
            }

            if (bound.state === "approved") {
                await finalizeStudentInvitationRedemption(
                    bound,
                    session,
                    now
                );
                accessState = "active";
            }
        });
        return accessState;
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw invalidRedemption();
        }
        throw error;
    } finally {
        await session.endSession();
    }
};

export const getStudentInvitationRedemptionStateService = async (
    redemptionId: string,
    claimToken: string
): Promise<Pick<
    StudentInvitationRedemptionDocument,
    "state" | "otpStatus" | "otpVerifiedAt"
>> => {
    const redemption = await StudentInvitationRedemptionModel.findOne({
        _id: redemptionId,
        claimTokenHash: createStudentInvitationClaimTokenHash(claimToken),
    }).select("state otpStatus otpVerifiedAt");

    if (!redemption) {
        throw new NotFoundException("Student invitation redemption not found");
    }

    return redemption;
};
