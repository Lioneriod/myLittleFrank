import { randomInt } from "node:crypto";
import { isUniqueViolation, type Database, type Queryable } from "../db";
import { fail } from "../errors";
import { isPlainObject, isUuid } from "../validation";

export type Monster = {
  id: string;
  name: string;
  invite_code: string;
  created_at: Date;
  frank_parts: Record<string, unknown>;
  frank_parts_updated_at: Date;
};

export type MonsterChanges = {
  name?: unknown;
  frank_parts?: unknown;
  frank_parts_updated_at?: unknown;
};

const COLUMNS = "m.id, m.name, m.invite_code, m.created_at, m.frank_parts, m.frank_parts_updated_at";
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_LENGTH = 6;
const INVITE_ATTEMPTS = 5;
const SLOTS = [1, 2];
const MAX_NAME_LENGTH = 30;
const MAX_PARTS_LENGTH = 10_000;
const DEFAULT_NAME = "Frank";

function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_LENGTH; i++) {
    code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return code;
}

function cleanName(name: unknown): string {
  if (typeof name !== "string") fail("invalid_name");
  const clean = name.trim();
  if (clean.length < 1 || clean.length > MAX_NAME_LENGTH) fail("invalid_name");
  return clean;
}

function cleanParts(parts: unknown): Record<string, unknown> {
  if (!isPlainObject(parts) || JSON.stringify(parts).length > MAX_PARTS_LENGTH) {
    fail("invalid_request");
  }
  return parts;
}

function cleanTimestamp(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) fail("invalid_request");
  return value;
}

export async function listMembers(db: Queryable, monsterId: string): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(
    "select user_id from public.monster_members where monster_id = $1 order by slot",
    [monsterId],
  );
  return rows.map((row) => row.user_id);
}

export async function requireMember(
  db: Queryable,
  monsterId: string,
  userId: string,
): Promise<string[]> {
  if (!isUuid(monsterId)) fail("monster_not_found");
  const members = await listMembers(db, monsterId);
  if (members.includes(userId)) return members;

  const { rows } = await db.query("select 1 from public.monsters where id = $1", [monsterId]);
  return fail(rows.length > 0 ? "not_a_member" : "monster_not_found");
}

async function findMonster(db: Queryable, monsterId: string): Promise<Monster | null> {
  const { rows } = await db.query<Monster>(
    `select ${COLUMNS} from public.monsters m where m.id = $1`,
    [monsterId],
  );
  return rows[0] ?? null;
}

async function hasMonster(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query("select 1 from public.monster_members where user_id = $1", [
    userId,
  ]);
  return rows.length > 0;
}

async function addMember(db: Queryable, monsterId: string, userId: string, slot: number) {
  try {
    await db.query(
      "insert into public.monster_members (monster_id, user_id, slot) values ($1, $2, $3)",
      [monsterId, userId, slot],
    );
  } catch (error) {
    if (isUniqueViolation(error, "monster_members_user_id_key")) fail("already_has_monster");
    if (isUniqueViolation(error, "monster_members_pkey")) fail("already_has_monster");
    if (isUniqueViolation(error, "monster_members_slot_key")) fail("monster_full");
    throw error;
  }
}

export async function getMyMonster(db: Queryable, userId: string): Promise<Monster | null> {
  const { rows } = await db.query<Monster>(
    `select ${COLUMNS}
     from public.monsters m
     join public.monster_members mm on mm.monster_id = m.id
     where mm.user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getMonster(db: Queryable, userId: string, monsterId: string): Promise<Monster> {
  await requireMember(db, monsterId, userId);
  return (await findMonster(db, monsterId)) ?? fail("monster_not_found");
}

export async function createMonster(
  db: Database,
  userId: string,
  name: unknown,
): Promise<Monster> {
  const monsterName = name === undefined || name === null || name === "" ? DEFAULT_NAME : cleanName(name);

  return db.transaction(async (tx) => {
    if (await hasMonster(tx, userId)) fail("already_has_monster");

    for (let attempt = 0; attempt < INVITE_ATTEMPTS; attempt++) {
      const { rows } = await tx.query<Monster>(
        `insert into public.monsters as m (name, invite_code, created_by)
         values ($1, $2, $3)
         on conflict (invite_code) do nothing
         returning ${COLUMNS}`,
        [monsterName, generateInviteCode(), userId],
      );
      if (rows[0]) {
        await addMember(tx, rows[0].id, userId, SLOTS[0]);
        return rows[0];
      }
    }
    return fail("internal_error");
  });
}

export async function joinMonster(db: Database, userId: string, code: string): Promise<Monster> {
  const inviteCode = code.trim().toUpperCase();
  if (!inviteCode) fail("invalid_code");

  return db.transaction(async (tx) => {
    if (await hasMonster(tx, userId)) fail("already_has_monster");

    const { rows } = await tx.query<Monster>(
      `select ${COLUMNS} from public.monsters m where m.invite_code = $1 for update`,
      [inviteCode],
    );
    const monster = rows[0] ?? fail("invalid_code");

    const taken = await tx.query<{ slot: number }>(
      "select slot from public.monster_members where monster_id = $1",
      [monster.id],
    );
    const usedSlots = taken.rows.map((row) => row.slot);
    const slot = SLOTS.find((candidate) => !usedSlots.includes(candidate)) ?? fail("monster_full");

    await addMember(tx, monster.id, userId, slot);
    return monster;
  });
}

export async function updateMonster(
  db: Queryable,
  userId: string,
  monsterId: string,
  changes: MonsterChanges,
): Promise<Monster> {
  const sets: string[] = [];
  const params: unknown[] = [monsterId];
  const set = (column: string, value: unknown, cast = "") => {
    params.push(value);
    sets.push(`${column} = $${params.length}${cast}`);
  };

  if (changes.name !== undefined) set("name", cleanName(changes.name));
  if (changes.frank_parts !== undefined) {
    set("frank_parts", JSON.stringify(cleanParts(changes.frank_parts)), "::jsonb");
    if (changes.frank_parts_updated_at === undefined) sets.push("frank_parts_updated_at = now()");
  }
  if (changes.frank_parts_updated_at !== undefined) {
    set("frank_parts_updated_at", cleanTimestamp(changes.frank_parts_updated_at), "::timestamptz");
  }

  await requireMember(db, monsterId, userId);
  if (sets.length === 0) return (await findMonster(db, monsterId)) ?? fail("monster_not_found");

  const { rows } = await db.query<Monster>(
    `update public.monsters as m set ${sets.join(", ")} where m.id = $1 returning ${COLUMNS}`,
    params,
  );
  return rows[0] ?? fail("monster_not_found");
}

export async function deleteMonster(db: Queryable, userId: string, monsterId: string): Promise<void> {
  await requireMember(db, monsterId, userId);
  await db.query("delete from public.monsters where id = $1", [monsterId]);
}
