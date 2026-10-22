
import mongoose, { Schema, Types, Document } from "mongoose";

export interface StudyGroupDocument extends Document {
    workspaceId: Types.ObjectId;
    subjectId: Types.ObjectId;
    name: string;
    description: string;
    monthlyFee: Types.Decimal128;
    capacity: number | null;
    status: "active" | "inactive" | "archived";
    createdAt: Date;
    updatedAt: Date;
}

const studyGroupSchema = new Schema<StudyGroupDocument>(
    {
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },

        subjectId: {
            type: Schema.Types.ObjectId,
            ref: "Subject",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 120,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        monthlyFee: {
            type: Schema.Types.Decimal128,
            required: true,
            min: 0,
        },

        capacity: {
            type: Number,
            min: 1,
            max: 1000,
            default: null,
        },

        status: {
            type: String,
            enum: ["active", "inactive", "archived"],
            default: "active",
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

studyGroupSchema.index({
    workspaceId: 1,
    subjectId: 1,
    status: 1,
});

studyGroupSchema.index({
    workspaceId: 1,
    name: 1,
});

const StudyGroupModel = mongoose.model<StudyGroupDocument>(
    "StudyGroup",
    studyGroupSchema
);

export default StudyGroupModel;
