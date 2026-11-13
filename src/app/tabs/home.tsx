import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
} from "react-native";
import { useSession } from "../../contexts/SessionContext";
import MonsterStats from "../../components/MonsterStats";
import Frank, { type FrankHandle } from "../components/Frank";
import Scene, { type SceneArt, type SceneRect } from "../../components/Scene";
import {
  ApiError,
  advancePairing,
  answerPairing,
  friendlyError,
  getHistory,
  getPairing,
} from "@/src/lib/api";
import { colors } from "../../theme";

const HOME_ART: SceneArt = {
  source: require("../assets/bgs/telaPrincipal.jpg"),
  width: 1200,
  height: 3171,
  anchorY: 3000,
  anchorTo: 1,
};

const DIARY_SPOT: SceneRect = { x: 20, y: 1809, w: 390, h: 270 };
const PAIRING_SPOT: SceneRect = { x: 760, y: 2024, w: 370, h: 330 };
const FRANK_FEET = { x: 600, y: 2869 };

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

function PairingModal({
  monsterId,
  visible,
  onClose,
}: {
  monsterId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { session } = useSession();
  const currentUserId = session?.user.id ?? null;
  const [pairing, setPairing] = useState<PairingRow | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const live = await getPairing(monsterId);
      setMembers(live.members);
      setPairing({ question: live.question, answers: live.answers });
      setError(null);
    } catch (err) {
      setError(friendlyError(err));
    }
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
    try {
      await answerPairing(monsterId, trimmed);
    } catch (err) {
      setSubmitting(false);
      setError(friendlyError(err));
      return;
    }
    setSubmitting(false);
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

  const handleClose = useCallback(async () => {
    if (submitting) return;

    if (pairing && allAnswered && myAnswer) {
      setSubmitting(true);
      try {
        await advancePairing(monsterId, pairing.question);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409) {
          console.warn("auto-advance failed:", e);
        }
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

function DiaryModal({
  monsterId,
  visible,
  onClose,
}: {
  monsterId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { session } = useSession();
  const currentUserId = session?.user.id ?? null;
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const entries = await getHistory(monsterId);
        if (cancelled) return;
        setHistory(entries);
      } catch (err) {
        if (cancelled) return;
        setError(friendlyError(err));
      }
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

export default function Home() {
  const { monster } = useSession();
  const frank = useRef<FrankHandle>(null);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);

  return (
    <>
      <Scene art={HOME_ART}>
        {(scene) => {
          if (!monster) return null;
          const feet = scene.point(FRANK_FEET.x, FRANK_FEET.y);
          return (
            <>
              <Frank
                ref={frank}
                monsterId={monster.id}
                box={{ centerX: feet.x, feetY: feet.y, width: HOME_ART.width * scene.scale }}
              />

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setPairingOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Abrir pergunta para cuidadores"
                style={[styles.squareRed, scene.rect(PAIRING_SPOT)]}
              />

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setDiaryOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Abrir diário"
                style={[styles.squareGreen, scene.rect(DIARY_SPOT)]}
              />
            </>
          );
        }}
      </Scene>

      {monster && (
        <>
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
    </>
  );
}

const styles = StyleSheet.create({
  statsSlot: { position: "absolute" },

  squareRed: { position: "absolute", backgroundColor: "rgba(255,0,0,0)" },
  squareGreen: { position: "absolute", backgroundColor: "rgba(0,255,0,0)" },

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
