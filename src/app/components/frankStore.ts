import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, getMonster, updateMonster } from "../../lib/api";
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
  dirty: boolean;
  updatedAt: number;
};

const snapshots = new Map<string, FrankSnapshot>();
const listeners = new Map<string, Set<() => void>>();
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hydrations = new Map<string, Promise<void>>();

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

async function persistLocal(monsterId: string, parts: FrankParts, updatedAt: number) {
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + monsterId, JSON.stringify({ parts, updatedAt }));
  } catch {
  }
}

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

  try {
    await updateMonster(monsterId, {
      frank_parts: snap.parts,
      frank_parts_updated_at: new Date(snap.updatedAt).toISOString(),
    });
  } catch (err) {
    console.warn("[frankStore.push]", monsterId, err);
    const rejected = err instanceof ApiError && err.status >= 400 && err.status < 500;
    if (!rejected) schedulePush(monsterId, RETRY_MS);
  }
}

export function flush(monsterId: string) {
  const t = pushTimers.get(monsterId);
  if (t) {
    clearTimeout(t);
    pushTimers.delete(monsterId);
  }
  return push(monsterId);
}

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
  }

  let remoteApplied = false;
  try {
    const data = await getMonster(monsterId);

    if (data.frank_parts && Object.keys(data.frank_parts).length > 0) {
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
  }

  if (!remoteApplied) {
    const cur = getSnapshot(monsterId);
    commit(monsterId, { ...cur, status: "ready" });
    if (cur.dirty || localApplied) schedulePush(monsterId);
  }
}

export const frankStore = { getSnapshot, subscribe, hydrate, setPart, setParts, flush };