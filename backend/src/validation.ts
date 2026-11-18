import type { Request } from "express";
import { fail } from "./errors";

export type Body = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bodyOf(req: Request): Body {
  const body: unknown = req.body ?? {};
  if (typeof body !== "object" || body === null || Array.isArray(body)) fail("invalid_body");
  return body as Body;
}

export function optionalString(body: Body, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") fail("invalid_request");
  return value;
}

export function stringOf(body: Body, key: string): string {
  return optionalString(body, key) ?? "";
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
