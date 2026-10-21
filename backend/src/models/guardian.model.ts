
import { Schema, model, InferSchemaType } from "mongoose";

const guardianSchema = new Schema(
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

export type Guardian = InferSchemaType<typeof guardianSchema>;

const GuardianModel = model("Guardian", guardianSchema);

export default GuardianModel;
