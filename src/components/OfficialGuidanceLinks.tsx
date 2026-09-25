import { officialGuidanceLinks } from '@/lib/official-guidance'

export default function OfficialGuidanceLinks({ className = '' }: { className?: string }) {
  return (
    <ul className={`space-y-1 text-sm ${className}`} aria-label="Officiel information">
      {officialGuidanceLinks.map((link) => (
        <li key={link.href}>
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center text-gray-100 underline decoration-white/30 underline-offset-4 hover:text-white hover:decoration-white/70"
          >
            {link.label}
            <span className="sr-only"> (åbner i en ny fane)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
