import type { Queryable } from "../db";
import { fail } from "../errors";

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: Record<string, unknown>;
};

export type PushTicket = { status: "ok" | "error"; details?: { error?: string } };

export type PushSender = (messages: PushMessage[]) => Promise<PushTicket[]>;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/;
const MAX_PUSH_TOKEN_LENGTH = 200;
const PLATFORMS = ["ios", "android"];

export function expoPushSender(accessToken?: string): PushSender {
  return async (messages) => {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`A API de push do Expo respondeu ${response.status}`);
    const { data } = (await response.json()) as { data: PushTicket[] };
    return data;
  };
}

export async function registerPushToken(
  db: Queryable,
  userId: string,
  token: string,
  platform: string,
): Promise<void> {
  const valid =
    token.length <= MAX_PUSH_TOKEN_LENGTH &&
    PUSH_TOKEN_PATTERN.test(token) &&
    PLATFORMS.includes(platform);
  if (!valid) fail("invalid_push_token");

  await db.query(
    `insert into public.push_tokens (token, user_id, platform)
     values ($1, $2, $3)
     on conflict (token) do update
       set user_id = excluded.user_id, platform = excluded.platform, updated_at = now()`,
    [token, userId, platform],
  );
}

export async function unregisterPushToken(db: Queryable, userId: string, token: string) {
  await db.query("delete from public.push_tokens where token = $1 and user_id = $2", [
    token,
    userId,
  ]);
}

export async function notifyPartners(
  db: Queryable,
  send: PushSender,
  userId: string,
  monsterId: string,
  members: string[],
): Promise<number> {
  const partners = members.filter((id) => id !== userId);
  if (partners.length === 0) return 0;

  const { rows } = await db.query<{ token: string }>(
    "select token from public.push_tokens where user_id = any($1::uuid[])",
    [partners],
  );
  const tokens = rows.map((row) => row.token);
  if (tokens.length === 0) return 0;

  const tickets = await send(
    tokens.map((to) => ({
      to,
      title: "My Little Frank",
      body: "Seu parceiro respondeu!",
      sound: "default",
      data: { type: "partner_answered", monster_id: monsterId },
    })),
  );

  const stale = tokens.filter((_, i) => tickets[i]?.details?.error === "DeviceNotRegistered");
  if (stale.length > 0) {
    await db.query("delete from public.push_tokens where token = any($1::text[])", [stale]);
  }
  return tickets.filter((ticket) => ticket.status === "ok").length;
}
