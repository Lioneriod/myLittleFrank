import "@supabase/functions-js/edge-runtime.d.ts";
import { HttpError, json, serve } from "../_shared/http.ts";
import { adminClient, requireEnv } from "../_shared/supabase.ts";

const DECAY_PER_RUN = 5;

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

async function secretMatches(received: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(received), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

serve(async (req) => {
  const expected = requireEnv("CRON_SECRET");
  const received = req.headers.get("x-cron-secret") ?? "";
  if (!received || !(await secretMatches(received, expected))) {
    throw new HttpError(401, "unauthorized", "Segredo do agendador inválido.");
  }

  const { data, error } = await adminClient().rpc("decay_monster_needs", {
    amount: DECAY_PER_RUN,
  });
  if (error) throw error;

  return json({ ok: true, decay: DECAY_PER_RUN, monsters_updated: data });
});
