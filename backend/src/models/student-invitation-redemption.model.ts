import mongoose, { Document, Schema, Types } from "mongoose";

export type StudentInvitationRedemptionState =
    | "claimed"
    | "otp_pending"
    | "otp_verified"
    | "approved"
    | "rejected"
    | "consumed";

export type StudentInvitationOtpStatus =
    | "none"
    | "sending"
    | "sent"
    | "failed"
    | "locked"
    | "verified";

export interface StudentInvitationRedemptionDocument extends Document {
    invitationId: Types.ObjectId;
    workspaceId: Types.ObjectId;
    studentId: Types.ObjectId;
    claimTokenHash: string;
    userId: Types.ObjectId | null;
    state: StudentInvitationRedemptionState;
    otpStatus: StudentInvitationOtpStatus;
    otpHash: string | null;
    otpEmailHash: string | null;
    verifiedEmailHash: string | null;
    otpExpiresAt: Date | null;
    otpAttempts: number;
    otpSendTimes: Date[];
    otpChallengeVersion: number;
    otpVerifiedAt: Date | null;
    approvedBy: Types.ObjectId | null;
    approvedAt: Date | null;
    rejectedBy: Types.ObjectId | null;
    rejectedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const studentInvitationRedemptionSchema =
    new Schema<StudentInvitationRedemptionDocument>(
        {
            invitationId: {
                type: Schema.Types.ObjectId,
                ref: "StudentInvitation",
                required: true,
            },
            workspaceId: {
                type: Schema.Types.ObjectId,
                ref: "Workspace",
                required: true,
            },
            studentId: {
                type: Schema.Types.ObjectId,
                ref: "Student",
                required: true,
            },
            claimTokenHash: {
                type: String,
                required: true,
                select: false,
            },
            userId: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            state: {
                type: String,
                enum: [
                    "claimed",
                    "otp_pending",
                    "otp_verified",
                    "approved",
                    "rejected",
                    "consumed",
                ],
                default: "claimed",
                required: true,
            },
            otpStatus: {
                type: String,
                enum: ["none", "sending", "sent", "failed", "locked", "verified"],
                default: "none",
                required: true,
            },
            otpHash: {
                type: String,
                default: null,
                select: false,
            },
            otpEmailHash: {
                type: String,
                default: null,
                select: false,
            },
            verifiedEmailHash: {
                type: String,
                default: null,
                select: false,
            },
            otpExpiresAt: {
                type: Date,
                default: null,
            },
            otpAttempts: {
                type: Number,
                default: 0,
                min: 0,
            },
            otpSendTimes: {
                type: [Date],
                default: [],
            },
            otpChallengeVersion: {
                type: Number,
                default: 0,
                min: 0,
            },
            otpVerifiedAt: {
                type: Date,
                default: null,
            },
            approvedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            approvedAt: {
                type: Date,
                default: null,
            },
            rejectedBy: {
                type: Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
            rejectedAt: {
                type: Date,
                default: null,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

studentInvitationRedemptionSchema.index(
    { invitationId: 1 },
    { unique: true }
);
studentInvitationRedemptionSchema.index({
    workspaceId: 1,
    state: 1,
    createdAt: -1,
});

const StudentInvitationRedemptionModel =
    mongoose.model<StudentInvitationRedemptionDocument>(
        "StudentInvitationRedemption",
        studentInvitationRedemptionSchema
    );

export default StudentInvitationRedemptionModel;
