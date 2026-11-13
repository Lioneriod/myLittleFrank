import { env } from "../env";
import { fail } from "../errors";
import { admin, unwrap } from "../supabase";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/;
const PLATFORMS = ["ios", "android"];

type ExpoTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

function validToken(token: unknown): string {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) fail("invalid_push_token");
  return token;
}

export async function registerPushToken(
  userId: string,
  rawToken: unknown,
  platform: unknown,
): Promise<void> {
  const token = validToken(rawToken);
  if (typeof platform !== "string" || !PLATFORMS.includes(platform)) fail("invalid_push_token");

  const { error } = await admin
    .from("push_tokens")
    .upsert(
      { token, user_id: userId, platform, updated_at: new Date().toISOString() },
      { onConflict: "token" },
    );
  if (error) throw error;
}

export async function unregisterPushToken(userId: string, rawToken: unknown): Promise<void> {
  const token = validToken(rawToken);
  const { error } = await admin
    .from("push_tokens")
    .delete()
    .eq("token", token)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function notifyPartners(
  userId: string,
  monsterId: string,
  memberIds: string[],
): Promise<{ sent: number; removed_tokens: number }> {
  const partnerIds = memberIds.filter((id) => id !== userId);
  if (partnerIds.length === 0) return { sent: 0, removed_tokens: 0 };

  const tokens = unwrap(
    await admin.from("push_tokens").select("token").in("user_id", partnerIds),
  ).map((row) => row.token as string);
  if (tokens.length === 0) return { sent: 0, removed_tokens: 0 };

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (env.expoAccessToken) headers.Authorization = `Bearer ${env.expoAccessToken}`;

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(
      tokens.map((token) => ({
        to: token,
        title: "My Little Frank",
        body: "Seu parceiro respondeu!",
        sound: "default",
        data: { type: "partner_answered", monster_id: monsterId },
      })),
    ),
  });
  if (!response.ok) {
    throw new Error(`A API de push do Expo respondeu ${response.status}: ${await response.text()}`);
  }

  const { data: tickets } = (await response.json()) as { data: ExpoTicket[] };
  const staleTokens = tokens.filter((_, i) => tickets[i]?.details?.error === "DeviceNotRegistered");
  if (staleTokens.length > 0) {
    const { error } = await admin.from("push_tokens").delete().in("token", staleTokens);
    if (error) console.error("Não foi possível apagar os tokens de push antigos:", error);
  }

  return {
    sent: tickets.filter((ticket) => ticket.status === "ok").length,
    removed_tokens: staleTokens.length,
  };
}
