import React, { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Frank, { type FrankHandle, type FrankPartKey } from "../components/Frank";
import { FRANK_ASSET_REGISTRY, resolveFrankSource } from "../components/frankAssets";
import { frankStore } from "../components/frankStore";
import { useSession } from "../../contexts/SessionContext";
import Scene, { type SceneArt, type SceneRect } from "../../components/Scene";

const CLOSET_ART: SceneArt = {
  source: require("../assets/bgs/telaArmario.jpg"),
  width: 1200,
  height: 3158,
  anchorY: 3000,
  anchorTo: 1,
};

const CLOSET_SPOT: SceneRect = { x: 68, y: 1828, w: 484, h: 944 };
const FRANK_FEET = { x: 840, y: 2919 };

const TOTAL_SLOTS = 9;

const CATEGORY_PREVIEW: Record<
  FrankPartKey,
  { scale: number; shiftUpRatio?: number }
> = {
  skin: { scale: 1 },
  currentHat: { scale: 1 },
  currentTop: { scale: 1.5, shiftUpRatio: 0.10 },
  currentBottom: { scale: 1.6, shiftUpRatio: 0.20 },
};

const GRID_SLOTS: (string | null)[] = (() => {
  const paths = Object.keys(FRANK_ASSET_REGISTRY).filter(
    (path) => !path.startsWith("frank/skin/"),
  );
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => paths[i] ?? null);
})();

const CATEGORY_MAP: Array<[prefix: string, key: FrankPartKey]> = [
  ["frank/skin/", "skin"],
  ["frank/hats/", "currentHat"],
  ["frank/tops/", "currentTop"],
  ["frank/bottoms/", "currentBottom"],
];

function categorize(path: string): FrankPartKey | null {
  return CATEGORY_MAP.find(([prefix]) => path.startsWith(prefix))?.[1] ?? null;
}

const POPUP_WIDTH_RATIO = 0.9;
const POPUP_PADDING = 16;
const GRID_COLS = 3;
const CELL_PADDING = 2;
const CELL_IMAGE_RATIO = 2;

function computeCellInnerHeight(screenWidth: number) {
  const popupContentWidth = screenWidth * POPUP_WIDTH_RATIO - POPUP_PADDING * 2;
  const cellWidth = popupContentWidth / GRID_COLS;
  return cellWidth - CELL_PADDING * 2;
}

export default function Closet() {
  const { width, height } = useWindowDimensions();
  const { monster } = useSession();
  const frank = useRef<FrankHandle>(null);
  const [closetOpen, setClosetOpen] = useState(false);

  const monsterId = monster?.id;

  const parts = useSyncExternalStore(
    useCallback(
      (cb) => (monsterId ? frankStore.subscribe(monsterId, cb) : () => { }),
      [monsterId],
    ),
    useCallback(
      () => (monsterId ? frankStore.getSnapshot(monsterId).parts : null),
      [monsterId],
    ),
  );

  const spriteLayoutHeight = useMemo(
    () => computeCellInnerHeight(width) * CELL_IMAGE_RATIO,
    [width],
  );

  const openCloset = useCallback(() => setClosetOpen(true), []);
  const closeCloset = useCallback(() => setClosetOpen(false), []);

  const handleItemPress = useCallback((path: string) => {
    const key = categorize(path);
    if (!key || !frank.current) return;
    const current = frank.current.getParts()[key];
    frank.current.setPart(key, current === path ? "" : path);
  }, []);

  return (
    <>
      <Scene art={CLOSET_ART}>
        {(scene) => {
          const feet = scene.point(FRANK_FEET.x, FRANK_FEET.y);
          return (
            <>
              {monster && (
                <Frank
                  ref={frank}
                  monsterId={monster.id}
                  box={{ centerX: feet.x, feetY: feet.y, width: CLOSET_ART.width * scene.scale }}
                />
              )}

              <Pressable
                onPress={openCloset}
                accessibilityRole="button"
                accessibilityLabel="Open closet"
                hitSlop={8}
                style={[styles.closet, scene.rect(CLOSET_SPOT)]}
              />
            </>
          );
        }}
      </Scene>

      <Modal
        visible={closetOpen}
        transparent
        animationType="fade"
        onRequestClose={closeCloset}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeCloset}
            accessibilityRole="button"
            accessibilityLabel="Dismiss closet"
          />

          <Pressable
            onPress={closeCloset}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close closet"
            style={styles.backButton}
          >
            <View style={styles.chevron} />
          </Pressable>

          <View style={[styles.popup, { width: width * POPUP_WIDTH_RATIO, height: height * 0.75 }]}>

            <ScrollView
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator
            >
              <View style={styles.grid}>
                {GRID_SLOTS.map((path, i) => {
                  const key = path ? categorize(path) : null;
                  const equipped = !!(path && key && parts && parts[key] === path);
                  const preview = key ? CATEGORY_PREVIEW[key] : null;

                  const shiftY = preview?.shiftUpRatio
                    ? -preview.shiftUpRatio * spriteLayoutHeight
                    : 0;
                  const shiftX = preview?.shiftUpRatio
                    ? 4
                    : 2;

                  return (
                    <View key={i} style={styles.cell}>
                      {path ? (
                        <Pressable
                          onPress={() => handleItemPress(path)}
                          accessibilityRole="button"
                          accessibilityLabel={path}
                          accessibilityState={{ selected: equipped }}
                          style={[
                            styles.cellInner,
                            equipped && styles.cellInnerEquipped,
                          ]}
                        >
                          <Image
                            source={resolveFrankSource(path)}
                            style={[
                              styles.cellImage,
                              preview && {
                                transform: [
                                  { scale: preview.scale },
                                  { translateY: shiftY },
                                  { translateX: shiftX },
                                ],
                              },
                            ]}
                            resizeMode="contain"
                          />
                        </Pressable>
                      ) : (
                        <View style={[styles.cellInner, styles.cellEmpty]} />
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  closet: {
    position: "absolute",
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    top: 48,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  chevron: {
    width: 14,
    height: 14,
    borderLeftWidth: 3,
    borderBottomWidth: 3,
    borderColor: "red",
    transform: [{ rotate: "45deg" }],
    marginLeft: 4,
  },

  popup: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: POPUP_PADDING,
    overflow: "hidden",
  },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 12, left: 8 },
  gridContent: { paddingBottom: 8 },

  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "33%", aspectRatio: 1, padding: CELL_PADDING },
  cellInner: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cellInnerEquipped: {
    backgroundColor: "rgba(80, 200, 100, 0.35)",
    borderColor: "#3cc85a",
    borderWidth: 2,
  },
  cellEmpty: { backgroundColor: "rgba(0,0,0,0.03)" },
  cellImage: {
    width: `${CELL_IMAGE_RATIO * 100}%`,
    height: `${CELL_IMAGE_RATIO * 100}%`,
  },
});