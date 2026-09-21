import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Link } from "@fluentui/react-components";
import { Modal } from "./Shared";

type AboutInfo = { name: string; version: string; repository: string };

export function About({ close }: { close: () => void }) {
  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    invoke<AboutInfo>("about_info")
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <Modal
      title="About XpieDB"
      close={close}
      actions={
        <Button appearance="primary" onClick={close}>
          Close
        </Button>
      }
    >
      <div className="about">
        {info && <p className="about-version">Version {info.version}</p>}
        <p>
          A local-first catalog for your personal video game collection. Your
          library stays on this computer.
        </p>
        <p className="about-credit">Created by Xpie, ChatGPT, and Claude.</p>
        {info && (
          <p>
            <Link
              href={info.repository}
              onClick={(e) => {
                // Open in the default browser, never inside the app window.
                e.preventDefault();
                invoke("open_link", { url: info.repository }).catch((err) =>
                  setError(String(err)),
                );
              }}
            >
              {info.repository.replace(/^https:\/\//, "")}
            </Link>
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <p className="muted about-small">
          Game data from IGDB (igdb.com). PDF reports use the DejaVu Sans font.
        </p>
      </div>
    </Modal>
  );
}
