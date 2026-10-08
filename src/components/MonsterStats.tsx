import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Monster, monsterAgeInDays } from "../lib/supabase";
import { colors } from "../theme";

// Placa com os dados do monstrinho. As barras vão de 0 (precisa de cuidado) a 100 (satisfeito).
export default function MonsterStats({ monster }: { monster: Monster }) {
  return (
    <View style={styles.card}>
      <Text style={styles.name} numberOfLines={1}>
        {monster.name}
      </Text>
      <Text style={styles.day}>Dia {monsterAgeInDays(monster)}</Text>
      <StatBar label="Fome" value={monster.hunger} />
      <StatBar label="Sede" value={monster.thirst} />
      <StatBar label="Carinho" value={monster.affection} />
    </View>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const percent = Math.max(0, Math.min(100, value));

  return (
    <View
      style={styles.stat}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%` }]} />
      </View>
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
  stat: {
    gap: 2,
  },
  statLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
  },
  track: {
    height: 12,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 6,
    backgroundColor: colors.paper,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
});
