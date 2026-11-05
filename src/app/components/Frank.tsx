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
  default: { bottomAnchorRatio: 0.10, left: 0.5 },
  home: { bottomAnchorRatio: 0.06, left: 0.5 },
  closet: { bottomAnchorRatio: 0.02, left: 0.7 },
} as const satisfies Record<string, FrankPlacement>;

export type FrankPlacementName = keyof typeof FRANK_PLACEMENTS;

/* ------------------------------- handle ------------------------------ */

export type FrankHandle = {
  setPart: <K extends FrankPartKey>(key: K, value: FrankParts[K]) => void;
  setParts: (next: Partial<FrankParts>) => void;
  getParts: () => FrankParts;
  save: () => Promise<void>;
};

/* ------------------------------ sizing ------------------------------- */

/** Intrinsic model size (the sprite grid + padding). */
const FRANK_BASE_WIDTH = 64 * 9 + 16 * 3;   // 624
const FRANK_BASE_HEIGHT = 64 * 12 + 16 * 4; // 832

/**
 * Tuning knobs. Frank scales uniformly (aspect ratio preserved) to the
 * smaller of these two budgets, so he can never exceed either one.
 * Raise to make Frank bigger, lower to make him smaller.
 */
const FRANK_MAX_WIDTH_RATIO = 1;
const FRANK_MAX_HEIGHT_RATIO = FRANK_MAX_WIDTH_RATIO * 3 / 4; 

function computeFrankSize(screenWidth: number, screenHeight: number) {
  // useWindowDimensions can briefly report 0 on mount in some environments.
  // Falling back to a sane reference size keeps Frank visible (not 0×0) until real dims arrive.
  const w = screenWidth > 0 ? screenWidth : 390;
  const h = screenHeight > 0 ? screenHeight : 844;

  const scale = Math.min(
    (w * FRANK_MAX_WIDTH_RATIO) / FRANK_BASE_WIDTH,
    (h * FRANK_MAX_HEIGHT_RATIO) / FRANK_BASE_HEIGHT,
  );

  return {
    width: FRANK_BASE_WIDTH * scale,
    height: FRANK_BASE_HEIGHT * scale,
  };
}

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

  const { width: frankWidth, height: frankHeight } = computeFrankSize(screenWidth, screenHeight);

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
  const left = screenWidth * leftAnchorRatio - frankWidth / 2;
  const bottom = screenHeight * bottomAnchorRatio;

  // Explicit width/height on every layer — don't rely on absoluteFillObject alone,
  // which can collapse when the parent has non-integer float dimensions.
  const layerStyle = {
    position: "absolute" as const,
    top: 0,
    left: 0,
    width: frankWidth,
    height: frankHeight,
  };

  return (
    <View
      pointerEvents="none"
      style={[styles.container, { left, bottom, width: frankWidth, height: frankHeight }]}
    >
      <Image source={resolveFrankSource(parts.skin)} style={layerStyle} resizeMode="contain" />
      <Image source={resolveFrankSource(parts.currentBottom)} style={layerStyle} resizeMode="contain" />
      <Image source={resolveFrankSource(parts.currentTop)} style={layerStyle} resizeMode="contain" />
      <Image source={resolveFrankSource(parts.currentHat)} style={layerStyle} resizeMode="contain" />
    </View>
  );
});

export default Frank;

const styles = StyleSheet.create({
  container: { position: "absolute" },
});
