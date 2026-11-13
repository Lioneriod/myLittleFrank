import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import {
  deleteAccount,
  deleteMonster,
  friendlyError,
  signOut,
  updateMonster,
} from "../../lib/api";
import { unregisterPushToken } from "../../lib/pushNotifications";

const SETTINGS_KEY = "@my_little_frank/settings";

type Settings = {
  musicVolume: number;
  sfxVolume: number;
  notificationsEnabled: boolean;
  notificationIntervalHours: number;
  notificationIntervalMinutes: number;
};

const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.7,
  sfxVolume: 0.8,
  notificationsEnabled: true,
  notificationIntervalHours: 12,
  notificationIntervalMinutes: 0,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

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

  const applyX = (x: number) => {
    if (trackWidth === 0) return;
    const raw = Math.max(0, Math.min(1, x / trackWidth));
    onChange(Math.round(raw * 20) / 20);
  };

  return (
    <View style={styles.sliderRow}>
      <View
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={(e) => applyX(e.nativeEvent.locationX)}
        onResponderMove={(e) => applyX(e.nativeEvent.locationX)}
        style={styles.sliderTrack}
        accessibilityRole="adjustable"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(value * 100),
        }}
      >
        <View style={[styles.sliderFill, { width: `${value * 100}%` }]} />
        <View
          style={[styles.sliderThumb, { left: `${value * 100}%` }]}
          pointerEvents="none"
        />
      </View>
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

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, monster, refreshMonster } = useSession();

  const email = session?.user?.email ?? null;

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [timeDigits, setTimeDigits] = useState(
    pad2(DEFAULT_SETTINGS.notificationIntervalHours) +
    pad2(DEFAULT_SETTINGS.notificationIntervalMinutes)
  );
  const [nameDraft, setNameDraft] = useState(monster?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameInputWidth, setNameInputWidth] = useState(0);
  const [busy, setBusy] = useState<"account" | "monster" | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<Settings>;
          const merged: Settings = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            notificationIntervalMinutes:
              typeof parsed.notificationIntervalMinutes === "number"
                ? parsed.notificationIntervalMinutes
                : 0,
          };
          setSettings(merged);
          setTimeDigits(
            pad2(merged.notificationIntervalHours) +
            pad2(merged.notificationIntervalMinutes)
          );
        } catch {
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    setNameDraft(monster?.name ?? "");
  }, [monster?.id, monster?.name]);

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(
          () => { }
        );
        return next;
      });
    },
    []
  );

  const sendTestNotification = useCallback(async () => {
    const message = "notificação placeholder";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") {
        window.alert(message);
      }
      return;
    }
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

  const handleTimeDigitsChange = useCallback((text: string) => {
    setTimeDigits(text.replace(/\D/g, "").slice(0, 4));
  }, []);

  const commitTime = useCallback(() => {
    if (timeDigits.length !== 4) {
      setTimeDigits(
        pad2(settings.notificationIntervalHours) +
        pad2(settings.notificationIntervalMinutes)
      );
      return;
    }
    const h = parseInt(timeDigits.slice(0, 2), 10);
    const m = parseInt(timeDigits.slice(2, 4), 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 99 || m < 0 || m > 59) {
      setTimeDigits(
        pad2(settings.notificationIntervalHours) +
        pad2(settings.notificationIntervalMinutes)
      );
      return;
    }
    setSettings((prev) => {
      const next: Settings = {
        ...prev,
        notificationIntervalHours: h,
        notificationIntervalMinutes: m,
      };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(
        () => { }
      );
      return next;
    });
  }, [
    timeDigits,
    settings.notificationIntervalHours,
    settings.notificationIntervalMinutes,
  ]);

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
    try {
      await updateMonster(monster.id, { name: trimmed });
    } catch (err) {
      setSavingName(false);
      showAlert("Erro", friendlyError(err));
      return;
    }
    setSavingName(false);
    await refreshMonster();
  }, [monster, nameDraft, refreshMonster]);

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
      await deleteMonster(monster.id);
      await refreshMonster();
      router.replace("/pair");
    } catch (err) {
      showAlert("Erro", friendlyError(err));
    } finally {
      setBusy(null);
    }
  }, [busy, monster, refreshMonster, router]);

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
      await deleteAccount();
    } catch (err) {
      showAlert("Erro", friendlyError(err));
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const handleLogOut = useCallback(async () => {
    await unregisterPushToken();
    try {
      await signOut();
    } catch (err) {
      showAlert("Erro", friendlyError(err));
    }
  }, []);

  const trimmedName = nameDraft.trim();
  const showSaveButton =
    savingName ||
    (!!monster && trimmedName.length >= 1 && trimmedName !== monster.name);

  const hoursDisplay = timeDigits.slice(0, 2);
  const minutesDisplay = timeDigits.slice(2, 4);

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
              onPress={() => { }}
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
            label="Horário das perguntas"
          >
            <View style={styles.inputRow}>
              <View style={styles.timeBox}>
                <View pointerEvents="none" style={styles.timeDisplay}>
                  <Text style={styles.timeDigits}>{hoursDisplay}</Text>
                  <Text style={styles.timeColon}> : </Text>
                  <Text style={styles.timeDigits}>{minutesDisplay}</Text>
                </View>
                <TextInput
                  value={timeDigits}
                  onChangeText={handleTimeDigitsChange}
                  onBlur={commitTime}
                  onSubmitEditing={commitTime}
                  keyboardType="number-pad"
                  maxLength={4}
                  style={styles.timeHiddenInput}
                  returnKeyType="done"
                  accessibilityLabel="Horário das perguntas em horas e minutos"
                  autoCorrect={false}
                  autoComplete="off"
                />
              </View>
            </View>
          </SettingRow>

          <SettingRow
            icon={<PencilSimple size={18} color={colors.ink} weight="bold" />}
            label="Nome do Frank"
          >
            <View style={styles.inputRow}>
              <Text
                onLayout={(e) =>
                  setNameInputWidth(Math.ceil(e.nativeEvent.layout.width))
                }
                style={styles.nameMeasure}
                numberOfLines={1}
                pointerEvents="none"
              >
                {nameDraft.length > 0 ? nameDraft : "Frank"}
              </Text>

              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                maxLength={30}
                style={[
                  styles.textInput,
                  {
                    flexGrow: 1,
                    flexShrink: 1,
                    minWidth: Math.max(nameInputWidth + 28, 80),
                  },
                ]}
                placeholder="Frank"
                placeholderTextColor={colors.muted}
                editable={!!monster && !savingName}
                returnKeyType="done"
                onSubmitEditing={saveMonsterName}
              />
              {showSaveButton && (
                <TouchableOpacity
                  onPress={saveMonsterName}
                  disabled={savingName}
                  style={styles.saveBtn}
                  accessibilityRole="button"
                >
                  {savingName ? (
                    <ActivityIndicator size="small" color={colors.ink} />
                  ) : (
                    <Text style={styles.saveBtnText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              )}
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
  timeBox: {
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 104,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  timeDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  timeDigits: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  timeColon: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: "800",
    marginHorizontal: 6,
  },
  timeHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.01,
    color: colors.ink,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 8,
    textAlign: "center",
  },
  nameMeasure: {
    position: "absolute",
    opacity: 0,
    left: 0,
    top: 0,
    fontSize: 15,
    fontWeight: "800",
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
  saveBtnText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
  },
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
