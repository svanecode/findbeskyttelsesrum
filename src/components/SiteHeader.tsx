'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type NavItem = { href: Route; label: string; active: (p: string) => boolean }

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
    'rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors duration-150'
  return active
    ? `${base} bg-[var(--surface-elevated)] text-white`
    : `${base} text-gray-400 hover:bg-white/[0.05] hover:text-gray-100`
}

function mobileNavClass(active: boolean) {
  const base =
    'rounded-lg px-3 py-3 text-sm font-medium outline-none transition-colors duration-150'
  return active
    ? `${base} bg-[var(--surface-elevated)] text-white`
    : `${base} text-gray-400 hover:bg-white/[0.05] hover:text-gray-100`
}

export default function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null)

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => firstMobileLinkRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true)
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
      className="sticky top-0 z-50 border-b border-white/10 bg-[var(--surface-page)] pt-[env(safe-area-inset-top,0px)]"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-[max(1rem,env(safe-area-inset-left,0px))] py-3 pr-[max(1rem,env(safe-area-inset-right,0px))] sm:px-6 lg:px-8">
        <Link
          href="/"
          className="break-safe font-space-grotesk text-sm font-semibold tracking-tight text-gray-100 transition-colors hover:text-white sm:text-base"
        >
          Find Beskyttelsesrum
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Hovednavigation">
          {NAV.map(({ href, label, active }) => {
            const isActive = active(pathname)
            return (
              <Link
                key={href}
                href={href}
                className={desktopNavClass(isActive)}
                aria-current={isActive ? 'page' : undefined}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        <button
          ref={menuButtonRef}
          type="button"
          className="inline-flex h-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-white/[0.06] hover:text-white md:hidden"
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
          className="flex flex-col gap-1 border-t border-white/10 px-[max(1rem,env(safe-area-inset-left,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-2 sm:px-6 md:hidden lg:px-8"
          aria-label="Hovednavigation"
        >
          {NAV.map(({ href, label, active }, index) => {
            const isActive = active(pathname)
            return (
              <Link
                ref={index === 0 ? firstMobileLinkRef : undefined}
                key={href}
                href={href}
                className={mobileNavClass(isActive)}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => close()}
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
