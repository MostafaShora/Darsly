
import mongoose, { Schema, Types, Document } from "mongoose";

export interface PaymentDocument extends Document {
    workspaceId: Types.ObjectId;
    studentId: Types.ObjectId;
    amount: Types.Decimal128;
    method:
        | "cash"
        | "bank_transfer"
        | "card"
        | "wallet"
        | "other";
    status: "pending" | "completed" | "failed" | "refunded";
    receivedAt: Date;
    reference: string | null;
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDocument>(
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

        amount: {
            type: Schema.Types.Decimal128,
            required: true,
            min: 0,
        },

        method: {
            type: String,
            enum: [
                "cash",
                "bank_transfer",
                "card",
                "wallet",
                "other",
            ],
            required: true,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "completed",
                "failed",
                "refunded",
            ],
            default: "completed",
            required: true,
        },

        receivedAt: {
            type: Date,
            default: Date.now,
            required: true,
        },

        reference: {
            type: String,
            trim: true,
            maxlength: 150,
            default: null,
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

paymentSchema.index({
    workspaceId: 1,
    studentId: 1,
    receivedAt: -1,
});

paymentSchema.index({
    workspaceId: 1,
    status: 1,
    receivedAt: -1,
});

const PaymentModel = mongoose.model<PaymentDocument>(
    "Payment",
    paymentSchema
);

export default PaymentModel;
