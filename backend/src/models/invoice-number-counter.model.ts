import mongoose, { Schema, Types, Document } from "mongoose";

export interface InvoiceNumberCounterDocument extends Document {
    workspaceId: Types.ObjectId;
    sequence: number;
}

const invoiceNumberCounterSchema =
    new Schema<InvoiceNumberCounterDocument>(
        {
            workspaceId: {
                type: Schema.Types.ObjectId,
                ref: "Workspace",
                required: true,
            },

            sequence: {
                type: Number,
                required: true,
                min: 0,
                default: 0,
                validate: {
                    validator: Number.isSafeInteger,
                    message: "Invoice sequence must be a safe integer",
                },
            },
        },
        {
            versionKey: false,
        }
    );

invoiceNumberCounterSchema.index(
    { workspaceId: 1 },
    { unique: true }
);

const InvoiceNumberCounterModel =
    mongoose.model<InvoiceNumberCounterDocument>(
        "InvoiceNumberCounter",
        invoiceNumberCounterSchema
    );

export default InvoiceNumberCounterModel;
