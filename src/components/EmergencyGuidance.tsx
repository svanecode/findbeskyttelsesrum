import { ui } from '@/components/ui-classes'
import { officialGuidanceLinks } from '@/lib/official-guidance'

/** "Ved varsling" with the official links, as on the front page. */
export default function EmergencyGuidance({ className = '' }: { className?: string }) {
  return (
    <aside className={`border-l-2 border-l-[var(--accent)] pl-4 ${className}`} aria-labelledby="emergency-guidance-heading">
      <p className="text-base leading-7 text-gray-100">
        <strong id="emergency-guidance-heading" className="font-semibold text-white">Ved varsling:</strong>{' '}
        Gå indenfor, og følg myndighedernes information.{' '}
        {officialGuidanceLinks.map((link, index) => (
          <span key={link.href}>
            {index > 0 ? <span className="text-gray-400" aria-hidden="true"> · </span> : null}
            <a href={link.href} target="_blank" rel="noopener noreferrer" className={ui.textLink}>
              {link.shortLabel}
              <span className="sr-only"> (åbner i en ny fane)</span>
            </a>
          </span>
        ))}
      </p>
    </aside>
  )
}
