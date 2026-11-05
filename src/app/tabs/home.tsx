import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useSession } from "../../contexts/SessionContext";
import MonsterStats from "../../components/MonsterStats";
import Frank, { type FrankHandle } from "../components/Frank";
import { supabase } from "@/src/lib/supabase";
import { colors } from "../../theme";

// --- pairing questions -----------------------------------------------------

const QUESTIONS = [
  "Qual sua memória favorita juntos?",
  "Qual é a minha comida favorita?",
  "Qual é a melhor parte do nosso tempo juntos?",
  "Que animal você vê em mim?",
  "Que personagem eu seria?",
  "Qual é a minha estação do ano preferida?",
];

function pickRandomQuestion(exclude?: string): string {
  const pool = exclude ? QUESTIONS.filter((q) => q !== exclude) : QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Reference size for positioning the tappable squares. Adjust the
// `right/left/bottom` values in `Home` so they line up with the
// interactive visual elements on `telaPrincipal.jpg`.
const BASE_WIDTH = 800;
const BASE_HEIGHT = 1200;
const SQUARE_BASE = 256;

type PairingRow = { question: string; answers: Record<string, string> };

type HistoryRow = {
  id: string;
  question: string;
  answers: Record<string, string>;
  answered_at: string;
};

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

// --- pair question modal ---------------------------------------------------

function PairingModal({
  monsterId,
  visible,
  onClose,
}: {
  monsterId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [pairing, setPairing] = useState<PairingRow | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sessão expirada.");
      setLoading(false);
      return;
    }
    setCurrentUserId(user.id);

    const [membersRes, pairingRes] = await Promise.all([
      supabase
        .from("monster_members")
        .select("user_id")
        .eq("monster_id", monsterId),
      supabase
        .from("monster_pairing")
        .select("question, answers")
        .eq("monster_id", monsterId)
        .maybeSingle(),
    ]);

    if (membersRes.error) {
      setError(membersRes.error.message);
      setLoading(false);
      return;
    }
    if (pairingRes.error) {
      setError(pairingRes.error.message);
      setLoading(false);
      return;
    }

    setMembers((membersRes.data ?? []).map((m: any) => m.user_id as string));

    if (!pairingRes.data) {
      const q = pickRandomQuestion();
      const { error: insErr } = await supabase
        .from("monster_pairing")
        .upsert(
          { monster_id: monsterId, question: q, answers: {} },
          { onConflict: "monster_id", ignoreDuplicates: true }
        );
      if (insErr) {
        setError(insErr.message);
        setLoading(false);
        return;
      }
      const { data: retry, error: retryErr } = await supabase
        .from("monster_pairing")
        .select("question, answers")
        .eq("monster_id", monsterId)
        .maybeSingle();
      if (retryErr || !retry) {
        setError(retryErr?.message ?? "Falha ao criar pergunta.");
        setLoading(false);
        return;
      }
      setPairing({
        question: retry.question,
        answers: (retry.answers as Record<string, string>) ?? {},
      });
    } else {
      setPairing({
        question: pairingRes.data.question,
        answers: (pairingRes.data.answers as Record<string, string>) ?? {},
      });
    }

    setError(null);
    setLoading(false);
  }, [monsterId]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setDraft("");
    load();
  }, [visible, load]);

  useEffect(() => {
    if (!visible || loading || !currentUserId || !pairing) return;
    const answeredIds = Object.keys(pairing.answers);
    const iAnswered = answeredIds.includes(currentUserId);
    const allAnswered =
      members.length === 0 || members.every((m) => answeredIds.includes(m));
    if (!iAnswered || allAnswered) return;

    const t = setInterval(() => {
      load();
    }, 3000);
    return () => clearInterval(t);
  }, [visible, loading, currentUserId, pairing, members, load]);

  const submit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc("answer_pairing_question", {
      monster_uuid: monsterId,
      answer_text: trimmed,
    });
    setSubmitting(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setDraft("");
    await load();
  };

  const myAnswer =
    currentUserId && pairing ? pairing.answers[currentUserId] : undefined;
  const answeredIds = pairing ? Object.keys(pairing.answers) : [];
  const allAnswered =
    members.length === 0 ||
    (pairing !== null && members.every((m) => answeredIds.includes(m)));
  const waitingCount = members.filter(
    (m) => !answeredIds.includes(m)
  ).length;

  // Every close path (X, overlay tap, Android back) goes through here.
  // If the user has seen both answers, we archive + reset the question
  // before closing — replacing the old "Próxima pergunta" button.
  const handleClose = useCallback(async () => {
    if (submitting) return;

    if (pairing && allAnswered && myAnswer) {
      setSubmitting(true);
      try {
        // Re-fetch live state so we don't double-advance if the other
        // caregiver already closed first (or beat us to the archive).
        const { data: live } = await supabase
          .from("monster_pairing")
          .select("question, answers")
          .eq("monster_id", monsterId)
          .maybeSingle();

        if (live && live.question === pairing.question) {
          const liveAnswers =
            (live.answers as Record<string, string>) ?? {};
          const liveIds = Object.keys(liveAnswers);
          const liveAll =
            members.length === 0 ||
            members.every((m) => liveIds.includes(m));
          const liveIMine =
            !!currentUserId && liveIds.includes(currentUserId);

          if (liveAll && liveIMine) {
            const q = pickRandomQuestion(pairing.question);
            const { error: rpcErr } = await supabase.rpc(
              "archive_and_reset_pairing",
              { monster_uuid: monsterId, next_question: q }
            );
            if (rpcErr) {
              console.warn(
                "archive_and_reset_pairing failed:",
                rpcErr.message
              );
            }
          }
        }
      } catch (e) {
        console.warn("auto-advance failed:", e);
      } finally {
        setSubmitting(false);
      }
    }

    onClose();
  }, [
    submitting,
    pairing,
    allAnswered,
    myAnswer,
    members,
    currentUserId,
    monsterId,
    onClose,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
        <Pressable
          onPress={handleClose}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        >
          <View style={styles.chevron} />
        </Pressable>

        <View style={styles.popup}>
          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.ink} />
            </View>
          ) : error ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : pairing ? (
            <>
              <Text style={styles.popupTitle}>Pergunta</Text>
              <Text style={styles.questionText}>{pairing.question}</Text>

              {allAnswered ? (
                <>
                  <ScrollView
                    style={styles.answersScroll}
                    contentContainerStyle={{ gap: 10 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {members.map((uid, i) => (
                      <View key={uid} style={styles.answerCard}>
                        <Text style={styles.answerLabel}>
                          {uid === currentUserId ? "Você" : `Cuidador ${i + 1}`}
                        </Text>
                        <Text style={styles.answerText}>
                          {pairing.answers[uid] ?? "—"}
                        </Text>
                      </View>
                    ))}
                    {members.length === 0 && currentUserId && (
                      <View style={styles.answerCard}>
                        <Text style={styles.answerLabel}>Você</Text>
                        <Text style={styles.answerText}>
                          {pairing.answers[currentUserId] ?? "—"}
                        </Text>
                      </View>
                    )}
                  </ScrollView>
                  {/* <Text style={styles.hintText}>
                    Feche para a próxima pergunta.
                  </Text> */}
                </>
              ) : myAnswer ? (
                <View style={styles.waitingBox}>
                  <View style={styles.myAnswerBox}>
                    <Text style={styles.myAnswerLabel}>Sua resposta:</Text>
                    <Text style={styles.myAnswerText}>{myAnswer}</Text>
                  </View>
                  <Text style={styles.waitingText}>
                    {waitingCount === 1
                      ? "Aguardando o outro cuidador responder..."
                      : `Aguardando mais ${waitingCount} cuidadores...`}
                  </Text>
                  <ActivityIndicator size="small" color={colors.ink} />
                </View>
              ) : (
                <>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Escreva sua resposta..."
                    placeholderTextColor={colors.muted}
                    multiline
                    style={styles.input}
                    editable={!submitting}
                  />
                  <Pressable
                    onPress={submit}
                    disabled={submitting || !draft.trim()}
                    style={[
                      styles.primaryBtn,
                      (submitting || !draft.trim()) &&
                        styles.primaryBtnDisabled,
                    ]}
                  >
                    {submitting ? (
                      <ActivityIndicator color={colors.paper} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Enviar</Text>
                    )}
                  </Pressable>
                </>
              )}
            </>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- diário (history) modal ------------------------------------------------

function DiaryModal({
  monsterId,
  visible,
  onClose,
}: {
  monsterId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setCurrentUserId(user?.id ?? null);

      const { data, error: histErr } = await supabase
        .from("monster_pairing_history")
        .select("id, question, answers, answered_at")
        .eq("monster_id", monsterId)
        .order("answered_at", { ascending: false });

      if (cancelled) return;

      if (histErr) {
        setError(histErr.message);
        setLoading(false);
        return;
      }

      setHistory(
        (data ?? []).map((h: any) => ({
          id: h.id,
          question: h.question,
          answers: (h.answers as Record<string, string>) ?? {},
          answered_at: h.answered_at,
        }))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, monsterId]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        />
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        >
          <View style={styles.chevron} />
        </Pressable>

        <View style={styles.popup}>
          <Text style={styles.popupTitle}>Diário</Text>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={colors.ink} />
            </View>
          ) : error ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : history.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.questionText}>
                Nenhuma resposta registrada ainda.
              </Text>
              <Text style={styles.waitingText}>
                Respondam uma pergunta juntos e ela aparecerá aqui.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.historyScroll}
              contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
              showsVerticalScrollIndicator={false}
            >
              {history.map((entry) => (
                <View key={entry.id} style={styles.historyCard}>
                  <Text style={styles.historyDate}>
                    {formatDate(entry.answered_at)}
                  </Text>
                  <Text style={styles.historyQuestion}>{entry.question}</Text>
                  {Object.entries(entry.answers).map(([uid, answer]) => (
                    <View key={uid} style={styles.historyAnswerRow}>
                      <Text style={styles.historyAnswerLabel}>
                        {uid === currentUserId ? "Você" : "Outro cuidador"}
                      </Text>
                      <Text style={styles.historyAnswerText}>{answer}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// --- home screen -----------------------------------------------------------

export default function Home() {
  const { width, height } = useWindowDimensions();
  const { monster } = useSession();
  const frank = useRef<FrankHandle>(null);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);

  useEffect(() => {
    if (!monster) return;
    let cancelled = false;

    (async () => {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      const { data: member, error: memberErr } = await supabase
        .from("monster_members")
        .select("monster_id, user_id")
        .eq("monster_id", monster.id)
        .maybeSingle();

      if (cancelled) return;
      console.log({
        user: user?.id,
        userErr,
        member,
        memberErr,
        monsterId: monster.id,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [monster?.id]);

  const scaleX = width / BASE_WIDTH;
  const scaleY = height / BASE_HEIGHT;
  const squareW = SQUARE_BASE * scaleX;
  const squareH = SQUARE_BASE * scaleY;

  return (
    <ImageBackground
      source={require("../assets/bgs/telaPrincipal.jpg")}
      style={[styles.background, { width, height }]}
      resizeMode="stretch"
    >
      {monster && (
        <>
          <Frank ref={frank} monsterId={monster.id} placement="home" />

          {/* Pair-question hotspot (red) — top-right */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setPairingOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Abrir pergunta para cuidadores"
            style={[
              styles.squareRed,
              {
                width: squareW,
                height: squareH,
                right: width * 0.08,
                bottom: height * 0.55,
              },
            ]}
          />

          {/* Diário hotspot (green) — bottom-left */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setDiaryOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Abrir diário"
            style={[
              styles.squareGreen,
              {
                width: squareW,
                height: squareH,
                left: width * 0.02,
                bottom: height * 0.68,
              },
            ]}
          />

          <PairingModal
            monsterId={monster.id}
            visible={pairingOpen}
            onClose={() => setPairingOpen(false)}
          />

          <DiaryModal
            monsterId={monster.id}
            visible={diaryOpen}
            onClose={() => setDiaryOpen(false)}
          />
        </>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { position: "absolute", top: 0, left: 0 },
  statsSlot: { position: "absolute" },

  /* transparent tappable hotspots on the home background */
  squareRed: { position: "absolute", backgroundColor: "rgba(255,0,0,0)" },
  squareGreen: { position: "absolute", backgroundColor: "rgba(0,255,0,0)" },

  /* ---- modal ---- */
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    top: 48,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  chevron: {
    width: 14,
    height: 14,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: "red",
    transform: [{ rotate: "45deg" }],
    marginLeft: 4,
  },

  /* ---- popup ---- */
  popup: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    width: "88%",
    maxHeight: "80%",
    gap: 14,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  popupTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  questionText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 24,
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  errorText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  hintText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    fontStyle: "italic",
  },

  /* ---- input ---- */
  input: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    minHeight: 100,
    textAlignVertical: "top",
  },

  /* ---- primary button (Enviar) ---- */
  primaryBtn: {
    backgroundColor: colors.ink,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: {
    color: colors.paper,
    fontSize: 16,
    fontWeight: "900",
  },

  /* ---- answers list (pair modal) ---- */
  answersScroll: { maxHeight: 260 },
  answerCard: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    padding: 12,
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  answerLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  answerText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },

  /* ---- waiting (pair modal) ---- */
  waitingBox: { gap: 12, alignItems: "center" },
  myAnswerBox: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    padding: 12,
    gap: 4,
    alignSelf: "stretch",
  },
  myAnswerLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  myAnswerText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  waitingText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },

  /* ---- diário (history) ---- */
  historyScroll: { maxHeight: 420 },
  historyCard: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 10,
    padding: 14,
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  historyDate: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  historyQuestion: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 4,
  },
  historyAnswerRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
    paddingTop: 8,
    gap: 2,
  },
  historyAnswerLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  historyAnswerText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
  },
});
