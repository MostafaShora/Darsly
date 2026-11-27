
import type { UserDocument } from "../models/user.model";
import type { WorkspaceAccessContext } from "../services/workspace-access.service";
import type { StudentAccessContext } from "../services/student-context.service";
import type { ValidatedRequestParts } from "../middlewares/validate-request.middleware";

declare global {
    namespace Express {
        interface User extends UserDocument { }

        interface Request {
            workspaceContext?: WorkspaceAccessContext;
            studentContext?: StudentAccessContext;
            validated?: ValidatedRequestParts;
            auth?: {
                userId: string;
            };
        }
    }
}

export { };
