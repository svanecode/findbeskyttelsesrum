import Link from 'next/link'

const FOOTER_NAV: { href: string; label: string }[] = [
  { href: '/', label: 'Forside' },
  { href: '/kort', label: 'Landskort' },
  { href: '/kommune', label: 'Kommuneoversigt' },
  { href: '/om-data', label: 'Datagrundlag' },
]

const GITHUB_URL = 'https://github.com/svanecode/findbeskyttelsesrum'

export default function GlobalFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0a0a0a] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pb-[max(2rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-6 sm:px-6 sm:pb-10 sm:pt-10 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3 lg:gap-12">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-300">Find beskyttelsesrum</h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-400">
            Søg efter registrerede beskyttelsesrum i Danmark.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-gray-400">
            {FOOTER_NAV.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href as never}
                  className="inline-flex min-h-[44px] items-center py-1 transition-colors hover:text-white"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-300">Data og forbehold</h2>
          <div className="mt-4 space-y-2 text-sm leading-relaxed text-gray-400">
            <p>Bygger på offentlige BBR- og DAR-registerdata.</p>
            <p>Følg altid myndighedernes anvisninger.</p>
            <p>Uafhængig. Ikke tilknyttet den danske stat.</p>
          </div>
          <p className="mt-4 text-sm">
            <Link
              href="/om-data"
              className="inline-flex min-h-[44px] items-center text-gray-300 underline-offset-2 hover:text-white hover:underline"
            >
              Læs om datagrundlaget
            </Link>
          </p>
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-300">Kontakt og kode</h2>
          <p className="mt-3 text-sm">
            <a
              href={GITHUB_URL}
              className="inline-flex min-h-[44px] items-center text-gray-400 underline-offset-2 transition-colors hover:text-white hover:underline"
              rel="noopener noreferrer"
              target="_blank"
            >
              Kildekode på GitHub
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
