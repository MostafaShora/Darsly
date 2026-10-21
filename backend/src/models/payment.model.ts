
import { Schema, model, InferSchemaType } from "mongoose";

const paymentSchema = new Schema(
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

export type Payment = InferSchemaType<typeof paymentSchema>;

const PaymentModel = model("Payment", paymentSchema);

export default PaymentModel;
