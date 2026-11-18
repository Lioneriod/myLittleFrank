import { request } from "./client";

export type Monster = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  frank_parts: Record<string, unknown>;
  frank_parts_updated_at: string;
};

export type MonsterChanges = {
  name?: string;
  frank_parts?: Record<string, unknown>;
  frank_parts_updated_at?: string;
};

type MonsterResponse = { monster: Monster };

const monsterPath = (monsterId: string) => `/api/monsters/${encodeURIComponent(monsterId)}`;

export function monsterAgeInDays(monster: Monster) {
  const ms = Date.now() - new Date(monster.created_at).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export async function getMyMonster(): Promise<Monster | null> {
  return (await request<{ monster: Monster | null }>("/api/monsters/mine")).monster;
}

export async function getMonster(monsterId: string): Promise<Monster> {
  return (await request<MonsterResponse>(monsterPath(monsterId))).monster;
}

export async function createMonster(name?: string): Promise<Monster> {
  return (await request<MonsterResponse>("/api/monsters", { method: "POST", body: { name } })).monster;
}

export async function joinMonster(code: string): Promise<Monster> {
  return (
    await request<MonsterResponse>("/api/monsters/join", { method: "POST", body: { code } })
  ).monster;
}

export async function updateMonster(monsterId: string, changes: MonsterChanges): Promise<Monster> {
  return (
    await request<MonsterResponse>(monsterPath(monsterId), { method: "PATCH", body: changes })
  ).monster;
}

export async function deleteMonster(monsterId: string): Promise<void> {
  await request(monsterPath(monsterId), { method: "DELETE" });
}
