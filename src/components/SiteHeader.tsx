'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type NavItem = { href: string; label: string; active: (p: string) => boolean }

const NAV: NavItem[] = [
  { href: '/', label: 'Søg', active: (p) => p === '/' || p.startsWith('/shelters/nearby') },
  { href: '/kort', label: 'Landskort', active: (p) => p === '/kort' },
  {
    href: '/kommune',
    label: 'Kommuneoversigt',
    active: (p) => p === '/kommune' || p.startsWith('/kommune/'),
  },
  { href: '/om-data', label: 'Datagrundlag', active: (p) => p === '/om-data' },
]

function desktopNavClass(active: boolean) {
  const base =
    'rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-orange-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]'
  return active
    ? `${base} bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(233,123,77,0.45)]`
    : `${base} text-gray-400 hover:bg-white/[0.06] hover:text-gray-100`
}

function mobileNavClass(active: boolean) {
  const base =
    'mx-0.5 rounded-lg px-3 py-3 text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-orange-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]'
  return active
    ? `${base} bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgba(233,123,77,0.45)]`
    : `${base} text-gray-400 hover:bg-white/[0.06] hover:text-gray-100`
}

export default function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, close])

  return (
    <header
      ref={rootRef}
      className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-space-grotesk text-base font-semibold tracking-tight text-gray-200 transition-colors hover:text-white sm:text-lg"
        >
          Findbeskyttelsesrum
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Hovednavigation">
          {NAV.map(({ href, label, active }) => {
            const isActive = active(pathname)
            return (
              <Link
                key={href}
                href={href as never}
                className={desktopNavClass(isActive)}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-gray-300 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          aria-expanded={open}
          aria-controls="site-header-mobile-nav"
          aria-label={open ? 'Luk menu' : 'Åbn menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {open ? (
        <nav
          id="site-header-mobile-nav"
          className="flex flex-col border-t border-white/10 px-4 pb-4 sm:px-6 md:hidden lg:px-8"
          aria-label="Hovednavigation"
        >
          {NAV.map(({ href, label, active }) => {
            const isActive = active(pathname)
            return (
              <Link
                key={href}
                href={href as never}
                className={mobileNavClass(isActive)}
                aria-current={isActive ? 'page' : undefined}
                onClick={close}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      ) : null}
    </header>
  )
}
