export function meaningfulNotes(html: string) {
  return !!new DOMParser()
    .parseFromString(html, "text/html")
    .body.textContent?.replace(/[\s\u200b\u00a0]/g, "");
}
