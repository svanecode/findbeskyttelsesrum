/*
 * Small, dependency-free charts for the private statistics page. Server
 * rendered: hovering a period reveals a tooltip through CSS, and every chart
 * has a table view (the keyboard and screen-reader path), so no value is
 * available by colour or hover alone.
 *
 * Colours follow the validated categorical palette (dark steps), checked
 * against the card surface #141517: blue #3987e5, orange #d95926.
 */

export const chartColors = { blue: "#3987e5", orange: "#d95926" } as const;

const countFormat = new Intl.NumberFormat("da-DK");

/**
 * A round axis maximum at or above the data maximum whose half is also a
 * whole number, so the middle gridline never shows 0,5 or 2,5 for counts.
 */
export function niceMax(value: number) {
  if (!(value > 0)) return 2;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = magnitude >= 10 ? [1, 2, 4, 5, 6, 8, 10] : [2, 4, 6, 8, 10];
  const step = steps.find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

export type ColumnSeries = { key: string; label: string; color: string };
export type ColumnPoint = {
  /** Short axis label, e.g. "28. sep." */
  label: string;
  /** Full label for the tooltip and table, e.g. "mandag 28. september". */
  title: string;
  values: Record<string, number | null>;
};

export function ColumnChart({
  title,
  series,
  points,
  format = (value) => countFormat.format(value),
  unit,
  emptyText = "Ingen data i perioden.",
}: {
  title: string;
  series: ColumnSeries[];
  points: ColumnPoint[];
  format?: (value: number) => string;
  unit?: string;
  emptyText?: string;
}) {
  if (!points.some((point) => series.some((item) => (point.values[item.key] ?? 0) > 0))) {
    return <p className="mt-4 rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-gray-400">{emptyText}</p>;
  }

  const max = niceMax(Math.max(0, ...points.flatMap((point) => series.map((item) => point.values[item.key] ?? 0))));
  const ticks = [max, max / 2, 0];
  const text = (value: number | null) => (value === null ? "ingen data" : `${format(value)}${unit ? ` ${unit}` : ""}`);

  return (
    <figure className="mt-4">
      {series.length > 1 ? (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-300" aria-label="Forklaring">
          {series.map((item) => (
            <li key={item.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <div className="flex h-40 w-10 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-gray-400" aria-hidden>
          {ticks.map((tick) => <span key={tick}>{format(tick)}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-40 border-b border-[#383835]" role="img" aria-label={`${title}. Tallene findes i tabellen under grafen.`}>
            <div className="absolute inset-x-0 top-0 border-t border-[#2c2c2a]" aria-hidden />
            <div className="absolute inset-x-0 top-1/2 border-t border-[#2c2c2a]" aria-hidden />
            <div className="absolute inset-0 flex items-end">
              {points.map((point, index) => {
                const align = index < points.length / 3 ? "left-0" : index > (points.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2";
                return (
                  <div
                    key={point.title}
                    className="group relative flex h-full flex-1 items-end justify-center gap-[2px] px-[1px] hover:bg-white/[0.04]"
                  >
                    {series.map((item) => {
                      const value = point.values[item.key];
                      return (
                        <span
                          key={item.key}
                          className="block w-full max-w-[24px] rounded-t-[4px]"
                          style={{
                            backgroundColor: item.color,
                            height: value ? `max(2px, ${(value / max) * 100}%)` : "0",
                          }}
                        />
                      );
                    })}
                    <span
                      className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max max-w-[16rem] rounded-lg border border-white/10 bg-[#1f2023] px-3 py-2 text-xs text-gray-200 shadow-lg group-hover:block ${align}`}
                    >
                      <span className="block font-semibold text-white">{point.title}</span>
                      {series.map((item) => (
                        <span key={item.key} className="mt-1 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }} />
                          {series.length > 1 ? `${item.label}: ` : ""}
                          <span className="tabular-nums">{text(point.values[item.key])}</span>
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* First, middle and last period only, so labels never collide or truncate. */}
          <div className="relative mt-1 h-4 text-[11px] text-gray-400" aria-hidden>
            {points.length > 0 ? <span className="absolute left-0">{points[0]!.label}</span> : null}
            {points.length > 2 ? (
              <span className="absolute -translate-x-1/2" style={{ left: `${((Math.floor(points.length / 2) + 0.5) / points.length) * 100}%` }}>
                {points[Math.floor(points.length / 2)]!.label}
              </span>
            ) : null}
            {points.length > 1 ? <span className="absolute right-0">{points[points.length - 1]!.label}</span> : null}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-gray-300 underline underline-offset-4">Vis som tabel</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-[#1f2023] text-xs text-gray-300">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Periode</th>
                {series.map((item) => <th key={item.key} scope="col" className="px-3 py-2 text-right font-medium">{item.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.title} className="border-t border-white/5">
                  <th scope="row" className="px-3 py-1.5 font-normal text-gray-300">{point.title}</th>
                  {series.map((item) => (
                    <td key={item.key} className="px-3 py-1.5 text-right tabular-nums text-gray-100">{text(point.values[item.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Horizontal bars for a few named categories, value at the bar end. */
export function BarList({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (rows.length === 0) return <p className="mt-4 text-sm text-gray-400">Ingen data endnu.</p>;
  return (
    <ul className="mt-4 space-y-3" aria-label={title}>
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-gray-200">{row.label}</span>
            <span className="tabular-nums text-gray-100">{countFormat.format(row.value)}</span>
          </div>
          <div className="mt-1 h-2 rounded-r-[4px]" aria-hidden>
            <div className="h-2 rounded-r-[4px]" style={{ width: `${(row.value / max) * 100}%`, minWidth: row.value > 0 ? "2px" : 0, backgroundColor: chartColors.blue }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
