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
  "qual sua memória favorita juntos?",
  "qual a minha comida favorita?",
  "qual a melhor parte do nosso tempo juntos?",
  "que animal você vê em mim?",
  "que personagem eu seria?",
];

function pickRandomQuestion(exclude?: string): string {
  const pool = exclude ? QUESTIONS.filter((q) => q !== exclude) : QUESTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Reference size for positioning the tappable square. Adjust `squareStyle`
// in `Home` below so it lines up with the interactive element on
// `telaPrincipal.jpg` (a book, a picture, a heart, etc.).
const BASE_WIDTH = 800;
const BASE_HEIGHT = 1200;
const SQUARE_BASE = 128;

type PairingRow = {
  question: string;
  answers: Record<string, string>;
};

// --- modal -----------------------------------------------------------------

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
      // No active question yet — create one (first writer wins).
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

  // Reload each time the modal opens (or the monster changes).
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    setDraft("");
    load();
  }, [visible, load]);

  // Poll while waiting for the other caregiver.
  useEffect(() => {
    if (!visible || loading || !currentUserId || !pairing) return;
    const answeredIds = Object.keys(pairing.answers);
    const iAnswered = answeredIds.includes(currentUserId);
    const allAnswered =
      members.length === 0 ||
      members.every((m) => answeredIds.includes(m));
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

  const nextQuestion = async () => {
    if (!pairing) return;
    setSubmitting(true);
    setError(null);
    const q = pickRandomQuestion(pairing.question);
    const { error: updErr } = await supabase
      .from("monster_pairing")
      .update({ question: q, answers: {} })
      .eq("monster_id", monsterId);
    setSubmitting(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
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
                  <Text style={styles.sectionLabel}>Respostas</Text>
                  <ScrollView
                    style={styles.answersScroll}
                    contentContainerStyle={{ gap: 10 }}
                    showsVerticalScrollIndicator={false}
                  >
                    {members.map((uid, i) => (
                      <View key={uid} style={styles.answerCard}>
                        <Text style={styles.answerLabel}>
                          {uid === currentUserId
                            ? "Você"
                            : `Cuidador ${i + 1}`}
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
                  <Pressable
                    onPress={nextQuestion}
                    disabled={submitting}
                    style={[
                      styles.primaryBtn,
                      submitting && styles.primaryBtnDisabled,
                    ]}
                  >
                    {submitting ? (
                      <ActivityIndicator color={colors.paper} />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        Próxima pergunta
                      </Text>
                    )}
                  </Pressable>
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

// --- home screen -----------------------------------------------------------

export default function Home() {
  const { width, height } = useWindowDimensions();
  const { monster } = useSession();
  const frank = useRef<FrankHandle>(null);
  const [pairingOpen, setPairingOpen] = useState(false);

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

          {/* Interactive hotspot — align this with a visual element on the
              home background. Fully transparent so only the tappable area
              matters; adjust left/right/top/bottom as needed. */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setPairingOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Abrir pergunta para cuidadores"
            style={[
              styles.square,
              {
                width: squareW,
                height: squareH,
                right: width * 0.08,
                bottom: height * 0.1,
              },
            ]}
          />

          <PairingModal
            monsterId={monster.id}
            visible={pairingOpen}
            onClose={() => setPairingOpen(false)}
          />
        </>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { position: "absolute", top: 0, left: 0 },
  statsSlot: { position: "absolute" },

  /* transparent tappable hotspot on the home background */
  square: { position: "absolute", backgroundColor: "rgba(0,0,0,0)" },

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
  },
  errorText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
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

  /* ---- primary button ---- */
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

  /* ---- answers list ---- */
  answersScroll: { maxHeight: 260 },
  answerCard: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    padding: 12,
    gap: 4,
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

  /* ---- waiting ---- */
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
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
});
