import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CaretRight,
  ChatsTeardrop,
  DotsThreeCircle,
  Eye,
  PencilSimple,
  SignOut,
  User,
} from "phosphor-react-native";
import { ChalkLine } from "../../components/Chalk";
import { colors } from "../../theme";
// Ajuste o caminho para onde o seu client do Supabase está exportado.
import { supabase } from "../../lib/supabase";

// Nome ainda é placeholder; o e-mail agora vem do Supabase.
const PLACEHOLDER_USER = {
  name: "Nome",
};

type ProfileRowProps = {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
};

function ProfileRow({ icon, label, onPress }: ProfileRowProps) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.rowLeft}>
        <View style={styles.iconBox}>{icon}</View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <CaretRight size={18} color={colors.ink} weight="bold" />
    </TouchableOpacity>
  );
}

export default function Profile() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Busca inicial do usuário autenticado.
    supabase.auth.getUser().then(({ data }) => {
      if (isMounted) {
        setEmail(data.user?.email ?? null);
      }
    });

    // Mantém o e-mail sincronizado com login/logout/refresh.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setEmail(session?.user?.email ?? null);
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleLogOut = async () => {
    if (signingOut) return;
    setSigningOut(true);

    const { error } = await supabase.auth.signOut();

    // O onAuthStateChange acima já vai zerar o email quando a sessão cair.
    if (error) {
      console.warn("Falha ao sair:", error.message);
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerTitle}>
              {/* <ChatsTeardrop size={28} color={colors.accent} weight="duotone" /> */}
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
          {/* <ChalkLine /> */}
        </View>

        <View style={styles.profileInfo}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarPlaceholder}>
              <User size={44} color={colors.ink} weight="duotone" />
            </View>
            {/* <TouchableOpacity
              style={styles.editIcon}
              accessibilityRole="button"
              accessibilityLabel="Edit avatar"
              onPress={() => {}}
            >
              <PencilSimple size={14} color={colors.paper} weight="bold" />
            </TouchableOpacity> */}
          </View>
          <Text style={styles.name}>{PLACEHOLDER_USER.name}</Text>
          <Text style={styles.email}>{email ?? ""}</Text>
        </View>

        {/* <ChalkLine /> */}

        <View style={styles.options}>
          <ProfileRow
            icon={<PencilSimple size={18} color={colors.ink} weight="bold" />}
            label="Editar Perfil"
            onPress={() => {}}
          />

          {/* <ChalkLine /> */}

          {/* <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.iconBox}>
                <Eye size={18} color={colors.ink} weight="bold" />
              </View>
              <Text style={styles.rowLabel}>Dark Theme</Text>
            </View>
            <Switch
              value={darkTheme}
              onValueChange={() => setDarkTheme(!darkTheme)}
              trackColor={{ false: colors.muted, true: colors.accent }}
              thumbColor={colors.paper}
              ios_backgroundColor={colors.muted}
            />
          </View> */}

          <ProfileRow
            icon={<SignOut size={18} color={colors.accent} weight="bold" />}
            label="Log Out"
            onPress={handleLogOut}
          />
        </View>
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
  editIcon: {
    position: "absolute",
    bottom: -2,
    right: -2,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 8,
    padding: 5,
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
    gap: 12,
    // Empurra o bloco para o final da tela.
    marginTop: "auto",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    gap: 12,
  },
  rowLeft: {
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
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 4,
  },
  rowLabel: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
  },
});