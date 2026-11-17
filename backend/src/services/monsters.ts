import { randomInt } from "node:crypto";
import { fail } from "../errors";
import { withLock } from "../locks";
import { admin, isForeignKeyViolation, isUniqueViolation, unwrap } from "../supabase";
import { isPlainObject } from "../validation";

const MONSTER_COLUMNS = "id, name, invite_code, created_at, frank_parts, frank_parts_updated_at";
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 6;
const INVITE_ATTEMPTS = 5;
const MAX_MEMBERS = 2;
const MAX_NAME_LENGTH = 30;
const MAX_FRANK_PARTS_BYTES = 8192;

export type Monster = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  frank_parts: Record<string, unknown>;
  frank_parts_updated_at: string;
};

export type MonsterPatch = {
  name?: unknown;
  frank_parts?: unknown;
  frank_parts_updated_at?: unknown;
};

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

async function monsterIdOfUser(userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("monster_members")
    .select("monster_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.monster_id as string | undefined) ?? null;
}

async function findMonsterById(monsterId: string): Promise<Monster | null> {
  const { data, error } = await admin
    .from("monsters")
    .select(MONSTER_COLUMNS)
    .eq("id", monsterId)
    .maybeSingle();
  if (error) throw error;
  return data as Monster | null;
}

export async function listMemberIds(monsterId: string): Promise<string[]> {
  const rows = unwrap(
    await admin
      .from("monster_members")
      .select("user_id")
      .eq("monster_id", monsterId)
      .order("joined_at", { ascending: true }),
  );
  return rows.map((row) => row.user_id as string);
}

export async function requireMembers(userId: string, monsterId: string): Promise<string[]> {
  const memberIds = await listMemberIds(monsterId);
  if (!memberIds.includes(userId)) fail("not_a_member");
  return memberIds;
}

export async function findMonsterOfUser(userId: string): Promise<Monster | null> {
  const monsterId = await monsterIdOfUser(userId);
  return monsterId ? findMonsterById(monsterId) : null;
}

export async function getMonster(userId: string, monsterId: string): Promise<Monster> {
  await requireMembers(userId, monsterId);
  return (await findMonsterById(monsterId)) ?? fail("monster_not_found");
}

async function insertMonster(userId: string, name: string): Promise<Monster> {
  for (let attempt = 0; attempt < INVITE_ATTEMPTS; attempt++) {
    const { data, error } = await admin
      .from("monsters")
      .insert({ name, invite_code: generateInviteCode(), created_by: userId })
      .select(MONSTER_COLUMNS)
      .single();
    if (!error) return data as Monster;
    if (!isUniqueViolation(error)) throw error;
  }
  throw new Error("Não foi possível gerar um código de convite único.");
}

export function createMonster(userId: string, rawName: unknown): Promise<Monster> {
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "Frank";
  if (name.length > MAX_NAME_LENGTH) fail("invalid_name");

  return withLock(`user:${userId}`, async () => {
    if (await monsterIdOfUser(userId)) fail("already_has_monster");

    const monster = await insertMonster(userId, name);
    const { error } = await admin
      .from("monster_members")
      .insert({ monster_id: monster.id, user_id: userId });
    if (error) {
      await admin.from("monsters").delete().eq("id", monster.id);
      if (isUniqueViolation(error)) fail("already_has_monster");
      throw error;
    }
    return monster;
  });
}

export function joinMonster(userId: string, rawCode: unknown): Promise<Monster> {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!code) fail("invalid_code");

  return withLock(`user:${userId}`, async () => {
    if (await monsterIdOfUser(userId)) fail("already_has_monster");

    const { data, error } = await admin
      .from("monsters")
      .select(MONSTER_COLUMNS)
      .eq("invite_code", code)
      .maybeSingle();
    if (error) throw error;
    if (!data) fail("invalid_code");
    const monster = data as Monster;

    return withLock(`monster:${monster.id}`, async () => {
      const memberIds = await listMemberIds(monster.id);
      if (memberIds.length >= MAX_MEMBERS) fail("monster_full");

      const { error: joinError } = await admin
        .from("monster_members")
        .insert({ monster_id: monster.id, user_id: userId });
      if (joinError) {
        if (isUniqueViolation(joinError)) fail("already_has_monster");
        if (isForeignKeyViolation(joinError)) fail("invalid_code");
        throw joinError;
      }
      return monster;
    });
  });
}

function validatedPatch(patch: MonsterPatch): Record<string, unknown> {
  const changes: Record<string, unknown> = {};

  if (patch.name !== undefined) {
    const name = typeof patch.name === "string" ? patch.name.trim() : "";
    if (name.length < 1 || name.length > MAX_NAME_LENGTH) fail("invalid_name");
    changes.name = name;
  }

  if (patch.frank_parts !== undefined) {
    if (
      !isPlainObject(patch.frank_parts) ||
      JSON.stringify(patch.frank_parts).length > MAX_FRANK_PARTS_BYTES
    ) {
      fail("invalid_frank_parts");
    }
    let updatedAt = new Date();
    if (patch.frank_parts_updated_at !== undefined) {
      if (typeof patch.frank_parts_updated_at !== "string") fail("invalid_frank_parts");
      updatedAt = new Date(patch.frank_parts_updated_at);
      if (Number.isNaN(updatedAt.getTime())) fail("invalid_frank_parts");
    }
    changes.frank_parts = patch.frank_parts;
    changes.frank_parts_updated_at = updatedAt.toISOString();
  }

  if (Object.keys(changes).length === 0) fail("nothing_to_update");
  return changes;
}

export async function updateMonster(
  userId: string,
  monsterId: string,
  patch: MonsterPatch,
): Promise<Monster> {
  const changes = validatedPatch(patch);
  await requireMembers(userId, monsterId);

  const { data, error } = await admin
    .from("monsters")
    .update(changes)
    .eq("id", monsterId)
    .select(MONSTER_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as Monster | null) ?? fail("monster_not_found");
}

export async function deleteMonster(userId: string, monsterId: string): Promise<void> {
  await requireMembers(userId, monsterId);
  const { error } = await admin.from("monsters").delete().eq("id", monsterId);
  if (error) throw error;
}

export function leaveMonster(userId: string, monsterId: string): Promise<{ deleted_monster: boolean }> {
  return withLock(`monster:${monsterId}`, async () => {
    const memberIds = await requireMembers(userId, monsterId);

    const { error } = await admin
      .from("monster_members")
      .delete()
      .eq("monster_id", monsterId)
      .eq("user_id", userId);
    if (error) throw error;

    const deletedMonster = memberIds.length === 1;
    if (deletedMonster) {
      const { error: deleteError } = await admin.from("monsters").delete().eq("id", monsterId);
      if (deleteError) throw deleteError;
    }
    return { deleted_monster: deletedMonster };
  });
}
