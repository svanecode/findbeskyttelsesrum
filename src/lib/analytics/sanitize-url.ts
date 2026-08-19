export function stripLocationDataFromMetric<TEvent extends { url: string }>(
  event: TEvent,
  baseUrl = "https://findbeskyttelsesrum.invalid",
): TEvent {
  try {
    const url = new URL(event.url, baseUrl);
    return { ...event, url: url.pathname };
  } catch {
    return { ...event, url: event.url.split(/[?#]/, 1)[0] ?? "/" };
  }
}
