import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useSyncExternalStore } from "react";
import { Image, StyleSheet, useWindowDimensions, View } from "react-native";
import { DEFAULT_FRANK_PARTS, FrankPartKey, FrankParts, resolveFrankSource } from "./frankAssets";
import { flush, frankStore } from "./frankStore";

export { DEFAULT_FRANK_PARTS };
export type { FrankPartKey, FrankParts };

export type FrankPlacement = {
  bottomAnchorRatio: number;
  left: number;
};

export const FRANK_PLACEMENTS = {
  default: { bottomAnchorRatio: 0.10, left: 0.5 },
} as const satisfies Record<string, FrankPlacement>;

export type FrankBox = {
  centerX: number;
  feetY: number;
  width: number;
};

export type FrankPlacementName = keyof typeof FRANK_PLACEMENTS;

export type FrankHandle = {
  setPart: <K extends FrankPartKey>(key: K, value: FrankParts[K]) => void;
  setParts: (next: Partial<FrankParts>) => void;
  getParts: () => FrankParts;
  save: () => Promise<void>;
};

const FRANK_BASE_WIDTH = 64 * 9 + 16 * 3;
const FRANK_BASE_HEIGHT = 64 * 12 + 16 * 4;
const FRANK_FEET_RATIO = 1590 / 2048;

const FRANK_MAX_WIDTH_RATIO = 1;
const FRANK_MAX_HEIGHT_RATIO = FRANK_MAX_WIDTH_RATIO * 3 / 4; 

function computeFrankSize(screenWidth: number, screenHeight: number) {
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

type Props = {
  monsterId: string;
  placement?: FrankPlacementName | FrankPlacement;
  box?: FrankBox;
};

function resolvePlacement(p: FrankPlacementName | FrankPlacement | undefined): FrankPlacement {
  if (!p) return FRANK_PLACEMENTS.default;
  if (typeof p === "string") return FRANK_PLACEMENTS[p];
  return p;
}

const Frank = forwardRef<FrankHandle, Props>(({ monsterId, placement, box }, ref) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { bottomAnchorRatio, left: leftAnchorRatio } = resolvePlacement(placement);

  const { width: frankWidth, height: frankHeight } = box
    ? { width: box.width, height: (box.width * FRANK_BASE_HEIGHT) / FRANK_BASE_WIDTH }
    : computeFrankSize(screenWidth, screenHeight);

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

  const position = box
    ? { left: box.centerX - frankWidth / 2, top: box.feetY - frankHeight * FRANK_FEET_RATIO }
    : { left: screenWidth * leftAnchorRatio - frankWidth / 2, bottom: screenHeight * bottomAnchorRatio };

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
      style={[styles.container, position, { width: frankWidth, height: frankHeight }]}
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
