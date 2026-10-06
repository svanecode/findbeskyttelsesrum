/**
 * Groups map pins that would cover each other on screen (4.1). Points are in
 * pixels at the current zoom; a pin joins the first group whose first pin is
 * closer than `distancePx`. The order of the input is kept, so the result
 * list's numbers stay in order inside a group ("1, 2").
 */
export type ScreenPoint = { id: string; x: number; y: number };

export function groupOverlappingPoints(points: ScreenPoint[], distancePx: number): string[][] {
  const groups: Array<{ anchor: ScreenPoint; ids: string[] }> = [];
  for (const point of points) {
    const group = groups.find(({ anchor }) => Math.hypot(anchor.x - point.x, anchor.y - point.y) < distancePx);
    if (group) group.ids.push(point.id);
    else groups.push({ anchor: point, ids: [point.id] });
  }
  return groups.map((group) => group.ids);
}
