
import mongoose, { Schema, Types, Document } from "mongoose";

export type WorkspaceMemberRole = "owner" | "teacher";

export type WorkspaceMemberStatus =
    | "active"
    | "invited"
    | "suspended";

export interface WorkspaceMemberDocument extends Document {
    workspaceId: Types.ObjectId;
    userId: Types.ObjectId;
    role: WorkspaceMemberRole;
    status: WorkspaceMemberStatus;
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
            enum: ["owner", "teacher"],
            required: true,
        },

        status: {
            type: String,
            enum: ["active", "invited", "suspended"],
            required: true,
            default: "invited",
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
    },
);

// A user can belong to a workspace only once.
workspaceMemberSchema.index(
    { workspaceId: 1, userId: 1 },
    { unique: true },
);

// Useful for listing workspace members by status.
workspaceMemberSchema.index({ workspaceId: 1, status: 1 });

// An active member must have joinedAt; other statuses must not.
workspaceMemberSchema.pre("validate", function () {
    if (this.status === "active" && !this.joinedAt) {
        this.invalidate(
            "joinedAt",
            "Active membership must have a join date",
        );
    }

    if (this.status === "invited" && this.joinedAt) {
        this.invalidate(
            "joinedAt",
            "Invited membership cannot have a join date",
        );
    }
});

const WorkspaceMemberModel = mongoose.model<WorkspaceMemberDocument>(
    "WorkspaceMember",
    workspaceMemberSchema,
);

export default WorkspaceMemberModel;
