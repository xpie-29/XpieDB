import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Spinner } from "@fluentui/react-components";
import type { Game, Platform, Preferences } from "./types";
import { Library } from "./components/Library";
import { GameDetail } from "./components/GameDetail";
import { PlatformManager } from "./components/PlatformManager";
import { Confirm } from "./components/Shared";
import { PrimaryToolbar, type Destination } from "./components/PrimaryToolbar";
import { LibraryUtilityBar } from "./components/LibraryUtilityBar";
import { IgdbSettings } from "./components/IgdbSettings";
import { BackupSettings } from "./components/BackupSettings";
const AddGameFlow = lazy(() =>
  import("./components/AddGameFlow").then((m) => ({ default: m.AddGameFlow })),
);
import {
  emptyFilters,
  hasFilters,
  queryLibrary,
  visibleSelection,
} from "./libraryQuery";
const GameForm = lazy(() =>
  import("./components/GameForm").then((m) => ({ default: m.GameForm })),
);

export function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    library_view: "grid",
    cover_size: "medium",
    library_sort: "title_asc",
  });
  const [filters, setFilters] = useState(emptyFilters);
  const [view, setView] = useState<Destination>("library");
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dataPath, setDataPath] = useState("");
  const visible = useMemo(
    () => queryLibrary(games, platforms, filters, preferences.library_sort),
    [games, platforms, filters, preferences.library_sort],
  );
  const visibleId = visibleSelection(visible, selected);
  const game =
    games.find((g) => g.id === (view === "library" ? visibleId : selected)) ??
    null;
  useEffect(() => {
    if (view === "library" && !loading && selected !== visibleId)
      setSelected(visibleId);
  }, [view, loading, selected, visibleId]);
  const preference = async (key: string, value: string) => {
    try {
      await invoke("set_preference", { key, value });
      setPreferences((p) => ({ ...p, [key]: value }));
    } catch (e) {
      setError(String(e));
    }
  };
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
  // After a restore every record may differ, so drop view state tied to the old library.
  const reloadRestored = async () => {
    await refresh();
    setPreferences(await invoke<Preferences>("get_preferences"));
    setFilters(emptyFilters());
    setSelected(null);
  };
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
        preference={preference}
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
                games={visible}
                total={games.length}
                filtered={hasFilters(filters)}
                clear={() => setFilters(emptyFilters())}
                platforms={platforms}
                preferences={preferences}
                selected={visibleId}
                select={setSelected}
                add={() => navigate("add")}
                utilityBar={
                  <LibraryUtilityBar
                    games={games}
                    platforms={platforms}
                    filters={filters}
                    change={setFilters}
                    clear={() => setFilters(emptyFilters())}
                    sort={preferences.library_sort}
                    setSort={(value) => void preference("library_sort", value)}
                  />
                }
                details={
                  game ? (
                    <GameDetail
                      game={game}
                      platform={platforms.find(
                        (p) => p.id === game.platform_id,
                      )}
                      edit={() => {
                        setSelected(game.id);
                        navigate("edit");
                      }}
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
                  {view === "add" ? (
                    <AddGameFlow
                      platforms={platforms}
                      games={games}
                      cancel={() => navigate("library")}
                      saved={(saved) => {
                        setGames((current) => [...current, saved]);
                        setSelected(saved.id);
                        navigate("library");
                        void refresh().catch((e) => setError(String(e)));
                      }}
                    />
                  ) : (
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
                  )}
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
                <IgdbSettings />
                <BackupSettings restored={reloadRestored} working={setBusy} />
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
              const index = visible.findIndex((g) => g.id === game.id);
              const next = visible[index + 1] ?? visible[index - 1];
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
