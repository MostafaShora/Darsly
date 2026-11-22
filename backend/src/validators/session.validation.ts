import { z } from "zod";
import { objectIdSchema, paginationQueryFields } from "./common.validation";

const isoDateSchema = z.iso
    .datetime({ offset: true })
    .transform((value) => new Date(value));

const sessionStatusSchema = z.enum(["scheduled", "completed", "cancelled"]);

export const sessionListQuerySchema = z
    .object({
        ...paginationQueryFields,
        groupId: objectIdSchema.optional(),
        from: isoDateSchema.optional(),
        to: isoDateSchema.optional(),
        status: sessionStatusSchema.optional(),
    })
    .refine(
        ({ from, to }) => from === undefined || to === undefined || from <= to,
        { message: "from must be before or equal to to", path: ["to"] },
    );

export const sessionParamsSchema = z.object({
    sessionId: objectIdSchema,
});

export const createSessionSchema = z
    .strictObject({
        groupId: objectIdSchema,
        title: z.string().trim().max(150).optional(),
        startsAt: isoDateSchema,
        endsAt: isoDateSchema,
        notes: z.string().trim().max(2000).optional(),
    })
    .refine((value) => value.endsAt > value.startsAt, {
        message: "endsAt must be after startsAt",
        path: ["endsAt"],
    });

export const updateSessionSchema = z
    .strictObject({
        title: z.string().trim().max(150).optional(),
        startsAt: isoDateSchema.optional(),
        endsAt: isoDateSchema.optional(),
        status: sessionStatusSchema.optional(),
        notes: z.string().trim().max(2000).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one field to update",
    })
    .refine(
        ({ startsAt, endsAt }) =>
            startsAt === undefined || endsAt === undefined || endsAt > startsAt,
        {
            message: "endsAt must be after startsAt",
            path: ["endsAt"],
        },
    );

export type SessionListQuery = z.infer<typeof sessionListQuerySchema>;
export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
