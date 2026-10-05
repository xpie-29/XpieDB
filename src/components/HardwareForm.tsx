import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Checkbox,
  Field,
  Input,
  Select,
} from "@fluentui/react-components";
import {
  Save20Regular,
  Dismiss20Regular,
  ImageAdd20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import type { Hardware, HardwareInput, Platform } from "../types";
import {
  emptyHardware,
  hardwareCompleteness,
  hardwareConditions,
  hardwareStatuses,
} from "../types";
import { parsePrice } from "../hardwareQuery";
import { ManagedImage, Modal } from "./Shared";
import { NotesEditor } from "./Notes";

const priceText = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toFixed(2);

export function HardwareForm({
  item,
  initial,
  all,
  platforms,
  saved,
  cancel,
}: {
  item?: Hardware;
  /** Starting values for a new item, e.g. an accessory with its system already chosen. */
  initial?: HardwareInput;
  all: Hardware[];
  platforms: Platform[];
  saved: (item: Hardware) => void;
  cancel: () => void;
}) {
  const [draft, setDraft] = useState<HardwareInput>(() =>
    item
      ? { ...item, compat_platform_ids: [...item.compat_platform_ids] }
      : (initial ?? emptyHardware("system")),
  );
  const [purchase, setPurchase] = useState(priceText(draft.purchase_price_cents));
  const [sale, setSale] = useState(priceText(draft.sale_price_cents));
  const [imports, setImports] = useState<string[]>(
    initial?.photo_path ? [initial.photo_path] : [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Selling a system that has accessories asks what happens to each one.
  const [asking, setAsking] = useState<Hardware[] | null>(null);
  const [going, setGoing] = useState<number[]>([]);
  const change = <K extends keyof HardwareInput>(
    key: K,
    value: HardwareInput[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));
  const systems = all
    .filter((h) => h.kind === "system" && h.id !== item?.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const accessories = item
    ? all.filter((h) => h.parent_id === item.id)
    : [];
  const isAccessory = draft.kind === "accessory";
  const cleanup = async () => {
    for (const path of imports) await invoke("discard_image", { path });
  };
  const pick = async () => {
    setBusy(true);
    setError("");
    try {
      const path = await invoke<string | null>("select_image", {
        kind: "covers",
      });
      if (path) {
        setImports((v) => [...v, path]);
        change("photo_path", path);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async (withAccessories: number[]) => {
    const bought = parsePrice(purchase);
    const sold = draft.status === "Owned" ? null : parsePrice(sale);
    if (bought === undefined || sold === undefined) {
      setError("Enter prices like 49.99.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await invoke<Hardware>("save_hardware", {
        id: item?.id ?? null,
        input: {
          ...draft,
          purchase_price_cents: bought,
          sale_price_cents: sold,
        },
        withAccessories,
      });
      try {
        await cleanup();
      } catch (e) {
        console.warn("Unused image cleanup:", e);
      }
      saved(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = () => {
    const leaving =
      item?.kind === "system" &&
      item.status === "Owned" &&
      draft.kind === "system" &&
      draft.status !== "Owned" &&
      accessories.length > 0;
    if (leaving) {
      setGoing(accessories.map((a) => a.id));
      setAsking(accessories);
    } else void save([]);
  };
  const text = (key: keyof HardwareInput, label: string, span = false) => (
    <Field label={label} className={span ? "span-two" : undefined}>
      <Input
        maxLength={500}
        value={(draft[key] as string | null) ?? ""}
        onChange={(_, d) => change(key, (d.value || null) as never)}
      />
    </Field>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <header className="page-header">
        <h1>
          {item ? "Edit" : "Add"} {isAccessory ? "Accessory" : "System"}
        </h1>
        <div className="actions">
          <Button
            type="button"
            disabled={busy}
            icon={<Dismiss20Regular />}
            onClick={async () => {
              setBusy(true);
              try {
                await cleanup();
                cancel();
              } catch (e) {
                setError(String(e));
                setBusy(false);
              }
            }}
          >
            Cancel
          </Button>
          <Button
            appearance="primary"
            type="submit"
            disabled={busy}
            icon={<Save20Regular />}
          >
            Save
          </Button>
        </div>
      </header>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <fieldset disabled={busy} inert={busy} className="form-layout">
        <div className="cover-column">
          <ManagedImage
            path={draft.photo_path}
            alt="Photo"
            className="cover"
          />
          <Button type="button" icon={<ImageAdd20Regular />} onClick={pick}>
            Choose photo
          </Button>
          {draft.photo_path && (
            <Button
              type="button"
              icon={<Delete20Regular />}
              onClick={() => change("photo_path", null)}
            >
              Remove photo
            </Button>
          )}
        </div>
        <div className="form-fields">
          <Field label="Type">
            <Select
              value={draft.kind}
              onChange={(_, d) => {
                const kind = d.value as HardwareInput["kind"];
                setDraft((v) => ({
                  ...v,
                  kind,
                  parent_id: kind === "system" ? null : v.parent_id,
                  compat_platform_ids:
                    kind === "system" ? [] : v.compat_platform_ids,
                }));
              }}
            >
              <option value="system">System (console, PC, handheld)</option>
              <option value="accessory">Accessory</option>
            </Select>
          </Field>
          <Field label="Name" required>
            <Input
              required
              maxLength={300}
              value={draft.name}
              onChange={(_, d) => change("name", d.value)}
              autoFocus
            />
          </Field>
          <Field label="Platform">
            <Select
              value={draft.platform_id ?? ""}
              onChange={(_, d) =>
                change("platform_id", d.value ? Number(d.value) : null)
              }
            >
              <option value="">Not specified</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {isAccessory && (
            <Field label="Belongs to system">
              <Select
                value={draft.parent_id ?? ""}
                onChange={(_, d) =>
                  change("parent_id", d.value ? Number(d.value) : null)
                }
              >
                <option value="">None (loose accessory)</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {isAccessory && (
            <fieldset className="compat span-two">
              <legend>Also works with</legend>
              <div className="compat-list">
                {platforms
                  .filter((p) => p.id !== draft.platform_id)
                  .map((p) => (
                    <Checkbox
                      key={p.id}
                      label={p.name}
                      checked={draft.compat_platform_ids.includes(p.id)}
                      onChange={(_, d) =>
                        change(
                          "compat_platform_ids",
                          d.checked
                            ? [...draft.compat_platform_ids, p.id]
                            : draft.compat_platform_ids.filter(
                                (id) => id !== p.id,
                              ),
                        )
                      }
                    />
                  ))}
              </div>
            </fieldset>
          )}
          {text("manufacturer", "Manufacturer")}
          {text("model", "Model")}
          {text("region", "Region")}
          {text("serial", "Serial number")}
          {text("color", "Color or edition")}
          <Field label="Condition">
            <Select
              value={draft.condition ?? ""}
              onChange={(_, d) => change("condition", d.value || null)}
            >
              <option value="">Not specified</option>
              {hardwareConditions.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Completeness">
            <Select
              value={draft.completeness ?? ""}
              onChange={(_, d) => change("completeness", d.value || null)}
            >
              <option value="">Not specified</option>
              {hardwareCompleteness.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <div className="span-two checks">
            <Checkbox
              label="Working"
              checked={draft.is_working}
              onChange={(_, d) => change("is_working", d.checked === true)}
            />
            <Checkbox
              label="Modded"
              checked={draft.is_modded}
              onChange={(_, d) => change("is_modded", d.checked === true)}
            />
          </div>
          <Field label="Purchase date">
            <Input
              type="date"
              value={draft.purchase_date ?? ""}
              onChange={(_, d) => change("purchase_date", d.value || null)}
            />
          </Field>
          <Field label="Price paid">
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={purchase}
              onChange={(_, d) => setPurchase(d.value)}
            />
          </Field>
          {text("purchase_source", "Bought from", true)}
          <Field label="Status">
            <Select
              value={draft.status}
              onChange={(_, d) => change("status", d.value)}
            >
              {hardwareStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          {draft.status !== "Owned" && (
            <>
              <Field label={`${draft.status} on`}>
                <Input
                  type="date"
                  value={draft.sale_date ?? ""}
                  onChange={(_, d) => change("sale_date", d.value || null)}
                />
              </Field>
              <Field label="Price received">
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={sale}
                  onChange={(_, d) => setSale(d.value)}
                />
              </Field>
            </>
          )}
          <section className="span-two">
            <h2>Notes</h2>
            <NotesEditor
              value={draft.notes_html}
              change={(html) => change("notes_html", html)}
            />
          </section>
        </div>
      </fieldset>
      {asking && (
        <Modal
          title={`What happens to the accessories of ${draft.name}?`}
          close={() => setAsking(null)}
          actions={
            <>
              <Button onClick={() => setAsking(null)}>Back</Button>
              <Button
                appearance="primary"
                onClick={() => {
                  setAsking(null);
                  void save(going);
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <p>
            Tick the ones that {draft.status.toLowerCase()} with it. The rest
            stay in your collection as loose accessories.
          </p>
          <div className="dialog-fields">
            {asking.map((a) => (
              <Checkbox
                key={a.id}
                label={`${a.name} (${draft.status.toLowerCase()} with it)`}
                checked={going.includes(a.id)}
                onChange={(_, d) =>
                  setGoing((g) =>
                    d.checked ? [...g, a.id] : g.filter((id) => id !== a.id),
                  )
                }
              />
            ))}
          </div>
        </Modal>
      )}
    </form>
  );
}
