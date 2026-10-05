import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button, Spinner } from "@fluentui/react-components";
import {
  collectionOf,
  emptyGuide,
  emptyHardware,
  type Collection,
  type Game,
  type Guide,
  type GuideFile,
  type GuideInput,
  type Hardware,
  type HardwareInput,
  type Platform,
  type Preferences,
} from "./types";
import { HardwareLibrary } from "./components/Hardware";
import { GuidesLibrary } from "./components/Guides";
import {
  emptyGuideFilters,
  gamesWithGuides,
  guidesForGame,
  queryGuides,
  visibleGuide,
} from "./guidesQuery";
import {
  emptyHardwareFilters,
  hardwareRows,
  visibleHardware,
} from "./hardwareQuery";
import { Library } from "./components/Library";
import { GameDetail } from "./components/GameDetail";
import { PlatformManager } from "./components/PlatformManager";
import { Confirm } from "./components/Shared";
import { PrimaryToolbar, type Destination } from "./components/PrimaryToolbar";
import { LibraryUtilityBar } from "./components/LibraryUtilityBar";
import { IgdbSettings } from "./components/IgdbSettings";
import { BackupSettings } from "./components/BackupSettings";
import { Reports } from "./components/Reports";
import { Backlog } from "./components/Backlog";
import { About } from "./components/About";
import { SteamImport } from "./components/SteamImport";
import { SteamSettings } from "./components/SteamSettings";
import { StatsPanel } from "./components/StatsPanel";
const AddGameFlow = lazy(() =>
  import("./components/AddGameFlow").then((m) => ({ default: m.AddGameFlow })),
);
import {
  emptyFilters,
  hasFilters,
  queryLibrary,
  visibleSelection,
} from "./libraryQuery";
const HardwareForm = lazy(() =>
  import("./components/HardwareForm").then((m) => ({
    default: m.HardwareForm,
  })),
);
const GuideForm = lazy(() =>
  import("./components/GuideForm").then((m) => ({ default: m.GuideForm })),
);
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
  // Hardware collection state (kept here so it survives visits to the editor).
  const [hardware, setHardware] = useState<Hardware[]>([]);
  const [hardwareFilters, setHardwareFilters] = useState(emptyHardwareFilters);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [hardwareSelected, setHardwareSelected] = useState<number | null>(null);
  const [hardwareHighlight, setHardwareHighlight] = useState<number | null>(
    null,
  );
  const [hardwareDraft, setHardwareDraft] = useState<HardwareInput | undefined>();
  const [deletingHardware, setDeletingHardware] = useState<Hardware | null>(
    null,
  );
  const hardwareScroll = useRef(0);
  // Guides collection state.
  const [guides, setGuides] = useState<Guide[]>([]);
  const [guideFilters, setGuideFilters] = useState(emptyGuideFilters);
  const [guideSelected, setGuideSelected] = useState<number | null>(null);
  const [guideHighlight, setGuideHighlight] = useState<number | null>(null);
  const [guideDraft, setGuideDraft] = useState<GuideInput | undefined>();
  const [deletingGuide, setDeletingGuide] = useState<Guide | null>(null);
  const [removingFile, setRemovingFile] = useState<GuideFile | null>(null);
  const guideScroll = useRef(0);
  // Set when another screen sends the owner to a game, so the Library scrolls to it once.
  const revealGame = useRef(false);
  const [view, setView] = useState<Destination>("library");
  // Where Cancel and Save return to after editing a game.
  const [editReturn, setEditReturn] = useState<Destination>("library");
  const [selected, setSelected] = useState<number | null>(null);
  // Library scroll position, kept while another screen (such as the editor) is shown.
  const libraryScroll = useRef(0);
  // The game just saved, flashed briefly in the Library so the owner can find their place.
  const [highlight, setHighlight] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [about, setAbout] = useState(false);
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
    const [g, p, h, gd] = await Promise.all([
      invoke<Game[]>("list_games"),
      invoke<Platform[]>("list_platforms"),
      invoke<Hardware[]>("list_hardware"),
      invoke<Guide[]>("list_guides"),
    ]);
    setGames(g);
    setPlatforms(p);
    setHardware(h);
    setGuides(gd);
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
  // The Help menu (native) asks the window to show the About dialog.
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    listen("open-about", () => setAbout(true))
      .then((unlisten) => (cancelled ? unlisten() : (stop = unlisten)))
      .catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
  // After a restore every record may differ, so drop view state tied to the old library.
  const reloadRestored = async () => {
    await refresh();
    setPreferences(await invoke<Preferences>("get_preferences"));
    setFilters(emptyFilters());
    setSelected(null);
    libraryScroll.current = 0;
    setHardwareFilters(emptyHardwareFilters());
    setHardwareSelected(null);
    hardwareScroll.current = 0;
    setGuideFilters(emptyGuideFilters());
    setGuideSelected(null);
    guideScroll.current = 0;
  };
  useEffect(() => {
    if (highlight === null || view !== "library") return;
    const timer = window.setTimeout(() => setHighlight(null), 2600);
    return () => window.clearTimeout(timer);
  }, [highlight, view]);
  const collection = collectionOf(preferences.collection);
  const grouping = preferences.hardware_grouping === "flat" ? "flat" : "grouped";
  const hardwareList = useMemo(
    () => hardwareRows(hardware, platforms, hardwareFilters, grouping, collapsed),
    [hardware, platforms, hardwareFilters, grouping, collapsed],
  );
  // Dimmed rows are only context (a system shown for its matching accessory), not matches.
  const hardwareShown = hardwareList.filter(
    (r) => r.type === "item" && !r.dimmed,
  ).length;
  const hardwareId = visibleHardware(hardwareList, hardwareSelected);
  const hardwareItem =
    hardware.find((h) => h.id === (view === "library" ? hardwareId : hardwareSelected)) ??
    null;
  useEffect(() => {
    if (view === "library" && !loading && hardwareSelected !== hardwareId)
      setHardwareSelected(hardwareId);
  }, [view, loading, hardwareSelected, hardwareId]);
  useEffect(() => {
    if (hardwareHighlight === null || view !== "library") return;
    const timer = window.setTimeout(() => setHardwareHighlight(null), 2600);
    return () => window.clearTimeout(timer);
  }, [hardwareHighlight, view]);
  // Switching collection always lands on that collection's list.
  // The screen changes at once; saving the choice happens in the background.
  const showCollection = (next: Collection) => {
    setPreferences((p) => ({ ...p, collection: next }));
    invoke("set_preference", { key: "collection", value: next }).catch((e) =>
      setError(String(e)),
    );
  };
  const switchCollection = (next: Collection) => {
    if (next === collection) return;
    setError("");
    setView("library");
    showCollection(next);
  };
  const guideList = useMemo(
    () => queryGuides(guides, games, platforms, guideFilters),
    [guides, games, platforms, guideFilters],
  );
  const guideId = visibleGuide(guideList, guideSelected);
  const guideItem =
    guides.find((x) => x.id === (view === "library" ? guideId : guideSelected)) ??
    null;
  const guideGameIds = useMemo(() => gamesWithGuides(guides), [guides]);
  useEffect(() => {
    if (view === "library" && !loading && guideSelected !== guideId)
      setGuideSelected(guideId);
  }, [view, loading, guideSelected, guideId]);
  useEffect(() => {
    if (guideHighlight === null || view !== "library") return;
    const timer = window.setTimeout(() => setGuideHighlight(null), 2600);
    return () => window.clearTimeout(timer);
  }, [guideHighlight, view]);
  const openGame = (id: number) => {
    setFilters(emptyFilters());
    setSelected(id);
    revealGame.current = true;
    setView("library");
    showCollection("games");
  };
  const openGuide = (id: number) => {
    setGuideFilters(emptyGuideFilters());
    setGuideSelected(id);
    setView("library");
    showCollection("guides");
  };
  const addGuideFor = (game: Game) => {
    setGuideDraft({
      ...emptyGuide(),
      game_id: game.id,
      platform_id: game.platform_id,
    });
    setView("add");
    showCollection("guides");
  };
  const withFile = (file: GuideFile, keep: boolean) =>
    setGuides((current) =>
      current.map((x) =>
        x.id !== file.guide_id
          ? x
          : {
              ...x,
              files: keep
                ? [...x.files.filter((f) => f.id !== file.id), file]
                : x.files.filter((f) => f.id !== file.id),
            },
      ),
    );
  const attachFile = async (guide: Guide) => {
    setError("");
    try {
      const file = await invoke<GuideFile | null>("attach_guide_file", {
        guideId: guide.id,
      });
      if (file) withFile(file, true);
    } catch (e) {
      setError(String(e));
    }
  };
  const fileAction = (command: string) => async (file: GuideFile) => {
    setError("");
    try {
      await invoke(command, { id: file.id });
    } catch (e) {
      setError(String(e));
    }
  };
  const guideSaved = (saved: Guide) => {
    setGuides((current) => [...current.filter((x) => x.id !== saved.id), saved]);
    setGuideSelected(saved.id);
    setGuideHighlight(saved.id);
    setGuideDraft(undefined);
    navigate("library");
    void refresh().catch((e) => setError(String(e)));
  };
  const editing = view === "add" || view === "edit";
  const hardwareSaved = (saved: Hardware) => {
    setHardware((current) => [...current.filter((h) => h.id !== saved.id), saved]);
    setHardwareSelected(saved.id);
    setHardwareHighlight(saved.id);
    setHardwareDraft(undefined);
    navigate("library");
    void refresh().catch((e) => setError(String(e)));
  };
  const navigate = (next: Destination) => {
    setError("");
    setView(next);
  };
  return (
    <main
      className={`app-shell ${preferences.platform_icon_style === "mono" ? "icons-mono" : "icons-color"}`}
    >
      <PrimaryToolbar
        view={view}
        navigate={navigate}
        locked={editing || loading || busy}
        preferences={preferences}
        preference={preference}
        collection={collection}
        setCollection={switchCollection}
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
            {collection === "guides" && view === "library" && (
              <GuidesLibrary
                guides={guideList}
                all={guides}
                games={games}
                platforms={platforms}
                filters={guideFilters}
                setFilters={setGuideFilters}
                selected={guideId}
                select={setGuideSelected}
                add={() => {
                  setGuideDraft(undefined);
                  navigate("add");
                }}
                edit={(item) => {
                  setGuideSelected(item.id);
                  navigate("edit");
                }}
                remove={setDeletingGuide}
                openGame={openGame}
                attachFile={(guide) => void attachFile(guide)}
                openFile={(file) => void fileAction("open_guide_file")(file)}
                revealFile={(file) => void fileAction("reveal_guide_file")(file)}
                removeFile={setRemovingFile}
                error={setError}
                scroll={guideScroll}
                highlight={guideHighlight}
              />
            )}
            {collection === "guides" && editing && (
              <section className="page-scroll">
                <Suspense fallback={<Spinner label="Opening editor" />}>
                  <GuideForm
                    key={view === "edit" ? guideItem?.id : "new"}
                    guide={view === "edit" ? (guideItem ?? undefined) : undefined}
                    initial={view === "add" ? guideDraft : undefined}
                    games={games}
                    platforms={platforms}
                    saved={guideSaved}
                    cancel={() => {
                      setGuideDraft(undefined);
                      navigate("library");
                    }}
                  />
                </Suspense>
              </section>
            )}
            {collection === "hardware" && view === "library" && (
              <HardwareLibrary
                rows={hardwareList}
                total={hardware.length}
                shown={hardwareShown}
                platforms={platforms}
                all={hardware}
                filters={hardwareFilters}
                setFilters={setHardwareFilters}
                grouping={grouping}
                setGrouping={(value) =>
                  void preference("hardware_grouping", value)
                }
                toggle={(id) =>
                  setCollapsed((current) => {
                    const next = new Set(current);
                    if (!next.delete(id)) next.add(id);
                    return next;
                  })
                }
                setAllOpen={(open) =>
                  setCollapsed(
                    open
                      ? new Set()
                      : new Set(
                          hardware
                            .filter((h) => h.kind === "system")
                            .map((h) => h.id),
                        ),
                  )
                }
                selected={hardwareId}
                select={setHardwareSelected}
                add={() => {
                  setHardwareDraft(undefined);
                  navigate("add");
                }}
                addAccessory={(system) => {
                  setHardwareDraft({
                    ...emptyHardware("accessory"),
                    parent_id: system.id,
                    platform_id: system.platform_id,
                  });
                  navigate("add");
                }}
                edit={(item) => {
                  setHardwareSelected(item.id);
                  navigate("edit");
                }}
                remove={setDeletingHardware}
                error={setError}
                scroll={hardwareScroll}
                highlight={hardwareHighlight}
              />
            )}
            {collection === "hardware" && editing && (
              <section className="page-scroll">
                <Suspense fallback={<Spinner label="Opening editor" />}>
                  <HardwareForm
                    key={view === "edit" ? hardwareItem?.id : "new"}
                    item={view === "edit" ? (hardwareItem ?? undefined) : undefined}
                    initial={view === "add" ? hardwareDraft : undefined}
                    all={hardware}
                    platforms={platforms}
                    saved={hardwareSaved}
                    cancel={() => {
                      setHardwareDraft(undefined);
                      navigate("library");
                    }}
                  />
                </Suspense>
              </section>
            )}
            {collection === "games" && view === "library" && (
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
                scroll={libraryScroll}
                reveal={revealGame}
                guideGameIds={guideGameIds}
                highlight={highlight}
                setPreference={(key, value) => void preference(key, value)}
                statsPanel={
                  games.length > 0 ? (
                    <StatsPanel
                      games={visible}
                      allCount={games.length}
                      platforms={platforms}
                      filtered={hasFilters(filters)}
                      open={preferences.stats_open !== "false"}
                      setOpen={(open) =>
                        void preference("stats_open", String(open))
                      }
                    />
                  ) : null
                }
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
                        setEditReturn("library");
                        navigate("edit");
                      }}
                      remove={() => setDeleting(true)}
                      guides={guidesForGame(guides, game.id)}
                      openGuide={openGuide}
                      addGuide={() => addGuideFor(game)}
                      error={setError}
                    />
                  ) : null
                }
              />
            )}
            {collection === "games" && editing && (
              <section className="page-scroll">
                <Suspense fallback={<Spinner label="Opening editor" />}>
                  {view === "add" ? (
                    <AddGameFlow
                      platforms={platforms}
                      games={games}
                      cancel={() => navigate("library")}
                      steam={() => navigate("steam")}
                      saved={(saved) => {
                        setGames((current) => [...current, saved]);
                        setSelected(saved.id);
                        setHighlight(saved.id);
                        navigate("library");
                        void refresh().catch((e) => setError(String(e)));
                      }}
                    />
                  ) : (
                    <GameForm
                      key={view === "edit" ? game?.id : "new"}
                      game={view === "edit" ? (game ?? undefined) : undefined}
                      platforms={platforms}
                      cancel={() => navigate(editReturn)}
                      saved={(saved) => {
                        setGames((current) => [
                          ...current.filter((g) => g.id !== saved.id),
                          saved,
                        ]);
                        setSelected(saved.id);
                        setHighlight(saved.id);
                        navigate(editReturn);
                        void refresh().catch((e) => setError(String(e)));
                      }}
                    />
                  )}
                </Suspense>
              </section>
            )}
            {collection === "games" && view === "backlog" && (
              <section className="page-scroll">
                <Backlog
                  games={games}
                  platforms={platforms}
                  refresh={refresh}
                  edit={(id) => {
                    setSelected(id);
                    setEditReturn("backlog");
                    navigate("edit");
                  }}
                />
              </section>
            )}
            {collection === "games" && view === "steam" && (
              <section className="page-scroll">
                <SteamImport
                  refresh={refresh}
                  working={setBusy}
                  close={() => navigate("library")}
                  openSettings={() => navigate("settings")}
                />
              </section>
            )}
            {view === "platforms" && (
              <section className="page-scroll">
                <PlatformManager
                  platforms={platforms}
                  refresh={refresh}
                  back={() => navigate("settings")}
                  iconStyle={preferences.platform_icon_style ?? "color"}
                  setIconStyle={(value) =>
                    void preference("platform_icon_style", value)
                  }
                />
              </section>
            )}
            {collection === "games" && view === "reports" && (
              <section className="page-scroll">
                <Reports
                  gameCount={games.length}
                  preferences={preferences}
                  preference={preference}
                  working={setBusy}
                />
              </section>
            )}
            {view === "settings" && (
              <section className="page-scroll">
                <header className="page-header">
                  <h1>Settings</h1>
                </header>
                <section className="settings-platforms">
                  <h2>Platforms</h2>
                  <p>
                    Add your own platforms, choose icons, and switch icon
                    colours.
                  </p>
                  <Button onClick={() => navigate("platforms")}>
                    Manage platforms
                  </Button>
                </section>
                <IgdbSettings />
                <SteamSettings />
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
      {about && <About close={() => setAbout(false)} />}
      {removingFile && (
        <Confirm
          title="Remove this file?"
          text={`Remove "${removingFile.file_name}" from this guide? The copy kept by XpieDB is deleted; your original file is not touched.`}
          label="Remove"
          busy={busy}
          close={() => setRemovingFile(null)}
          confirm={async () => {
            setBusy(true);
            try {
              await invoke("remove_guide_file", { id: removingFile.id });
              withFile(removingFile, false);
              setRemovingFile(null);
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {deletingGuide && (
        <Confirm
          title="Delete guide?"
          text={`Delete "${deletingGuide.title}" from your collection? This cannot be undone.`}
          busy={busy}
          close={() => setDeletingGuide(null)}
          confirm={async () => {
            setBusy(true);
            try {
              const ids = guideList.map((x) => x.id);
              const at = ids.indexOf(deletingGuide.id);
              const rest = ids.filter((id) => id !== deletingGuide.id);
              await invoke("delete_guide", { id: deletingGuide.id });
              setGuides((current) =>
                current.filter((x) => x.id !== deletingGuide.id),
              );
              setGuideSelected(rest[at] ?? rest[at - 1] ?? null);
              setDeletingGuide(null);
              await refresh();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {deletingHardware && (
        <Confirm
          title="Delete hardware?"
          text={`Delete "${deletingHardware.name}" from your collection? ${
            hardware.some((h) => h.parent_id === deletingHardware.id)
              ? "Its accessories are kept and become loose accessories. "
              : ""
          }This cannot be undone.`}
          busy={busy}
          close={() => setDeletingHardware(null)}
          confirm={async () => {
            setBusy(true);
            try {
              const next = hardwareList
                .flatMap((r) => (r.type === "item" ? [r.item.id] : []))
                .filter((id) => id !== deletingHardware.id);
              const at = hardwareList
                .flatMap((r) => (r.type === "item" ? [r.item.id] : []))
                .indexOf(deletingHardware.id);
              await invoke("delete_hardware", { id: deletingHardware.id });
              setHardware((current) =>
                current.filter((h) => h.id !== deletingHardware.id),
              );
              setHardwareSelected(next[at] ?? next[at - 1] ?? null);
              setDeletingHardware(null);
              await refresh();
            } catch (e) {
              setError(String(e));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
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
