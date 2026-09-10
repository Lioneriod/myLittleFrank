import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  View,
  Pressable,
  Image,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_NAV_IMAGE = require("../assets/tabNav.jpg");
const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 257;
const IMAGE_BACKGROUND_COLOR = "#C7DCC9";
const HOTSPOTS = [
  { left: 118 / IMAGE_WIDTH, right: 320 / IMAGE_WIDTH },
  { left: 363 / IMAGE_WIDTH, right: 567 / IMAGE_WIDTH },
  { left: 623 / IMAGE_WIDTH, right: 833 / IMAGE_WIDTH },
  { left: 877 / IMAGE_WIDTH, right: 1089 / IMAGE_WIDTH },
];
const HOTSPOT_TOP = 25 / IMAGE_HEIGHT;
const HOTSPOT_BOTTOM = 236 / IMAGE_HEIGHT;

function ImageTabBar({ state, navigation }: BottomTabBarProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const barHeight = width * (IMAGE_HEIGHT / IMAGE_WIDTH);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <View style={{ width, height: barHeight }}>
        <Image
          source={TAB_NAV_IMAGE}
          style={{ width, height: barHeight }}
          resizeMode="stretch"
        />
        {state.routes.map((route, index) => {
          const hotspot = HOTSPOTS[index];
          if (!hotspot) return null;
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
              accessibilityState={isFocused ? { selected: true } : {}}
              onPress={onPress}
              style={[
                styles.hotspot,
                {
                  left: hotspot.left * width,
                  width: (hotspot.right - hotspot.left) * width,
                  top: HOTSPOT_TOP * barHeight,
                  height: (HOTSPOT_BOTTOM - HOTSPOT_TOP) * barHeight,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
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
    backgroundColor: IMAGE_BACKGROUND_COLOR,
  },
  hotspot: {
    position: "absolute",
  },
});
