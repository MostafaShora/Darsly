import mongoose, { Types } from "mongoose";
import StudentInvitationModel from "../models/student-invitation.model";
import StudentInvitationRedemptionModel from "../models/student-invitation-redemption.model";
import StudentModel from "../models/student.model";
import WorkspaceModel from "../models/workspace.model";
import {
    ConflictException,
} from "../utils/app-error";
import { createPaginationMetadata } from "../utils/pagination";
import {
    ensureActiveInvitationAndStudent,
    finalizeStudentInvitationRedemption,
} from "./student-invitation-redemption.service";
import { StudentInvitationApprovalListQuery } from "../validators/student-invitation-approval.validation";

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000;

const invalidApproval = (): ConflictException =>
    new ConflictException(
        "Student invitation request is no longer available for review"
    );

export const listStudentInvitationApprovalRequestsService = async (
    workspaceId: Types.ObjectId,
    query: StudentInvitationApprovalListQuery,
    now: Date = new Date()
) => {
    const activeInvitations = await StudentInvitationModel.find({
        workspaceId,
        revokedAt: null,
        consumedAt: null,
        expiresAt: { $gt: now },
    }).select("_id studentId");
    const invitationIds = activeInvitations.map((invitation) => invitation._id);
    if (invitationIds.length === 0) {
        return {
            items: [],
            pagination: createPaginationMetadata(query.page, query.pageSize, 0),
        };
    }

    const activeStudents = await StudentModel.find({
        workspaceId,
        status: "active",
        _id: { $in: activeInvitations.map((invitation) => invitation.studentId) },
    }).select("_id");
    const studentIds = activeStudents.map((student) => student._id);
    if (studentIds.length === 0) {
        return {
            items: [],
            pagination: createPaginationMetadata(query.page, query.pageSize, 0),
        };
    }

    const filter = {
        workspaceId,
        state: "otp_verified" as const,
        invitationId: { $in: invitationIds },
        studentId: { $in: studentIds },
    };
    const skip = (query.page - 1) * query.pageSize;
    const [items, totalItems] = await Promise.all([
        StudentInvitationRedemptionModel.find(filter)
            .sort({ otpVerifiedAt: 1, _id: 1 })
            .skip(skip)
            .limit(query.pageSize),
        StudentInvitationRedemptionModel.countDocuments(filter),
    ]);

    return {
        items: items.map((item) => ({
            redemptionId: item._id.toString(),
            studentId: item.studentId.toString(),
            verifiedAt: item.otpVerifiedAt,
            requestedAt: item.createdAt,
        })),
        pagination: createPaginationMetadata(
            query.page,
            query.pageSize,
            totalItems
        ),
    };
};

export const approveStudentInvitationRedemptionService = async (
    workspaceId: Types.ObjectId,
    redemptionId: string,
    approvingUserId: string
): Promise<"approved" | "consumed"> => {
    const session = await mongoose.startSession();
    const now = new Date();
    try {
        let finalState: "approved" | "consumed" = "approved";
        await session.withTransaction(async () => {
            const workspaceQuery = WorkspaceModel.findOne({
                _id: workspaceId,
                status: "active",
            });
            const workspace = await workspaceQuery.session(session);
            if (!workspace) {
                throw invalidApproval();
            }

            const redemptionQuery = StudentInvitationRedemptionModel.findOne({
                _id: redemptionId,
                workspaceId,
                state: "otp_verified",
                otpStatus: "verified",
                otpVerifiedAt: { $ne: null },
            }).select("+verifiedEmailHash");
            const redemption = await redemptionQuery.session(session);
            if (!redemption) {
                throw invalidApproval();
            }

            await ensureActiveInvitationAndStudent(redemption, now, session);

            const approved =
                await StudentInvitationRedemptionModel.findOneAndUpdate(
                    {
                        _id: redemption._id,
                        workspaceId,
                        state: "otp_verified",
                        otpStatus: "verified",
                        otpVerifiedAt: { $ne: null },
                    },
                    {
                        $set: {
                            state: "approved",
                            approvedBy: new Types.ObjectId(approvingUserId),
                            approvedAt: now,
                            updatedAt: now,
                        },
                    },
                    { session, returnDocument: "after" }
                ).select("+verifiedEmailHash");
            if (!approved) {
                throw invalidApproval();
            }

            if (approved.userId) {
                await finalizeStudentInvitationRedemption(
                    approved,
                    session,
                    now
                );
                finalState = "consumed";
            }
        });

        return finalState;
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw invalidApproval();
        }
        throw error;
    } finally {
        await session.endSession();
    }
};

export const rejectStudentInvitationRedemptionService = async (
    workspaceId: Types.ObjectId,
    redemptionId: string,
    rejectingUserId: string
): Promise<void> => {
    const session = await mongoose.startSession();
    const now = new Date();
    try {
        await session.withTransaction(async () => {
            const workspaceQuery = WorkspaceModel.findOne({
                _id: workspaceId,
                status: "active",
            });
            const workspace = await workspaceQuery.session(session);
            if (!workspace) {
                throw invalidApproval();
            }

            const redemptionQuery = StudentInvitationRedemptionModel.findOne({
                _id: redemptionId,
                workspaceId,
                state: "otp_verified",
                otpStatus: "verified",
                otpVerifiedAt: { $ne: null },
            });
            const redemption = await redemptionQuery.session(session);
            if (!redemption) {
                throw invalidApproval();
            }

            const rejected =
                await StudentInvitationRedemptionModel.findOneAndUpdate(
                    {
                        _id: redemption._id,
                        workspaceId,
                        state: "otp_verified",
                        otpStatus: "verified",
                        otpVerifiedAt: { $ne: null },
                    },
                    {
                        $set: {
                            state: "rejected",
                            otpHash: null,
                            otpEmailHash: null,
                            verifiedEmailHash: null,
                            rejectedBy: new Types.ObjectId(rejectingUserId),
                            rejectedAt: now,
                            updatedAt: now,
                        },
                    },
                    { session, returnDocument: "after" }
                );
            if (!rejected) {
                throw invalidApproval();
            }

            const invitation = await StudentInvitationModel.findOne({
                _id: redemption.invitationId,
                workspaceId,
            }).session(session);
            if (!invitation || invitation.consumedAt) {
                throw invalidApproval();
            }

            if (!invitation.revokedAt) {
                const revoked = await StudentInvitationModel.findOneAndUpdate(
                    {
                        _id: invitation._id,
                        workspaceId,
                        consumedAt: null,
                        revokedAt: null,
                    },
                    {
                        $set: {
                            revokedAt: now,
                            revokedBy: new Types.ObjectId(rejectingUserId),
                            updatedAt: now,
                        },
                    },
                    { session, returnDocument: "after" }
                );
                if (!revoked) {
                    throw invalidApproval();
                }
            }
        });
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            throw invalidApproval();
        }
        throw error;
    } finally {
        await session.endSession();
    }
};
