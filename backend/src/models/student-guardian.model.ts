
import { Schema, model, InferSchemaType } from "mongoose";

const studentGuardianSchema = new Schema(
    {
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },

        studentId: {
            type: Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },

        guardianId: {
            type: Schema.Types.ObjectId,
            ref: "Guardian",
            required: true,
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

        isPrimary: {
            type: Boolean,
            default: false,
            required: true,
        },

        canReceiveNotifications: {
            type: Boolean,
            default: true,
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Prevent duplicate links between the same student and guardian.
studentGuardianSchema.index(
    { workspaceId: 1, studentId: 1, guardianId: 1 },
    { unique: true }
);

// A student can have only one primary guardian.
studentGuardianSchema.index(
    { workspaceId: 1, studentId: 1 },
    {
        unique: true,
        partialFilterExpression: { isPrimary: true },
    }
);

// List guardians for a student.
studentGuardianSchema.index({
    workspaceId: 1,
    studentId: 1,
});

// List students for a guardian.
studentGuardianSchema.index({
    workspaceId: 1,
    guardianId: 1,
});

export type StudentGuardian = InferSchemaType<
    typeof studentGuardianSchema
>;

const StudentGuardianModel = model(
    "StudentGuardian",
    studentGuardianSchema
);

export default StudentGuardianModel;
