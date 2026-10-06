import { useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Field,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Radio,
  RadioGroup,
  Select,
} from "@fluentui/react-components";
import { ImageAdd20Regular, PaintBrush20Regular } from "@fluentui/react-icons";
import { panelFits, type Game, type PanelBackground, type PanelFit } from "../types";
import { useImageData } from "./Shared";

const placement: Record<PanelFit, CSSProperties> = {
  fill: { backgroundSize: "cover", backgroundRepeat: "no-repeat" },
  fit: { backgroundSize: "contain", backgroundRepeat: "no-repeat" },
  stretch: { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat" },
  center: { backgroundSize: "auto", backgroundRepeat: "no-repeat" },
  tile: { backgroundSize: "auto", backgroundRepeat: "repeat" },
};

/** The faded picture behind a game's details, if its panel is set to one. */
export function PanelBackdrop({ game }: { game: Game }) {
  const { mode, image, fit } = game.panel;
  const path =
    mode === "cover" ? game.cover_path : mode === "image" ? image : null;
  const [data] = useImageData(path);
  if (!path || !data) return null;
  return (
    <div
      className={`detail-backdrop ${mode === "cover" ? "desaturated" : ""}`}
      data-mode={mode}
      aria-hidden="true"
      style={{
        backgroundImage: `url("${data}")`,
        backgroundPosition: "center",
        ...placement[mode === "cover" ? "fill" : fit],
      }}
    />
  );
}

/** A button and popover to choose the panel background for one game. */
export function PanelPicker({
  game,
  save,
  fail,
}: {
  game: Game;
  /** Saves the choice; resolves false if it was refused. */
  save: (panel: PanelBackground) => Promise<boolean>;
  fail: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const panel = game.panel;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  const chooseImage = () =>
    run(async () => {
      const path = await invoke<string | null>("select_image", {
        kind: "covers",
      }).catch((e) => {
        fail(String(e));
        return null;
      });
      if (!path) return;
      const ok = await save({ ...panel, mode: "image", image: path });
      if (!ok) await invoke("discard_image", { path }).catch(() => {});
    });
  return (
    <Popover positioning="below-start">
      <PopoverTrigger disableButtonEnhancement>
        <Button
          title="Panel background"
          aria-label="Panel background"
          icon={<PaintBrush20Regular />}
          appearance="subtle"
        />
      </PopoverTrigger>
      <PopoverSurface aria-label="Panel background" className="panel-picker">
        <RadioGroup
          aria-label="Panel background"
          value={panel.mode}
          disabled={busy}
          onChange={(_, d) => {
            const mode = d.value as PanelBackground["mode"];
            if (mode === "image" && !panel.image) void chooseImage();
            else void run(async () => void (await save({ ...panel, mode })));
          }}
        >
          <Radio value="default" label="Default gray" />
          <Radio
            value="cover"
            label="Cover art"
            disabled={!game.cover_path}
          />
          <Radio value="image" label="Your own image" />
        </RadioGroup>
        {panel.mode === "image" && (
          <>
            <Field label="Placement">
              <Select
                value={panel.fit}
                disabled={busy}
                onChange={(_, d) =>
                  void run(
                    async () =>
                      void (await save({ ...panel, fit: d.value as PanelFit })),
                  )
                }
              >
                {panelFits.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              icon={<ImageAdd20Regular />}
              disabled={busy}
              onClick={() => void chooseImage()}
            >
              Choose a different image
            </Button>
          </>
        )}
      </PopoverSurface>
    </Popover>
  );
}
