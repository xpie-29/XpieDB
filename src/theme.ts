import { createDarkTheme, type BrandVariants } from "@fluentui/react-components";
import { brandRamp } from "./accent";

/** The app's dark theme with the given highlight colour (any CSS hex colour). */
export const themeFor = (accent: string) =>
  createDarkTheme(brandRamp(accent) as unknown as BrandVariants);
