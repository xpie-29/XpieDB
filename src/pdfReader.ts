// A thin wrapper around PDF.js's viewer components, so the reader screen deals in plain values.
// This module (and PDF.js) is only loaded when a guide is opened for reading.
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  EventBus,
  PDFFindController,
  PDFLinkService,
  PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type OutlineNode = { title: string; dest: unknown; items: OutlineNode[] };
export type Callbacks = {
  page: (page: number) => void;
  /** The zoom in effect: a preset name ("page-width") or a number as text ("1.25"). */
  zoom: (zoom: string) => void;
  matches: (current: number, total: number) => void;
  /** After a search: whether the words were found. */
  found: (found: boolean) => void;
};
export type OpenFailure =
  | "password"
  | "missing"
  | "invalid"
  | "network"
  | "unknown";

/** Turns whatever PDF.js threw into a reason the screen can explain. */
export function failureOf(error: unknown): OpenFailure {
  const { name = "", status } = (error ?? {}) as {
    name?: string;
    status?: number;
  };
  if (status === 404) return "missing";
  if (name === "PasswordException") return "password";
  if (name === "MissingPDFException") return "missing";
  if (name === "InvalidPDFException" || name === "FormatError") return "invalid";
  if (name === "ResponseException" || name === "UnexpectedResponseException")
    return "network";
  return "unknown";
}

/**
 * Feeds PDF.js exact byte ranges of a file, so it never has to download the whole thing. The server
 * may return fewer bytes than asked for (it caps each reply), so each range is fetched in a loop.
 */
class RangeTransport extends pdfjs.PDFDataRangeTransport {
  constructor(
    length: number,
    initial: Uint8Array,
    private readonly url: string,
    private readonly failed: (error: Error) => void,
  ) {
    super(length, initial);
  }
  private async fetchRange(begin: number, end: number): Promise<Uint8Array> {
    const out = new Uint8Array(end - begin);
    let filled = 0;
    while (filled < out.length) {
      const from = begin + filled;
      const response = await fetch(this.url, {
        headers: { Range: `bytes=${from}-${end - 1}` },
      });
      if (!response.ok) {
        throw Object.assign(new Error("Could not read the file"), {
          name: "ResponseException",
          status: response.status,
        });
      }
      const part = new Uint8Array(await response.arrayBuffer());
      if (!part.length) throw new Error("The file ended early");
      // A server that ignores Range sends the whole file from the start.
      const chunk = response.status === 206 ? part : part.subarray(from);
      const take = Math.min(chunk.length, out.length - filled);
      out.set(chunk.subarray(0, take), filled);
      filled += take;
    }
    return out;
  }
  requestDataRange(begin: number, end: number) {
    this.fetchRange(begin, end).then(
      (data) => this.onDataRange(begin, data),
      (error) => this.failed(error),
    );
  }
  static async start(
    url: string,
    length: number,
    failed: (error: Error) => void,
  ): Promise<RangeTransport> {
    const first = Math.min(length, 128 * 1024);
    const probe = new RangeTransport(length, new Uint8Array(0), url, failed);
    const initial = await probe.fetchRange(0, first);
    return new RangeTransport(length, initial, url, failed);
  }
}

const assets = (folder: string) =>
  new URL(`/pdfjs/${folder}/`, window.location.origin).href;

export class PdfReader {
  private readonly bus = new EventBus();
  private readonly links = new PDFLinkService({ eventBus: this.bus });
  private readonly finder = new PDFFindController({
    eventBus: this.bus,
    linkService: this.links,
  });
  private readonly viewer: PDFViewer;
  private task: pdfjs.PDFDocumentLoadingTask | null = null;
  private doc: pdfjs.PDFDocumentProxy | null = null;
  private query = "";

  constructor(
    container: HTMLDivElement,
    viewerElement: HTMLDivElement,
    private readonly callbacks: Callbacks,
  ) {
    this.viewer = new PDFViewer({
      container,
      viewer: viewerElement,
      eventBus: this.bus,
      linkService: this.links,
      findController: this.finder,
      textLayerMode: 1,
    });
    this.links.setViewer(this.viewer);
    this.bus.on("pagechanging", (e: { pageNumber: number }) =>
      this.callbacks.page(e.pageNumber),
    );
    this.bus.on(
      "scalechanging",
      (e: { scale: number; presetValue?: string }) =>
        this.callbacks.zoom(e.presetValue ?? e.scale.toFixed(2)),
    );
    this.bus.on(
      "updatefindmatchescount",
      (e: { matchesCount: { current: number; total: number } }) =>
        this.callbacks.matches(e.matchesCount.current, e.matchesCount.total),
    );
    this.bus.on(
      "updatefindcontrolstate",
      (e: { state: number; matchesCount: { current: number; total: number } }) => {
        // 1 = not found; 3 = still searching.
        if (e.state !== 3) this.callbacks.found(e.state !== 1);
        this.callbacks.matches(e.matchesCount.current, e.matchesCount.total);
      },
    );
  }

