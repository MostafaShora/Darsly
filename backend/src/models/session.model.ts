
import mongoose, { Schema, Types, Document } from "mongoose";

export interface SessionDocument extends Document {
    workspaceId: Types.ObjectId;
    groupId: Types.ObjectId;
    title: string;
    startsAt: Date;
    endsAt: Date;
    status: "scheduled" | "completed" | "cancelled";
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const sessionSchema = new Schema<SessionDocument>(
    {
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },

        groupId: {
            type: Schema.Types.ObjectId,
            ref: "StudyGroup",
            required: true,
        },

        title: {
            type: String,
            trim: true,
            maxlength: 150,
            default: "",
        },

        startsAt: {
            type: Date,
            required: true,
        },

        endsAt: {
            type: Date,
            required: true,
        },

        status: {
            type: String,
            enum: ["scheduled", "completed", "cancelled"],
            default: "scheduled",
            required: true,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: "",
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

sessionSchema.pre("validate", function () {
    if (this.endsAt <= this.startsAt) {
        this.invalidate("endsAt", "endsAt must be after startsAt");
    }
});

// Retrieve sessions for a group in chronological order.
sessionSchema.index({
    workspaceId: 1,
    groupId: 1,
    startsAt: 1,
});

// Retrieve upcoming sessions by status and date.
sessionSchema.index({
    workspaceId: 1,
    status: 1,
    startsAt: 1,
});

const SessionModel = mongoose.model<SessionDocument>(
    "Session",
    sessionSchema
);

export default SessionModel;
