import mongoose, { Document, Schema } from "mongoose";

export interface StudentInvitationRateLimitEvent {
    reservationId: string;
    occurredAt: Date;
}

export interface StudentInvitationRateLimitDocument extends Document {
    keyHash: string;
    events: StudentInvitationRateLimitEvent[];
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const eventSchema = new Schema<StudentInvitationRateLimitEvent>(
    {
        reservationId: {
            type: String,
            required: true,
        },
        occurredAt: {
            type: Date,
            required: true,
        },
    },
    {
        _id: false,
        versionKey: false,
    }
);

const studentInvitationRateLimitSchema =
    new Schema<StudentInvitationRateLimitDocument>(
        {
            keyHash: {
                type: String,
                required: true,
                select: false,
            },
            events: {
                type: [eventSchema],
                default: [],
                select: false,
            },
            expiresAt: {
                type: Date,
                required: true,
            },
        },
        {
            timestamps: true,
            versionKey: false,
        }
    );

studentInvitationRateLimitSchema.index({ keyHash: 1 }, { unique: true });
studentInvitationRateLimitSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

const StudentInvitationRateLimitModel =
    mongoose.model<StudentInvitationRateLimitDocument>(
        "StudentInvitationRateLimit",
        studentInvitationRateLimitSchema
    );

export default StudentInvitationRateLimitModel;
