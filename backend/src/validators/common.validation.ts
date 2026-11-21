import { z } from "zod";
import { isValidObjectId } from "../utils/object-id";

export const objectIdSchema = z.string().refine(isValidObjectId, {
    message: "Invalid MongoDB ObjectId",
});

export const paginationQueryFields = {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const paginationQuerySchema = z.object(paginationQueryFields);
