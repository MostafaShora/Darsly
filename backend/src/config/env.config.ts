import { getEnv } from "../utils/get-env";
import { getJwtSecret } from "./jwt-secret.config";

export const Env = {
    NODE_ENV: getEnv("NODE_ENV", "development"),
    PORT: getEnv("PORT", "8000"),
    MONGO_URI: getEnv("MONGO_URI"),
    JWT_SECRET: getJwtSecret(process.env.JWT_SECRET),
    JWT_EXPIRES_IN: getEnv("JWT_EXPIRES_IN", "15m"),
    FRONTEND_ORIGIN: getEnv("FRONTEND_ORIGIN", "http://localhost:4200"),

    // Cloudinary
    // CLOUDINARY_CLOUD_NAME: getEnv("CLOUDINARY_CLOUD_NAME"),
    // CLOUDINARY_API_KEY: getEnv("CLOUDINARY_API_KEY"),
    // CLOUDINARY_API_SECRET: getEnv("CLOUDINARY_API_SECRET"),

    // Google Generative AI
    // GOOGLE_GENERATIVE_AI_API_KEY: getEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
} as const;