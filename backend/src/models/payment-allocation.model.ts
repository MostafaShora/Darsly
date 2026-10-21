
import { Schema, model, InferSchemaType } from "mongoose";

const paymentAllocationSchema = new Schema(
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

// Prevent duplicate allocation documents for the same pair.
// Update the existing allocation when necessary.
paymentAllocationSchema.index(
    { workspaceId: 1, paymentId: 1, invoiceId: 1 },
    { unique: true }
);

paymentAllocationSchema.index({
    workspaceId: 1,
    invoiceId: 1,
});

paymentAllocationSchema.index({
    workspaceId: 1,
    paymentId: 1,
});

export type PaymentAllocation = InferSchemaType<
    typeof paymentAllocationSchema
>;

const PaymentAllocationModel = model(
    "PaymentAllocation",
    paymentAllocationSchema
);

export default PaymentAllocationModel;
