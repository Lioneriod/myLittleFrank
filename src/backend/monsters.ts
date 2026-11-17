import { db, run, runOptional } from "./database";
import { fail, isUniqueViolation, toBackendError } from "./errors";
import { requireUser, type SessionUser } from "./session";

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

const MONSTER_COLUMNS = "id, name, invite_code, created_at, frank_parts, frank_parts_updated_at";
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 6;
const INVITE_ATTEMPTS = 5;
const MAX_MEMBERS = 2;
const MAX_NAME_LENGTH = 30;

export function monsterAgeInDays(monster: Monster) {
  const ms = Date.now() - new Date(monster.created_at).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export async function listMembers(monsterId: string): Promise<string[]> {
  const rows = await run(
    db.from("monster_members").select("user_id").eq("monster_id", monsterId).order("slot"),
  );
  return rows.map((row) => row.user_id as string);
}

export async function requireMember(
  monsterId: string,
): Promise<{ user: SessionUser; members: string[] }> {
  const user = await requireUser();
  const members = await listMembers(monsterId);
  if (!members.includes(user.id)) fail("not_a_member");
  return { user, members };
}

async function monsterIdOfUser(userId: string): Promise<string | null> {
  const row = await runOptional(
    db.from("monster_members").select("monster_id").eq("user_id", userId).maybeSingle(),
  );
  return (row?.monster_id as string | undefined) ?? null;
}

async function findMonster(monsterId: string): Promise<Monster | null> {
  return (await runOptional(
    db.from("monsters").select(MONSTER_COLUMNS).eq("id", monsterId).maybeSingle(),
  )) as Monster | null;
}

export async function getMyMonster(): Promise<Monster | null> {
  const user = await requireUser();
  const monsterId = await monsterIdOfUser(user.id);
  return monsterId ? findMonster(monsterId) : null;
}

export async function getMonster(monsterId: string): Promise<Monster> {
  await requireMember(monsterId);
  return (await findMonster(monsterId)) ?? fail("monster_not_found");
}

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)];
  }
  return code;
}

function cleanName(name: string): string {
  const clean = name.trim();
  if (clean.length < 1 || clean.length > MAX_NAME_LENGTH) fail("invalid_name");
  return clean;
}

async function insertMonster(userId: string, name: string): Promise<Monster> {
  for (let attempt = 0; attempt < INVITE_ATTEMPTS; attempt++) {
    const { data, error } = await db
      .from("monsters")
      .insert({ name, invite_code: generateInviteCode(), created_by: userId })
      .select(MONSTER_COLUMNS)
      .single();
    if (!error) return data as Monster;
    if (!isUniqueViolation(error, "monsters_invite_code_key")) throw toBackendError(error);
  }
  return fail("unknown");
}

async function addMember(monsterId: string, userId: string, slot: number): Promise<void> {
  const { error } = await db
    .from("monster_members")
    .insert({ monster_id: monsterId, user_id: userId, slot });
  if (isUniqueViolation(error, "monster_members_user_id_key")) fail("already_has_monster");
  if (isUniqueViolation(error, "monster_members_slot_key")) fail("monster_full");
  if (error) throw toBackendError(error);
}

export async function createMonster(name = "Frank"): Promise<Monster> {
  const user = await requireUser();
  const monsterName = cleanName(name || "Frank");
  if (await monsterIdOfUser(user.id)) fail("already_has_monster");

  const monster = await insertMonster(user.id, monsterName);
  try {
    await addMember(monster.id, user.id, 1);
  } catch (error) {
    await db.from("monsters").delete().eq("id", monster.id);
    throw error;
  }
  return monster;
}

export async function joinMonster(code: string): Promise<Monster> {
  const user = await requireUser();
  const inviteCode = code.trim().toUpperCase();
  if (!inviteCode) fail("invalid_code");
  if (await monsterIdOfUser(user.id)) fail("already_has_monster");

  const monster = (await runOptional(
    db.from("monsters").select(MONSTER_COLUMNS).eq("invite_code", inviteCode).maybeSingle(),
  )) as Monster | null;
  if (!monster) fail("invalid_code");

  const members = await listMembers(monster.id);
  if (members.length >= MAX_MEMBERS) fail("monster_full");

  await addMember(monster.id, user.id, members.length + 1);
  return monster;
}

export async function updateMonster(monsterId: string, changes: MonsterChanges): Promise<Monster> {
  const patch: MonsterChanges = { ...changes };
  if (patch.name !== undefined) patch.name = cleanName(patch.name);
  await requireMember(monsterId);

  const monster = (await runOptional(
    db.from("monsters").update(patch).eq("id", monsterId).select(MONSTER_COLUMNS).maybeSingle(),
  )) as Monster | null;
  return monster ?? fail("monster_not_found");
}

export async function deleteMonster(monsterId: string): Promise<void> {
  await requireMember(monsterId);
  await run(db.from("monsters").delete().eq("id", monsterId));
}
