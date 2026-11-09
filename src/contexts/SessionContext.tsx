import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MONSTER_COLUMNS, Monster, supabase } from "../lib/supabase";
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

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  const refreshMonster = useCallback(async () => {
    if (!userId) return false;
    const { data, error } = await supabase
      .from("monsters")
      .select(MONSTER_COLUMNS)
      .maybeSingle<Monster>();
    if (currentUserId.current !== userId) return false;
    if (error) {
      setError("Não foi possível carregar seu monstrinho.");
    } else {
      setError(null);
      setMonster(data);
    }
    setLoadedFor(userId);
    return !error;
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
