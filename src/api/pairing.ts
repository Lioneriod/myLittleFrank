import { request } from "./client";

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

const pairingPath = (monsterId: string) => `/api/monsters/${encodeURIComponent(monsterId)}/pairing`;

export async function getPairing(monsterId: string): Promise<Pairing> {
  return (await request<{ pairing: Pairing }>(pairingPath(monsterId))).pairing;
}

export async function answerPairing(monsterId: string, answer: string): Promise<Pairing> {
  return (
    await request<{ pairing: Pairing }>(`${pairingPath(monsterId)}/answers`, {
      method: "POST",
      body: { answer },
    })
  ).pairing;
}

export async function advancePairing(monsterId: string, expectedQuestion?: string): Promise<string> {
  return (
    await request<{ question: string }>(`${pairingPath(monsterId)}/advance`, {
      method: "POST",
      body: { expected_question: expectedQuestion },
    })
  ).question;
}

export async function getHistory(monsterId: string): Promise<HistoryEntry[]> {
  return (await request<{ history: HistoryEntry[] }>(`${pairingPath(monsterId)}/history`)).history;
}
