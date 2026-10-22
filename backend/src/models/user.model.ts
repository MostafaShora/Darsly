import mongoose, { Schema, type Document } from "mongoose";

export interface UserDocument extends Document {
    name: string;
    email: string;
    passwordHash: string;
    status: "active" | "suspended" | "pending";
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: 254,
        },
        passwordHash: {
            type: String,
            required: true,
            select: false,
        },
        status: {
            type: String,
            enum: ["active", "suspended", "pending"],
            default: "active",
            required: true,
        },
        lastLoginAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

const UserModel = mongoose.model<UserDocument>("User", userSchema);

export default UserModel;
