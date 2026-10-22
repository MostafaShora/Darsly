
import mongoose, { Schema, Types, Document } from "mongoose";

export interface SubjectDocument extends Document {
    workspaceId: Types.ObjectId;
    name: string;
    description: string;
    status: "active" | "archived";
    createdAt: Date;
    updatedAt: Date;
}

const subjectSchema = new Schema<SubjectDocument>(
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

const SubjectModel = mongoose.model<SubjectDocument>(
    "Subject",
    subjectSchema
);

export default SubjectModel;
