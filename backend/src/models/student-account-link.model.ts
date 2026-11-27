import mongoose, { Schema, Types, Document } from "mongoose";

export type StudentAccountLinkStatus = "pending" | "active" | "inactive";

export interface StudentAccountLinkDocument extends Document {
    userId: Types.ObjectId;
    studentId: Types.ObjectId;
    workspaceId: Types.ObjectId;
    status: StudentAccountLinkStatus;
    createdAt: Date;
    updatedAt: Date;
}

const studentAccountLinkSchema = new Schema<StudentAccountLinkDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        studentId: {
            type: Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },
        status: {
            type: String,
            enum: ["pending", "active", "inactive"],
            default: "pending",
            required: true,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

studentAccountLinkSchema.index(
    { workspaceId: 1, studentId: 1 },
    { unique: true }
);

studentAccountLinkSchema.index(
    { userId: 1, studentId: 1 },
    { unique: true }
);

studentAccountLinkSchema.index({ userId: 1, status: 1 });

const StudentAccountLinkModel = mongoose.model<StudentAccountLinkDocument>(
    "StudentAccountLink",
    studentAccountLinkSchema
);

export default StudentAccountLinkModel;
