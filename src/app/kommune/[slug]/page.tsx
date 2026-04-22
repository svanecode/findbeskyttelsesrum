import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getAppV2MunicipalityBySlug,
  getAppV2MunicipalityShelters,
  getAppV2MunicipalityShelterStats,
  groupMunicipalityShelters,
} from '@/lib/supabase/app-v2-queries'
import KommuneExperience from './kommune-experience'
export { generateMetadata } from './metadata'

export const revalidate = 3600

interface Props {
  params: Promise<{ slug: string }>
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  const formatted =
    typeof value === 'number' ? value.toLocaleString('da-DK') : value
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-white">{formatted}</p>
    </div>
  )
}

export default async function KommunePage({ params }: Props) {
  const { slug } = await params
  const municipality = await getAppV2MunicipalityBySlug(slug)

  if (!municipality) notFound()

  const [shelters, stats] = await Promise.all([
    getAppV2MunicipalityShelters(municipality.id),
    getAppV2MunicipalityShelterStats(municipality.id),
  ])

  const groups = groupMunicipalityShelters(shelters)

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Background grid */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[#0a0a0a]" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      </div>

      {/* Nav */}
      <nav className="border-b border-white/10 bg-black/30 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-1">
            <Link href="/" className="text-gray-400 transition-colors hover:text-white">
              Forside
            </Link>
            <span className="mx-1.5 text-gray-600">›</span>
            <Link href="/kommune" className="text-gray-400 transition-colors hover:text-white">
              Kommuner
            </Link>
            <span className="mx-1.5 text-gray-600">›</span>
            <span className="font-medium text-white">{municipality.name}</span>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/land" className="text-gray-400 transition-colors hover:text-white">
              Hele landet
            </Link>
            <Link href="/om-data" className="text-gray-400 transition-colors hover:text-white">
              Om data
            </Link>
          </div>
        </div>
      </nav>

      {/* Header */}
      <header className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-widest text-gray-500">
          Kommune
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
          Beskyttelsesrum i {municipality.name}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-300">
          {groups.length.toLocaleString('da-DK')}{' '}
          {groups.length === 1 ? 'adresse' : 'adresser'} med samlet{' '}
          {stats.totalCapacity.toLocaleString('da-DK')} registrerede pladser (sum af kapacitet i aktive registreringer).
        </p>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Adresser" value={groups.length} />
          <StatCard label="Aktive registreringer" value={municipality.activeShelterCount} />
          <StatCard label="Registrerede pladser" value={stats.totalCapacity} />
          <StatCard label="Postområder i datalaget" value={stats.postalAreaCount} />
        </div>
      </header>

      {/* List + map experience */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-6 max-w-3xl rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-gray-300 sm:p-5">
          <p>
            Liste og kort viser aktive registreringer i det aktuelle datalag. Kortet giver lokalt overblik med den
            normale kortoplevelse og er ikke i sig selv et bevis på fuld app_v2-cutover af hele kortfladen.
          </p>
          <p className="mt-2 text-gray-400">
            Brug{" "}
            <Link href="/om-data" className="text-white underline-offset-2 hover:underline">
              Om data
            </Link>{" "}
            for grænsen mellem registerfelter og den almindelige adressesøgning.
          </p>
        </div>
        <KommuneExperience
          groups={groups}
          municipalityName={municipality.name}
        />
      </section>

      {/* Footer links */}
      <div className="border-t border-white/10 bg-black/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-6 text-sm sm:px-6 lg:px-8">
          <Link href="/land" className="text-gray-400 hover:text-white transition-colors">
            Hele landet
          </Link>
          <Link href="/kommune" className="text-gray-400 hover:text-white transition-colors">
            Kommuner
          </Link>
          <Link href="/om-data" className="text-gray-400 hover:text-white transition-colors">
            Om data
          </Link>
        </div>
      </div>
    </main>
  )
}
