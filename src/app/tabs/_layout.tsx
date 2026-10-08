import { Redirect, Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  View,
  Pressable,
  Image,
  ImageSourcePropType,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../../contexts/SessionContext";

// As artes dos botões foram desenhadas como camadas de 1536x2048 (a tela inteira).
// Os PNGs em buttons/cropped são recortes dessas camadas; x/y/w/h guardam onde cada
// recorte ficava na camada original, para a barra ficar igual ao desenho.
const LAYER_WIDTH = 1536;
const BAR_TOP = 1717;
const BAR_BOTTOM = 2048;
const BAR_BACKGROUND_COLOR = "#C7DCC9";

type Piece = { source: ImageSourcePropType; x: number; y: number; w: number; h: number };

const LINE: Piece = {
  source: require("../assets/buttons/cropped/Line.png"),
  x: 0,
  y: 1717,
  w: 1536,
  h: 20,
};

const BUTTONS: Record<string, Piece & { label: string }> = {
  home: {
    label: "Início",
    source: require("../assets/buttons/cropped/BHome.png"),
    x: 26,
    y: 1753,
    w: 339,
    h: 269,
  },
  games: {
    label: "Jogos",
    source: require("../assets/buttons/cropped/BGames.png"),
    x: 409,
    y: 1753,
    w: 338,
    h: 269,
  },
  closet: {
    label: "Armário",
    source: require("../assets/buttons/cropped/BCloset.png"),
    x: 791,
    y: 1753,
    w: 339,
    h: 269,
  },
  profile: {
    label: "Configurações",
    source: require("../assets/buttons/cropped/BConf.png"),
    x: 1173,
    y: 1753,
    w: 339,
    h: 269,
  },
};

function ImageTabBar({ state, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scale = width / LAYER_WIDTH;

  const place = (piece: Piece) => ({
    position: "absolute" as const,
    left: piece.x * scale,
    top: (piece.y - BAR_TOP) * scale,
    width: piece.w * scale,
    height: piece.h * scale,
  });

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={{ width, height: (BAR_BOTTOM - BAR_TOP) * scale }}>
        <Image source={LINE.source} style={place(LINE)} resizeMode="stretch" />
        {state.routes.map((route, index) => {
          const button = BUTTONS[route.name];
          if (!button) return null;
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={button.label}
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              style={({ pressed }) => [place(button), pressed && styles.pressed]}
            >
              <Image source={button.source} style={styles.buttonImage} resizeMode="stretch" />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const { session, monster, loading } = useSession();

  // Sem login ou sem monstrinho, volta para o início do fluxo.
  if (loading) return null;
  if (!session || !monster) return <Redirect href="/" />;

  return (
    <Tabs
      tabBar={(props) => <ImageTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="games" />
      <Tabs.Screen name="closet" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: BAR_BACKGROUND_COLOR,
  },
  buttonImage: {
    width: "100%",
    height: "100%",
  },
  pressed: {
    opacity: 0.7,
    transform: [{ translateY: 2 }],
  },
});
