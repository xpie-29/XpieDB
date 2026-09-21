import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Field, Input, Link } from "@fluentui/react-components";
import {
  Save20Regular,
  PlugConnected20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";

const KEY_PAGE = "https://steamcommunity.com/dev/apikey";

export function SteamSettings() {
  const [configured, setConfigured] = useState(false),
    [key, setKey] = useState(""),
    [profile, setProfile] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    invoke<{ configured: boolean }>("steam_config")
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
    <section className="steam-settings">
      <h2>Steam</h2>
      <p className="muted">
        Import your Steam library from Add Game. It needs a free Steam Web API
        key and your profile, and your profile's Game details must be Public
        while you import. Steam asks for a domain name when you create the key;
        any name, such as localhost, works.{" "}
        <Link
          href={KEY_PAGE}
          onClick={(e) => {
            e.preventDefault();
            invoke("open_link", { url: KEY_PAGE }).catch((err) =>
              setError(String(err)),
            );
          }}
        >
          Get an API key
        </Link>
      </p>
      <p role="status">
        {configured ? "Steam settings saved" : "Not configured"}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            try {
              await invoke("steam_save_credentials", {
                apiKey: key,
                profile,
              });
              setConfigured(true);
              setMessage("Steam settings saved.");
              setProfile("");
            } finally {
              setKey("");
            }
          });
        }}
      >
        <Field label="Steam API key">
          <Input
            type="password"
            autoComplete="new-password"
            value={key}
            disabled={busy}
            onChange={(_, d) => setKey(d.value)}
          />
        </Field>
        <Field
          label="Steam profile"
          hint="Your 17-digit Steam ID, your profile link, or your custom profile name."
        >
          <Input
            autoComplete="off"
            value={profile}
            disabled={busy}
            onChange={(_, d) => setProfile(d.value)}
          />
        </Field>
        <div className="actions">
          <Button
            type="submit"
            icon={<Save20Regular />}
            disabled={busy || !key.trim() || !profile.trim()}
          >
            Save Steam settings
          </Button>
          <Button
            type="button"
            icon={<PlugConnected20Regular />}
            disabled={busy || !configured}
            onClick={() =>
              void action(async () => {
                const r = await invoke<{
                  games: number;
                  account_name: string | null;
                }>("steam_test");
                setMessage(
                  `Steam connection successful: ${r.games} ${r.games === 1 ? "game" : "games"}${r.account_name ? ` for ${r.account_name}` : ""}.`,
                );
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
                await invoke("steam_clear_credentials");
                setConfigured(false);
                setKey("");
                setProfile("");
                setMessage("Steam settings cleared.");
              })
            }
          >
            Clear Steam settings
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