  /**
   * Opens a PDF of a known size by URL, starting at a page and zoom. Only the parts being read are
   * fetched (guides can be hundreds of megabytes). Resolves with the page count.
   */
  async open(
    url: string,
    size: number,
    startPage: number,
    zoom: string,
  ): Promise<number> {
    await this.close();
    let fail: (error: Error) => void = () => {};
    const failure = new Promise<never>((_, reject) => (fail = reject));
    failure.catch(() => {});
    const transport = await RangeTransport.start(url, size, (e) => fail(e));
    const task = pdfjs.getDocument({
      range: transport,
      rangeChunkSize: 1024 * 1024,
      disableAutoFetch: true,
      cMapUrl: assets("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: assets("standard_fonts"),
      wasmUrl: assets("wasm"),
      iccUrl: assets("iccs"),
    });
    this.task = task;
    const doc = await Promise.race([task.promise, failure]);
    if (this.task !== task) {
      // Another document was opened while this one loaded (closing destroyed its task).
      throw new Error("superseded");
    }
    this.doc = doc;
    this.viewer.setDocument(doc);
    this.links.setDocument(doc, null);
    await this.viewer.firstPagePromise;
    this.setZoom(zoom);
    this.viewer.currentPageNumber = Math.min(
      Math.max(1, startPage),
      doc.numPages,
    );
    return doc.numPages;
  }

  async close() {
    const task = this.task;
    this.task = null;
    this.doc = null;
    this.query = "";
    if (task) {
      try {
        this.viewer.setDocument(null as never);
      } catch {
        // The viewer had nothing to clear.
      }
      await task.destroy().catch(() => {});
    }
  }

  goToPage(page: number) {
    if (!this.doc) return;
    this.viewer.currentPageNumber = Math.min(
      Math.max(1, Math.round(page)),
      this.doc.numPages,
    );
  }
  get pages() {
    return this.doc?.numPages ?? 0;
  }
  setZoom(zoom: string) {
    const value = Number(zoom);
    this.viewer.currentScaleValue = Number.isFinite(value)
      ? String(Math.min(5, Math.max(0.25, value)))
      : zoom;
  }
  zoomIn() {
    this.viewer.increaseScale();
  }
  zoomOut() {
    this.viewer.decreaseScale();
  }
  /** Re-fits after the window or a side panel changes the page area's size. */
  refit() {
    const zoom = this.viewer.currentScaleValue;
    // "Fit width", "Fit page" and "Automatic" depend on the area's size, so apply them again.
    if (zoom === "page-width" || zoom === "page-fit" || zoom === "auto")
      this.viewer.currentScaleValue = zoom;
    else this.viewer.update();
  }

  /** Searches for words, from the top for a new query or onward for the same one. */
  find(query: string, backwards = false) {
    const again = query === this.query && query !== "";
    this.query = query;
    if (!query.trim()) {
      this.clearFind();
      return;
    }
    this.bus.dispatch("find", {
      source: this,
      type: again ? "again" : "",
      query,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: backwards,
      matchDiacritics: true,
    });
  }
  clearFind() {
    this.query = "";
    this.bus.dispatch("findbarclose", { source: this });
    this.callbacks.matches(0, 0);
    this.callbacks.found(true);
  }

  /** The document's own table of contents, if it has one. */
  async outline(): Promise<OutlineNode[]> {
    if (!this.doc) return [];
    const walk = (
      items: Array<{ title: string; dest: unknown; items?: unknown[] }> | null,
    ): OutlineNode[] =>
      (items ?? []).map((item) => ({
        title: item.title,
        dest: item.dest,
        items: walk(
          (item.items ?? null) as Parameters<typeof walk>[0],
        ),
      }));
    return walk(
      (await this.doc.getOutline()) as Parameters<typeof walk>[0],
    );
  }
  goToOutline(node: OutlineNode) {
    if (node.dest) void this.links.goToDestination(node.dest as never);
  }
}
