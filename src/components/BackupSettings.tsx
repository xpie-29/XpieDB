import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@fluentui/react-components";
import {
  ArrowDownload20Regular,
  ArrowUpload20Regular,
} from "@fluentui/react-icons";
import { Confirm } from "./Shared";

type CreateResult = {
  path: string;
  games: number;
  images: number;
  missing_images: number;
};
type RestorePreview = {
  file_name: string;
  created_at: string;
  app_version: string;
  games: number;
  images: number;
  missing_images: number;
};
type RestoreResult = {
  games: number;
  images: number;
  missing_images: number;
  safety_backup: string | null;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const missingNote = (n: number) =>
  n > 0
    ? ` ${plural(n, "referenced image")} could not be found and will show the placeholder.`
    : "";

export function BackupSettings({
  restored,
  working,
}: {
  restored: () => Promise<void>;
  working: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<RestorePreview | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function action(run: () => Promise<void>) {
    setBusy(true);
    working(true);
    setMessage("");
    setError("");
    try {
      await run();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      working(false);
    }
  }
  const cancelRestore = () => {
    setPreview(null);
    void invoke("backup_cancel_restore").catch(() => {});
  };
  return (
    <section className="backup-settings">
      <h2>Backup and restore</h2>
      <p className="muted">
        A backup is a single .zip file with your whole library: games, notes,
        tags, platforms, preferences, cover images and custom platform icons.
        IGDB credentials are not included; they stay in this computer's secure
        credential store.
      </p>
      <div className="actions">
        <Button
          icon={<ArrowDownload20Regular />}
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const result = await invoke<CreateResult | null>("backup_create");
              if (result)
                setMessage(
                  `Backed up ${plural(result.games, "game")} and ${plural(result.images, "image")} to ${result.path}.${missingNote(result.missing_images)}`,
                );
            })
          }
        >
          Back up library...
        </Button>
        <Button
          icon={<ArrowUpload20Regular />}
          disabled={busy}
          onClick={() =>
            void action(async () => {
              setPreview(
                await invoke<RestorePreview | null>("backup_choose_restore"),
              );
            })
          }
        >
          Restore from backup...
        </Button>
      </div>
      {busy && <p role="status">Working...</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <Confirm
          title="Restore this backup?"
          label="Restore"
          busy={busy}
          close={cancelRestore}
          text={`Replace your current library with "${preview.file_name}", created ${new Date(preview.created_at).toLocaleString()}? It contains ${plural(preview.games, "game")} and ${plural(preview.images, "image")}. Everything in your current library will be replaced. A safety backup of the current library is saved automatically first.${missingNote(preview.missing_images)}`}
          confirm={() => {
            setPreview(null);
            void action(async () => {
              const result = await invoke<RestoreResult>("backup_restore");
              await restored();
              setMessage(
                `Restored ${plural(result.games, "game")} and ${plural(result.images, "image")}.${missingNote(result.missing_images)}${result.safety_backup ? ` Your previous library was saved to ${result.safety_backup}.` : ""}`,
              );
            });
          }}
        />
      )}
    </section>
  );
}
