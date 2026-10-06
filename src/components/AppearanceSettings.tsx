import { Switch } from "@fluentui/react-components";

/** Settings section: XpieDB's own orange highlight, or the colour chosen in the system settings. */
export function AppearanceSettings({
  useSystem,
  systemAccent,
  setUseSystem,
}: {
  useSystem: boolean;
  /** The system accent as hex, or null when this window cannot report one. */
  systemAccent: string | null;
  setUseSystem: (on: boolean) => void;
}) {
  return (
    <section className="appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Appearance</h2>
      <Switch
        label="Use the system accent colour"
        checked={useSystem && systemAccent !== null}
        disabled={systemAccent === null}
        onChange={(_, d) => setUseSystem(d.checked)}
      />
      {systemAccent === null ? (
        <p className="muted">
          This system does not share its accent colour with the app, so XpieDB
          uses its own orange.
        </p>
      ) : (
        <p className="muted accent-note">
          <span
            className="accent-swatch"
            style={{ background: systemAccent }}
            aria-hidden="true"
          />
          <span>
            Your system accent is{" "}
            <span className="accent-hex">{systemAccent}</span>.
            {useSystem
              ? " XpieDB follows it, including when you change it."
              : " Off: XpieDB uses its own orange."}
          </span>
        </p>
      )}
    </section>
  );
}
