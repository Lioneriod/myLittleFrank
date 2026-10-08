import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { MONSTER_COLUMNS, Monster, supabase } from "../lib/supabase";

type SessionState = {
  session: Session | null;
  monster: Monster | null;
  // true enquanto ainda não sabemos se há sessão salva ou qual é o monstrinho do usuário
  loading: boolean;
  error: string | null;
  // Recarrega o monstrinho do banco; devolve false se não conseguiu.
  refreshMonster: () => Promise<boolean>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // undefined = a sessão salva ainda não foi lida do armazenamento
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [monster, setMonster] = useState<Monster | null>(null);
  // id do usuário para quem o monstrinho atual foi carregado
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Dispara INITIAL_SESSION com a sessão salva e depois a cada login, logout ou renovação.
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
    // As políticas de RLS só devolvem o monstrinho de quem é cuidador dele.
    const { data, error } = await supabase
      .from("monsters")
      .select(MONSTER_COLUMNS)
      .maybeSingle<Monster>();
    // Ignora a resposta se o usuário trocou de conta enquanto ela chegava.
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
