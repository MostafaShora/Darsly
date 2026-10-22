
import mongoose, { Schema, Types, Document } from "mongoose";

export interface PaymentAllocationDocument extends Document {
    workspaceId: Types.ObjectId;
    paymentId: Types.ObjectId;
    invoiceId: Types.ObjectId;
    amount: Types.Decimal128;
    createdAt: Date;
    updatedAt: Date;
}

const paymentAllocationSchema = new Schema<PaymentAllocationDocument>(
    {
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },

        paymentId: {
            type: Schema.Types.ObjectId,
            ref: "Payment",
            required: true,
        },

        invoiceId: {
            type: Schema.Types.ObjectId,
            ref: "Invoice",
            required: true,
        },

        amount: {
            type: Schema.Types.Decimal128,
            required: true,
            min: 0,
        },
    },
    {
        timestamps: true,
        versionKey: false,
    }
);

// Prevent duplicate allocations for the same payment and invoice.
paymentAllocationSchema.index(
    { workspaceId: 1, paymentId: 1, invoiceId: 1 },
    { unique: true }
);

// Find allocations associated with an invoice.
paymentAllocationSchema.index({
    workspaceId: 1,
    invoiceId: 1,
});

const PaymentAllocationModel = mongoose.model<PaymentAllocationDocument>(
    "PaymentAllocation",
    paymentAllocationSchema
);

export default PaymentAllocationModel;
