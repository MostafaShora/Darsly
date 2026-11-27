import { z } from "zod";
import { objectIdSchema } from "./common.validation";

export const selectStudentContextSchema = z.object({
    studentAccountLinkId: objectIdSchema,
});

export type SelectStudentContextInput = z.infer<
    typeof selectStudentContextSchema
>;
