import { request } from "./client";

export async function registerPushToken(token: string, platform: string): Promise<void> {
  await request("/api/push-tokens", { method: "POST", body: { token, platform } });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await request(`/api/push-tokens/${encodeURIComponent(token)}`, { method: "DELETE" });
}
