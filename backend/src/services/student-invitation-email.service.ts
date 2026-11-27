import { Resend } from "resend";
import { emailSchema } from "../validators/auth.validation";

export interface StudentInvitationOtpEmail {
    recipient: string;
    code: string;
    expiresAt: Date;
}

export interface StudentInvitationEmailProvider {
    readonly available: boolean;
    sendOtpEmail(message: StudentInvitationOtpEmail): Promise<void>;
}

export class StudentInvitationEmailConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StudentInvitationEmailConfigurationError";
    }
}

export class StudentInvitationEmailDeliveryError extends Error {
    constructor() {
        super("Student verification email delivery failed");
        this.name = "StudentInvitationEmailDeliveryError";
    }
}

interface ResendEmailPayload {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
}

interface ResendEmailResult {
    id?: string;
    error?: unknown;
}

export type ResendEmailSender = (
    apiKey: string,
    payload: ResendEmailPayload,
    signal: AbortSignal
) => Promise<ResendEmailResult>;

interface ResendEnvironment {
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
}

const RESEND_REQUEST_TIMEOUT_MS = 10_000;

const getResendConfiguration = (
    environment: ResendEnvironment
): { apiKey: string; fromEmail: string } => {
    const apiKey = environment.RESEND_API_KEY?.trim();
    if (!apiKey) {
        throw new StudentInvitationEmailConfigurationError(
            "RESEND_API_KEY is required for student verification email"
        );
    }

    const senderValue = environment.RESEND_FROM_EMAIL?.trim();
    if (!senderValue) {
        throw new StudentInvitationEmailConfigurationError(
            "RESEND_FROM_EMAIL is required for student verification email"
        );
    }

    const sender = emailSchema.safeParse(senderValue);
    if (!sender.success) {
        throw new StudentInvitationEmailConfigurationError(
            "RESEND_FROM_EMAIL must be a valid sender email address"
        );
    }

    return {
        apiKey,
        fromEmail: sender.data,
    };
};

const escapeHtml = (value: string): string =>
    value.replace(/[&<>"']/g, (character) => {
        switch (character) {
            case "&":
                return "&amp;";
            case "<":
                return "&lt;";
            case ">":
                return "&gt;";
            case '"':
                return "&quot;";
            default:
                return "&#39;";
        }
    });

export const buildStudentInvitationOtpEmail = (
    message: StudentInvitationOtpEmail,
    fromEmail: string
): ResendEmailPayload => {
    const code = escapeHtml(message.code);

    return {
        from: `Darsly <${fromEmail}>`,
        to: [message.recipient],
        subject: "Your Darsly verification code",
        html: [
            '<div style="font-family:Arial,sans-serif;color:#17211b;line-height:1.6">',
            "<p>You requested access to your student account in Darsly.</p>",
            `<p style="font-size:32px;font-weight:700;letter-spacing:8px;direction:ltr">${code}</p>`,
            "<p>This code expires in five minutes. Do not share it with anyone.</p>",
            "<p>If you did not request this code, you can ignore this email.</p>",
            "</div>",
        ].join(""),
        text: [
            "You requested access to your student account in Darsly.",
            "",
            `Your verification code is: ${message.code}`,
            "",
            "This code expires in five minutes. Do not share it with anyone.",
            "If you did not request this code, you can ignore this email.",
        ].join("\n"),
    };
};

const sendWithResend: ResendEmailSender = async (
    apiKey,
    payload,
    signal
) => {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send(payload, { signal });
    return {
        id: data?.id,
        error,
    };
};

export class ResendStudentInvitationEmailProvider
    implements StudentInvitationEmailProvider
{
    constructor(
        private readonly sendEmail: ResendEmailSender = sendWithResend,
        private readonly getEnvironment: () => ResendEnvironment = () =>
            process.env
    ) {}

    get available(): boolean {
        try {
            getResendConfiguration(this.getEnvironment());
            return true;
        } catch {
            return false;
        }
    }

    async sendOtpEmail(message: StudentInvitationOtpEmail): Promise<void> {
        const { apiKey, fromEmail } = getResendConfiguration(
            this.getEnvironment()
        );
        const payload = buildStudentInvitationOtpEmail(message, fromEmail);

        try {
            const result = await this.sendEmail(
                apiKey,
                payload,
                AbortSignal.timeout(RESEND_REQUEST_TIMEOUT_MS)
            );
            if (result.error || !result.id) {
                throw new Error("Resend did not accept the email");
            }
        } catch {
            throw new StudentInvitationEmailDeliveryError();
        }
    }
}

export const resendStudentInvitationEmailProvider: StudentInvitationEmailProvider =
    new ResendStudentInvitationEmailProvider();
