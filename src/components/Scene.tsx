import React, { useCallback, useMemo, useState } from "react";
import { Image, ImageSourcePropType, LayoutChangeEvent, StyleSheet, View } from "react-native";
import { colors } from "../theme";

export type SceneArt = {
  source: ImageSourcePropType;
  width: number;
  height: number;
  anchorY: number;
  anchorTo: number;
};

export type SceneRect = { x: number; y: number; w: number; h: number };

export type SceneLayout = {
  scale: number;
  rect: (r: SceneRect) => { left: number; top: number; width: number; height: number };
  point: (x: number, y: number) => { x: number; y: number };
};

type Size = { width: number; height: number };

export default function Scene({
  art,
  children,
}: {
  art: SceneArt;
  children?: (layout: SceneLayout) => React.ReactNode;
}) {
  const [size, setSize] = useState<Size | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const layout = useMemo<(SceneLayout & { imageTop: number }) | null>(() => {
    if (!size || size.width === 0) return null;
    const scale = size.width / art.width;
    const imageTop = size.height * art.anchorTo - art.anchorY * scale;
    return {
      scale,
      imageTop,
      rect: (r) => ({
        left: r.x * scale,
        top: imageTop + r.y * scale,
        width: r.w * scale,
        height: r.h * scale,
      }),
      point: (x, y) => ({ x: x * scale, y: imageTop + y * scale }),
    };
  }, [size, art]);

  return (
    <View style={styles.container} onLayout={onLayout}>
      {layout && size && (
        <>
          <Image
            source={art.source}
            style={{
              position: "absolute",
              left: 0,
              top: layout.imageTop,
              width: size.width,
              height: art.height * layout.scale,
            }}
          />
          {children?.(layout)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: colors.background,
  },
});
