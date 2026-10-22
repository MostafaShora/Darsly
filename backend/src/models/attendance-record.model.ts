
import mongoose, { Schema, Types, Document } from "mongoose";

export interface AttendanceRecordDocument extends Document {
    workspaceId: Types.ObjectId;
    sessionId: Types.ObjectId;
    studentId: Types.ObjectId;
    status: "present" | "absent" | "late" | "excused";
    lateMinutes: number;
    notes: string;
    recordedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const attendanceRecordSchema = new Schema<AttendanceRecordDocument>(
    {
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },

        sessionId: {
            type: Schema.Types.ObjectId,
            ref: "Session",
            required: true,
        },

        studentId: {
            type: Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },

        status: {
            type: String,
            enum: ["present", "absent", "late", "excused"],
            required: true,
            default: "present",
        },

        lateMinutes: {
            type: Number,
            min: 0,
            default: 0,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        recordedAt: {
            type: Date,
            default: Date.now,
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// A student can have only one attendance record per session.
attendanceRecordSchema.index(
    { workspaceId: 1, sessionId: 1, studentId: 1 },
    { unique: true }
);

// Retrieve attendance records for a session.
attendanceRecordSchema.index({
    workspaceId: 1,
    sessionId: 1,
    status: 1,
});

// Retrieve a student's attendance history.
attendanceRecordSchema.index({
    workspaceId: 1,
    studentId: 1,
    recordedAt: -1,
});

const AttendanceRecordModel = mongoose.model<AttendanceRecordDocument>(
    "AttendanceRecord",
    attendanceRecordSchema
);

export default AttendanceRecordModel;
