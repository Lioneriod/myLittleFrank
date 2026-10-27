import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useSyncExternalStore } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { DEFAULT_FRANK_PARTS, FrankPartKey, FrankParts, resolveFrankSource } from "./frankAssets";
import { flush, frankStore } from "./frankStore";

export { DEFAULT_FRANK_PARTS };
export type { FrankPartKey, FrankParts };

/* ----------------------------- placement ----------------------------- */

export type FrankPlacement = {
  /** 0..1 of screen height. 0 = flush with bottom, 1 = top. Anchors the model's bottom edge. */
  bottomAnchorRatio: number;
  /** 0..1 of screen width. 0.5 = horizontally centered. Anchors the model's horizontal center. */
  left: number;
};

// lista de lugares do frank para cada tela do app
export const FRANK_PLACEMENTS = {
  default: { bottomAnchorRatio: 0.10, left: 0.5},
  home: { bottomAnchorRatio: 0.06, left: 0.5},
  closet: { bottomAnchorRatio: 0.02, left: 0.7},
} as const satisfies Record<string, FrankPlacement>;

export type FrankPlacementName = keyof typeof FRANK_PLACEMENTS;

/* ------------------------------- handle ------------------------------ */

export type FrankHandle = {
  setPart: <K extends FrankPartKey>(key: K, value: FrankParts[K]) => void;
  setParts: (next: Partial<FrankParts>) => void;
  getParts: () => FrankParts;
  save: () => Promise<void>;
};

const FRANK_WIDTH = (64 * 9 + 16 * 3);
const FRANK_HEIGHT = (64 * 12 + 16 * 4);

/* ------------------------------ component ---------------------------- */

type Props = {
  monsterId: string;
  /** Named preset OR explicit placement. Defaults to the "default" preset. */
  placement?: FrankPlacementName | FrankPlacement;
};

function resolvePlacement(p: FrankPlacementName | FrankPlacement | undefined): FrankPlacement {
  if (!p) return FRANK_PLACEMENTS.default;
  if (typeof p === "string") return FRANK_PLACEMENTS[p];
  return p;
}

const Frank = forwardRef<FrankHandle, Props>(({ monsterId, placement }, ref) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { bottomAnchorRatio, left: leftAnchorRatio } = resolvePlacement(placement);

  useEffect(() => {
    void frankStore.hydrate(monsterId);
  }, [monsterId]);

  const parts = useSyncExternalStore(
    useCallback((cb) => frankStore.subscribe(monsterId, cb), [monsterId]),
    useCallback(() => frankStore.getSnapshot(monsterId).parts, [monsterId]),
  );

  useImperativeHandle(
    ref,
    () => ({
      setPart: (key, value) => frankStore.setPart(monsterId, key, value),
      setParts: (next) => frankStore.setParts(monsterId, next),
      getParts: () => frankStore.getSnapshot(monsterId).parts,
      save: () => flush(monsterId),
    }),
    [monsterId],
  );

  // Anchors the *center* of Frank horizontally and the *bottom* vertically.
  const left = screenWidth * leftAnchorRatio - FRANK_WIDTH / 2;
  const bottom = screenHeight * bottomAnchorRatio;

  return (
    <View
      pointerEvents="none"
      style={[styles.container, { left, bottom, width: FRANK_WIDTH, height: FRANK_HEIGHT }]}
    >
      <Image source={resolveFrankSource(parts.skin)} style={styles.layer} resizeMode="contain" />
      <Image source={resolveFrankSource(parts.currentBottom)} style={styles.layer} resizeMode="contain" />
      <Image source={resolveFrankSource(parts.currentTop)} style={styles.layer} resizeMode="contain" />
      <Image source={resolveFrankSource(parts.currentHat)} style={styles.layer} resizeMode="contain" />
    </View>
  );
});

export default Frank;

const styles = StyleSheet.create({
  container: { position: "absolute" },
  layer: { ...StyleSheet.absoluteFillObject, width: FRANK_WIDTH, height: FRANK_HEIGHT },
});

