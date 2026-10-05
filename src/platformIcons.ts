import desktop from "./platformIcons/desktop.svg";
import gamepad from "./platformIcons/gamepad.svg";
import playstation from "./platformIcons/playstation.svg";
import sega from "./platformIcons/sega.svg";
import steam from "./platformIcons/steam.svg";
import xbox from "./platformIcons/xbox.svg";

/** An icon bundled with the app. `label` is a short caption that tells apart platforms sharing a glyph. */
export type BundledIcon = { url: string; label?: string };

/**
 * Icons for the built-in platforms, keyed by platform name. Brand logos come from Simple Icons (CC0) and
 * Font Awesome Free (CC BY 4.0, see THIRD_PARTY_NOTICES.md). Where no freely licensed logo exists
 * (Nintendo consoles) a generic gamepad is shown with the platform's short name beneath it.
 */
export const bundledIcons: Record<string, BundledIcon> = {
  "Nintendo Entertainment System": { url: gamepad, label: "NES" },
  "Super Nintendo": { url: gamepad, label: "SNES" },
  "Nintendo 64": { url: gamepad, label: "N64" },
  GameCube: { url: gamepad, label: "GC" },
  Wii: { url: gamepad, label: "Wii" },
  "Wii U": { url: gamepad, label: "Wii U" },
  "Nintendo Switch": { url: gamepad, label: "NS" },
  "Nintendo Switch 2": { url: gamepad, label: "NS2" },
  "Nintendo 3DS": { url: gamepad, label: "3DS" },
  PlayStation: { url: playstation },
  "PlayStation 2": { url: playstation, label: "PS2" },
  "PlayStation 3": { url: playstation, label: "PS3" },
  "PlayStation 4": { url: playstation, label: "PS4" },
  "PlayStation 5": { url: playstation, label: "PS5" },
  Xbox: { url: xbox },
  "Xbox 360": { url: xbox, label: "360" },
  "Xbox Series S/X": { url: xbox, label: "X|S" },
  Steam: { url: steam },
  PC: { url: desktop },
  Dreamcast: { url: sega, label: "DC" },
};

/** Only built-in platforms use bundled icons; a custom icon the owner chose always wins elsewhere. */
export const bundledIconFor = (platform: {
  name: string;
  is_builtin: boolean;
}) => (platform.is_builtin ? bundledIcons[platform.name] : undefined);
