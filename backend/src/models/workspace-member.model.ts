
import mongoose, { Schema, Types, Document } from "mongoose";

export interface WorkspaceMemberDocument extends Document {
    workspaceId: Types.ObjectId;
    userId: Types.ObjectId;
    role: "owner";
    status: "active" | "invited" | "suspended";
    invitedBy: Types.ObjectId | null;
    joinedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const workspaceMemberSchema = new Schema<WorkspaceMemberDocument>(
    {
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },

        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        role: {
            type: String,
            enum: ["owner"],
            required: true,
            default: "owner",
        },

        status: {
            type: String,
            enum: ["active", "invited", "suspended"],
            required: true,
            default: "active",
        },

        invitedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        joinedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// A user can belong to a workspace only once.
workspaceMemberSchema.index(
    { workspaceId: 1, userId: 1 },
    { unique: true }
);

// Useful for listing active members of a workspace.
workspaceMemberSchema.index({ workspaceId: 1, status: 1 });

const WorkspaceMemberModel = mongoose.model<WorkspaceMemberDocument>(
    "WorkspaceMember",
    workspaceMemberSchema
);

export default WorkspaceMemberModel;
