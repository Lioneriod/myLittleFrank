import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../contexts/SessionContext";
import { Monster, friendlyError, supabase } from "../lib/supabase";
import { ChalkButton, ChalkCard, ChalkInput, ChalkLine } from "../components/Chalk";
import { colors } from "../theme";

const CODE_LENGTH = 6;

type Busy = "create" | "join" | "continue" | null;

// Primeiro acesso: gera o código de um monstrinho novo ou entra com o código de alguém.
export default function Pair() {
  const { session, monster, refreshMonster } = useSession();
  const insets = useSafeAreaInsets();
  // Monstrinho recém-criado: fica nesta tela mostrando o código até o usuário continuar.
  const [created, setCreated] = useState<Monster | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session) return <Redirect href="/" />;
  if (monster && !created) return <Redirect href="/" />;

  const createMonster = async () => {
    setError(null);
    setBusy("create");
    const { data, error } = await supabase.rpc("create_monster");
    setBusy(null);
    if (error) {
      setError(friendlyError(error));
      return;
    }
    setCreated(data as Monster);
  };

  const joinMonster = async () => {
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length !== CODE_LENGTH) {
      setError(`O código tem ${CODE_LENGTH} letras e números.`);
      return;
    }
    setError(null);
    setBusy("join");
    const { error } = await supabase.rpc("join_monster", { code: cleanCode });
    if (error) {
      setBusy(null);
      setError(friendlyError(error));
      return;
    }
    // Com o monstrinho carregado no contexto, o Redirect acima leva para a tela inicial.
    if (!(await refreshMonster())) {
      setBusy(null);
      setError("Você entrou, mas não conseguimos carregar o monstrinho. Tente de novo.");
    }
  };

  const continueToHome = async () => {
    setError(null);
    setBusy("continue");
    if (await refreshMonster()) {
      setCreated(null);
    } else {
      setBusy(null);
      setError("Não foi possível carregar seu monstrinho. Tente de novo.");
    }
  };

  const shareCode = (monsterToShare: Monster) => {
    Share.share({
      message: `Vem cuidar do ${monsterToShare.name} comigo no My Little Frank! Use o código ${monsterToShare.invite_code}`,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {created ? (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>O {created.name} nasceu!</Text>
              <ChalkLine />
            </View>

            <ChalkCard>
              <Text style={styles.body}>
                Este é o código do seu monstrinho. Envie para quem vai cuidar dele com você:
              </Text>
              <View
                style={styles.codeRow}
                accessible
                accessibilityLabel={`Código ${created.invite_code.split("").join(" ")}`}
              >
                {created.invite_code.split("").map((char, index) => (
                  <View key={index} style={styles.codeCell}>
                    <Text style={styles.codeChar}>{char}</Text>
                  </View>
                ))}
              </View>
              <ChalkButton
                label="Compartilhar código"
                variant="secondary"
                onPress={() => shareCode(created)}
              />
              <ChalkButton
                label="Continuar"
                onPress={continueToHome}
                loading={busy === "continue"}
              />
            </ChalkCard>
          </>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Quase lá!</Text>
              <ChalkLine />
              <Text style={styles.subtitle}>Seu monstrinho precisa de cuidadores</Text>
            </View>

            <ChalkCard>
              <Text style={styles.cardTitle}>Começar um monstrinho</Text>
              <Text style={styles.body}>
                Você recebe um código para compartilhar com quem vai cuidar dele junto.
              </Text>
              <ChalkButton
                label="Gerar código"
                onPress={createMonster}
                loading={busy === "create"}
                disabled={busy !== null}
              />
            </ChalkCard>

            <View style={styles.orRow}>
              <View style={styles.orLine}>
                <ChalkLine />
              </View>
              <Text style={styles.orText}>ou</Text>
              <View style={styles.orLine}>
                <ChalkLine />
              </View>
            </View>

            <ChalkCard>
              <Text style={styles.cardTitle}>Recebi um código</Text>
              <ChalkInput
                label="Código"
                value={code}
                onChangeText={(text) => setCode(text.toUpperCase())}
                placeholder="EX: K7Q2MP"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                maxLength={CODE_LENGTH}
                returnKeyType="go"
                onSubmitEditing={joinMonster}
                style={styles.codeInput}
              />
              <ChalkButton
                label="Entrar com código"
                onPress={joinMonster}
                loading={busy === "join"}
                disabled={busy !== null}
              />
            </ChalkCard>
          </>
        )}

        {error && (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        )}

        {!created && (
          <Pressable
            accessibilityRole="button"
            onPress={() => supabase.auth.signOut()}
            style={styles.signOut}
          >
            <Text style={styles.signOutText}>Sair desta conta</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 24,
  },
  header: {
    alignItems: "center",
    gap: 10,
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
  },
  body: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
  },
  codeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  codeCell: {
    flex: 1,
    maxWidth: 48,
    aspectRatio: 0.8,
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 4,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  codeChar: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
  },
  codeInput: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 6,
    textAlign: "center",
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  orLine: {
    flex: 1,
  },
  orText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  error: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  signOut: {
    alignSelf: "center",
    padding: 8,
  },
  signOutText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
