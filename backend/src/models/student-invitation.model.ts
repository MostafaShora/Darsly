import mongoose, { Document, Schema, Types } from "mongoose";

export interface StudentInvitationDocument extends Document {
    workspaceId: Types.ObjectId;
    studentId: Types.ObjectId;
    secretHash: string;
    createdBy: Types.ObjectId;
    expiresAt: Date;
    revokedAt: Date | null;
    revokedBy: Types.ObjectId | null;
    consumedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const studentInvitationSchema = new Schema<StudentInvitationDocument>(
    {
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
        secretHash: {
            type: String,
            required: true,
            select: false,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        revokedAt: {
            type: Date,
            default: null,
        },
        revokedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        consumedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

studentInvitationSchema.index({ secretHash: 1 }, { unique: true });
studentInvitationSchema.index({ workspaceId: 1, createdAt: -1 });
studentInvitationSchema.index({
    workspaceId: 1,
    studentId: 1,
    createdAt: -1,
});

const StudentInvitationModel = mongoose.model<StudentInvitationDocument>(
    "StudentInvitation",
    studentInvitationSchema
);

export default StudentInvitationModel;
