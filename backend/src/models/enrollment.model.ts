
import { Schema, model, InferSchemaType } from "mongoose";

const enrollmentSchema = new Schema(
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
        this.invalidate("endedAt", "endedAt cannot be before enrolledAt");
    }
});

// A student can have only one enrollment record
// for a particular group. Rejoining updates the existing record.
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

export type Enrollment = InferSchemaType<typeof enrollmentSchema>;

const EnrollmentModel = model("Enrollment", enrollmentSchema);

export default EnrollmentModel;
