import { Types } from "mongoose";

export const isValidObjectId = (value: unknown): value is string =>
    typeof value === "string" && Types.ObjectId.isValid(value);
