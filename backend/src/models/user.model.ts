
import { Schema, model, InferSchemaType } from "mongoose";

const userSchema = new Schema(
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

export type User = InferSchemaType<typeof userSchema>;

const UserModel = model("User", userSchema);

export default UserModel;
