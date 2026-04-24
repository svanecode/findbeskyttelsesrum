import Link from 'next/link'

const FOOTER_NAV: { href: string; label: string }[] = [
  { href: '/', label: 'Forside' },
  { href: '/land', label: 'Hele landet' },
  { href: '/kommune', label: 'Kommuner' },
  { href: '/kort', label: 'Landskort' },
  { href: '/om-data', label: 'Om data' },
]

const GITHUB_URL = 'https://github.com/svanecode/findbeskyttelsesrum'

export default function GlobalFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0a0a0a] px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-300">Navigation</h2>
          <ul className="mt-4 space-y-2 text-sm text-gray-400">
            {FOOTER_NAV.map(({ href, label }) => (
              <li key={href}>
                <Link href={href as never} className="transition-colors hover:text-white">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-300">Data og kilder</h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-400">
            Oplysningerne på destinationssiderne bygger på registrerede data og kan have begrænsninger. Læs metode,
            kilder og forbehold på{' '}
            <Link href="/om-data" className="text-gray-300 underline-offset-2 hover:text-white hover:underline">
              Om data
            </Link>
            .
          </p>
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <h2 className="text-xs font-medium uppercase tracking-wider text-gray-300">Juridisk</h2>
          <p className="mt-4 text-sm leading-relaxed text-gray-400">
            Bemærk: Denne tjeneste er uafhængig og er ikke tilknyttet, drevet eller godkendt af den danske stat eller
            nogen offentlige myndigheder.
          </p>
          <p className="mt-3 text-sm">
            <a
              href={GITHUB_URL}
              className="text-gray-400 underline-offset-2 transition-colors hover:text-white hover:underline"
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
