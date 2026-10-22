
import mongoose, { Schema, Types, Document } from "mongoose";

export interface InvoiceDocument extends Document {
    workspaceId: Types.ObjectId;
    invoiceNumber: string;
    studentId: Types.ObjectId;
    enrollmentId: Types.ObjectId;
    groupId: Types.ObjectId;
    periodStart: Date;
    periodEnd: Date;
    totalAmount: Types.Decimal128;
    dueDate: Date | null;
    status: "draft" | "issued" | "void";
    description: string;
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const invoiceSchema = new Schema<InvoiceDocument>(
    {
        workspaceId: {
            type: Schema.Types.ObjectId,
            ref: "Workspace",
            required: true,
        },

        invoiceNumber: {
            type: String,
            required: true,
            trim: true,
            maxlength: 50,
        },

        studentId: {
            type: Schema.Types.ObjectId,
            ref: "Student",
            required: true,
        },

        enrollmentId: {
            type: Schema.Types.ObjectId,
            ref: "Enrollment",
            required: true,
        },

        groupId: {
            type: Schema.Types.ObjectId,
            ref: "StudyGroup",
            required: true,
        },

        periodStart: {
            type: Date,
            required: true,
        },

        periodEnd: {
            type: Date,
            required: true,
        },

        totalAmount: {
            type: Schema.Types.Decimal128,
            required: true,
            min: 0,
        },

        dueDate: {
            type: Date,
            default: null,
        },

        status: {
            type: String,
            enum: ["draft", "issued", "void"],
            default: "issued",
            required: true,
        },

        description: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
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

invoiceSchema.pre("validate", function () {
    if (this.periodEnd < this.periodStart) {
        this.invalidate(
            "periodEnd",
            "periodEnd cannot be before periodStart"
        );
    }
});

invoiceSchema.index(
    { workspaceId: 1, invoiceNumber: 1 },
    { unique: true }
);

invoiceSchema.index({
    workspaceId: 1,
    studentId: 1,
    status: 1,
});

invoiceSchema.index({
    workspaceId: 1,
    groupId: 1,
    periodStart: 1,
});

const InvoiceModel = mongoose.model<InvoiceDocument>(
    "Invoice",
    invoiceSchema
);

export default InvoiceModel;
