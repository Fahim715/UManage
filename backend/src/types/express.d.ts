import type { AuthUser } from "./auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by auth middleware once implemented; placeholder for now. */
      user?: AuthUser;
    }
  }
}

export {};
