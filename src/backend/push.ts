import { db, run } from "./database";
import { requireUser } from "./session";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ExpoTicket = { status: "ok" | "error"; details?: { error?: string } };

export async function registerPushToken(token: string, platform: string): Promise<void> {
  const user = await requireUser();
  await run(
    db
      .from("push_tokens")
      .upsert(
        { token, user_id: user.id, platform, updated_at: new Date().toISOString() },
        { onConflict: "token" },
      ),
  );
}

export async function unregisterPushToken(token: string): Promise<void> {
  const user = await requireUser();
  await run(db.from("push_tokens").delete().eq("token", token).eq("user_id", user.id));
}

export async function notifyPartners(
  userId: string,
  monsterId: string,
  members: string[],
): Promise<number> {
  const partners = members.filter((id) => id !== userId);
  if (partners.length === 0) return 0;

  const rows = await run(db.from("push_tokens").select("token").in("user_id", partners));
  const tokens = rows.map((row) => row.token as string);
  if (tokens.length === 0) return 0;

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title: "My Little Frank",
        body: "Seu parceiro respondeu!",
        sound: "default",
        data: { type: "partner_answered", monster_id: monsterId },
      })),
    ),
  });
  if (!response.ok) throw new Error(`A API de push do Expo respondeu ${response.status}`);

  const { data: tickets } = (await response.json()) as { data: ExpoTicket[] };
  const stale = tokens.filter((_, i) => tickets[i]?.details?.error === "DeviceNotRegistered");
  if (stale.length > 0) await run(db.from("push_tokens").delete().in("token", stale));

  return tickets.filter((ticket) => ticket.status === "ok").length;
}
