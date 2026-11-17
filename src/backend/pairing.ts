import { db, run, runOptional } from "./database";
import { fail } from "./errors";
import { requireMember } from "./monsters";
import { notifyPartners } from "./push";

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
  answered_at: string;
};

type CurrentQuestion = { question: string; round: number };

const MAX_ANSWER_LENGTH = 1000;

async function readCurrentQuestion(monsterId: string): Promise<CurrentQuestion | null> {
  return (await runOptional(
    db.from("monster_pairing").select("question, round").eq("monster_id", monsterId).maybeSingle(),
  )) as CurrentQuestion | null;
}

async function pickQuestion(monsterId: string, exclude: string | null): Promise<string | null> {
  const [questions, history] = await Promise.all([
    run(db.from("pairing_questions").select("question").eq("active", true)),
    run(db.from("monster_pairing_history").select("question").eq("monster_id", monsterId)),
  ]);

  const used = new Set(history.map((row) => row.question as string));
  const candidates = questions
    .map((row) => row.question as string)
    .filter((question) => question !== exclude);
  const unused = candidates.filter((question) => !used.has(question));
  const pool = unused.length > 0 ? unused : candidates;

  return pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
}

async function ensureCurrentQuestion(monsterId: string): Promise<CurrentQuestion> {
  const existing = await readCurrentQuestion(monsterId);
  if (existing) return existing;

  const question = (await pickQuestion(monsterId, null)) ?? fail("no_questions");
  await run(
    db
      .from("monster_pairing")
      .upsert({ monster_id: monsterId, question }, { onConflict: "monster_id", ignoreDuplicates: true }),
  );
  return (await readCurrentQuestion(monsterId)) ?? fail("no_questions");
}

async function readAnswers(monsterId: string, round: number): Promise<Record<string, string>> {
  const rows = await run(
    db
      .from("monster_pairing_answers")
      .select("user_id, answer")
      .eq("monster_id", monsterId)
      .eq("round", round),
  );
  const answers: Record<string, string> = {};
  for (const row of rows) answers[row.user_id as string] = row.answer as string;
  return answers;
}

export async function getPairing(monsterId: string): Promise<Pairing> {
  const { members } = await requireMember(monsterId);
  const { question, round } = await ensureCurrentQuestion(monsterId);
  return { question, round, answers: await readAnswers(monsterId, round), members };
}

export async function answerPairing(monsterId: string, answer: string): Promise<Pairing> {
  const text = answer.trim();
  if (!text || text.length > MAX_ANSWER_LENGTH) fail("invalid_answer");

  const { user, members } = await requireMember(monsterId);
  const { question, round } = await ensureCurrentQuestion(monsterId);

  await run(
    db.from("monster_pairing_answers").upsert(
      { monster_id: monsterId, round, user_id: user.id, answer: text, answered_at: new Date().toISOString() },
      { onConflict: "monster_id,round,user_id" },
    ),
  );

  notifyPartners(user.id, monsterId, members).catch((error) => {
    console.warn("Não foi possível avisar o outro cuidador:", error);
  });

  const answers = await readAnswers(monsterId, round);
  return { question, round, answers, members };
}

export async function advancePairing(monsterId: string, expectedQuestion?: string): Promise<string> {
  const pairing = await getPairing(monsterId);
  if (expectedQuestion !== undefined && expectedQuestion !== pairing.question) fail("question_changed");
  if (pairing.members.some((memberId) => !(memberId in pairing.answers))) fail("not_all_answered");

  await run(
    db.from("monster_pairing_history").upsert(
      { monster_id: monsterId, round: pairing.round, question: pairing.question, answers: pairing.answers },
      { onConflict: "monster_id,round", ignoreDuplicates: true },
    ),
  );

  const next = (await pickQuestion(monsterId, pairing.question)) ?? pairing.question;
  const advanced = await run(
    db
      .from("monster_pairing")
      .update({ question: next, round: pairing.round + 1, created_at: new Date().toISOString() })
      .eq("monster_id", monsterId)
      .eq("round", pairing.round)
      .select("round"),
  );
  if (advanced.length === 0) fail("question_changed");

  await run(
    db.from("monster_pairing_answers").delete().eq("monster_id", monsterId).lte("round", pairing.round),
  );
  return next;
}

export async function getHistory(monsterId: string): Promise<HistoryEntry[]> {
  await requireMember(monsterId);
  const rows = await run(
    db
      .from("monster_pairing_history")
      .select("id, question, answers, answered_at")
      .eq("monster_id", monsterId)
      .order("answered_at", { ascending: false }),
  );
  return rows.map((row) => ({
    id: row.id as string,
    question: row.question as string,
    answers: (row.answers as Record<string, string> | null) ?? {},
    answered_at: row.answered_at as string,
  }));
}
