import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Monster, monsterAgeInDays } from "../lib/api";
import { colors } from "../theme";

export default function MonsterStats({ monster }: { monster: Monster }) {
  return (
    <View style={styles.card}>
      <Text style={styles.name} numberOfLines={1}>
        {monster.name}
      </Text>
      <Text style={styles.day}>Dia {monsterAgeInDays(monster)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 6,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    transform: [{ rotate: "-2deg" }],
  },
  name: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  day: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "800",
    marginTop: -4,
  },
});
