import React from "react";
import { ImageBackground, StyleSheet, useWindowDimensions } from "react-native";

export default function Closet() {
  const { width, height } = useWindowDimensions();

  return (
    <ImageBackground
      source={require("../assets/telaArmario.jpg")}
      style={[styles.background, { width, height }]}
      resizeMode="stretch"
    />
  );
}

const styles = StyleSheet.create({
  background: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});
