'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ui } from './ui-classes'

import { shelterReportTypes, type ShelterReportType } from '@/lib/reporting/shelter-report'
import { trackProductMetric } from '@/lib/analytics/product-metrics'

type Props = {
  shelterId: string
  shelterAddress: string
}

type SubmitState = 'idle' | 'submitting' | 'success'

export default function ReportShelterIssue({ shelterId, shelterAddress }: Props) {
  const [open, setOpen] = useState(false)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [messageLength, setMessageLength] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const typeRef = useRef<HTMLSelectElement>(null)

  const openForm = () => {
    setOpen(true)
    setError(null)
    trackProductMetric('report_started')
    window.requestAnimationFrame(() => typeRef.current?.focus())
  }

  const closeForm = () => {
    setOpen(false)
    setError(null)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') closeForm()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitState('submitting')

    const form = new FormData(event.currentTarget)
    const reportType = form.get('reportType') as ShelterReportType
    const message = String(form.get('message') ?? '')
    const contactEmail = String(form.get('contactEmail') ?? '')
    const website = String(form.get('website') ?? '')

    try {
      const response = await fetch('/api/app-v2/shelter-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shelterId, reportType, message, contactEmail, website }),
      })
      const result = (await response.json()) as { success?: boolean; error?: string }

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Rapporten kunne ikke gemmes.')
      }

      setSubmitState('success')
      trackProductMetric('report_submitted')
    } catch (submitError) {
      setSubmitState('idle')
      trackProductMetric('report_error')
      setError(submitError instanceof Error ? submitError.message : 'Rapporten kunne ikke gemmes. Prøv igen senere.')
    }
  }

  if (submitState === 'success') {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-4" role="status">
        <p className="font-semibold text-emerald-100">Tak for din rapport</p>
        <p className="mt-1 text-sm leading-6 text-gray-200">
          Den er lagt i moderationskø. Registreringen ændres ikke automatisk.
        </p>
      </div>
    )
  }

  return (
    <section onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="shelter-report-form"
        onClick={open ? closeForm : openForm}
        className={ui.secondaryAction}
      >
        {open ? 'Luk rapportformular' : 'Rapportér fejl ved registreringen'}
      </button>

      {open ? (
        <form
          id="shelter-report-form"
          onSubmit={handleSubmit}
          className={`mt-4 space-y-4 p-4 sm:p-5 ${ui.panelInset}`}
        >
          <div>
            <h3 className="font-semibold text-white">Rapportér en mulig fejl</h3>
            <p className="break-safe mt-1 text-sm leading-6 text-gray-300">Registrering ved {shelterAddress}</p>
          </div>

          <div>
            <label htmlFor="shelter-report-type" className="block text-sm font-medium text-gray-200">
              Hvad ser forkert ud?
            </label>
            <select
              ref={typeRef}
              id="shelter-report-type"
              name="reportType"
              required
              defaultValue=""
              className={`mt-2 ${ui.input}`}
            >
              <option value="" disabled>Vælg fejltype</option>
              {shelterReportTypes.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-end justify-between gap-3">
              <label htmlFor="shelter-report-message" className="block text-sm font-medium text-gray-200">
                Beskriv det, du har observeret
              </label>
              <span className="text-xs tabular-nums text-gray-400">{messageLength}/1.500</span>
            </div>
            <textarea
              id="shelter-report-message"
              name="message"
              required
              minLength={10}
              maxLength={1500}
              rows={5}
              onChange={(event) => setMessageLength(event.target.value.length)}
              className={`${ui.input} mt-2 min-h-32 py-3`}
              placeholder="Skriv kun oplysninger, der er relevante for registreringen."
            />
          </div>

          <div>
            <label htmlFor="shelter-report-email" className="block text-sm font-medium text-gray-200">
              E-mail <span className="font-normal text-gray-400">(valgfri)</span>
            </label>
            <input
              id="shelter-report-email"
              name="contactEmail"
              type="email"
              autoComplete="email"
              maxLength={254}
              className={`mt-2 ${ui.input}`}
              placeholder="Hvis vi må kontakte dig om rapporten"
            />
          </div>

          <div className="sr-only" aria-hidden="true">
            <label htmlFor="shelter-report-website">Websted</label>
            <input id="shelter-report-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <p className="text-xs leading-5 text-gray-400">
            Undlad CPR-nummer og andre følsomme oplysninger. En rapport ændrer ikke data automatisk.
          </p>

          {error ? <p className="text-sm text-red-200" role="alert">{error}</p> : null}

          <button
            type="submit"
            disabled={submitState === 'submitting'}
            className={`${ui.primaryAction} min-h-[48px] disabled:cursor-wait disabled:opacity-60`}
          >
            {submitState === 'submitting' ? 'Sender rapport …' : 'Send rapport'}
          </button>
        </form>
      ) : null}
    </section>
  )
}
