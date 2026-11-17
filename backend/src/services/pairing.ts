import { randomInt } from "node:crypto";
import { fail } from "../errors";
import { withLock } from "../locks";
import { admin, unwrap } from "../supabase";
import { requireMembers } from "./monsters";
import { notifyPartners } from "./push";

type Answers = Record<string, string>;

type PairingRow = { question: string; answers: Answers };

export type Pairing = PairingRow & { members: string[] };

export type HistoryEntry = {
  id: string;
  question: string;
  answers: Answers;
  answered_at: string;
};

async function readPairing(monsterId: string): Promise<PairingRow | null> {
  const { data, error } = await admin
    .from("monster_pairing")
    .select("question, answers")
    .eq("monster_id", monsterId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { question: data.question as string, answers: (data.answers as Answers | null) ?? {} };
}

async function pickQuestion(monsterId: string, exclude: string | null): Promise<string | null> {
  const [questions, history] = await Promise.all([
    admin.from("pairing_questions").select("question").eq("active", true),
    admin.from("monster_pairing_history").select("question").eq("monster_id", monsterId),
  ]);

  const used = new Set(unwrap(history).map((row) => row.question as string));
  const candidates = unwrap(questions)
    .map((row) => row.question as string)
    .filter((question) => question !== exclude);
  const unused = candidates.filter((question) => !used.has(question));
  const pool = unused.length > 0 ? unused : candidates;

  return pool.length > 0 ? pool[randomInt(pool.length)] : null;
}

function ensurePairing(monsterId: string): Promise<PairingRow> {
  return withLock(`monster:${monsterId}`, async () => {
    const existing = await readPairing(monsterId);
    if (existing) return existing;

    const question = (await pickQuestion(monsterId, null)) ?? fail("no_questions");
    const { error } = await admin
      .from("monster_pairing")
      .upsert({ monster_id: monsterId, question }, { onConflict: "monster_id", ignoreDuplicates: true });
    if (error) throw error;

    return (await readPairing(monsterId)) ?? fail("no_pairing_question");
  });
}

export async function getPairing(userId: string, monsterId: string): Promise<Pairing> {
  const members = await requireMembers(userId, monsterId);
  const pairing = (await readPairing(monsterId)) ?? (await ensurePairing(monsterId));
  return { ...pairing, members };
}

export async function answerQuestion(
  userId: string,
  monsterId: string,
  rawAnswer: unknown,
): Promise<Pairing> {
  const answer = typeof rawAnswer === "string" ? rawAnswer.trim() : "";
  if (!answer) fail("invalid_answer");

  const pairing = await withLock(`monster:${monsterId}`, async () => {
    const members = await requireMembers(userId, monsterId);
    const current = (await readPairing(monsterId)) ?? fail("no_pairing_question");
    const answers = { ...current.answers, [userId]: answer };

    const { error } = await admin
      .from("monster_pairing")
      .update({ answers })
      .eq("monster_id", monsterId);
    if (error) throw error;

    return { question: current.question, answers, members };
  });

  notifyPartners(userId, monsterId, pairing.members).catch((error) => {
    console.error("Não foi possível avisar o outro cuidador:", error);
  });

  return pairing;
}

export function advanceQuestion(
  userId: string,
  monsterId: string,
  expectedQuestion: unknown,
): Promise<{ question: string }> {
  return withLock(`monster:${monsterId}`, async () => {
    const members = await requireMembers(userId, monsterId);
    const current = (await readPairing(monsterId)) ?? fail("no_pairing_question");

    if (typeof expectedQuestion === "string" && expectedQuestion !== current.question) {
      fail("question_changed");
    }
    if (members.some((memberId) => !(memberId in current.answers))) {
      fail("not_all_answered");
    }

    const { error: historyError } = await admin
      .from("monster_pairing_history")
      .insert({ monster_id: monsterId, question: current.question, answers: current.answers });
    if (historyError) throw historyError;

    const question = (await pickQuestion(monsterId, current.question)) ?? current.question;
    const { error } = await admin
      .from("monster_pairing")
      .update({ question, answers: {}, created_at: new Date().toISOString() })
      .eq("monster_id", monsterId);
    if (error) throw error;

    return { question };
  });
}

export async function listHistory(userId: string, monsterId: string): Promise<HistoryEntry[]> {
  await requireMembers(userId, monsterId);
  const rows = unwrap(
    await admin
      .from("monster_pairing_history")
      .select("id, question, answers, answered_at")
      .eq("monster_id", monsterId)
      .order("answered_at", { ascending: false }),
  );
  return rows.map((row) => ({
    id: row.id as string,
    question: row.question as string,
    answers: (row.answers as Answers | null) ?? {},
    answered_at: row.answered_at as string,
  }));
}
