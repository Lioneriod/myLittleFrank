import React, { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Image,
  ImageBackground,
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

/** Rectangle of the closet in the ORIGINAL background image, in original pixels. */
const CLOSET_RECT_ORIG = { x: 68, y: 184, w: 484, h: 944 } as const;

const BACKGROUND = require("../assets/bgs/telaArmario.jpg");

const TOTAL_SLOTS = 9; // 32

/**
 * Per-category preview config for the closet grid.
 *
 * Every sprite is laid out on the same 624×832 canvas, but the *visible*
 * content only occupies a slice of it (hats ≈ full height, tops ≈ upper-middle,
 * bottoms ≈ lower half). The grid clips whatever overflows `cellInner`, so each
 * category needs its own zoom + vertical compensation to make its visible
 * region fill / centre in the cell.
 *
 *   scale         — zoom on top of the shared 200% baseline (`styles.cellImage`).
 *   shiftUpRatio  — move the sprite UP by this fraction of its own *visible*
 *                   height (relative to the rendered sprite, not the cell).
 *                   Use this to cancel out empty padding above the content
 *                   (tops and bottoms both have content biased downward on the
 *                   sprite canvas, hence they need a positive shift).
 */
const CATEGORY_PREVIEW: Record<
  FrankPartKey,
  { scale: number; shiftUpRatio?: number }
> = {
  skin: { scale: 1 },
  currentHat: { scale: 1 },
  currentTop: { scale: 1.5, shiftUpRatio: 0.10 },
  currentBottom: { scale: 1.6, shiftUpRatio: 0.20 },
};

/** Every asset path, then pad with nulls up to 32 slots. */
const GRID_SLOTS: (string | null)[] = (() => {
  // Skins are managed elsewhere (character picker), so they don't belong in the closet.
  const paths = Object.keys(FRANK_ASSET_REGISTRY).filter(
    (path) => !path.startsWith("frank/skin/"),
  );
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => paths[i] ?? null);
})();

/** Derive which part a path belongs to, from its folder name. */
const CATEGORY_MAP: Array<[prefix: string, key: FrankPartKey]> = [
  ["frank/skin/", "skin"],
  ["frank/hats/", "currentHat"],
  ["frank/tops/", "currentTop"],
  ["frank/bottoms/", "currentBottom"],
];

function categorize(path: string): FrankPartKey | null {
  return CATEGORY_MAP.find(([prefix]) => path.startsWith(prefix))?.[1] ?? null;
}

/* -------------------- grid geometry (mirrors the styles) -------------------- */

/**
 * The grid layout in logical pixels. Kept in one place so the shift math stays
 * in sync with the styles — if you change `popup.padding`, `cell.padding`, or
 * the `width: "33%"` cell, update the constants below too.
 */
const POPUP_WIDTH_RATIO = 0.9;
const POPUP_PADDING = 16;
const GRID_COLS = 3;          // matches `cell: { width: "33%" }`
const CELL_PADDING = 2;       // matches `cell: { padding: 2 }`
const CELL_IMAGE_RATIO = 2;   // matches `cellImage: { width/height: "200%" }`

function computeCellInnerHeight(screenWidth: number) {
  const popupContentWidth = screenWidth * POPUP_WIDTH_RATIO - POPUP_PADDING * 2;
  const cellWidth = popupContentWidth / GRID_COLS;
  // aspectRatio: 1 → cell height === cell width; cellInner fills cell minus padding.
  return cellWidth - CELL_PADDING * 2;
}

export default function Closet() {
  const { width, height } = useWindowDimensions();
  const { monster } = useSession();
  const frank = useRef<FrankHandle>(null);
  const [closetOpen, setClosetOpen] = useState(false);

  const monsterId = monster?.id;

  // Live subscribe to the same store Frank reads from, so the grid
  // re-renders the instant a part changes (no need to close the modal).
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

  const rect = useMemo(() => {
    const scaleX = width / BACKGROUND.width;
    const scaleY = height / BACKGROUND.height;
    return {
      left: CLOSET_RECT_ORIG.x * scaleX,
      top: CLOSET_RECT_ORIG.y * scaleY,
      width: CLOSET_RECT_ORIG.w * scaleX,
      height: CLOSET_RECT_ORIG.h * scaleY,
    };
  }, [width, height]);

  // Height of a single sprite layer at its *layout* size (before any transform).
  // The Image is 200% of cellInner and `contain` makes the sprite fill that
  // height edge-to-edge, so this equals the sprite's visible height at scale 1.
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
    <ImageBackground
      source={BACKGROUND}
      style={[styles.background, { width, height }]}
      resizeMode="stretch"
    >
      {monster && <Frank ref={frank} monsterId={monster.id} placement="closet" />}

      <Pressable
        onPress={openCloset}
        accessibilityRole="button"
        accessibilityLabel="Open closet"
        hitSlop={8}
        style={[styles.closet, rect]}
      />

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
            {/* <Text style={styles.title}>Closet</Text> */}

            <ScrollView
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator
            >
              <View style={styles.grid}>
                {GRID_SLOTS.map((path, i) => {
                  const key = path ? categorize(path) : null;
                  const equipped = !!(path && key && parts && parts[key] === path);
                  const preview = key ? CATEGORY_PREVIEW[key] : null;

                  // Shift up by `shiftUpRatio × visible sprite height`.
                  //
                  // transform order in RN: [{ scale }, { translateY }] composes
                  // as S × T, so the translate is applied in the *unscaled*
                  // coordinate frame and ends up scaled by `s` on screen.
                  // We therefore pass `-ratio × spriteLayoutHeight` (no `s`
                  // factor): the on-screen shift becomes
                  //   s × ratio × spriteLayoutHeight  =  ratio × visibleSpriteHeight
                  // which is exactly "relative to the item's own height".
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { position: "absolute", top: 0, left: 0 },
  closet: {
    position: "absolute",
    // backgroundColor: "rgba(0, 200, 0, 0.5)",
  },

  /* ---- modal ---- */
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

  /* ---- popup ---- */
  popup: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: POPUP_PADDING,
    overflow: "hidden",
  },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 12, left: 8 },
  gridContent: { paddingBottom: 8 },

  /* ---- grid ---- */
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