import { createPageMetadata } from "@/lib/seo/metadata";

export const metadata = createPageMetadata({
  title: "Registreringer i nærheden",
  description:
    "Orienterende kort og liste over BBR-registrerede sikringsrumspladser i nærheden.",
  path: "/shelters/nearby",
  index: false,
  follow: false,
});

export default function NearbyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
