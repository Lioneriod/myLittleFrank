import { createHash, randomBytes } from "node:crypto";
import type { Queryable } from "../db";

export type AuthUser = { id: string; email: string };

export const TOKEN_TTL_DAYS = 30;
const TOKEN_BYTES = 32;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createToken(db: Queryable, userId: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await db.query(
    `insert into public.user_tokens (token_hash, user_id, expires_at)
     values ($1, $2, now() + $3::int * interval '1 day')`,
    [hashToken(token), userId, TOKEN_TTL_DAYS],
  );
  return token;
}

export async function findUserByToken(db: Queryable, token: string): Promise<AuthUser | null> {
  const { rows } = await db.query<AuthUser>(
    `select u.id, u.email
     from public.user_tokens t
     join public.users u on u.id = t.user_id
     where t.token_hash = $1 and t.expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function revokeToken(db: Queryable, token: string): Promise<void> {
  await db.query("delete from public.user_tokens where token_hash = $1", [hashToken(token)]);
}

export async function deleteExpiredTokens(db: Queryable, userId: string): Promise<void> {
  await db.query("delete from public.user_tokens where user_id = $1 and expires_at <= now()", [
    userId,
  ]);
}
