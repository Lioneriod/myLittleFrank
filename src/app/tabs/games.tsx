import React, { useCallback, useEffect, useState } from "react";
import {
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

/** Reference screen the base size was designed at. */
const BASE_WIDTH = 800;
const BASE_HEIGHT = 1200;

/** Base square side length at BASE_WIDTH × BASE_HEIGHT. */
const SQUARE_BASE = 256 + 128;

/** Gap between tic-tac-toe cells. */
const GAP = 6;

/** Number of questions in the math quiz. */
const TOTAL_QUESTIONS = 5;

type GameKey = "red" | "blue";
type Player = "pink" | "blue";
type Cell = Player | null;
type Outcome = Player | "draw" | null;

/* ============================ TIC TAC TOE ============================ */

const WIN_LINES: readonly [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function computeOutcome(board: Cell[]): Outcome {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return board.every(Boolean) ? "draw" : null;
}

function playerLabel(p: Player): string {
  return p === "pink" ? "Rosa (O)" : "Azul (X)";
}

function TicTacToe({ size }: { size: number }) {
  const [board, setBoard] = React.useState<Cell[]>(() => Array(9).fill(null));
  const [turn, setTurn] = React.useState<Player>("pink");

  const outcome = React.useMemo(() => computeOutcome(board), [board]);
  const cellSize = (size - 2 * GAP) / 3;

  const play = (i: number) => {
    if (outcome || board[i]) return;
    const next = board.slice();
    next[i] = turn;
    setBoard(next);
    if (!computeOutcome(next)) {
      setTurn(turn === "pink" ? "blue" : "pink");
    }
  };

  const reset = () => {
    setBoard(Array(9).fill(null));
    setTurn("pink");
  };

  const statusText =
    outcome === "draw"
      ? "Empate!"
      : outcome
        ? `${playerLabel(outcome)} venceu!`
        : `Vez de ${playerLabel(turn)}`;

  return (
    <View style={styles.gameContainer}>
      <Text style={styles.gameTitle}>Jogo da Velha</Text>
      <Text style={styles.statusText}>{statusText}</Text>

      <View style={[styles.board, { width: size, height: size }]}>
        {board.map((cell, i) => (
          <TouchableOpacity
            key={i}
            activeOpacity={0.7}
            onPress={() => play(i)}
            disabled={!!cell || !!outcome}
            accessibilityRole="button"
            accessibilityLabel={`Célula ${i + 1}${cell ? `, ${cell === "pink" ? "rosa" : "azul"}` : ""}`}
            style={[
              styles.cellBase,
              cell === "pink" && styles.cellPink,
              cell === "blue" && styles.cellBlue,
              { width: cellSize, height: cellSize },
            ]}
          >
            {cell && (
              <Text style={[styles.symbol, { fontSize: cellSize * 0.55 }]}>
                {cell === "pink" ? "O" : "X"}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <Pressable
        onPress={reset}
        accessibilityRole="button"
        accessibilityLabel="Reiniciar jogo da velha"
        style={({ pressed }) => [
          styles.resetButton,
          pressed && styles.resetButtonPressed,
        ]}
      >
        <Text style={styles.resetText}>Reiniciar</Text>
      </Pressable>
    </View>
  );
}

/* ============================ MATH QUIZ ============================= */

type Question = {
  text: string;
  answer: number;
  options: number[];
};

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function generateOptions(answer: number): number[] {
  const opts = new Set<number>([answer]);
  const offsets = shuffle([-3, -2, -1, 1, 2, 3, 4, -4, 5, -5, 6]);
  for (const off of offsets) {
    if (opts.size >= 4) break;
    const v = answer + off;
    if (v >= 0) opts.add(v);
  }
  let pad = 7;
  while (opts.size < 4) opts.add(answer + pad++);
  return shuffle(Array.from(opts));
}

function generateQuestion(): Question {
  const kind = Math.floor(Math.random() * 3);
  let a: number, b: number, answer: number, text: string;

  if (kind === 0) {
    a = 1 + Math.floor(Math.random() * 20);
    b = 1 + Math.floor(Math.random() * 20);
    answer = a + b;
    text = `${a} + ${b}`;
  } else if (kind === 1) {
    a = 3 + Math.floor(Math.random() * 18);
    b = 1 + Math.floor(Math.random() * (a - 1));
    answer = a - b;
    text = `${a} − ${b}`;
  } else {
    a = 1 + Math.floor(Math.random() * 10);
    b = 1 + Math.floor(Math.random() * 10);
    answer = a * b;
    text = `${a} × ${b}`;
  }

  return { text, answer, options: generateOptions(answer) };
}

function newQuiz(): Question[] {
  return Array.from({ length: TOTAL_QUESTIONS }, generateQuestion);
}

function MathQuiz() {
  const [questions, setQuestions] = useState<Question[]>(newQuiz);
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    Array(TOTAL_QUESTIONS).fill(null),
  );
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<{ value: number; correct: boolean } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => {
      setFeedback(null);
      if (index < TOTAL_QUESTIONS - 1) setIndex((i) => i + 1);
      else setDone(true);
    }, 700);
    return () => clearTimeout(t);
  }, [feedback, index]);

  const current = questions[index];

  const answer = (value: number) => {
    if (feedback) return;
    setFeedback({ value, correct: value === current.answer });
    setAnswers((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  };

  const restart = () => {
    setQuestions(newQuiz());
    setAnswers(Array(TOTAL_QUESTIONS).fill(null));
    setIndex(0);
    setFeedback(null);
    setDone(false);
  };

  if (done) {
    const correctCount = answers.reduce(
      (acc, a, i) => acc + (a === questions[i].answer ? 1 : 0),
      0,
    );
    return (
      <View style={styles.summaryContainer}>
        <Text style={styles.gameTitle}>Resultado</Text>
        <Text style={styles.scoreText}>
          {correctCount}/{TOTAL_QUESTIONS}
        </Text>

        <ScrollView
          style={styles.summaryScroll}
          contentContainerStyle={styles.summaryContent}
          showsVerticalScrollIndicator={false}
        >
          {questions.map((q, i) => {
            const userAnswer = answers[i];
            const correct = userAnswer === q.answer;
            return (
              <View
                key={i}
                style={[
                  styles.summaryRow,
                  correct ? styles.summaryCorrect : styles.summaryWrong,
                ]}
              >
                <Text style={styles.summaryText}>
                  {q.text} = {q.answer}
                </Text>
                <Text
                  style={[
                    styles.summaryMark,
                    correct ? styles.summaryMarkCorrect : styles.summaryMarkWrong,
                  ]}
                >
                  {correct ? "✓" : `✗ (você: ${userAnswer ?? "—"})`}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={restart}
          accessibilityRole="button"
          accessibilityLabel="Jogar novamente"
          style={({ pressed }) => [
            styles.resetButton,
            pressed && styles.resetButtonPressed,
          ]}
        >
          <Text style={styles.resetText}>Jogar novamente</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.gameContainer}>
      <Text style={styles.gameTitle}>Quiz de Matemática</Text>
      <Text style={styles.progressText}>
        Pergunta {index + 1} de {TOTAL_QUESTIONS}
      </Text>

      <View style={styles.questionBox}>
        <Text style={styles.questionText}>{current.text} = ?</Text>
      </View>

      <View style={styles.optionsGrid}>
        {current.options.map((opt) => {
          const isSelected = feedback?.value === opt;
          const isCorrect = !!feedback && opt === current.answer;
          return (
            <TouchableOpacity
              key={opt}
              activeOpacity={0.7}
              disabled={!!feedback}
              onPress={() => answer(opt)}
              accessibilityRole="button"
              accessibilityLabel={`Resposta ${opt}`}
              style={[
                styles.optionButton,
                isCorrect && styles.optionCorrect,
                isSelected && !isCorrect && styles.optionWrong,
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  (isCorrect || (isSelected && !isCorrect)) &&
                    styles.optionTextHighlighted,
                ]}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/* ============================== SCREEN ============================== */

export default function Games() {
  const { width, height } = useWindowDimensions();
  const [openGame, setOpenGame] = useState<GameKey | null>(null);

  const scaleX = width / BASE_WIDTH;
  const scaleY = height / BASE_HEIGHT;

  const squareW = SQUARE_BASE * scaleX;
  const squareH = SQUARE_BASE * scaleY;

  const closeGame = useCallback(() => setOpenGame(null), []);

  const popupW = width * 0.9;
  const popupH = height * 0.75;
  const contentW = popupW - 32;
  const contentH = popupH - 32;
  const boardSize = Math.min(contentW, contentH - 150);

  return (
    <ImageBackground
      source={require("../assets/bgs/telaJogos.jpg")}
      style={[styles.background, { width, height }]}
      resizeMode="stretch"
    >
      {/* Red: 8% from left, 60% from bottom — abre o jogo da velha */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpenGame("red")}
        accessibilityRole="button"
        accessibilityLabel="Abrir jogo da velha"
        style={[
          styles.square,
          styles.redSquare,
          {
            width: squareW,
            height: squareH,
            left: width * 0.08,
            bottom: height * 0.6,
          },
        ]}
      />

      {/* Blue: 50% from left, 25% from bottom — abre o quiz de matemática */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpenGame("blue")}
        accessibilityRole="button"
        accessibilityLabel="Abrir quiz de matemática"
        style={[
          styles.square,
          styles.blueSquare,
          {
            width: squareW,
            height: squareH,
            left: width * 0.50,
            bottom: height * 0.25,
          },
        ]}
      />

      <Modal
        visible={openGame !== null}
        transparent
        animationType="fade"
        onRequestClose={closeGame}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeGame}
            accessibilityRole="button"
            accessibilityLabel="Fechar jogo"
          />

          <Pressable
            onPress={closeGame}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fechar jogo"
            style={styles.backButton}
          >
            <View style={styles.chevron} />
          </Pressable>

          <View style={[styles.popup, { width: popupW, height: popupH }]}>
            {openGame === "red" && <TicTacToe size={boardSize} />}
            {openGame === "blue" && <MathQuiz />}
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { position: "absolute", top: 0, left: 0 },
  square: { position: "absolute" },
  redSquare: { backgroundColor: "rgba(255, 0, 0, 0)" },
  blueSquare: { backgroundColor: "rgba(0, 0, 255, 0)" },

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

  /* ---- popup (green background shared by both games) ---- */
  popup: {
    backgroundColor: "#a5d6a7",
    borderRadius: 16,
    padding: 16,
    overflow: "hidden",
  },

  /* ---- shared game container ---- */
  gameContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  gameTitle: { fontSize: 20, fontWeight: "700", color: "#222" },
  statusText: { fontSize: 16, color: "#444", minHeight: 22 },

  /* ---- tic tac toe ---- */
  board: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  cellBase: {
    borderRadius: 6,
    backgroundColor: "#ececec",
    alignItems: "center",
    justifyContent: "center",
  },
  cellPink: { backgroundColor: "#e91e63" },
  cellBlue: { backgroundColor: "#2196f3" },
  symbol: { fontWeight: "800", color: "#fff" },

  /* ---- reset / replay button (shared) ---- */
  resetButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#333",
  },
  resetButtonPressed: { backgroundColor: "#111" },
  resetText: { color: "#fff", fontWeight: "600" },

  /* ---- math quiz: question view ---- */
  progressText: { fontSize: 14, color: "#333" },
  questionBox: {
    paddingVertical: 20,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 200,
    alignItems: "center",
  },
  questionText: { fontSize: 36, fontWeight: "700", color: "#222" },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  optionButton: {
    width: "45%",
    paddingVertical: 20,
    borderRadius: 12,
    backgroundColor: "#ececec",
    alignItems: "center",
  },
  optionCorrect: { backgroundColor: "#4caf50" },
  optionWrong: { backgroundColor: "#f44336" },
  optionText: { fontSize: 24, fontWeight: "700", color: "#333" },
  optionTextHighlighted: { color: "#fff" },

  /* ---- math quiz: summary view ---- */
  summaryContainer: {
    flex: 1,
    alignItems: "center",
    gap: 16,
  },
  scoreText: { fontSize: 56, fontWeight: "800", color: "#222" },
  summaryScroll: { flex: 1, width: "100%" },
  summaryContent: { gap: 10, paddingVertical: 8 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  summaryCorrect: { backgroundColor: "#e8f5e9" },
  summaryWrong: { backgroundColor: "#ffebee" },
  summaryText: { fontSize: 20, fontWeight: "600", color: "#333" },
  summaryMark: { fontSize: 20, fontWeight: "700" },
  summaryMarkCorrect: { color: "#2e7d32" },
  summaryMarkWrong: { color: "#c62828" },
});