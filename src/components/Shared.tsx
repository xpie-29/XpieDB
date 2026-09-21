import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@fluentui/react-components";
import type { Platform } from "../types";
import placeholder from "../placeholder.svg";

export function ManagedImage({
  path,
  alt,
  className = "",
}: {
  path: string | null;
  alt: string;
  className?: string;
}) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setImage(null);
    if (path)
      invoke<string>("image_data", { path })
        .then((v) => {
          if (live) setImage(v);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);
  return (
    <img
      className={className}
      src={image ?? placeholder}
      alt={alt}
      onError={() => setImage(null)}
    />
  );
}
export function PlatformIcon({ platform }: { platform?: Platform }) {
  return (
    <span
      className="platform-icon"
      title={platform?.name ?? "Unknown platform"}
    >
      {platform?.icon_path ? (
        <ManagedImage path={platform.icon_path} alt={platform.name} />
      ) : (
        <span>{platform?.short_name ?? "?"}</span>
      )}
    </span>
  );
}
export function Modal({
  title,
  children,
  actions,
  close,
}: {
  title: string;
  children: ReactNode;
  actions: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <div>{children}</div>
      <div className="modal-actions">{actions}</div>
    </dialog>
  );
}
export function Confirm({
  title,
  text,
  label = "Delete",
  confirm,
  close,
  busy,
}: {
  title: string;
  text: string;
  label?: string;
  confirm: () => void;
  close: () => void;
  busy: boolean;
}) {
  return (
    <Modal
      title={title}
      close={() => {
        if (!busy) close();
      }}
      actions={
        <>
          <Button disabled={busy} onClick={close}>
            Cancel
          </Button>
          <Button appearance="primary" disabled={busy} onClick={confirm}>
            {label}
          </Button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  );
}
