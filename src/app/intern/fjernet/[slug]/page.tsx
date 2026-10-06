import type { Metadata } from 'next'
import Link from 'next/link'

import EmergencyGuidance from '@/components/EmergencyGuidance'
import { ui } from '@/components/ui-classes'
import { retiredShelterSearchLink } from '@/lib/retired-shelter-page'
import { resolveRetiredShelter } from '@/lib/supabase/app-v2-queries'

/**
 * The body of the 410 page for a registration removed from BBR, with the
 * site's header, footer and fonts (5.1). A page cannot answer 410, so
 * /beskyttelsesrum/[slug]/fjernet fetches this page and returns its HTML with
 * status 410. It is not linked from anywhere and is never indexed.
 */

export const metadata: Metadata = {
  title: 'Registreringen findes ikke længere i BBR',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ slug: string }> }

export default async function RetiredShelterPage({ params }: Props) {
  const { slug } = await params
  const shelter = await resolveRetiredShelter(slug).catch(() => null)
  const { address, href, label } = retiredShelterSearchLink(shelter)

  return (
    <main id="main-content" tabIndex={-1} className={ui.page}>
      <div className="mx-auto w-full max-w-7xl px-4 pb-12 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <section className="max-w-[40rem]" aria-labelledby="retired-heading">
          <h1 id="retired-heading" className={ui.pageTitle}>Registreringen findes ikke længere i BBR</h1>
          {address ? (
            <p className="mt-2 text-base leading-7 text-gray-300">Den sidst kendte adresse var {address}.</p>
          ) : null}
          <a href={href} className={`${ui.primaryAction} mt-6 text-base`}>{label}</a>
          <EmergencyGuidance className="mt-8" />
          <nav className="mt-6 flex flex-wrap gap-x-6 text-base" aria-label="Andre veje videre">
            <Link href="/" className={`${ui.textLink} inline-flex min-h-[44px] items-center`}>Til forsiden</Link>
            <Link href="/kommune" className={`${ui.textLink} inline-flex min-h-[44px] items-center`}>Find en kommune</Link>
          </nav>
        </section>
      </div>
    </main>
  )
}
