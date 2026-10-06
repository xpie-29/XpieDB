/** Returns a copy of `items` with the item at `from` moved to index `to`. */
export function moved<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Keeps `index` inside a list of `length` items. */
export function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(length - 1, index));
}

/**
 * The order to save when some backlog games are hidden. `all` is the whole backlog in its saved order;
 * hidden games keep their places and the visible ones fill the other places in the order given.
 */
export function withHidden(
  visibleOrder: readonly number[],
  all: ReadonlyArray<{ id: number; hidden: boolean }>,
): number[] {
  const queue = [...visibleOrder];
  return all.map((g) => (g.hidden ? g.id : (queue.shift() ?? g.id)));
}
