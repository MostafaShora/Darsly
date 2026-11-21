
import type { UserDocument } from "../models/user.model";
import type { WorkspaceAccessContext } from "../services/workspace-access.service";
import type { ValidatedRequestParts } from "../middlewares/validate-request.middleware";

declare global {
    namespace Express {
        interface User extends UserDocument { }

        interface Request {
            workspaceContext?: WorkspaceAccessContext;
            validated?: ValidatedRequestParts;
            auth?: {
                userId: string;
            };
        }
    }
}

export { };
