import { lazy, Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Spinner } from "@fluentui/react-components";
import {
  Grid20Regular,
  Add20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import type { Game, Platform, Preferences } from "./types";
import { Library } from "./components/Library";
const GameForm = lazy(() =>
  import("./components/GameForm").then((m) => ({ default: m.GameForm })),
);
import { GameDetail } from "./components/GameDetail";
import { PlatformManager } from "./components/PlatformManager";
import { Confirm } from "./components/Shared";
export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    library_view: "grid",
    cover_size: "medium",
  });
  const [view, setView] = useState<
    "library" | "detail" | "add" | "edit" | "settings"
  >("library");
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dataPath, setDataPath] = useState("");
  const refresh = async () => {
    const [g, p] = await Promise.all([
      invoke<Game[]>("list_games"),
      invoke<Platform[]>("list_platforms"),
    ]);
    setGames(g);
    setPlatforms(p);
  };
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      await refresh();
      setPreferences(await invoke<Preferences>("get_preferences"));
      const data = await invoke<{ appDataDir: string }>("get_app_data_info");
      setDataPath(data.appDataDir);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const open = async (id: number) => {
    setError("");
    try {
      setGame(await invoke<Game>("get_game", { id }));
      setView("detail");
    } catch (e) {
      setError(String(e));
    }
  };
  const editing = view === "add" || view === "edit";
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">GameVault</div>
        <nav aria-label="Primary">
          <Button
            disabled={editing}
            appearance={
              view === "library" || view === "detail" ? "primary" : "subtle"
            }
            icon={<Grid20Regular />}
            onClick={() => {
              setView("library");
              setError("");
            }}
          >
            Library
          </Button>
          <Button
            disabled={editing || loading}
            appearance="subtle"
            icon={<Add20Regular />}
            onClick={() => {
              setView("add");
              setError("");
            }}
          >
            Add Game
          </Button>
          <Button
            disabled={editing}
            appearance={view === "settings" ? "primary" : "subtle"}
            icon={<Settings20Regular />}
            onClick={() => {
              setView("settings");
              setError("");
            }}
          >
            Settings
          </Button>
        </nav>
        <span className="sidebar-footer">Local Library</span>
      </aside>
      <section className="workspace">
        {error && (
          <div role="alert" className="error">
            {error}
            <Button onClick={() => void load()}>Retry</Button>
          </div>
        )}
        {loading ? (
          <Spinner label="Opening library" />
        ) : (
          <>
            {view === "library" && (
              <Library
                games={games}
                platforms={platforms}
                preferences={preferences}
                preference={async (key, value) => {
                  try {
                    await invoke("set_preference", { key, value });
                    setPreferences((p) => ({ ...p, [key]: value }));
                  } catch (e) {
                    setError(String(e));
                  }
                }}
                open={(id) => void open(id)}
                add={() => setView("add")}
              />
            )}
            {editing && (
              <Suspense fallback={<Spinner label="Opening editor" />}>
                <GameForm
                  key={view === "edit" ? game?.id : "new"}
                  game={view === "edit" ? (game ?? undefined) : undefined}
                  platforms={platforms}
                  cancel={() => setView(view === "edit" ? "detail" : "library")}
                  saved={(g) => {
                    setGame(g);
                    setView("detail");
                    void refresh().catch((e) => setError(String(e)));
                  }}
                />
              </Suspense>
            )}
            {view === "detail" && game && (
              <GameDetail
                game={game}
                platform={platforms.find((p) => p.id === game.platform_id)}
                back={() => setView("library")}
                edit={() => setView("edit")}
                remove={() => setDeleting(true)}
                error={setError}
              />
            )}
            {view === "settings" && (
              <PlatformManager
                platforms={platforms}
                refresh={refresh}
                dataPath={dataPath}
              />
            )}
          </>
        )}
      </section>
      {deleting && game && (
        <Confirm
          title="Delete game?"
          text={`Delete "${game.title}" from your library? Its notes and tags will be removed. This cannot be undone.`}
          busy={busy}
          close={() => setDeleting(false)}
          confirm={async () => {
            setBusy(true);
            try {
              await invoke("delete_game", { id: game.id });
              setDeleting(false);
              setGame(null);
              setView("library");
              await refresh();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </main>
  );
}
