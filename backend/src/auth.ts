import type { NextFunction, Request, Response } from "express";
import type { AuthError, Session } from "@supabase/supabase-js";
import { HttpError, fail, isErrorCode } from "./errors";
import { admin } from "./supabase";

export type AuthUser = { id: string; email: string | null };

export type ApiSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: AuthUser;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
    accessToken?: string;
  }
}

export function isRejectedByAuth(error: AuthError): boolean {
  return typeof error.status === "number" && error.status >= 400 && error.status < 500;
}

export function toHttpError(error: AuthError): HttpError {
  if (!isRejectedByAuth(error)) {
    console.error("Supabase Auth indisponível:", error.message);
    return new HttpError("supabase_unavailable");
  }
  if (isErrorCode(error.code)) return new HttpError(error.code);
  console.warn("Erro do Supabase Auth sem tradução:", error.code, error.message);
  return new HttpError("auth_error");
}

export function toApiSession(session: Session): ApiSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    user: { id: session.user.id, email: session.user.email ?? null },
  };
}

export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) fail("not_authenticated");

  const { data, error } = await admin.auth.getUser(token);
  if (error) {
    throw isRejectedByAuth(error) ? new HttpError("not_authenticated") : toHttpError(error);
  }
  if (!data.user) fail("not_authenticated");

  req.user = { id: data.user.id, email: data.user.email ?? null };
  req.accessToken = token;
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) fail("not_authenticated");
  return req.user;
}
