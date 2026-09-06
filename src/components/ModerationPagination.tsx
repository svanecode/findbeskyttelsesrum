import type { Route } from "next";
import Link from "next/link";

export default function ModerationPagination({
  basePath,
  status,
  page,
  totalPages,
  totalCount,
}: {
  basePath: "/admin" | "/admin/kontakt";
  status?: string;
  page: number;
  totalPages: number;
  totalCount: number;
}) {
  function href(targetPage: number) {
    const query = new URLSearchParams({ page: String(targetPage) });
    if (status) query.set("status", status);
    return `${basePath}?${query}` as Route;
  }

  const linkClass = "inline-flex min-h-[44px] items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-gray-200 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300";
  return (
    <nav className="my-6 flex flex-wrap items-center gap-3" aria-label="Sider i køen">
      <p className="mr-auto text-sm text-gray-400">Side {page} af {totalPages} · {totalCount.toLocaleString("da-DK")} i denne visning</p>
      {page > 1 ? <Link href={href(page - 1)} className={linkClass}>Forrige side</Link> : null}
      {page < totalPages ? <Link href={href(page + 1)} className={linkClass}>Næste side</Link> : null}
    </nav>
  );
}
