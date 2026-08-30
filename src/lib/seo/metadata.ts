import type { Metadata } from "next";

import { siteLocale, siteName, siteOpenGraphImagePath, siteUrl } from "@/lib/seo/site";

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  keywords?: string[];
  index?: boolean;
  follow?: boolean;
};

function getSocialTitle(title: string, absoluteTitle: boolean) {
  return absoluteTitle ? title : `${title} | ${siteName}`;
}

export function createPageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
  keywords,
  index = true,
  follow = true,
}: PageMetadataOptions): Metadata {
  const canonicalUrl = new URL(path, siteUrl).toString();
  const socialTitle = getSocialTitle(title, absoluteTitle);
  const imageUrl = new URL(siteOpenGraphImagePath, siteUrl).toString();

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    ...(keywords ? { keywords } : {}),
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: socialTitle,
      description,
      type: "website",
      url: canonicalUrl,
      siteName,
      locale: siteLocale,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [imageUrl],
    },
    ...(!index || !follow
      ? {
          robots: {
            index,
            follow,
            googleBot: {
              index,
              follow,
              "max-video-preview": -1,
              "max-image-preview": "large" as const,
              "max-snippet": -1,
            },
          },
        }
      : {}),
  };
}
