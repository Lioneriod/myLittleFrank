import "@supabase/functions-js/edge-runtime.d.ts";
import { HttpError, json, readJson, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ExpoTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

serve(async (req) => {
  const admin = adminClient();
  const user = await requireUser(req, admin);

  const { monster_id: monsterId } = await readJson(req);
  if (typeof monsterId !== "string" || !UUID_PATTERN.test(monsterId)) {
    throw new HttpError(400, "invalid_monster_id", "Monstrinho inválido.");
  }

  const { data: members, error: membersError } = await admin
    .from("monster_members")
    .select("user_id")
    .eq("monster_id", monsterId);
  if (membersError) throw membersError;

  const memberIds = members.map((m) => m.user_id as string);
  if (!memberIds.includes(user.id)) {
    throw new HttpError(403, "not_a_member", "Você não cuida deste monstrinho.");
  }

  const { data: pairing, error: pairingError } = await admin
    .from("monster_pairing")
    .select("answers")
    .eq("monster_id", monsterId)
    .maybeSingle();
  if (pairingError) throw pairingError;

  const answers = (pairing?.answers ?? {}) as Record<string, unknown>;
  if (!(user.id in answers)) {
    throw new HttpError(409, "not_answered", "Responda a pergunta antes de avisar o outro cuidador.");
  }

  const partnerIds = memberIds.filter((id) => id !== user.id);
  if (partnerIds.length === 0) {
    return json({ ok: true, sent: 0 });
  }

  const { data: tokens, error: tokensError } = await admin
    .from("push_tokens")
    .select("token")
    .in("user_id", partnerIds);
  if (tokensError) throw tokensError;
  if (tokens.length === 0) {
    return json({ ok: true, sent: 0 });
  }

  const messages = tokens.map(({ token }) => ({
    to: token,
    title: "My Little Frank",
    body: "Seu parceiro respondeu!",
    sound: "default",
    data: { type: "partner_answered", monster_id: monsterId },
  }));

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    console.error("Expo push API error", response.status, await response.text());
    throw new HttpError(502, "push_failed", "Não foi possível enviar a notificação.");
  }

  const { data: tickets } = (await response.json()) as { data: ExpoTicket[] };
  const staleTokens = tokens
    .filter((_, i) => tickets[i]?.details?.error === "DeviceNotRegistered")
    .map(({ token }) => token);
  if (staleTokens.length > 0) {
    const { error } = await admin.from("push_tokens").delete().in("token", staleTokens);
    if (error) console.error("Failed to delete stale push tokens", error);
  }

  const sent = tickets.filter((t) => t.status === "ok").length;
  return json({ ok: true, sent, removed_tokens: staleTokens.length });
});
