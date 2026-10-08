import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../contexts/SessionContext";
import { friendlyError, supabase } from "../lib/supabase";
import { ChalkButton, ChalkCard, ChalkInput, ChalkLine } from "../components/Chalk";
import { colors } from "../theme";

type Mode = "signIn" | "signUp";

export default function Login() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Assim que a sessão existir (login agora ou salva de antes), segue o fluxo.
  if (session) return <Redirect href="/" />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setError(null);
    setNotice(null);
    if (!cleanEmail || !password) {
      setError("Preencha e-mail e senha.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "signIn") {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) setError(friendlyError(error));
      } else {
        const { data, error } = await supabase.auth.signUp({ email: cleanEmail, password });
        if (error) {
          setError(friendlyError(error));
        } else if (!data.session) {
          // Acontece quando "Confirm email" está ligado no Supabase.
          setMode("signIn");
          setNotice("Conta criada! Confirme pelo link que enviamos para o seu e-mail e depois entre.");
        }
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
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
        <View style={styles.header}>
          <Text style={styles.title}>My Little Frank</Text>
          <ChalkLine />
          <Text style={styles.subtitle}>Cuidem juntos do seu monstrinho</Text>
        </View>

        <ChalkCard>
          <View style={styles.modeSwitch} accessibilityRole="tablist">
            <ModeTab label="Entrar" active={mode === "signIn"} onPress={() => switchMode("signIn")} />
            <ModeTab
              label="Criar conta"
              active={mode === "signUp"}
              onPress={() => switchMode("signUp")}
            />
          </View>

          <ChalkInput
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="voce@email.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <ChalkInput
            label="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "signUp" ? "Pelo menos 6 caracteres" : "Sua senha"}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            textContentType={mode === "signIn" ? "password" : "newPassword"}
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          )}
          {notice && (
            <Text style={styles.notice} accessibilityLiveRegion="polite">
              {notice}
            </Text>
          )}

          <ChalkButton
            label={mode === "signIn" ? "Entrar" : "Criar conta"}
            onPress={submit}
            loading={busy}
          />
        </ChalkCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ModeTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeTab, active && styles.modeTabActive]}
    >
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
    </Pressable>
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
    gap: 28,
  },
  header: {
    alignItems: "center",
    gap: 10,
  },
  title: {
    color: colors.ink,
    fontSize: 38,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  modeSwitch: {
    flexDirection: "row",
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 4,
    overflow: "hidden",
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  modeTabActive: {
    backgroundColor: colors.accent,
  },
  modeLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  modeLabelActive: {
    color: colors.paper,
  },
  error: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: "800",
  },
  notice: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700",
  },
});
