import { lazy, Suspense, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Spinner } from "@fluentui/react-components";
import type { Game, Platform, Preferences } from "./types";
import { Library } from "./components/Library";
import { GameDetail } from "./components/GameDetail";
import { PlatformManager } from "./components/PlatformManager";
import { Confirm } from "./components/Shared";
import { PrimaryToolbar, type Destination } from "./components/PrimaryToolbar";
const GameForm = lazy(() =>
  import("./components/GameForm").then((m) => ({ default: m.GameForm })),
);

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    library_view: "grid",
    cover_size: "medium",
  });
  const [view, setView] = useState<Destination>("library");
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dataPath, setDataPath] = useState("");
  const game = games.find((g) => g.id === selected) ?? null;
  const refresh = async () => {
    const [g, p] = await Promise.all([
      invoke<Game[]>("list_games"),
      invoke<Platform[]>("list_platforms"),
    ]);
    setGames(g);
    setPlatforms(p);
    setSelected((id) =>
      g.some((game) => game.id === id) ? id : (g[0]?.id ?? null),
    );
  };
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      await refresh();
      setPreferences(await invoke<Preferences>("get_preferences"));
      const info = await invoke<{ appDataDir: string }>("get_app_data_info");
      setDataPath(info.appDataDir);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const editing = view === "add" || view === "edit";
  const navigate = (next: Destination) => {
    setError("");
    setView(next);
  };
  return (
    <main className="app-shell">
      <PrimaryToolbar
        view={view}
        navigate={navigate}
        locked={editing || loading || busy}
        preferences={preferences}
        preference={async (key, value) => {
          try {
            await invoke("set_preference", { key, value });
            setPreferences((p) => ({ ...p, [key]: value }));
          } catch (e) {
            setError(String(e));
          }
        }}
      />
      {error && (
        <div role="alert" className="shell-error error">
          {error}
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      )}
      <div className="workspace">
        {loading ? (
          <Spinner label="Opening library" />
        ) : (
          <>
            {view === "library" && (
              <Library
                games={games}
                platforms={platforms}
                preferences={preferences}
                selected={selected}
                select={setSelected}
                add={() => navigate("add")}
                details={
                  game ? (
                    <GameDetail
                      game={game}
                      platform={platforms.find(
                        (p) => p.id === game.platform_id,
                      )}
                      edit={() => navigate("edit")}
                      remove={() => setDeleting(true)}
                      error={setError}
                    />
                  ) : null
                }
              />
            )}
            {editing && (
              <section className="page-scroll">
                <Suspense fallback={<Spinner label="Opening editor" />}>
                  <GameForm
                    key={view === "edit" ? game?.id : "new"}
                    game={view === "edit" ? (game ?? undefined) : undefined}
                    platforms={platforms}
                    cancel={() => navigate("library")}
                    saved={(saved) => {
                      setGames((current) => [
                        ...current.filter((g) => g.id !== saved.id),
                        saved,
                      ]);
                      setSelected(saved.id);
                      navigate("library");
                      void refresh().catch((e) => setError(String(e)));
                    }}
                  />
                </Suspense>
              </section>
            )}
            {view === "platforms" && (
              <section className="page-scroll">
                <PlatformManager platforms={platforms} refresh={refresh} />
              </section>
            )}
            {view === "settings" && (
              <section className="page-scroll">
                <header className="page-header">
                  <h1>Settings</h1>
                </header>
                <section className="data-location">
                  <h2>Local data</h2>
                  <p>{dataPath}</p>
                </section>
              </section>
            )}
          </>
        )}
      </div>
      {deleting && game && (
        <Confirm
          title="Delete game?"
          text={`Delete "${game.title}" from your library? Its notes and tags will be removed. This cannot be undone.`}
          busy={busy}
          close={() => setDeleting(false)}
          confirm={async () => {
            setBusy(true);
            try {
              const index = games.findIndex((g) => g.id === game.id);
              const next = games[index + 1] ?? games[index - 1];
              await invoke("delete_game", { id: game.id });
              setGames((current) => current.filter((g) => g.id !== game.id));
              setSelected(next?.id ?? null);
              setDeleting(false);
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
