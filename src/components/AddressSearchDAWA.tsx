'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from './LoadingSpinner'
import { useErrorHandler } from '@/hooks/useErrorHandler'

declare global {
  interface Window {
    dawaAutocomplete: {
      dawaAutocomplete: (element: HTMLElement, options: any) => void
    }
  }
}

export default function AddressSearchDAWA() {
  const [loading, setLoading] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState('')
  const [scriptsLoaded, setScriptsLoaded] = useState(false)
  const [dawaFailed, setDawaFailed] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [scriptLoadingProgress, setScriptLoadingProgress] = useState('')
  const router = useRouter()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const { handleError } = useErrorHandler()

  const handleLocationClick = async () => {
    if (!navigator.geolocation) {
      handleError(new Error('Geolocation not supported'), 'Geolocation API not available')
      return
    }

    setLoading(true)
    
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: true
        })
      })
      
      router.push(`/shelters/nearby?lat=${position.coords.latitude}&lng=${position.coords.longitude}`)
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to get location')
      handleError(err, 'Geolocation failed')
    } finally {
      setLoading(false)
    }
  }

  // Simple script loading approach
  useEffect(() => {
    let isMounted = true
    let timeoutId: NodeJS.Timeout

    const loadDAWAScripts = () => {
      try {
        setScriptLoadingProgress('Indlæser DAWA Autocomplete...')
        
        // Check if already loaded
        if (window.dawaAutocomplete) {
          setScriptsLoaded(true)
          setScriptLoadingProgress('')
          return
        }

        // Load the DAWA script directly
        const script = document.createElement('script')
        script.src = '/dawa-autocomplete2.min.js?v=' + Date.now()
        script.async = true
        script.onload = () => {
          if (isMounted) {
            console.log('DAWA script loaded successfully')
            setScriptsLoaded(true)
            setScriptLoadingProgress('')
          }
        }
        script.onerror = (error) => {
          console.error('DAWA script failed to load:', error)
          if (isMounted) {
            handleError(new Error('DAWA script failed to load'), 'DAWA Autocomplete script failed to load')
            setDawaFailed(true)
            setScriptLoadingProgress('')
          }
        }

        document.head.appendChild(script)

        // Timeout after 10 seconds
        timeoutId = setTimeout(() => {
          if (isMounted && !window.dawaAutocomplete) {
            console.error('DAWA script load timeout')
            handleError(new Error('DAWA script load timeout'), 'DAWA Autocomplete took too long to load')
            setDawaFailed(true)
            setScriptLoadingProgress('')
          }
        }, 10000)

      } catch (error) {
        if (isMounted) {
          const err = error instanceof Error ? error : new Error('Script loading failed')
          handleError(err, 'Failed to load DAWA script')
          setDawaFailed(true)
          setScriptLoadingProgress('')
        }
      }
    }

    loadDAWAScripts()

    return () => {
      isMounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [handleError])

  // Initialize DAWA Autocomplete when scripts are loaded
  useEffect(() => {
    if (scriptsLoaded && searchInputRef.current && window.dawaAutocomplete) {
      try {
        console.log('Initializing DAWA Autocomplete...')
        
        window.dawaAutocomplete.dawaAutocomplete(searchInputRef.current, {
          select: function(selected: any) {
            console.log('Address selected:', selected)
            setSelectedAddress(selected.tekst)
            
            // Extract coordinates from the selected address
            if (selected.data && selected.data.x && selected.data.y) {
              const lng = selected.data.x
              const lat = selected.data.y
              console.log('Navigating to coordinates:', lat, lng)
              router.push(`/shelters/nearby?lat=${lat}&lng=${lng}`)
            } else {
              console.error('Invalid address data:', selected)
              handleError(new Error('Invalid address data'), 'Selected address missing coordinates')
            }
          },
          onError: function(error: any) {
            console.error('DAWA autocomplete error:', error)
            handleError(new Error('DAWA autocomplete error'), error.message || 'Unknown DAWA error')
            setDawaFailed(true)
          }
        })
        
        console.log('DAWA Autocomplete initialized successfully')
      } catch (error) {
        console.error('Failed to initialize DAWA:', error)
        const err = error instanceof Error ? error : new Error('Failed to initialize DAWA')
        handleError(err, 'DAWA Autocomplete initialization failed')
        setDawaFailed(true)
      }
    } else if (scriptsLoaded && !window.dawaAutocomplete) {
      console.error('Script loaded but window.dawaAutocomplete is not available')
      const error = new Error('DAWA Autocomplete not available')
      handleError(error, 'Script loaded but window.dawaAutocomplete is not available')
      setDawaFailed(true)
    }
  }, [scriptsLoaded, router, handleError])

  return (
    <div className="space-y-3 sm:space-y-6">

      <button
        onClick={handleLocationClick}
        className="w-full bg-[#F97316] text-white py-4 px-6 rounded-full flex items-center justify-center gap-2 hover:bg-[#EA580C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={loading}
        aria-label="Brug min nuværende position til at finde beskyttelsesrum"
        role="button"
        tabIndex={0}
      >
        {loading ? (
          <LoadingSpinner size="sm" text="Henter din position..." />
        ) : (
          <>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
            </svg>
            <span>Brug min nuværende position</span>
          </>
        )}
      </button>

      <div className="text-center text-gray-400">eller</div>

      <div className="relative w-full">
        {/* Script loading progress */}
        {scriptLoadingProgress && !dawaFailed && (
          <div className="mb-2 p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg text-blue-200 text-sm" role="status">
            <div className="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              <p>{scriptLoadingProgress}</p>
            </div>
          </div>
        )}

        {dawaFailed && (
          <div className="mb-2 p-3 bg-yellow-900/20 border border-yellow-600/30 rounded-lg text-yellow-200 text-sm" role="alert">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="font-medium">DAWA Autocomplete er ikke tilgængelig</p>
                <p className="text-xs mt-1 opacity-80">Prøv at genindlæse siden eller brug GPS-funktionen ovenfor</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="ml-2 px-2 py-1 bg-yellow-600/20 hover:bg-yellow-600/30 rounded text-xs transition-colors"
                aria-label="Genindlæs siden"
              >
                Genindlæs
              </button>
            </div>
          </div>
        )}
        
        <div className="autocomplete-container w-full relative">
          <svg
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          
          {searchLoading && (
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 z-10">
              <LoadingSpinner size="sm" />
            </div>
          )}
          
          <input
            ref={searchInputRef}
            type="text"
            id="adresse"
            placeholder="Søg efter en adresse i Danmark"
            className="w-full bg-[#1a1a1a] text-white py-3 px-12 rounded-full border border-[#E97B4D] focus:outline-none focus:border-[#E97B4D] focus:bg-[#141414] transition-all placeholder-gray-400 disabled:opacity-50"
            disabled={searchLoading || dawaFailed}
            aria-label="Søg efter en adresse i Danmark"
            aria-describedby={dawaFailed ? "dawa-error" : undefined}
            role="searchbox"
            autoComplete="off"
          />
        </div>
        
        {selectedAddress && (
          <p className="mt-2 text-sm text-gray-400">
            Valgt adresse: <span className="text-white">{selectedAddress}</span>
          </p>
        )}
      </div>

      <style jsx global>{`
        .autocomplete-container {
          position: relative;
          width: 100%;
        }

        .autocomplete-container input {
          width: 100%;
          box-sizing: border-box;
        }

        .dawa-autocomplete-suggestions {
          margin: 0.3em 0 0 0;
          padding: 0;
          text-align: left;
          border-radius: 0.3125em;
          background: #1a1a1a;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 255, 255, 0.1);
          position: absolute;
          left: 0;
          right: 0;
          z-index: 9999;
          overflow-y: auto;
          box-sizing: border-box;
          border: 2px solid rgba(255, 255, 255, 0.3);
        }

        .dawa-autocomplete-suggestions .dawa-autocomplete-suggestion {
          margin: 0;
          list-style: none;
          cursor: pointer;
          padding: 0.4em 0.6em;
          color: #ffffff;
          border: 0.0625em solid rgba(255, 255, 255, 0.1);
          border-bottom-width: 0;
          background: #1a1a1a;
        }

        .dawa-autocomplete-suggestions .dawa-autocomplete-suggestion:first-child {
          border-top-left-radius: inherit;
          border-top-right-radius: inherit;
        }

        .dawa-autocomplete-suggestions .dawa-autocomplete-suggestion:last-child {
          border-bottom-left-radius: inherit;
          border-bottom-right-radius: inherit;
          border-bottom-width: 0.0625em;
        }

        .dawa-autocomplete-suggestions .dawa-autocomplete-suggestion.dawa-selected,
        .dawa-autocomplete-suggestions .dawa-autocomplete-suggestion:hover {
          background: #2a2a2a;
        }

        /* Limit suggestions to top 5 results */
        .dawa-autocomplete-suggestions .dawa-autocomplete-suggestion:nth-child(n+6) {
          display: none !important;
        }
      `}</style>
    </div>
  )
} 