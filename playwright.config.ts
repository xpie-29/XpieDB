import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/ui",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:1421", channel: process.platform === "win32" ? "msedge" : undefined },
  webServer: {
    command: "npm run dev -- --port 1421 --strictPort",
    url: "http://127.0.0.1:1421",
    reuseExistingServer: false,
  },
});
