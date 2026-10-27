import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
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

type Dialog = {
  title: string;
  message: string;
};

export default function Login() {
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  // Assim que a sessão existir (login agora ou salva de antes), segue o fluxo.
  if (session) return <Redirect href="/" />;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setDialog(null);
  };

  // Mostra o popup e já posiciona o usuário na aba de login,
  // porque nos dois casos de signUp ele vai precisar entrar de qualquer jeito.
  const showDialog = (next: Dialog) => {
    switchMode("signIn");
    setDialog(next);
  };

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setError(null);
    setDialog(null);
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
          // Versões/configurações mais antigas do Supabase retornam erro explícito
          // quando o e-mail já existe. A versão atual NÃO retorna — ver abaixo.
          if (
            error.code === "user_already_exists" ||
            /already registered/i.test(error.message)
          ) {
            showDialog({
              title: "Conta já existe",
              message: "Tente entrar com a sua conta.",
            });
          } else {
            setError(friendlyError(error));
          }
        } else if (
          data.user &&
          Array.isArray(data.user.identities) &&
          data.user.identities.length === 0
        ) {
          // Com "Confirm email" ligado, o Supabase não vaza existência de conta:
          // para um e-mail já cadastrado ele devolve um usuário "ofuscado" com
          // identities vazio, em vez de erro. É assim que se detecta hoje.
          showDialog({
            title: "Conta já existe",
            message: "Tente entrar com a sua conta.",
          });
        } else if (!data.session) {
          // Conta nova + "Confirm email" ligado: nenhuma sessão é retornada
          // porque o usuário ainda precisa clicar no link do e-mail.
          showDialog({
            title: "Email de confirmação enviado",
            message: "Confirme pelo link enviado para o seu e-mail.",
          });
        }
        // Se data.session existir, o "Confirm email" está desligado:
        // o Redirect do topo assume e não há e-mail de confirmação a anunciar.
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
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
              <ModeTab
                label="Entrar"
                active={mode === "signIn"}
                onPress={() => switchMode("signIn")}
              />
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

            <ChalkButton
              label={mode === "signIn" ? "Entrar" : "Criar conta"}
              onPress={submit}
              loading={busy}
            />
          </ChalkCard>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={dialog !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDialog(null)}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogWrap} accessibilityViewIsModal>
            <ChalkCard>
              <View style={styles.dialogBody}>
                <Text style={styles.dialogTitle}>{dialog?.title}</Text>
                <ChalkLine />
                <Text style={styles.dialogMessage}>{dialog?.message}</Text>
                <ChalkButton label="Entendi" onPress={() => setDialog(null)} />
              </View>
            </ChalkCard>
          </View>
        </View>
      </Modal>
    </>
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
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  dialogWrap: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
  },
  dialogBody: {
    gap: 14,
  },
  dialogTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  dialogMessage: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
});