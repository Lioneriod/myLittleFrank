// Componentes no estilo "giz" das artes do app: contorno preto grosso, papel claro e vermelho.
import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors } from "../theme";

const LINE = require("../app/assets/buttons/cropped/Line.png");

type ChalkButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
};

// Imita os botões da barra de navegação: borda preta, filete branco e fundo vermelho.
export function ChalkButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = "primary",
}: ChalkButtonProps) {
  const isDisabled = disabled || loading;
  const secondary = variant === "secondary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.buttonOuter,
        pressed && styles.pressed,
        isDisabled && !loading && styles.disabled,
      ]}
    >
      <View style={[styles.buttonInner, secondary && styles.buttonInnerSecondary]}>
        {loading ? (
          <ActivityIndicator color={secondary ? colors.ink : colors.paper} />
        ) : (
          <Text style={[styles.buttonLabel, secondary && styles.buttonLabelSecondary]}>
            {label}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function ChalkInput({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

export function ChalkCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// A mesma linha de giz que fica acima da barra de navegação.
export function ChalkLine({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.lineWrapper, style]}>
      <Image source={LINE} style={styles.line} resizeMode="stretch" />
    </View>
  );
}

const styles = StyleSheet.create({
  buttonOuter: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 4,
    backgroundColor: colors.ink,
  },
  buttonInner: {
    borderWidth: 2,
    borderColor: colors.paper,
    borderRadius: 2,
    backgroundColor: colors.accent,
    minHeight: 50,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonInnerSecondary: {
    backgroundColor: colors.paper,
  },
  buttonLabel: {
    color: colors.paper,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  buttonLabelSecondary: {
    color: colors.ink,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 2 }],
  },
  disabled: {
    opacity: 0.5,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  input: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 4,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  card: {
    borderWidth: 3,
    borderColor: colors.ink,
    borderRadius: 6,
    backgroundColor: colors.paper,
    padding: 20,
    gap: 16,
  },
  lineWrapper: {
    width: "100%",
  },
  line: {
    width: "100%",
    aspectRatio: 1536 / 20,
  },
});
