import "server-only";

import { revalidatePath } from "next/cache";

export function revalidatePublicData() {
  for (const path of ["/", "/kort", "/kommune", "/om-data", "/sitemap.xml"]) {
    revalidatePath(path);
  }
  revalidatePath("/beskyttelsesrum/[slug]", "page");
  revalidatePath("/kommune/[slug]", "page");
  revalidatePath("/kommune/[slug]/side/[page]", "page");
}
