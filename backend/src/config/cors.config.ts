import cors from "cors";

export const allowedFrontendOrigins = [
    "https://darsly-alpha.vercel.app",
    "http://localhost:4200",
] as const;

export const corsMiddleware = cors({
    origin: [...allowedFrontendOrigins],
    credentials: true,
});
