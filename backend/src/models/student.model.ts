
import mongoose, { Schema, Types, Document } from "mongoose";

export interface StudentDocument extends Document {
    workspaceId: Types.ObjectId;
    name: string;
    phone: string | null;
    email: string | null;
    schoolName: string;
    grade: string;
    status: "active" | "inactive" | "archived";
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const studentSchema = new Schema<StudentDocument>(
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
            maxlength: 120,
        },

        phone: {
            type: String,
            trim: true,
            maxlength: 25,
            default: null,
        },

        email: {
            type: String,
            lowercase: true,
            trim: true,
            maxlength: 254,
            default: null,
        },

        schoolName: {
            type: String,
            trim: true,
            maxlength: 150,
            default: "",
        },

        grade: {
            type: String,
            trim: true,
            maxlength: 80,
            default: "",
        },

        status: {
            type: String,
            enum: ["active", "inactive", "archived"],
            default: "active",
            required: true,
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 2000,
            default: "",
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

studentSchema.index({ workspaceId: 1, status: 1 });
studentSchema.index({ workspaceId: 1, name: 1 });

const StudentModel = mongoose.model<StudentDocument>(
    "Student",
    studentSchema
);

export default StudentModel;
