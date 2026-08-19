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
import { saveNearbySearchContext } from '@/lib/nearby/search-context'

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const DAWA_LISTBOX_ID = 'dawa-address-suggestions'

type SelectedAddress = {
  label: string
  latitude: number
  longitude: number
}

function getGeolocationErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = Number((error as { code?: unknown }).code)
    if (code === 1) {
      return 'Du har afvist adgang til din placering. Søg efter en adresse i stedet, eller tillad placering i browserens indstillinger.'
    }
    if (code === 3) {
      return 'Din placering kunne ikke hentes inden for 10 sekunder. Prøv igen, eller søg efter en adresse.'
    }
    if (code === 2) {
      return 'Din placering er ikke tilgængelig lige nu. Prøv igen, eller søg efter en adresse.'
    }
  }

  return 'Din placering kunne ikke hentes. Prøv igen, eller søg efter en adresse.'
}

export default function AddressSearchDAWA() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<DawaSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<SelectedAddress | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [hasNoResults, setHasNoResults] = useState(false)
  const router = useRouter()
  const { handleError } = useErrorHandler()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cursorPosRef = useRef(0)

  const navigateToNearby = useCallback(
    (search: SelectedAddress) => {
      const saved = saveNearbySearchContext({
        latitude: search.latitude,
        longitude: search.longitude,
        label: search.label,
      })

      if (!saved) {
        setSearchError('Din browser blokerer midlertidig lagring af søgningen. Tillad sessionsdata, og prøv igen.')
        return
      }

      setSearchError(null)
      router.push('/shelters/nearby')
    },
    [router],
  )

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
        setSelectedAddress({
          label,
          latitude: suggestion.data.y,
          longitude: suggestion.data.x,
        })
        setIsOpen(false)
        setActiveIndex(null)
        setHasNoResults(false)
        setSearchError(null)
        setQuery(label)
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
    [],
  )

  const canSubmit = useMemo(() => selectedAddress !== null && !hasFailed, [selectedAddress, hasFailed])

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()

      if (!canSubmit) {
        if (query.trim().length < 2) {
          inputRef.current?.focus()
          return
        }

        syncCaretFromInput()
        try {
          setIsLoading(true)
          const results = await fetchAddressSuggestions(query, {
            limit: 5,
            caretpos: cursorPosRef.current,
          })
          setSuggestions(results)
          setIsOpen(results.length > 0)
          setActiveIndex(results.length > 0 ? 0 : null)
          setHasNoResults(results.length === 0)
        } catch (error) {
          handleError(error instanceof Error ? error : new Error('DAWA autocomplete failed'), 'DAWA Autocomplete failed')
        } finally {
          setIsLoading(false)
        }
        return
      }

      if (selectedAddress) navigateToNearby(selectedAddress)
    },
    [canSubmit, handleError, navigateToNearby, query, selectedAddress, syncCaretFromInput],
  )

  const handleLocationClick = async () => {
    if (!navigator.geolocation) {
      setGpsError('Denne browser understøtter ikke placering. Søg efter en adresse i stedet.')
      handleError(new Error('Geolocation not supported'), 'Geolocation API not available')
      return
    }

    setGpsError(null)
    setSearchError(null)
    setGpsLoading(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000, enableHighAccuracy: true })
      })
      navigateToNearby({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: 'Din placering',
      })
    } catch (error) {
      setGpsError(getGeolocationErrorMessage(error))
      handleError(error instanceof Error ? error : new Error('Failed to get location'), 'Geolocation failed')
    } finally {
      setGpsLoading(false)
    }
  }

  useEffect(() => {
    abortControllerRef.current?.abort()
    if (selectedAddress?.label === query.trim()) {
      return
    }
    if (query.trim().length < 2) {
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
        setHasNoResults(results.length === 0)
      } catch (error) {
        if (!isAbortError(error)) {
          setHasFailed(true)
          setHasNoResults(false)
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
  }, [query, handleError, selectedAddress?.label])

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
      if (isOpen && activeIndex !== null && suggestions[activeIndex]) {
        event.preventDefault()
        selectSuggestion(suggestions[activeIndex])
      }
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
      <button
        type="button"
        onClick={handleLocationClick}
        className="btn-primary btn-interactive focus-visible touch-target flex w-full items-center justify-center gap-3 rounded-full px-6 py-4 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        disabled={gpsLoading}
        aria-label="Brug min placering til at se registreringer i nærheden"
      >
        {gpsLoading ? <LoadingSpinner size="sm" text="Henter din position..." /> : (
          <>
            <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>
            <span className="text-sm sm:text-base font-medium">Brug min placering</span>
          </>
        )}
      </button>

      <p className="text-center text-xs text-gray-300 sm:text-sm">
        Din placering bruges kun til denne søgning og gemmes ikke i linket.
      </p>

      {gpsError ? (
        <div className="rounded-lg border border-yellow-600/30 bg-yellow-900/20 p-3 text-sm text-yellow-100" role="alert">
          {gpsError}
        </div>
      ) : null}

      <div className="text-center text-gray-400 text-sm sm:text-base font-medium">eller</div>

      <div ref={containerRef} className="relative w-full">
        {hasFailed && (
          <div id="dawa-error" className="mb-2 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg text-yellow-200 text-sm" role="alert">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              <div className="flex-1">
                <p className="font-medium">Adressesøgningen er ikke tilgængelig</p>
                <p className="text-xs mt-1 opacity-80">Prøv at genindlæse siden eller brug din placering ovenfor.</p>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ml-2 inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-yellow-600/25 px-3 py-2 text-xs font-medium text-yellow-100 transition-colors hover:bg-yellow-600/40"
                aria-label="Genindlæs siden"
              >
                Genindlæs
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="autocomplete-container w-full space-y-2">
          <label htmlFor="adresse" className="block text-sm font-medium text-gray-200">
            Adresse, by eller postnummer
          </label>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
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
                placeholder="Skriv vejnavn, by eller postnummer"
                className="input-interactive touch-target w-full rounded-lg border border-white/20 bg-[var(--surface-input)] py-3 pl-12 pr-11 text-base text-white transition-colors placeholder:text-gray-400 focus:border-[color:var(--accent)] focus:bg-[var(--surface-input-focus)] focus:outline-none focus-visible disabled:opacity-50 sm:py-4 sm:pl-14 sm:pr-12"
                disabled={hasFailed}
                aria-describedby={hasFailed ? 'dawa-error' : hasNoResults ? 'dawa-no-results' : undefined}
                role="combobox"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-controls={isOpen && suggestions.length > 0 ? DAWA_LISTBOX_ID : undefined}
                aria-expanded={isOpen && suggestions.length > 0}
                aria-activedescendant={
                  isOpen && activeIndex !== null && suggestions[activeIndex]
                    ? `dawa-address-option-${activeIndex}`
                    : undefined
                }
                autoComplete="off"
                minLength={2}
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value
                  setQuery(nextQuery)
                  setSelectedAddress(null)
                  setSearchError(null)
                  setHasNoResults(false)
                  if (nextQuery.trim().length < 2) {
                    abortControllerRef.current?.abort()
                    setSuggestions([])
                    setIsOpen(false)
                    setActiveIndex(null)
                    setIsLoading(false)
                  }
                  cursorPosRef.current = event.target.selectionStart ?? event.target.value.length
                }}
                onSelect={syncCaretFromInput}
                onClick={syncCaretFromInput}
                onFocus={() => setIsOpen(suggestions.length > 0 && !selectedAddress)}
                onKeyDown={handleKeyDown}
              />

              {isOpen && suggestions.length > 0 && (
                <div
                  id={DAWA_LISTBOX_ID}
                  className="absolute left-0 right-0 top-full z-[9999] mt-1 max-h-[min(18rem,50vh)] overflow-y-auto rounded-md border-2 border-white/30 bg-[var(--surface-elevated)] shadow-[0_8px_16px_rgba(0,0,0,0.6),0_0_15px_rgba(255,255,255,0.1)]"
                  role="listbox"
                  aria-label="Adresseforslag"
                >
                  {suggestions.map((suggestion, index) => {
                    const display = (suggestion.forslagstekst ?? suggestion.tekst).trim()
                    const key =
                      typeof suggestion.data.href === 'string'
                        ? suggestion.data.href
                        : `${suggestion.dawaType ?? 'item'}-${display}-${index}`

                    return (
                      <div
                        key={key}
                        id={`dawa-address-option-${index}`}
                        role="option"
                        aria-selected={activeIndex === index}
                        className={`cursor-pointer border-b border-white/10 px-2.5 py-2.5 text-base text-white last:border-b-0 sm:py-2 ${activeIndex === index ? 'bg-[var(--surface-row-hover)]' : 'hover:bg-[var(--surface-row-hover)]'}`}
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

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#0a0a0a] transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400 sm:min-w-28"
            >
              Søg
            </button>
          </div>
        </form>

        {hasNoResults ? (
          <p id="dawa-no-results" className="mt-3 text-sm text-gray-200" role="status">
            Ingen adresser fundet. Prøv med vejnavn og by eller søg efter kommunen.
          </p>
        ) : null}

        {searchError ? (
          <p className="mt-3 rounded-lg border border-yellow-600/30 bg-yellow-900/20 p-3 text-sm text-yellow-100" role="alert">
            {searchError}
          </p>
        ) : null}

        {selectedAddress && (
          <div className="mt-3 p-3 bg-success-bg border border-success/30 rounded-lg" role="status" aria-live="polite">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-success success-animation" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              <p className="text-sm sm:text-base text-success font-medium">Valgt adresse: <span className="text-white">{selectedAddress.label}</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
