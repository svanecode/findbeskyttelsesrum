import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import { publicDataRevisionTag } from "@/lib/supabase/queries/public-data-cache";

export function revalidatePublicData() {
  // Public reads are cached per data revision. Expire the cached revision first,
  // so regenerated pages read the revision this change created.
  revalidateTag(publicDataRevisionTag, { expire: 0 });
  for (const path of ["/", "/kort", "/kommune", "/om-data", "/sitemap.xml"]) {
    revalidatePath(path);
  }
  revalidatePath("/beskyttelsesrum/[slug]", "page");
  revalidatePath("/kommune/[slug]", "page");
  revalidatePath("/kommune/[slug]/side/[page]", "page");
}
