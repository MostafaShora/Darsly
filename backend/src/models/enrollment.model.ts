
import mongoose, { Schema, Types, Document } from "mongoose";

export interface EnrollmentDocument extends Document {
    workspaceId: Types.ObjectId;
    studentId: Types.ObjectId;
    groupId: Types.ObjectId;
    enrolledAt: Date;
    endedAt: Date | null;
    status: "active" | "paused" | "completed" | "cancelled";
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const enrollmentSchema = new Schema<EnrollmentDocument>(
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

        groupId: {
            type: Schema.Types.ObjectId,
            ref: "StudyGroup",
            required: true,
        },

        enrolledAt: {
            type: Date,
            required: true,
            default: Date.now,
        },

        endedAt: {
            type: Date,
            default: null,
        },

        status: {
            type: String,
            enum: ["active", "paused", "completed", "cancelled"],
            default: "active",
            required: true,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

enrollmentSchema.pre("validate", function () {
    if (this.endedAt && this.endedAt < this.enrolledAt) {
        this.invalidate(
            "endedAt",
            "endedAt cannot be before enrolledAt"
        );
    }
});

// A student can have only one enrollment record per group.
enrollmentSchema.index(
    { workspaceId: 1, studentId: 1, groupId: 1 },
    { unique: true }
);

enrollmentSchema.index({
    workspaceId: 1,
    groupId: 1,
    status: 1,
});

enrollmentSchema.index({
    workspaceId: 1,
    studentId: 1,
    status: 1,
});

const EnrollmentModel = mongoose.model<EnrollmentDocument>(
    "Enrollment",
    enrollmentSchema
);

export default EnrollmentModel;
