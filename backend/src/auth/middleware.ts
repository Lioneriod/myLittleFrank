import type { Request, RequestHandler } from "express";
import type { Queryable } from "../db";
import { fail } from "../errors";
import { findUserByToken, type AuthUser } from "./tokens";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      token?: string;
    }
  }
}

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

export function bearerToken(req: Request): string | null {
  return req.get("authorization")?.trim().match(BEARER_PATTERN)?.[1] ?? null;
}

export function requireUser(db: Queryable): RequestHandler {
  return async (req, _res, next) => {
    const token = bearerToken(req) ?? fail("not_authenticated");
    req.user = (await findUserByToken(db, token)) ?? fail("not_authenticated");
    req.token = token;
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  return req.user ?? fail("not_authenticated");
}

export function currentToken(req: Request): string {
  return req.token ?? fail("not_authenticated");
}
