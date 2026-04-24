'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from './LoadingSpinner'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import {
  fetchAddressSuggestions,
  suggestionHasCoordinates,
  type DawaSuggestion,
} from '@/lib/dawa/autocomplete'

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

export default function AddressSearchDAWA() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const router = useRouter()
  const { handleError } = useErrorHandler()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cursorPosRef = useRef(0)

  const syncCaretFromInput = useCallback(() => {
    const el = inputRef.current
    if (!el) {
      return
    }
    cursorPosRef.current = el.selectionStart ?? el.value.length
  }, [])

  const selectSuggestion = useCallback(
    (suggestion: DawaSuggestion) => {
      if (suggestionHasCoordinates(suggestion)) {
        const label = (suggestion.forslagstekst ?? suggestion.tekst).trim()
        setSelectedAddress(label)
        setIsOpen(false)
        setActiveIndex(null)
        setQuery(suggestion.tekst.trimEnd())
        router.push(`/shelters/nearby?lat=${suggestion.data.y}&lng=${suggestion.data.x}`)
        return
      }

      setSelectedAddress(null)
      setQuery(suggestion.tekst)
      const pos = suggestion.caretpos ?? suggestion.tekst.length
      cursorPosRef.current = pos
      setIsOpen(false)
      setActiveIndex(null)

      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) {
          return
        }
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    },
    [router],
  )

  const canSubmit = useMemo(() => query.trim().length >= 2 && !hasFailed, [query, hasFailed])

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()

      if (!canSubmit) {
        inputRef.current?.focus()
        return
      }

      syncCaretFromInput()

      const active =
        activeIndex !== null && suggestions[activeIndex] ? suggestions[activeIndex] : suggestions[0]

      if (active) {
        selectSuggestion(active)
        return
      }

      try {
        setIsLoading(true)
        const results = await fetchAddressSuggestions(query, {
          limit: 5,
          caretpos: cursorPosRef.current,
        })
        if (results.length > 0) {
          selectSuggestion(results[0])
          return
        }
        setIsOpen(false)
        setActiveIndex(null)
      } catch (error) {
        handleError(error instanceof Error ? error : new Error('DAWA autocomplete failed'), 'DAWA Autocomplete failed')
      } finally {
        setIsLoading(false)
      }
    },
    [activeIndex, canSubmit, handleError, query, selectSuggestion, suggestions, syncCaretFromInput],
  )

  const handleLocationClick = async () => {
    if (!navigator.geolocation) {
      handleError(new Error('Geolocation not supported'), 'Geolocation API not available')
      return
    }

    setGpsLoading(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true })
      })
      router.push(`/shelters/nearby?lat=${position.coords.latitude}&lng=${position.coords.longitude}`)
    } catch (error) {
      handleError(error instanceof Error ? error : new Error('Failed to get location'), 'Geolocation failed')
    } finally {
      setGpsLoading(false)
    }
  }

  useEffect(() => {
    abortControllerRef.current?.abort()
    if (query.trim().length < 2) {
      setSuggestions([])
      setIsOpen(false)
      setActiveIndex(null)
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    const timeoutId = setTimeout(async () => {
      setIsLoading(true)
      try {
        const results = await fetchAddressSuggestions(query, {
          signal: controller.signal,
          limit: 5,
          caretpos: cursorPosRef.current,
        })
        setSuggestions(results)
        setIsOpen(results.length > 0)
        setActiveIndex(null)
        setHasFailed(false)
      } catch (error) {
        if (!isAbortError(error)) {
          setHasFailed(true)
          handleError(
            error instanceof Error ? error : new Error('DAWA autocomplete failed'),
            'DAWA Autocomplete failed',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 120)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [query, handleError])

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
        setActiveIndex(null)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(null)
      return
    }
    if (event.key === 'Enter') {
      // Let the form submit handler pick the best suggestion (active/first/fetch).
      return
    }
    if (!isOpen || suggestions.length === 0) {
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index === null ? 0 : index + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index === null ? 0 : index - 1, 0))
    }
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      <button onClick={handleLocationClick} className="btn-primary w-full py-4 px-6 rounded-full flex items-center justify-center gap-3 hover:bg-[#EA580C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target focus-visible btn-interactive" disabled={gpsLoading} aria-label="Brug min placering til at finde beskyttelsesrum" role="button" tabIndex={0}>
        {gpsLoading ? <LoadingSpinner size="sm" text="Henter din position..." /> : (
          <>
            <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>
            <span className="text-sm sm:text-base font-medium">Brug min placering</span>
          </>
        )}
      </button>

      <div className="text-center text-gray-400 text-sm sm:text-base font-medium">eller</div>

      <div ref={containerRef} className="relative w-full">
        {hasFailed && (
          <div id="dawa-error" className="mb-2 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg text-yellow-200 text-sm" role="alert">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              <div className="flex-1">
                <p className="font-medium">DAWA Autocomplete er ikke tilgængelig</p>
                <p className="text-xs mt-1 opacity-80">Prøv at genindlæse siden eller brug GPS-funktionen ovenfor</p>
              </div>
              <button onClick={() => window.location.reload()} className="ml-2 px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 rounded text-xs transition-colors" aria-label="Genindlæs siden">Genindlæs</button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="autocomplete-container w-full">
          <label htmlFor="adresse" className="sr-only">
            Adresse
          </label>

          <div className="relative w-full">
            <svg className="pointer-events-none absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 transform text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            {isLoading && (
              <div className="absolute right-3 top-1/2 z-10 -translate-y-1/2 transform">
                <LoadingSpinner size="sm" />
              </div>
            )}

            <input
              ref={inputRef}
              type="text"
              id="adresse"
              placeholder="Indtast adresse, by eller postnummer"
              className="input-interactive touch-target w-full rounded-full border border-[#E97B4D] bg-[#1a1a1a] py-3 pl-12 pr-11 text-sm text-white transition-all placeholder-gray-400 focus:border-[#E97B4D] focus:bg-[#141414] focus:outline-none focus-visible disabled:opacity-50 sm:py-4 sm:pl-14 sm:pr-12 sm:text-base"
              disabled={hasFailed}
              aria-describedby={hasFailed ? 'dawa-error' : undefined}
              role="searchbox"
              autoComplete="off"
              minLength={2}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                cursorPosRef.current = event.target.selectionStart ?? event.target.value.length
              }}
              onSelect={syncCaretFromInput}
              onClick={syncCaretFromInput}
              onFocus={() => setIsOpen(suggestions.length > 0)}
              onKeyDown={handleKeyDown}
            />

            {isOpen && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-[9999] mt-1 max-h-[min(18rem,50vh)] overflow-y-auto rounded-md border-2 border-white/30 bg-[#1a1a1a] shadow-[0_8px_16px_rgba(0,0,0,0.6),0_0_15px_rgba(255,255,255,0.1)]" role="listbox">
                {suggestions.map((suggestion, index) => {
                  const display = (suggestion.forslagstekst ?? suggestion.tekst).trim()
                  const key =
                    typeof suggestion.data.href === 'string'
                      ? suggestion.data.href
                      : `${suggestion.dawaType ?? 'item'}-${display}-${index}`

                  return (
                    <div
                      key={key}
                      role="option"
                      aria-selected={activeIndex === index}
                      className={`cursor-pointer border-b border-white/10 px-2.5 py-1.5 text-white last:border-b-0 ${activeIndex === index ? 'bg-[#2a2a2a]' : 'hover:bg-[#2a2a2a]'}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        selectSuggestion(suggestion)
                      }}
                    >
                      {display}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </form>

        {selectedAddress && (
          <div className="mt-3 p-3 bg-success-bg border border-success/30 rounded-lg" role="status" aria-live="polite">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-success success-animation" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              <p className="text-sm sm:text-base text-success font-medium">Valgt adresse: <span className="text-white">{selectedAddress}</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
