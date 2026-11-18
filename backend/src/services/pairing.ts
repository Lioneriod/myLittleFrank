import type { Database, Queryable } from "../db";
import { fail } from "../errors";
import { requireMember } from "./monsters";

export type Pairing = {
  question: string;
  round: number;
  answers: Record<string, string>;
  members: string[];
};

export type HistoryEntry = {
  id: string;
  question: string;
  answers: Record<string, string>;
  answered_at: Date;
};

type CurrentQuestion = { question: string; round: number };

const MAX_ANSWER_LENGTH = 1000;

async function pickQuestion(
  db: Queryable,
  monsterId: string,
  exclude: string | null,
): Promise<string | null> {
  const { rows } = await db.query<{ question: string }>(
    `select q.question
     from public.pairing_questions q
     where q.active and q.question is distinct from $2
     order by exists (
       select 1 from public.monster_pairing_history h
       where h.monster_id = $1 and h.question = q.question
     ), random()
     limit 1`,
    [monsterId, exclude],
  );
  return rows[0]?.question ?? null;
}

async function readCurrentQuestion(
  db: Queryable,
  monsterId: string,
  lock: boolean,
): Promise<CurrentQuestion | null> {
  const { rows } = await db.query<CurrentQuestion>(
    `select question, round from public.monster_pairing where monster_id = $1${lock ? " for update" : ""}`,
    [monsterId],
  );
  return rows[0] ?? null;
}

async function ensureCurrentQuestion(
  db: Queryable,
  monsterId: string,
  lock = false,
): Promise<CurrentQuestion> {
  const existing = await readCurrentQuestion(db, monsterId, lock);
  if (existing) return existing;

  const question = (await pickQuestion(db, monsterId, null)) ?? fail("no_questions");
  await db.query(
    `insert into public.monster_pairing (monster_id, question)
     values ($1, $2)
     on conflict (monster_id) do nothing`,
    [monsterId, question],
  );
  return (await readCurrentQuestion(db, monsterId, lock)) ?? fail("no_questions");
}

async function readAnswers(
  db: Queryable,
  monsterId: string,
  round: number,
): Promise<Record<string, string>> {
  const { rows } = await db.query<{ user_id: string; answer: string }>(
    "select user_id, answer from public.monster_pairing_answers where monster_id = $1 and round = $2",
    [monsterId, round],
  );
  return Object.fromEntries(rows.map((row) => [row.user_id, row.answer]));
}

export async function getPairing(db: Queryable, userId: string, monsterId: string): Promise<Pairing> {
  const members = await requireMember(db, monsterId, userId);
  const { question, round } = await ensureCurrentQuestion(db, monsterId);
  return { question, round, answers: await readAnswers(db, monsterId, round), members };
}

export async function answerPairing(
  db: Database,
  userId: string,
  monsterId: string,
  answer: string,
): Promise<Pairing> {
  const text = answer.trim();
  if (!text || text.length > MAX_ANSWER_LENGTH) fail("invalid_answer");

  return db.transaction(async (tx) => {
    const members = await requireMember(tx, monsterId, userId);
    const { question, round } = await ensureCurrentQuestion(tx, monsterId, true);

    await tx.query(
      `insert into public.monster_pairing_answers (monster_id, round, user_id, answer)
       values ($1, $2, $3, $4)
       on conflict (monster_id, round, user_id) do update
         set answer = excluded.answer, answered_at = now()`,
      [monsterId, round, userId, text],
    );

    return { question, round, answers: await readAnswers(tx, monsterId, round), members };
  });
}

export async function advancePairing(
  db: Database,
  userId: string,
  monsterId: string,
  expectedQuestion?: string,
): Promise<string> {
  return db.transaction(async (tx) => {
    const members = await requireMember(tx, monsterId, userId);
    const { question, round } = await ensureCurrentQuestion(tx, monsterId, true);
    if (expectedQuestion !== undefined && expectedQuestion !== question) fail("question_changed");

    const answers = await readAnswers(tx, monsterId, round);
    if (members.some((memberId) => !Object.hasOwn(answers, memberId))) fail("not_all_answered");

    await tx.query(
      `insert into public.monster_pairing_history (monster_id, round, question, answers)
       values ($1, $2, $3, $4::jsonb)
       on conflict (monster_id, round) do nothing`,
      [monsterId, round, question, JSON.stringify(answers)],
    );

    const next = (await pickQuestion(tx, monsterId, question)) ?? question;
    await tx.query(
      `update public.monster_pairing
       set question = $2, round = round + 1, created_at = now()
       where monster_id = $1`,
      [monsterId, next],
    );
    await tx.query(
      "delete from public.monster_pairing_answers where monster_id = $1 and round <= $2",
      [monsterId, round],
    );
    return next;
  });
}

export async function getHistory(
  db: Queryable,
  userId: string,
  monsterId: string,
): Promise<HistoryEntry[]> {
  await requireMember(db, monsterId, userId);
  const { rows } = await db.query<HistoryEntry>(
    `select id, question, answers, answered_at
     from public.monster_pairing_history
     where monster_id = $1
     order by answered_at desc`,
    [monsterId],
  );
  return rows.map((row) => ({ ...row, answers: row.answers ?? {} }));
}
