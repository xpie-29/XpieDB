import desktop from "./platformIcons/desktop.svg";
import gamepad from "./platformIcons/gamepad.svg";
import playstation from "./platformIcons/playstation.svg";
import sega from "./platformIcons/sega.svg";
import steam from "./platformIcons/steam.svg";
import xbox from "./platformIcons/xbox.svg";

/** An icon bundled with the app. `tint` is its colour when icons are shown in colour. `label` is a short caption that tells apart platforms sharing a glyph. */
export type BundledIcon = { url: string; tint: string; label?: string };

/**
 * Icons for the built-in platforms, keyed by platform name. Brand logos come from Simple Icons (CC0) and
 * Font Awesome Free (CC BY 4.0, see THIRD_PARTY_NOTICES.md). Tints come from the owner's colour chart
 * (platform_icon_colors.xlsx) and are fixed, not user-editable. Where no freely licensed logo exists
 * (Nintendo consoles) a generic gamepad is shown with the platform's short name beneath it.
 */
export const bundledIcons: Record<string, BundledIcon> = {
  "Nintendo Entertainment System": { url: gamepad, tint: "#B5121B", label: "NES" },
  "Super Nintendo": { url: gamepad, tint: "#9A8AC8", label: "SNES" },
  "Nintendo 64": { url: gamepad, tint: "#1F9D55", label: "N64" },
  GameCube: { url: gamepad, tint: "#6A5FBB", label: "GC" },
  Wii: { url: gamepad, tint: "#8FD3F4", label: "Wii" },
  "Wii U": { url: gamepad, tint: "#009AC7", label: "Wii U" },
  "Nintendo Switch": { url: gamepad, tint: "#E60012", label: "NS" },
  "Nintendo Switch 2": { url: gamepad, tint: "#FF5F55", label: "NS2" },
  "Nintendo 3DS": { url: gamepad, tint: "#D4145A", label: "3DS" },
  PlayStation: { url: playstation, tint: "#9C9FA5" },
  "PlayStation 2": { url: playstation, tint: "#3B46C4", label: "PS2" },
  "PlayStation 3": { url: playstation, tint: "#5C7FA8", label: "PS3" },
  "PlayStation 4": { url: playstation, tint: "#1450B8", label: "PS4" },
  "PlayStation 5": { url: playstation, tint: "#0070D1", label: "PS5" },
  Xbox: { url: xbox, tint: "#A6D608" },
  "Xbox 360": { url: xbox, tint: "#7AC143", label: "360" },
  "Xbox Series S/X": { url: xbox, tint: "#2FA84F", label: "X|S" },
  Steam: { url: steam, tint: "#66C0F4" },
  PC: { url: desktop, tint: "#00B7C3" },
  Dreamcast: { url: sega, tint: "#F47B20", label: "DC" },
};

/** Only built-in platforms use bundled icons; a custom icon the owner chose always wins elsewhere. */
export const bundledIconFor = (platform: {
  name: string;
  is_builtin: boolean;
}) => (platform.is_builtin ? bundledIcons[platform.name] : undefined);
