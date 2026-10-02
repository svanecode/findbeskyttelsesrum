import Link from 'next/link'

import GlobalFooter from '@/components/GlobalFooter'
import { ui } from '@/components/ui-classes'
import { serializeJsonLd } from '@/lib/seo/json-ld'
import type { AppV2MunicipalityShelter, AppV2MunicipalityShelterGroup } from '@/lib/supabase/app-v2-queries'
import KommuneExperience from './kommune-experience'

type Props = {
  municipality: { name: string; slug: string }
  shelters: AppV2MunicipalityShelter[]
  pagination: {
    items: AppV2MunicipalityShelterGroup[]
    currentPage: number
    totalPages: number
    totalItems: number
    firstItemNumber: number
    lastItemNumber: number
  }
  /** Set on the search route; the plain municipality pages leave it empty. */
  searchQuery?: string
  jsonLd?: unknown[]
}

export default function KommuneView({ municipality, shelters, pagination, searchQuery = '', jsonLd }: Props) {
  const publicShelterCount = shelters.length
  const totalCapacity = shelters.reduce((sum, shelter) => sum + shelter.capacity, 0)

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
          suppressHydrationWarning
        />
      ) : null}
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <nav aria-label="Brødkrummer" className="text-sm text-gray-400">
          <Link href="/kommune" className="hover:text-white">
            Kommuner
          </Link>
          <span className="mx-2 text-gray-500" aria-hidden>
            /
          </span>
          <span className="text-gray-200" aria-current="page">{municipality.name}</span>
        </nav>
      </div>

      <header className="mx-auto max-w-7xl px-4 pb-6 pt-4 sm:px-6 lg:px-8">
        <h1 className={ui.pageTitle}>BBR-registreringer i {municipality.name}</h1>
        <p className="mt-2 text-base text-gray-300">
          {publicShelterCount === 1
            ? '1 BBR-registrering'
            : `${publicShelterCount.toLocaleString('da-DK')} BBR-registreringer`}
          <span className="text-gray-400"> · </span>
          {totalCapacity === 1
            ? '1 registreret plads'
            : `${totalCapacity.toLocaleString('da-DK')} registrerede pladser`}
        </p>
      </header>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <KommuneExperience
          groups={pagination.items}
          municipalityName={municipality.name}
          municipalitySlug={municipality.slug}
          pagination={pagination}
          searchQuery={searchQuery}
          hasAnyRegistrations={publicShelterCount > 0}
        />
      </section>

      <GlobalFooter />
    </main>
  )
}
