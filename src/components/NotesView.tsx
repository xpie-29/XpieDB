import { invoke } from "@tauri-apps/api/core";
import type { MouseEvent } from "react";
export function NotesView({
  html,
  onError,
}: {
  html: string;
  onError: (e: string) => void;
}) {
  const open = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    if (a) {
      e.preventDefault();
      if (e.button !== 2)
        invoke("open_link", { url: a.getAttribute("href") }).catch((e) =>
          onError(String(e)),
        );
    }
  };
  return (
    <div
      className="notes-view"
      onClick={open}
      onAuxClick={open}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
