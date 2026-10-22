
import mongoose, { Schema, Types, Document } from "mongoose";

export interface GuardianDocument extends Document {
    workspaceId: Types.ObjectId;
    name: string;
    phone: string;
    alternatePhone: string | null;
    email: string | null;
    relationship:
        | "father"
        | "mother"
        | "brother"
        | "sister"
        | "relative"
        | "other";
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const guardianSchema = new Schema<GuardianDocument>(
    {
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120,
        },

        phone: {
            type: String,
            required: true,
            trim: true,
            maxlength: 25,
        },

        alternatePhone: {
            type: String,
            trim: true,
            maxlength: 25,
            default: null,
        },

        email: {
            type: String,
            lowercase: true,
            trim: true,
            maxlength: 254,
            default: null,
        },

        relationship: {
            type: String,
            enum: [
                "father",
                "mother",
                "brother",
                "sister",
                "relative",
                "other",
            ],
            default: "other",
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

guardianSchema.index({ workspaceId: 1, phone: 1 });
guardianSchema.index({ workspaceId: 1, name: 1 });

const GuardianModel = mongoose.model<GuardianDocument>(
    "Guardian",
    guardianSchema
);

export default GuardianModel;
