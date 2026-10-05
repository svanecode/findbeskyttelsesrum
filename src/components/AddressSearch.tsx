'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from './LoadingSpinner'
import { ui } from './ui-classes'
import { useErrorHandler } from '@/hooks/useErrorHandler'
import {
  pickExactAddressMatch,
  pickUnambiguousSuggestion,
  resolveAddress,
  searchAddresses,
  type AddressSuggestion,
} from '@/lib/address/adressevaelger'
import { loadPostalAreaTable } from '@/lib/address/locality'
import { loadNearbySearchContext, saveNearbySearchContext } from '@/lib/nearby/search-context'
import { useOfflineCopy } from '@/lib/use-offline-copy'
import { trackProductMetric, type ProductMetricEventName } from '@/lib/analytics/product-metrics'

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'

const ADDRESS_LISTBOX_ID = 'address-suggestions'
const SUGGESTION_LIMIT = 5

export const chooseFromListMessage = 'Vælg den rigtige adresse på listen.'
const emptyQueryMessage = 'Skriv en adresse, et postnummer eller en by.'
const noResultsMessage = 'Ingen adresser fundet. Prøv med vejnavn, husnummer og postnummer, eller find kommunen.'

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
      return 'Din placering kunne ikke hentes i tide. Prøv igen, eller søg efter en adresse.'
    }
    if (code === 2) {
      return 'Din placering er ikke tilgængelig lige nu. Prøv igen, eller søg efter en adresse.'
    }
  }

  return 'Din placering kunne ikke hentes. Prøv igen, eller søg efter en adresse.'
}

function getGeolocationErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? Number((error as { code?: unknown }).code)
    : null
}

function requestPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  })
}

// GPS often cannot get a fix indoors. A network-based position is precise enough
// to rank nearby registrations, so fall back to it instead of failing the search.
async function getCurrentPosition() {
  try {
    return await requestPosition({ enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 })
  } catch (error) {
    const code = getGeolocationErrorCode(error)
    if (code !== 2 && code !== 3) throw error
    return requestPosition({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 })
  }
}

/** One look for every error at the field (2.4): red icon and text right under it. */
const fieldErrorClass = 'mt-2 flex items-start gap-2 text-sm leading-6 text-red-100'

