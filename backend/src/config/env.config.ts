import { getEnv } from "../utils/get-env";

export const Env = {
    NODE_ENV: getEnv("NODE_ENV", "development"),
    PORT: getEnv("PORT", "8000"),
    MONGO_URI: getEnv("MONGO_URI"),
    FRONTEND_ORIGIN: getEnv("FRONTEND_ORIGIN", "http://localhost:4200"),

} as const;