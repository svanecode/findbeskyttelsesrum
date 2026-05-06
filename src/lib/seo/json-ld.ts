import { siteUrl } from "@/lib/seo/site";

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function getWebsiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Find Beskyttelsesrum",
    url: siteUrl,
    inLanguage: "da",
  };
}

