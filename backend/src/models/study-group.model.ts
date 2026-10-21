
import { Schema, model, InferSchemaType } from "mongoose";

const studyGroupSchema = new Schema(
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

export type StudyGroup = InferSchemaType<typeof studyGroupSchema>;

const StudyGroupModel = model("StudyGroup", studyGroupSchema);

export default StudyGroupModel;
