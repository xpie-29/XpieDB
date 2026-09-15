import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Caption1,
  Card,
  CardHeader,
  Input,
  LargeTitle,
  Subtitle2,
  Text,
  Title3,
  Toolbar,
  ToolbarButton,
  makeStyles,
  shorthands,
  tokens,
} from "@fluentui/react-components";
import {
  Add20Regular,
  Database20Regular,
  Grid20Regular,
  Search20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";

type AppDataInfo = {
  appDataDir: string;
  databasePath: string;
  coversDir: string;
  backupsDir: string;
};

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
    display: "grid",
    gridTemplateColumns: "260px minmax(0, 1fr)",
  },
  nav: {
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderRight("1px", "solid", tokens.colorNeutralStroke2),
    padding: "20px 14px",
    display: "flex",
    flexDirection: "column",
    rowGap: "18px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    columnGap: "10px",
    padding: "0 6px",
  },
  navItems: {
    display: "grid",
    rowGap: "4px",
  },
  content: {
    minWidth: 0,
    padding: "28px 32px",
    display: "grid",
    gridTemplateRows: "auto auto minmax(0, 1fr)",
    rowGap: "20px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    columnGap: "16px",
  },
  titleBlock: {
    display: "grid",
    rowGap: "4px",
  },
  commandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: "16px",
  },
  search: {
    maxWidth: "420px",
    width: "100%",
  },
  library: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
    gap: "18px",
    alignContent: "start",
  },
  cover: {
    aspectRatio: "3 / 4",
    borderRadius: "6px",
    backgroundColor: tokens.colorNeutralBackground4,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    display: "grid",
    placeItems: "center",
    color: tokens.colorNeutralForeground3,
  },
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
  },
  status: {
    color: tokens.colorBrandForeground1,
  },
  footer: {
    marginTop: "auto",
    display: "grid",
    rowGap: "8px",
    color: tokens.colorNeutralForeground3,
  },
});

const sampleGames = [
  { title: "Foundation Ready", platform: "Windows", status: "Milestone 1" },
  { title: "Manual Library", platform: "Offline", status: "Next" },
  { title: "Metadata Import", platform: "IGDB", status: "Later" },
];

export function App() {
  const styles = useStyles();
  const [appData, setAppData] = useState<AppDataInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<AppDataInfo>("get_app_data_info")
      .then(setAppData)
      .catch((value: unknown) => {
        setError(value instanceof Error ? value.message : String(value));
      });
  }, []);

  return (
    <main className={styles.root}>
      <aside className={styles.nav}>
        <div className={styles.brand}>
          <Database20Regular />
          <Title3>GameVault</Title3>
        </div>
        <nav className={styles.navItems} aria-label="Primary">
          <Button appearance="subtle" icon={<Grid20Regular />} aria-current="page">
            Library
          </Button>
          <Button appearance="subtle" icon={<Add20Regular />}>
            Add Game
          </Button>
          <Button appearance="subtle" icon={<Settings20Regular />}>
            Settings
          </Button>
        </nav>
        <div className={styles.footer}>
          <Caption1>Local-first desktop catalog</Caption1>
          <Caption1>{appData?.databasePath ?? "Preparing local data..."}</Caption1>
          {error ? <Caption1 role="alert">{error}</Caption1> : null}
        </div>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <LargeTitle>Library</LargeTitle>
            <Text>Cover-first browsing for a personal game collection.</Text>
          </div>
          <Button appearance="primary" icon={<Add20Regular />}>
            Add Game
          </Button>
        </header>

        <div className={styles.commandRow}>
          <Input
            className={styles.search}
            contentBefore={<Search20Regular />}
            placeholder="Search title, platform, genre, developer, publisher, or tags"
          />
          <Toolbar aria-label="Library tools">
            <ToolbarButton>Platform</ToolbarButton>
            <ToolbarButton>Status</ToolbarButton>
            <ToolbarButton>Sort</ToolbarButton>
          </Toolbar>
        </div>

        <div className={styles.library} aria-label="Game library">
          {sampleGames.map((game) => (
            <Card key={game.title} className={styles.card} appearance="filled">
              <div className={styles.cover}>Cover</div>
              <CardHeader
                header={<Subtitle2>{game.title}</Subtitle2>}
                description={
                  <Caption1>
                    {game.platform} · <span className={styles.status}>{game.status}</span>
                  </Caption1>
                }
              />
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
