import Link from 'next/link'

const FOOTER_NAV = [
  { href: '/', label: 'Søg' },
  { href: '/kort', label: 'Landskort' },
  { href: '/kommune', label: 'Kommuner' },
  { href: '/om-data', label: 'Datagrundlag' },
  { href: '/privatliv', label: 'Privatliv' },
  { href: '/om-data#rapportering', label: 'Rapportér fejl' },
] as const

const GITHUB_URL = 'https://github.com/svanecode/findbeskyttelsesrum'

export default function GlobalFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-[#0a0a0a] px-[max(1rem,env(safe-area-inset-left,0px))] pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl text-sm leading-6 text-gray-400">
          <p className="font-medium text-gray-200">BBR-registreringer til orientering</p>
          <p className="mt-1">
            Offentlig adgang, klargøring og fysisk stand er ikke bekræftet. Følg altid myndighedernes information.
          </p>
          <p className="mt-1 text-xs text-gray-400">Uafhængig tjeneste · Ikke tilknyttet den danske stat</p>
        </div>

        <nav aria-label="Sidefod" className="flex max-w-lg flex-wrap gap-x-1 gap-y-1 text-sm">
          {FOOTER_NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="inline-flex min-h-[44px] items-center rounded-md px-3 text-gray-300 hover:bg-white/5 hover:text-white">
              {label}
            </Link>
          ))}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded-md px-3 text-gray-300 hover:bg-white/5 hover:text-white">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  )
}
