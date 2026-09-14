export function stripLocationDataFromMetric<TEvent extends { url: string }>(
  event: TEvent,
  baseUrl = "https://findbeskyttelsesrum.dk",
): TEvent | null {
  try {
    const url = new URL(event.url, baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.search = "";
    url.hash = "";
    url.username = "";
    url.password = "";
    return { ...event, url: url.toString() };
  } catch {
    return null;
  }
}