function FieldErrorIcon() {
  return (
    <svg className="mt-[3px] h-[18px] w-[18px] shrink-0 text-[var(--color-error)]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-4.75a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0V6a.75.75 0 0 1 .75-.75ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  )
}

function suggestionKey(suggestion: AddressSuggestion) {
  return suggestion.kind === 'street' ? `street-${suggestion.label}` : `${suggestion.kind}-${suggestion.id}`
}

export default function AddressSearch() {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [suggestionsQuery, setSuggestionsQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<SelectedAddress | null>(null)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [fieldMessage, setFieldMessage] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  const [resolvingLabel, setResolvingLabel] = useState<string | null>(null)
  const router = useRouter()
  const { handleError } = useErrorHandler()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const resolveControllerRef = useRef<AbortController | null>(null)
  const resolvePromiseRef = useRef<Promise<SelectedAddress | null> | null>(null)
  const submittingRef = useRef(false)
  const fieldMessageId = useId()
  const hasQuery = query.trim().length > 0
  const offlineCopy = useOfflineCopy()
  const savedSearch = offlineCopy && offlineCopy !== 'pending' ? offlineCopy.search ?? null : null

  const navigateToNearby = useCallback(
    (search: SelectedAddress, successMetric: ProductMetricEventName) => {
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
      trackProductMetric(successMetric)
      router.push('/naer-dig')
    },
    [router],
  )

  const resolveSuggestion = useCallback(
    async (suggestion: Exclude<AddressSuggestion, { kind: 'street' }>): Promise<SelectedAddress | null> => {
      if (suggestion.kind === 'area') {
        return { label: `${suggestion.label} (postnummer)`, latitude: suggestion.latitude, longitude: suggestion.longitude }
      }

      resolveControllerRef.current?.abort()
      const controller = new AbortController()
      resolveControllerRef.current = controller
      setResolvingLabel(suggestion.label)
      setIsLoading(true)
      const pending = (async () => {
        try {
          const resolved = await resolveAddress(suggestion, { signal: controller.signal })
          if (controller.signal.aborted) return null
          setHasFailed(false)
          return resolved
        } catch (error) {
          if (isAbortError(error) || controller.signal.aborted) return null
          trackProductMetric('address_search_error')
          setHasFailed(true)
          handleError(error instanceof Error ? error : new Error('Address lookup failed'), 'Address lookup failed')
          return null
        } finally {
          if (!controller.signal.aborted) {
            setResolvingLabel(null)
            setIsLoading(false)
          }
        }
      })()
      resolvePromiseRef.current = pending
      return pending
    },
    [handleError],
  )

  /**
   * Choosing an address or area (click or Enter) searches at once; the
   * address stays in the field so it can be corrected. A street only fills
   * the field, with the caret where the house number goes.
   */
  const selectSuggestion = useCallback(
    async (suggestion: AddressSuggestion) => {
      setIsOpen(false)
      setActiveIndex(null)
      setFieldMessage(null)
      setSearchError(null)

      if (suggestion.kind === 'street') {
        setSelectedAddress(null)
        setQuery(suggestion.refineText)
        requestAnimationFrame(() => {
          const el = inputRef.current
          if (!el) return
          el.focus()
          el.setSelectionRange(suggestion.caret, suggestion.caret)
        })
        return
      }

      setSelectedAddress(null)
      setQuery(suggestion.label)
      trackProductMetric('address_search_started')
      const resolved = await resolveSuggestion(suggestion)
      if (!resolved) return
      setSelectedAddress(resolved)
      setQuery(suggestion.kind === 'area' ? suggestion.label : resolved.label)
      navigateToNearby(resolved, 'address_selected')
    },
    [navigateToNearby, resolveSuggestion],
  )

  /**
   * The free-text search behind both the "Søg" button and Enter in the field:
   * 1. an address already chosen (and still unchanged in the field) is searched again,
   * 2. free text with exactly one clear match takes it and searches, also when
   *    street, house number and town or postcode match one address exactly,
   * 3. otherwise the suggestions open with an instruction to choose.
   */
  const runSearch = useCallback(async () => {
    if (submittingRef.current) return
    const trimmed = query.trim()
    setSearchError(null)

    if (!trimmed) {
      setFieldMessage(emptyQueryMessage)
      inputRef.current?.focus()
      return
    }

    submittingRef.current = true
    try {
      if (selectedAddress) {
        trackProductMetric('address_search_started')
        navigateToNearby(selectedAddress, 'address_selected')
        return
      }

      if (resolvingLabel && resolvingLabel === trimmed && resolvePromiseRef.current) {
        const resolved = await resolvePromiseRef.current
        if (resolved) {
          trackProductMetric('address_search_started')
          navigateToNearby(resolved, 'address_selected')
        }
        return
      }

      trackProductMetric('address_search_started')
      let results = suggestionsQuery === trimmed ? suggestions : null
      if (!results) {
        abortControllerRef.current?.abort()
        setIsLoading(true)
        try {
          results = await searchAddresses(trimmed, { limit: SUGGESTION_LIMIT })
          setSuggestions(results)
          setSuggestionsQuery(trimmed)
          setHasFailed(false)
        } catch (error) {
          trackProductMetric('address_search_error')
          setHasFailed(true)
          handleError(error instanceof Error ? error : new Error('Address search failed'), 'Address search failed')
          return
        } finally {
          setIsLoading(false)
        }
      }

      const pick = pickUnambiguousSuggestion(trimmed, results)
        ?? pickExactAddressMatch(trimmed, results, await loadPostalAreaTable().catch(() => null))
      if (pick) {
        setIsOpen(false)
        setQuery(pick.label)
        const resolved = await resolveSuggestion(pick)
        if (resolved) navigateToNearby(resolved, 'address_selected')
        return
      }

      if (results.length === 0) {
        setIsOpen(false)
        setFieldMessage(noResultsMessage)
        return
      }

      setIsOpen(true)
      setActiveIndex(null)
      setFieldMessage(chooseFromListMessage)
      inputRef.current?.focus()
    } finally {
      submittingRef.current = false
    }
  }, [handleError, navigateToNearby, query, resolveSuggestion, resolvingLabel, selectedAddress, suggestions, suggestionsQuery])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    void runSearch()
  }

  const handleLocationClick = async () => {
    trackProductMetric('geolocation_requested')
    if (!navigator.geolocation) {
      setGpsError('Denne browser understøtter ikke placering. Søg efter en adresse i stedet.')
      trackProductMetric('geolocation_error')
      handleError(new Error('Geolocation not supported'), 'Geolocation API not available')
      return
    }

    setGpsError(null)
    setSearchError(null)
    setGpsLoading(true)
    try {
      const position = await getCurrentPosition()
      navigateToNearby({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        label: 'Din placering',
      }, 'geolocation_succeeded')
    } catch (error) {
      setGpsError(getGeolocationErrorMessage(error))
      const errorCode = getGeolocationErrorCode(error)
      trackProductMetric(errorCode === 1 ? 'geolocation_denied' : 'geolocation_error')
      if (errorCode !== 1) {
        handleError(error instanceof Error ? error : new Error('Failed to get location'), 'Geolocation failed')
      }
    } finally {
      setGpsLoading(false)
    }
  }

  useEffect(() => {
    abortControllerRef.current?.abort()
    const trimmed = query.trim()
    if (selectedAddress?.label === trimmed || resolvingLabel === trimmed || suggestionsQuery === trimmed) {
      return
    }
    if (trimmed.length < 2) {
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    const timeoutId = setTimeout(async () => {
      setIsLoading(true)
      try {
        const results = await searchAddresses(trimmed, { signal: controller.signal, limit: SUGGESTION_LIMIT })
        if (controller.signal.aborted) return
        setSuggestions(results)
        setSuggestionsQuery(trimmed)
        setIsOpen(results.length > 0)
        setActiveIndex(null)
        setHasFailed(false)
        setFieldMessage(results.length === 0 ? noResultsMessage : null)
      } catch (error) {
        if (!isAbortError(error)) {
          trackProductMetric('address_search_error')
          setHasFailed(true)
          handleError(
            error instanceof Error ? error : new Error('Address search failed'),
            'Address search failed',
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
  }, [query, handleError, selectedAddress?.label, resolvingLabel, suggestionsQuery, retryToken])

  // Back from the results, the searched address is still in the field so it can be corrected.
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const previous = loadNearbySearchContext()
      if (!previous?.label || previous.label === 'Din placering' || inputRef.current?.value) return
      setQuery(previous.label)
      setSuggestionsQuery(previous.label)
      setSelectedAddress({ label: previous.label, latitude: previous.latitude, longitude: previous.longitude })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

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
      resolveControllerRef.current?.abort()
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setIsOpen(false)
      setActiveIndex(null)
      return
    }
    // Enter on a highlighted suggestion chooses it; otherwise the form submits
    // and runs the same search as the button.
    if (event.key === 'Enter' && isOpen && activeIndex !== null && suggestions[activeIndex]) {
      event.preventDefault()
      void selectSuggestion(suggestions[activeIndex])
      return
    }
    if (event.key === 'ArrowDown' && !isOpen && suggestions.length > 0 && suggestionsQuery === query.trim()) {
      event.preventDefault()
      setIsOpen(true)
      setActiveIndex(0)
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

  const fieldMessageIsError = fieldMessage === emptyQueryMessage || fieldMessage === noResultsMessage
  const hasFieldError = fieldMessageIsError || hasFailed || Boolean(searchError)
  const listIsOpen = isOpen && suggestions.length > 0
  // Offline, the position alone does not help: results need data saved for that area.
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false
  const describedBy = [fieldMessage ? fieldMessageId : null, hasFailed ? 'address-search-error' : null, searchError ? 'address-search-storage-error' : null].filter(Boolean).join(' ') || undefined

  const openSavedResults = () => {
    if (!savedSearch) return
    if (!saveNearbySearchContext(savedSearch)) return
    router.push('/naer-dig')
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleLocationClick}
        className={`${hasQuery ? ui.secondaryAction : ui.primaryAction} touch-target w-full gap-3 py-3.5 text-base disabled:opacity-60 sm:w-auto sm:min-w-[16rem]`}
        disabled={gpsLoading}
        aria-describedby="location-privacy-note"
      >
        {gpsLoading ? <LoadingSpinner size="sm" text="Henter din position..." /> : (
          <>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/></svg>
            <span>Brug min placering</span>
          </>
        )}
      </button>

      <p id="location-privacy-note" className="mt-2 text-sm text-gray-400">
        Din placering gemmes ikke.
      </p>

      {gpsError ? (
        <p className="mt-3 border-l-2 border-yellow-500 pl-3 text-sm leading-6 text-yellow-100" role="alert">
          {gpsError}
        </p>
      ) : null}

      <div ref={containerRef} className="relative mt-6 w-full">
        <form onSubmit={handleSubmit} className="autocomplete-container w-full" noValidate>
          <label htmlFor="adresse" className="block text-base font-medium text-gray-100">
            Eller søg på en adresse
          </label>

          <div className="mt-2 flex gap-2">
            <div className="relative min-w-0 flex-1">
              {isLoading && (
                <div className="absolute right-2 top-1/2 z-10 -translate-y-1/2 transform">
                  <LoadingSpinner size="sm" />
                </div>
              )}

              <input
                ref={inputRef}
                type="text"
                id="adresse"
                name="adresse"
                enterKeyHint="search"
                placeholder="Adresse, by eller postnummer"
                className={`${ui.input} touch-target py-3 pl-3 pr-9 sm:pl-4 ${hasFieldError ? '!border-[var(--color-error)]' : ''}`}
                aria-describedby={describedBy}
                aria-invalid={hasFieldError ? true : undefined}
                role="combobox"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-controls={isOpen && suggestions.length > 0 ? ADDRESS_LISTBOX_ID : undefined}
                aria-expanded={isOpen && suggestions.length > 0}
                aria-activedescendant={
                  isOpen && activeIndex !== null && suggestions[activeIndex]
                    ? `address-option-${activeIndex}`
                    : undefined
                }
                autoComplete="off"
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value
                  setQuery(nextQuery)
                  resolveControllerRef.current?.abort()
                  resolvePromiseRef.current = null
                  setResolvingLabel(null)
                  setSelectedAddress(null)
                  setSearchError(null)
                  setFieldMessage(null)
                  if (nextQuery.trim().length < 2) {
                    abortControllerRef.current?.abort()
                    setSuggestions([])
                    setSuggestionsQuery('')
                    setIsOpen(false)
                    setActiveIndex(null)
                    setIsLoading(false)
                  }
                }}
                // Focus only ever opens the list. runSearch focuses the field right
                // after opening it, when this handler still sees the previous render.
                onFocus={() => {
                  if (suggestions.length > 0 && !selectedAddress && suggestionsQuery === query.trim()) setIsOpen(true)
                }}
                onKeyDown={handleKeyDown}
              />

              {listIsOpen && (
                <div className="absolute left-0 right-0 top-full z-[9999] mt-1 overflow-hidden rounded-lg border border-white/15 bg-[var(--surface-elevated)] shadow-[0_12px_30px_rgba(0,0,0,0.38)]">
                {/* Visible instruction over the list (2.2); screen readers hear it from the status below. */}
                <p className="border-b border-white/10 px-3 py-2 text-sm font-medium text-gray-200" aria-hidden="true">
                  {chooseFromListMessage}
                </p>
                <div
                  id={ADDRESS_LISTBOX_ID}
                  className="max-h-[min(18rem,50vh)] overflow-y-auto"
                  role="listbox"
                  aria-label="Adresseforslag"
                >
                  {suggestions.map((suggestion, index) => (
                    <div
                      key={suggestionKey(suggestion)}
                      id={`address-option-${index}`}
                      role="option"
                      aria-selected={activeIndex === index}
                      // Active row (mouse or keyboard, 2.1): orange bar, 6.9:1 against the other
                      // rows, plus a lighter background.
                      className={`cursor-pointer border-b border-l-4 border-b-white/10 py-3 pl-2 pr-3 text-base text-white last:border-b-0 ${activeIndex === index ? 'border-l-[var(--accent)] bg-[var(--surface-option-active)]' : 'border-l-transparent'}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        void selectSuggestion(suggestion)
                      }}
                    >
                      {suggestion.label}
                      {suggestion.kind === 'area' ? <span className="text-gray-400"> · postnummer</span> : null}
                    </div>
                  ))}
                </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className={`${hasQuery ? ui.primaryAction : ui.secondaryAction} min-h-[48px] shrink-0 px-4 sm:px-5`}
            >
              Søg
            </button>
          </div>
        </form>

        {/* Always in the DOM so screen readers announce changes to it. */}
        <div id={fieldMessageId} role="status" aria-live="polite">
          {fieldMessage && fieldMessageIsError ? (
            <p className={fieldErrorClass}><FieldErrorIcon />{fieldMessage}</p>
          ) : fieldMessage ? (
            // The instruction is shown over the open list; here it is for screen readers.
            <p className={listIsOpen ? 'sr-only' : 'mt-2 text-sm leading-6 text-gray-100'}>{fieldMessage}</p>
          ) : null}
        </div>

        {hasFailed ? (
          <div id="address-search-error" className={fieldErrorClass} role="alert">
            <FieldErrorIcon />
            <div>
              <p>
                {isOffline
                  ? 'Adressesøgningen virker ikke uden net.'
                  : 'Adressesøgningen er ikke tilgængelig lige nu. Prøv igen, eller brug din placering.'}
              </p>
              <div className="flex flex-wrap gap-x-5">
                {savedSearch ? (
                  <button
                    type="button"
                    onClick={openSavedResults}
                    className="inline-flex min-h-[44px] items-center text-left font-medium text-white underline underline-offset-4"
                  >
                    Se gemte resultater for {savedSearch.label}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setHasFailed(false)
                    setSuggestionsQuery('')
                    setRetryToken((token) => token + 1)
                    inputRef.current?.focus()
                  }}
                  className="inline-flex min-h-[44px] items-center font-medium text-white underline underline-offset-4"
                >
                  Prøv igen
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {searchError ? (
          <p id="address-search-storage-error" className={fieldErrorClass} role="alert">
            <FieldErrorIcon />{searchError}
          </p>
        ) : null}
      </div>
    </div>
  )
}
