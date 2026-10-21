
import { Schema, model, InferSchemaType } from "mongoose";

const workspaceMemberSchema = new Schema(
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
            enum: ["owner", "admin", "teacher", "assistant"],
            required: true,
            default: "teacher",
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

export type WorkspaceMember = InferSchemaType<
    typeof workspaceMemberSchema
>;

const WorkspaceMemberModel = model(
    "WorkspaceMember",
    workspaceMemberSchema
);

export default WorkspaceMemberModel;
