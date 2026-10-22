import mongoose, { Schema, Types, Document } from "mongoose";

export interface WorkspaceDocument extends Document {
    name: string;
    slug: string;
    ownerId: Types.ObjectId;
    type: "individual" | "center";
    status: "active" | "suspended";
    description: string;
    currency: "EGP";
    createdAt: Date;
    updatedAt: Date;
}

const workspaceSchema = new Schema<WorkspaceDocument>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120,
        },

        slug: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            maxlength: 100,
            unique: true,
        },

        ownerId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        type: {
            type: String,
            enum: ["individual", "center"],
            default: "individual",
            required: true,
        },

        status: {
            type: String,
            enum: ["active", "suspended"],
            default: "active",
            required: true,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        currency: {
            type: String,
            enum: ["EGP"],
            default: "EGP",
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

workspaceSchema.index({ ownerId: 1, status: 1 });

const WorkspaceModel = mongoose.model<WorkspaceDocument>(
    "Workspace",
    workspaceSchema
);

export default WorkspaceModel;
