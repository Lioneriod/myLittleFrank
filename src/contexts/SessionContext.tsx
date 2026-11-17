import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Monster, Session, getMyMonster, onSessionChange } from "../lib/api";
import { registerPushToken } from "../lib/pushNotifications";

type SessionState = {
  session: Session | null;
  monster: Monster | null;
  loading: boolean;
  error: string | null;
  refreshMonster: () => Promise<boolean>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [monster, setMonster] = useState<Monster | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onSessionChange(setSession), []);

  const userId = session?.user.id ?? null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  const refreshMonster = useCallback(async () => {
    if (!userId) return false;
    let loaded: Monster | null = null;
    let failed = false;
    try {
      loaded = await getMyMonster();
    } catch {
      failed = true;
    }
    if (currentUserId.current !== userId) return false;
    if (failed) {
      setError("Não foi possível carregar seu monstrinho.");
    } else {
      setError(null);
      setMonster(loaded);
    }
    setLoadedFor(userId);
    return !failed;
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setMonster(null);
      setLoadedFor(null);
      setError(null);
      return;
    }
    refreshMonster();
  }, [userId, refreshMonster]);

  useEffect(() => {
    if (!userId) return;
    registerPushToken().catch((err) => {
      console.warn("Não foi possível registrar as notificações:", err);
    });
  }, [userId]);

  const loading = session === undefined || (userId !== null && loadedFor !== userId);

  return (
    <SessionContext.Provider
      value={{ session: session ?? null, monster, loading, error, refreshMonster }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession precisa estar dentro de <SessionProvider>");
  return value;
}
