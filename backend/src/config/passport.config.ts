
import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { Env } from "./env.config";
import { findByIdUserService } from "../services/user.service";

passport.use(
    new JwtStrategy(
        {
            jwtFromRequest: ExtractJwt.fromExtractors([
                (req) => req.cookies?.accessToken ?? null,
            ]),
            secretOrKey: Env.JWT_SECRET,
            audience: ["user"],
            algorithms: ["HS256"],
        },
        async ({ userId }, done) => {
            try {
                if (!userId) {
                    return done(null, false);
                }

                const user = await findByIdUserService(userId);

                if (!user || user.status !== "active") {
                    return done(null, false);
                }

                return done(null, user);
            } catch (error) {
                return done(error);
            }
        }
    )
);

export const passportAuthenticateJwt = passport.authenticate(
    "jwt",
    { session: false }
);
