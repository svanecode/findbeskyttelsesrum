type RegistrationNoticeProps = {
  compact?: boolean
  className?: string
}

export function RegistrationStatusLabels({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-2 text-xs ${className}`} aria-label="Oplysninger om registreringen">
      <li className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-gray-200">BBR-registrering</li>
      <li className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-gray-200">Adgang ikke bekræftet</li>
      <li className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-gray-200">Stand ikke verificeret</li>
    </ul>
  )
}

export default function RegistrationNotice({ compact = false, className = '' }: RegistrationNoticeProps) {
  return (
    <aside className={`rounded-lg border border-orange-400/30 bg-orange-400/10 p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-white">Om registreringerne</h2>
      <p className="mt-1 text-sm leading-6 text-gray-200">
        Adresserne har registrerede sikringsrumspladser i BBR. Det betyder ikke nødvendigvis, at rummene er offentligt
        tilgængelige, klargjorte eller fysisk kontrollerede.
      </p>
      {!compact ? (
        <p className="mt-2 text-sm leading-6 text-gray-200">
          Kortet er til orientering og er ikke en evakueringsanvisning. Ved varsling skal du gå indenfor og følge
          information fra myndighederne.
        </p>
      ) : null}
    </aside>
  )
}
