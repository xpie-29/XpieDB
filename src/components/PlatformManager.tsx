import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Field, Input } from "@fluentui/react-components";
import {
  Add20Regular,
  Edit20Regular,
  Delete20Regular,
  ImageAdd20Regular,
} from "@fluentui/react-icons";
import type { Platform } from "../types";
import { Modal, PlatformIcon, Confirm } from "./Shared";
export function PlatformManager({
  platforms,
  refresh,
}: {
  platforms: Platform[];
  refresh: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<{
    id: number | null;
    name: string;
    short_name: string;
    icon_path: string | null;
  } | null>(null);
  const [imports, setImports] = useState<string[]>([]);
  const [remove, setRemove] = useState<Platform | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cleanup = async () => {
    for (const path of imports) await invoke("discard_image", { path });
    setImports([]);
  };
  const close = async () => {
    if (busy) return;
    try {
      await cleanup();
      setDraft(null);
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <>
      <header className="page-header">
        <h1>Platforms</h1>
      </header>
      <section>
        <div className="section-header">
          <Button
            icon={<Add20Regular />}
            onClick={() => {
              setError("");
              setDraft({ id: null, name: "", short_name: "", icon_path: null });
            }}
          >
            Add platform
          </Button>
        </div>
        {error && !draft && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="platforms">
          {platforms.map((p) => (
            <div className="platform-row" key={p.id}>
              <PlatformIcon platform={p} />
              <span>{p.name}</span>
              <span className="muted">
                {p.is_builtin ? "Built-in" : "Custom"}
              </span>
              <Button
                appearance="subtle"
                title={`Edit ${p.name}`}
                aria-label={`Edit ${p.name}`}
                icon={<Edit20Regular />}
                onClick={() => {
                  setError("");
                  setDraft(p);
                }}
              />
              {!p.is_builtin && (
                <Button
                  appearance="subtle"
                  title={`Delete ${p.name}`}
                  aria-label={`Delete ${p.name}`}
                  icon={<Delete20Regular />}
                  onClick={() => setRemove(p)}
                />
              )}
            </div>
          ))}
        </div>
      </section>
      {draft && (
        <Modal
          title={draft.id ? "Edit platform" : "Add platform"}
          close={() => void close()}
          actions={
            <>
              <Button disabled={busy} onClick={() => void close()}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                appearance="primary"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await invoke("save_platform", {
                      id: draft.id,
                      name: draft.name,
                      shortName: draft.short_name,
                      iconPath: draft.icon_path,
                    });
                    await cleanup();
                    await refresh();
                    setDraft(null);
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="dialog-fields">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Field label="Display name" required>
              <Input
                value={draft.name}
                onChange={(_, d) => setDraft({ ...draft, name: d.value })}
              />
            </Field>
            <Field label="Short mark" required>
              <Input
                maxLength={5}
                value={draft.short_name}
                onChange={(_, d) => setDraft({ ...draft, short_name: d.value })}
              />
            </Field>
            <PlatformIcon
              platform={{
                ...draft,
                id: draft.id ?? 0,
                sort_order: 100,
                is_builtin: false,
              }}
            />
            <Button
              disabled={busy}
              icon={<ImageAdd20Regular />}
              onClick={async () => {
                setBusy(true);
                try {
                  const path = await invoke<string | null>("select_image", {
                    kind: "platform-icons",
                  });
                  if (path) {
                    setImports((v) => [...v, path]);
                    setDraft({ ...draft, icon_path: path });
                  }
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Choose icon
            </Button>
            {draft.icon_path && (
              <Button onClick={() => setDraft({ ...draft, icon_path: null })}>
                Use short mark
              </Button>
            )}
          </div>
        </Modal>
      )}
      {remove && (
        <Confirm
          title="Delete platform?"
          text={`Delete ${remove.name}? Only unused custom platforms can be deleted.`}
          busy={busy}
          close={() => setRemove(null)}
          confirm={async () => {
            setBusy(true);
            try {
              await invoke("delete_platform", { id: remove.id });
              await refresh();
              setRemove(null);
            } catch (e) {
              setError(String(e));
              setRemove(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
