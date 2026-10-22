import mongoose, { Schema, Types, Document } from "mongoose";

export interface StudentGuardianDocument extends Document {
    workspaceId: Types.ObjectId;
    studentId: Types.ObjectId;
    guardianId: Types.ObjectId;
    relationship:
    | "father"
    | "mother"
    | "brother"
    | "sister"
    | "relative"
    | "other";
    isPrimary: boolean;
    canReceiveNotifications: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const studentGuardianSchema = new Schema<StudentGuardianDocument>(
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
            enum: ["father", "mother", "brother", "sister", "relative", "other"],
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
    },
);

// Prevent duplicate links between the same student and guardian.
studentGuardianSchema.index(
    { workspaceId: 1, studentId: 1, guardianId: 1 },
    { unique: true },
);

// A student can have only one primary guardian.
studentGuardianSchema.index(
    { workspaceId: 1, studentId: 1 },
    {
        unique: true,
        partialFilterExpression: { isPrimary: true },
    },
);

// List students for a guardian.
studentGuardianSchema.index({
    workspaceId: 1,
    guardianId: 1,
});

const StudentGuardianModel = mongoose.model<StudentGuardianDocument>(
    "StudentGuardian",
    studentGuardianSchema,
);

export default StudentGuardianModel;
