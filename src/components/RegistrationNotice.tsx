import { ui } from './ui-classes'

type RegistrationNoticeProps = {
  compact?: boolean
  className?: string
}

export function RegistrationStatusLabels({ className = '' }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-gray-300 ${className}`} aria-label="Oplysninger om registreringen">
      <li>BBR-registrering</li>
      <li className="before:mr-3 before:text-gray-600 before:content-['·']">Adgang ikke bekræftet</li>
      <li className="before:mr-3 before:text-gray-600 before:content-['·']">Stand ikke verificeret</li>
    </ul>
  )
}

export default function RegistrationNotice({ compact = false, className = '' }: RegistrationNoticeProps) {
  return (
    <aside className={`${ui.panel} border-l-2 border-l-[var(--accent)] p-4 ${className}`}>
      <h2 className="text-sm font-semibold text-gray-100">Om registreringerne</h2>
      <p className="mt-1 text-sm leading-6 text-gray-300">
        Adresserne har registrerede sikringsrumspladser i BBR. Det betyder ikke nødvendigvis, at rummene er offentligt
        tilgængelige, klargjorte eller fysisk kontrollerede.
      </p>
      {!compact ? (
        <p className="mt-2 text-sm leading-6 text-gray-400">
          Kortet er til orientering og er ikke en evakueringsanvisning. Ved varsling skal du gå indenfor og følge
          information fra myndighederne.
        </p>
      ) : null}
    </aside>
  )
}
