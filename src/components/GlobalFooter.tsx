import Link from 'next/link'

const FOOTER_NAV = [
  { href: '/om-data', label: 'Datagrundlag' },
  { href: '/privatliv', label: 'Privatliv' },
  { href: '/om-data#rapportering', label: 'Rapportér fejl' },
] as const

const GITHUB_URL = 'https://github.com/svanecode/findbeskyttelsesrum'

export default function GlobalFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-[var(--surface-page)] px-[max(1rem,env(safe-area-inset-left,0px))] pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+0.5rem))] pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-3xl text-xs leading-5 text-gray-400 sm:text-sm">
          <p>
            <span className="font-medium text-gray-200">BBR-data til orientering.</span>{' '}
            Offentlig adgang, klargøring og fysisk stand er ikke bekræftet.
          </p>
          <p className="text-xs text-gray-400">Uafhængig tjeneste · Ikke en myndighedstjeneste</p>
        </div>

        <nav aria-label="Sidefod" className="grid grid-cols-2 gap-x-1 text-sm sm:flex sm:flex-wrap sm:justify-end">
          {FOOTER_NAV.map(({ href, label }) => (
            <Link key={href} href={href} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-gray-300 hover:bg-white/[0.05] hover:text-white">
              {label}
            </Link>
          ))}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-gray-300 hover:bg-white/[0.05] hover:text-white">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  )
}
