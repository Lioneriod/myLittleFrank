import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import {
  DEFAULT_FRANK_PARTS,
  FrankPartKey,
  FrankParts,
  sanitizeFrankParts,
} from "./frankAssets";

const STORAGE_PREFIX = "frank:parts:";
const PUSH_DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

export type FrankSnapshot = {
  parts: FrankParts;
  status: "idle" | "hydrating" | "ready";
  dirty: boolean;      // local changes not yet confirmed by the server
  updatedAt: number;   // ms epoch, last-write-wins
};

const snapshots = new Map<string, FrankSnapshot>();
const listeners = new Map<string, Set<() => void>>();
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hydrations = new Map<string, Promise<void>>();

/* ------------------------------- state ------------------------------- */

function getSnapshot(monsterId: string): FrankSnapshot {
  let snap = snapshots.get(monsterId);
  if (!snap) {
    snap = { parts: { ...DEFAULT_FRANK_PARTS }, status: "idle", dirty: false, updatedAt: 0 };
    snapshots.set(monsterId, snap);
  }
  return snap;
}

function commit(monsterId: string, next: FrankSnapshot) {
  snapshots.set(monsterId, next);
  listeners.get(monsterId)?.forEach((cb) => cb());
}

function subscribe(monsterId: string, cb: () => void) {
  let set = listeners.get(monsterId);
  if (!set) {
    set = new Set();
    listeners.set(monsterId, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
  };
}

/* ------------------------------ writes ------------------------------- */

function applyPatch(monsterId: string, patch: Partial<FrankParts>) {
  const cur = getSnapshot(monsterId);
  const parts = sanitizeFrankParts({ ...cur.parts, ...patch });
  const updatedAt = Date.now();

  commit(monsterId, { ...cur, parts, updatedAt, dirty: true, status: cur.status });

  persistLocal(monsterId, parts, updatedAt);
  schedulePush(monsterId);
}

export function setPart<K extends FrankPartKey>(monsterId: string, key: K, value: FrankParts[K]) {
  applyPatch(monsterId, { [key]: value } as Partial<FrankParts>);
}

export function setParts(monsterId: string, next: Partial<FrankParts>) {
  applyPatch(monsterId, next);
}

/* --------------------------- local cache ----------------------------- */

async function persistLocal(monsterId: string, parts: FrankParts, updatedAt: number) {
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + monsterId, JSON.stringify({ parts, updatedAt }));
  } catch {
    /* best-effort */
  }
}

/* ----------------------------- pushing ------------------------------- */

function schedulePush(monsterId: string, delay = PUSH_DEBOUNCE_MS) {
  const existing = pushTimers.get(monsterId);
  if (existing) clearTimeout(existing);
  pushTimers.set(
    monsterId,
    setTimeout(() => {
      pushTimers.delete(monsterId);
      void push(monsterId);
    }, delay),
  );
}

async function push(monsterId: string) {
  const snap = getSnapshot(monsterId);
  if (!snap.dirty) return;

  const { error, data, status, statusText } = await supabase
    .from("monsters")
    .update({
      frank_parts: snap.parts,
      frank_parts_updated_at: new Date(snap.updatedAt).toISOString(),
    })
    .eq("id", monsterId)
    .select("id, frank_parts_updated_at");   // ← forces return of the row too

  console.log("[frankStore.push]", {
    monsterId,
    status,
    statusText,
    errorCode: error?.code,
    errorMessage: error?.message,
    errorDetails: error?.details,
    errorHint: error?.hint,
    data,
  });

  if (error) {
    schedulePush(monsterId, RETRY_MS);
    return;
  }
  // ...
}

export function flush(monsterId: string) {
  const t = pushTimers.get(monsterId);
  if (t) {
    clearTimeout(t);
    pushTimers.delete(monsterId);
  }
  return push(monsterId);
}

/* ----------------------------- hydration ----------------------------- */

export function hydrate(monsterId: string): Promise<void> {
  const inFlight = hydrations.get(monsterId);
  if (inFlight) return inFlight;
  const p = doHydrate(monsterId).finally(() => hydrations.delete(monsterId));
  hydrations.set(monsterId, p);
  return p;
}

async function doHydrate(monsterId: string) {
  const starting = getSnapshot(monsterId);
  commit(monsterId, { ...starting, status: "hydrating" });

  /* 1. local cache — instant */
  let localApplied = false;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_PREFIX + monsterId);
    if (raw) {
      const parsed = JSON.parse(raw) as { parts?: unknown; updatedAt?: number };
      const localUpdatedAt = Number(parsed.updatedAt) || 0;
      const cur = getSnapshot(monsterId);
      if (localUpdatedAt > cur.updatedAt) {
        commit(monsterId, {
          ...cur,
          parts: sanitizeFrankParts(parsed.parts),
          updatedAt: localUpdatedAt,
        });
        localApplied = true;
      }
    }
  } catch {
    /* ignore */
  }

  /* 2. remote — source of truth across devices */
  let remoteApplied = false;
  try {
    const { data, error } = await supabase
      .from("monsters")
      .select("frank_parts, frank_parts_updated_at")
      .eq("id", monsterId)
      .maybeSingle();

    if (!error && data?.frank_parts && Object.keys(data.frank_parts).length > 0) {
      const remoteUpdatedAt = data.frank_parts_updated_at
        ? Date.parse(data.frank_parts_updated_at)
        : 0;
      const cur = getSnapshot(monsterId);
      if (remoteUpdatedAt > cur.updatedAt) {
        const parts = sanitizeFrankParts(data.frank_parts);
        commit(monsterId, { parts, status: "ready", dirty: false, updatedAt: remoteUpdatedAt });
        await persistLocal(monsterId, parts, remoteUpdatedAt);
        remoteApplied = true;
      }
    }
  } catch {
    /* offline — keep local */
  }

  if (!remoteApplied) {
    const cur = getSnapshot(monsterId);
    commit(monsterId, { ...cur, status: "ready" });
    // Local edits exist but the server doesn't have them (fresh DB, offline,
    // or newer local) — sync up so this device's state wins.
    if (cur.dirty || localApplied) schedulePush(monsterId);
  }
}

/* ------------------------------ exports ------------------------------ */

export const frankStore = { getSnapshot, subscribe, hydrate, setPart, setParts, flush };