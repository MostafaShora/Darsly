import { z } from "zod";

const decimalStringSchema = z
    .string()
    .trim()
    .max(128)
    .regex(/^\d+(?:\.\d+)?$/, "Amount must be a non-negative decimal string")
    .refine(
        (value) => value.replace(".", "").replace(/^0+/, "").length <= 34,
        "Amount exceeds Decimal128 precision"
    );

export const positiveDecimalStringSchema = decimalStringSchema.refine(
    (value) => /[1-9]/.test(value),
    "Amount must be greater than zero"
);
