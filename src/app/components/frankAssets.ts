import { ImageSourcePropType } from "react-native";

export type FrankPartKey = "skin" | "currentHat" | "currentTop" | "currentBottom";

/** Every part is an image *path* (a string). */
export type FrankParts = Record<FrankPartKey, string>;

/**
 * Metro requires literal require() calls, so bundled assets must be listed here.
 * The key IS the path that gets persisted to the DB.
 */

export const FRANK_ASSET_REGISTRY: Record<string, ImageSourcePropType> = {
  "frank/skin/default.png": require("../assets/frank/FrankDefault.png"),
  "frank/bottoms/Blackpants.png": require("../assets/clothes/bottoms/ClothesBlackpants.png"),
  "frank/bottoms/Heartpants.png": require("../assets/clothes/bottoms/ClothesHeartpants.png"),
  "frank/hats/HairHeart.png": require("../assets/clothes/hats/ClothesHairHeart.png"),
  "frank/hats/HairTeto.png": require("../assets/clothes/hats/ClothesHairTeto.png"),
  "frank/tops/RedDress.png": require("../assets/clothes/tops/ClothesRedDress.png"),
  "frank/tops/HeartShirt.png": require("../assets/clothes/tops/ClothesHeartShirt.png"),
  "frank/tops/WhiteShirt.png": require("../assets/clothes/tops/ClothesWhiteshirt.png"),
};

/** Starting defaults. Persisted the first time the member row is written. */
export const DEFAULT_FRANK_PARTS: FrankParts = {
  skin: "frank/skin/default.png",
  currentHat: "",
  currentTop: "",
  currentBottom: "",
};

const PART_KEYS = Object.keys(DEFAULT_FRANK_PARTS) as FrankPartKey[];

/** Never throws: unknown/missing/corrupt values fall back to defaults. */
export function sanitizeFrankParts(input: unknown): FrankParts {
  const out: FrankParts = { ...DEFAULT_FRANK_PARTS };
  if (input && typeof input === "object") {
    for (const key of PART_KEYS) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === "string" && value.length > 0 && value.length <= 512) {
        out[key] = value;
      }
    }
  }
  return out;
}

/** Path → something <Image source> accepts. Remote URLs work too. */
export function resolveFrankSource(path: string | undefined | null): ImageSourcePropType | undefined {
  if (!path) return undefined;
  const bundled = FRANK_ASSET_REGISTRY[path];
  if (bundled) return bundled;
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return { uri: path };
  return undefined;
}