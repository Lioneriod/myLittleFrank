import React from "react";
import { ImageBackground, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSession } from "../../contexts/SessionContext";
import MonsterStats from "../../components/MonsterStats";

export default function Home() {
  const { width, height } = useWindowDimensions();
  const { monster } = useSession();

  return (
    <ImageBackground
      source={require("../assets/bgs/telaPrincipal.jpg")}
      style={[styles.background, { width, height }]}
      resizeMode="stretch"
    >
      {monster && (
        // Na parede vazia à esquerda, entre o calendário e o chão.
        <View style={[styles.statsSlot, { top: height * 0.3, left: width * 0.05, width: width * 0.42 }]}>
          <MonsterStats monster={monster} />
        </View>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  statsSlot: {
    position: "absolute",
  },
});
