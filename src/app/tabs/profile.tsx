import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Bell,
  Clock,
  DotsThreeCircle,
  MusicNote,
  PencilSimple,
  SignOut,
  SpeakerHigh,
  Trash,
  User,
} from "phosphor-react-native";
import { useSession } from "../../contexts/SessionContext";
import { colors } from "../../theme";
import { supabase } from "../../lib/supabase";

// NOTE: For real OS notifications on mobile, install expo-notifications:
//   npx expo install expo-notifications
// Then in sendTestNotification(), swap the Alert.alert(...) branch with:
//   await Notifications.scheduleNotificationAsync({
//     content: { title: "My Little Frank", body: "test notification" },
//     trigger: null,
//   });

const SETTINGS_KEY = "@my_little_frank/settings";

type Settings = {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  notificationsEnabled: boolean;
  notificationIntervalHours: number;
};

const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.7,
  sfxVolume: 0.8,
  notificationsEnabled: true,
  notificationIntervalHours: 12,
};

// ---------------------------------------------------------------------------
// Cross-platform dialogs
// (react-native-web's Alert.alert drops the button list — so use window.* on web)
// ---------------------------------------------------------------------------

function showAlert(title: string, message?: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  if (message) {
    Alert.alert(title, message);
  } else {
    Alert.alert(title);
  }
}

function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string
): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined") return Promise.resolve(false);
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: "destructive",
        onPress: () => resolve(true),
      },
    ]);
  });
}

// ---------------------------------------------------------------------------
// Reusable bits
// ---------------------------------------------------------------------------

function SettingRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingHeader}>
        <View style={styles.iconBox}>{icon}</View>
        <Text style={styles.settingLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.settingControl}>{children}</View>
    </View>
  );
}

function VolumeSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);

  const handlePress = (e: any) => {
    if (trackWidth === 0) return;
    const x = e.nativeEvent.locationX;
    onChange(Math.max(0, Math.min(1, x / trackWidth)));
  };

  return (
    <View style={styles.sliderRow}>
      <Pressable
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onPress={handlePress}
        style={styles.sliderTrack}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      >
        <View style={[styles.sliderFill, { width: `${value * 100}%` }]} />
        <View
          style={[styles.sliderThumb, { left: `${value * 100}%` }]}
          pointerEvents="none"
        />
      </Pressable>
      <Text style={styles.sliderValue}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

function DangerRow({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={styles.dangerRow}
    >
      <View style={styles.dangerLeft}>
        <View style={styles.iconBox}>{icon}</View>
        <Text style={styles.dangerText}>{label}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : null}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, monster, refreshMonster } = useSession();

  const email = session?.user?.email ?? null;

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [intervalDraft, setIntervalDraft] = useState(
    String(DEFAULT_SETTINGS.notificationIntervalHours)
  );
  const [nameDraft, setNameDraft] = useState(monster?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [busy, setBusy] = useState<"account" | "monster" | null>(null);

  // Load persisted settings.
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          const merged = { ...DEFAULT_SETTINGS, ...parsed };
          setSettings(merged);
          setIntervalDraft(String(merged.notificationIntervalHours));
        } catch {
          // ignore corrupt storage
        }
      })
      .catch(() => {});
  }, []);

  // Keep the name draft in sync when the monster loads / changes.
  useEffect(() => {
    setNameDraft(monster?.name ?? "");
  }, [monster?.id, monster?.name]);

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(
          () => {}
        );
        return next;
      });
    },
    []
  );

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------

  const sendTestNotification = useCallback(async () => {
    const message = "notificação placeholder";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.alert(message);
      }
      return;
    }
    // No expo-notifications installed — fall back to an in-app alert.
    Alert.alert("My Little Frank", message);
  }, []);

  const handleNotificationToggle = useCallback(
    async (value: boolean) => {
      updateSetting("notificationsEnabled", value);
      if (value) {
        await sendTestNotification();
      }
    },
    [sendTestNotification, updateSetting]
  );

  const commitInterval = useCallback(() => {
    const n = parseInt(intervalDraft, 10);
    if (isNaN(n) || n < 1 || n > 9999) {
      setIntervalDraft(String(settings.notificationIntervalHours));
      return;
    }
    updateSetting("notificationIntervalHours", n);
    setIntervalDraft(String(n));
  }, [intervalDraft, settings.notificationIntervalHours, updateSetting]);

  // -------------------------------------------------------------------------
  // Monster name
  // -------------------------------------------------------------------------

  const saveMonsterName = useCallback(async () => {
    if (!monster) return;
    const trimmed = nameDraft.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      showAlert(
        "Nome inválido",
        "O nome do Frank precisa ter entre 1 e 30 caracteres."
      );
      return;
    }
    if (trimmed === monster.name) return;

    setSavingName(true);
    const { error } = await supabase
      .from("monsters")
      .update({ name: trimmed })
      .eq("id", monster.id);
    setSavingName(false);

    if (error) {
      showAlert("Erro", error.message);
      return;
    }
    await refreshMonster();
  }, [monster, nameDraft, refreshMonster]);

  // -------------------------------------------------------------------------
  // Delete monster data (leave pairing) -> /pair
  // -------------------------------------------------------------------------

  const handleDeleteMonster = useCallback(async () => {
  if (!monster || busy) return;

  const ok = await confirmDestructive(
    "Apagar Frank",
    "Isso vai apagar o Frank permanentemente para TODOS os cuidadores dele. " +
      "Qualquer outra conta que estava cuidando junto perderá acesso. Não é possível desfazer. Continuar?",
    "Apagar"
  );
  if (!ok) return;

  setBusy("monster");
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      showAlert("Erro", "Sessão expirada. Faça login de novo.");
      return;
    }

    const monsterId = monster.id;

    // Deletes the monster row; FK cascade removes all monster_members rows.
    const { error: rpcErr } = await supabase.rpc("delete_monster", {
      monster_uuid: monsterId,
    });
    if (rpcErr) {
      showAlert("Erro", rpcErr.message);
      return;
    }

    // Verify via SECURITY DEFINER helper (RLS on `monsters` would hide the row otherwise).
    const { data: stillExists, error: checkErr } = await supabase.rpc(
      "monster_exists",
      { m: monsterId }
    );
    if (checkErr) {
      showAlert("Erro", checkErr.message);
      return;
    }
    if (stillExists) {
      showAlert(
        "Erro",
        "Este Frank ainda está no banco de dados."
      );
      return;
    }

    await refreshMonster();
    router.replace("/pair");
  } catch (err: any) {
    showAlert("Erro", err?.message ?? "Falha ao apagar Frank.");
  } finally {
    setBusy(null);
  }
}, [busy, monster, refreshMonster, router]);

  // -------------------------------------------------------------------------
  // Delete account
  // -------------------------------------------------------------------------

  const handleDeleteAccount = useCallback(async () => {
    if (busy) return;

    const ok = await confirmDestructive(
      "Apagar conta",
      "Isso vai apagar sua conta e todos os seus dados. Essa ação não pode ser desfeita. Continuar?",
      "Apagar conta"
    );
    if (!ok) return;

    setBusy("account");
    try {
      // Preferred: full deletion via security-definer RPC.
      const { error: rpcError } = await supabase.rpc("delete_user_account");

      if (rpcError) {
        // Fallback: at least remove user data, then sign out.
        console.warn("delete_user_account RPC falhou:", rpcError.message);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("monsters").delete().eq("created_by", user.id);
          await supabase
            .from("monster_members")
            .delete()
            .eq("user_id", user.id);
        }
      }

      await supabase.auth.signOut();
    } catch (err: any) {
      showAlert(
        "Erro",
        err?.message ?? "Não foi possível apagar a conta."
      );
    } finally {
      setBusy(null);
    }
  }, [busy]);

  // -------------------------------------------------------------------------
  // Log out
  // -------------------------------------------------------------------------

  const handleLogOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      showAlert("Erro", error.message);
    }
  }, []);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerTitle}>
              <Text style={styles.title}>Perfil</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="More options"
              hitSlop={12}
              onPress={() => {}}
            >
              <DotsThreeCircle size={26} color={colors.ink} weight="bold" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarPlaceholder}>
              <User size={44} color={colors.ink} weight="duotone" />
            </View>
          </View>
          <Text style={styles.name}>{monster?.name ?? "Sem Frank"}</Text>
          <Text style={styles.email}>{email ?? ""}</Text>
        </View>

        <View style={styles.options}>
          <Text style={styles.sectionTitle}>Opções</Text>

          <SettingRow
            icon={<MusicNote size={18} color={colors.ink} weight="bold" />}
            label="Volume da música"
          >
            <VolumeSlider
              value={settings.musicVolume}
              onChange={(v) => updateSetting("musicVolume", v)}
            />
          </SettingRow>

          <SettingRow
            icon={<SpeakerHigh size={18} color={colors.ink} weight="bold" />}
            label="Volume dos sons"
          >
            <VolumeSlider
              value={settings.sfxVolume}
              onChange={(v) => updateSetting("sfxVolume", v)}
            />
          </SettingRow>

          <SettingRow
            icon={<Bell size={18} color={colors.ink} weight="bold" />}
            label="Notificações"
          >
            <Switch
              value={settings.notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: colors.muted, true: colors.accent }}
              thumbColor={colors.paper}
              ios_backgroundColor={colors.muted}
            />
          </SettingRow>

          <SettingRow
            icon={<Clock size={18} color={colors.ink} weight="bold" />}
            label="Frequência das notificações"
          >
            <View style={styles.inputRow}>
              <TextInput
                keyboardType="number-pad"
                value={intervalDraft}
                onChangeText={setIntervalDraft}
                onBlur={commitInterval}
                onSubmitEditing={commitInterval}
                maxLength={4}
                style={[styles.textInput, styles.intervalInput]}
                returnKeyType="done"
                accessibilityLabel="Horas entre notificações"
              />
              <Text style={styles.inputSuffix}>horas</Text>
            </View>
          </SettingRow>

          <SettingRow
            icon={<PencilSimple size={18} color={colors.ink} weight="bold" />}
            label="Nome do Frank"
          >
            <View style={styles.inputRow}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                maxLength={30}
                style={[styles.textInput, styles.nameInput]}
                placeholder="Frank"
                placeholderTextColor={colors.muted}
                editable={!!monster && !savingName}
                returnKeyType="done"
                onSubmitEditing={saveMonsterName}
              />
              <TouchableOpacity
                onPress={saveMonsterName}
                disabled={
                  !monster ||
                  savingName ||
                  nameDraft.trim() === monster?.name
                }
                style={[
                  styles.saveBtn,
                  (!monster ||
                    savingName ||
                    nameDraft.trim() === monster?.name) &&
                    styles.saveBtnDisabled,
                ]}
                accessibilityRole="button"
              >
                {savingName ? (
                  <ActivityIndicator size="small" color={colors.ink} />
                ) : (
                  <Text style={styles.saveBtnText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </SettingRow>

          <DangerRow
            icon={<Trash size={18} color={colors.accent} weight="bold" />}
            label="Apagar Frank"
            onPress={handleDeleteMonster}
            busy={busy === "monster"}
          />

          <DangerRow
            icon={<Trash size={18} color={colors.accent} weight="bold" />}
            label="Apagar conta"
            onPress={handleDeleteAccount}
            busy={busy === "account"}
          />
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          onPress={handleLogOut}
          style={styles.logoutBtn}
        >
          <SignOut size={16} color={colors.muted} weight="bold" />
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    gap: 24,
  },
  header: {
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: "800",
  },
  profileInfo: {
    alignItems: "center",
    gap: 4,
  },
  avatarWrap: {
    position: "relative",
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 12,
    textAlign: "center",
  },
  email: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
  options: {
    gap: 20,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
  },
  // Row: [icon + label]  <---->  [control]
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  settingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  settingLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    flexShrink: 1,
  },
  settingControl: {
    flex: 1,
    alignItems: "flex-end",
  },
  // Slider
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
  },
  sliderTrack: {
    flex: 1,
    height: 10,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 5,
    position: "relative",
    justifyContent: "center",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  sliderThumb: {
    position: "absolute",
    top: -5,
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: colors.paper,
    borderWidth: 3,
    borderColor: colors.ink,
  },
  sliderValue: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "800",
    width: 44,
    textAlign: "right",
  },
  // Inputs
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    alignSelf: "stretch",
    justifyContent: "flex-end",
  },
  textInput: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    backgroundColor: "transparent",
  },
  intervalInput: {
    width: 80,
    textAlign: "center",
  },
  nameInput: {
    flex: 1,
  },
  inputSuffix: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700",
  },
  saveBtn: {
    borderWidth: 2,
    borderColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 4,
    minWidth: 72,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  // Danger
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  dangerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexShrink: 1,
  },
  dangerText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "800",
    flexShrink: 1,
  },
  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "center",
    padding: 10,
    marginTop: 4,
  },
  logoutText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
