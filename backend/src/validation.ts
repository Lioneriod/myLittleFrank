import type { Request } from "express";
import { fail } from "./errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function bodyOf(req: Request): Record<string, unknown> {
  if (req.body === undefined || req.body === null) return {};
  if (!isPlainObject(req.body)) fail("invalid_body");
  return req.body;
}

export function monsterIdOf(req: Request): string {
  const id = req.params.id;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) fail("invalid_monster_id");
  return id;
}
