import { z } from "zod";
import { passwordSchema } from "./auth.validation";
import { objectIdSchema } from "./common.validation";

const claimTokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export const startStudentInvitationRedemptionSchema = z.object({
    invitationSecret: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const studentInvitationRedemptionParamsSchema = z.object({
    redemptionId: objectIdSchema,
});

export const studentInvitationClaimSchema = z.object({
    claimToken: claimTokenSchema,
});

export const verifyStudentInvitationOtpSchema = z.object({
    claimToken: claimTokenSchema,
    otp: z.string().regex(/^\d{6}$/),
});

export const completeStudentInvitationRegistrationSchema = z.object({
    claimToken: claimTokenSchema,
    password: passwordSchema,
});

export type StartStudentInvitationRedemptionInput = z.infer<
    typeof startStudentInvitationRedemptionSchema
>;
export type StudentInvitationClaimInput = z.infer<
    typeof studentInvitationClaimSchema
>;
export type VerifyStudentInvitationOtpInput = z.infer<
    typeof verifyStudentInvitationOtpSchema
>;
export type CompleteStudentInvitationRegistrationInput = z.infer<
    typeof completeStudentInvitationRegistrationSchema
>;
