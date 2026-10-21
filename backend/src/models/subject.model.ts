
import { Schema, model, InferSchemaType } from "mongoose";

const subjectSchema = new Schema(
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
            maxlength: 100,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        status: {
            type: String,
            enum: ["active", "archived"],
            default: "active",
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

subjectSchema.index(
    { workspaceId: 1, name: 1 },
    { unique: true }
);

subjectSchema.index({ workspaceId: 1, status: 1 });

export type Subject = InferSchemaType<typeof subjectSchema>;

const SubjectModel = model("Subject", subjectSchema);

export default SubjectModel;
