import { invoke } from "@tauri-apps/api/core";
import { parseColor, toHex } from "./accent";

/**
 * The operating system's accent colour as "#rrggbb", or null when the system does not offer one. It is asked of
 * Rust (the web view's own accent keyword is not the owner's real choice on Windows or macOS).
 */
export async function findSystemAccent(): Promise<string | null> {
  try {
    const color = parseColor(await invoke<string | null>("system_accent"));
    return color ? toHex(color) : null;
  } catch {
    return null;
  }
}
