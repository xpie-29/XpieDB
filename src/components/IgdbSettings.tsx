import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Field, Input } from "@fluentui/react-components";
import {
  Save20Regular,
  PlugConnected20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
export function IgdbSettings() {
  const [configured, setConfigured] = useState(false),
    [id, setId] = useState(""),
    [secret, setSecret] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    invoke<{ configured: boolean }>("igdb_config")
      .then((v) => setConfigured(v.configured))
      .catch((e) => setError(String(e)));
  }, []);
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await run();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="igdb-settings">
      <h2>IGDB</h2>
      <p role="status">
        {configured ? "Credentials configured" : "Not configured"}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            try {
              await invoke("igdb_save_credentials", {
                clientId: id,
                clientSecret: secret,
              });
              setConfigured(true);
              setMessage("Credentials saved.");
              setId("");
            } finally {
              setSecret("");
            }
          });
        }}
      >
        <Field label="Client ID">
          <Input
            autoComplete="off"
            value={id}
            disabled={busy}
            onChange={(_, d) => setId(d.value)}
          />
        </Field>
        <Field label="Client Secret">
          <Input
            type="password"
            autoComplete="new-password"
            value={secret}
            disabled={busy}
            onChange={(_, d) => setSecret(d.value)}
          />
        </Field>
        <div className="actions">
          <Button
            type="submit"
            icon={<Save20Regular />}
            disabled={busy || !id.trim() || !secret.trim()}
          >
            Save credentials
          </Button>
          <Button
            type="button"
            icon={<PlugConnected20Regular />}
            disabled={busy || !configured}
            onClick={() =>
              void action(async () => {
                await invoke("igdb_test");
                setMessage("IGDB connection successful.");
              })
            }
          >
            Test connection
          </Button>
          <Button
            type="button"
            icon={<Delete20Regular />}
            disabled={busy || !configured}
            onClick={() =>
              void action(async () => {
                await invoke("igdb_clear_credentials");
                setConfigured(false);
                setId("");
                setSecret("");
                setMessage("Credentials cleared.");
              })
            }
          >
            Clear credentials
          </Button>
        </div>
      </form>
      {busy && <p role="status">Working...</p>}
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
