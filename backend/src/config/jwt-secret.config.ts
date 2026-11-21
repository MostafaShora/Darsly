const MIN_JWT_SECRET_BYTES = 32;

export const getJwtSecret = (value: string | undefined): string => {
    if (!value || value.trim().length === 0) {
        throw new Error("Missing required environment variable: JWT_SECRET");
    }

    if (value !== value.trim()) {
        throw new Error("JWT_SECRET must not contain surrounding whitespace");
    }

    if (Buffer.byteLength(value, "utf8") < MIN_JWT_SECRET_BYTES) {
        throw new Error("JWT_SECRET must be at least 32 bytes");
    }

    return value;
};
