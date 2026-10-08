import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useSession } from "../contexts/SessionContext";
import { ChalkButton } from "../components/Chalk";
import { colors } from "../theme";

// Decide para onde o usuário vai: login -> código do monstrinho -> tela inicial.
export default function Index() {
  const { session, monster, loading, error, refreshMonster } = useSession();
  const [retrying, setRetrying] = useState(false);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;

  if (error) {
    const retry = async () => {
      setRetrying(true);
      await refreshMonster();
      setRetrying(false);
    };

    return (
      <View style={styles.screen}>
        <Text style={styles.message}>{error}</Text>
        <ChalkButton label="Tentar de novo" onPress={retry} loading={retrying} />
      </View>
    );
  }

  if (!monster) return <Redirect href="/pair" />;

  return <Redirect href="/tabs/home" />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "stretch",
    justifyContent: "center",
    padding: 32,
    gap: 20,
  },
  message: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
});
