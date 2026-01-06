'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'

declare global {
  interface Window {
    dawaAutocomplete: {
      dawaAutocomplete: (element: HTMLElement, options: any) => void
    }
  }
}

export default function Search() {
  const [loading, setLoading] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState('')
  const [scriptsLoaded, setScriptsLoaded] = useState(false)
  const [dawaFailed, setDawaFailed] = useState(false)
  const router = useRouter()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handleLocationClick = () => {
    if (!navigator.geolocation) {
      alert('Geolocation er ikke understøttet i din browser')
      return
    }

    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        router.push(`/shelters/nearby?lat=${position.coords.latitude}&lng=${position.coords.longitude}`)
        setLoading(false)
      },
      (error) => {
        console.error('Error getting location:', error)
        setLoading(false)
        alert('Kunne ikke hente din position. Tjek om du har givet tilladelse til at bruge din lokation.')
      }
    )
  }

  // Initialize DAWA Autocomplete
  useEffect(() => {
    if (scriptsLoaded && searchInputRef.current && window.dawaAutocomplete) {
      try {
        window.dawaAutocomplete.dawaAutocomplete(searchInputRef.current, {
          select: function(selected: any) {
            setSelectedAddress(selected.tekst)
            // Extract coordinates from the selected address
            if (selected.data && selected.data.x && selected.data.y) {
              const lng = selected.data.x
              const lat = selected.data.y
              router.push(`/shelters/nearby?lat=${lat}&lng=${lng}`)
            }
          }
        })
        console.log('DAWA Autocomplete2 initialized successfully')
      } catch (error) {
        console.error('Failed to initialize DAWA Autocomplete2:', error)
        setTimeout(() => setDawaFailed(true), 0)
      }
    } else if (scriptsLoaded && !window.dawaAutocomplete) {
      console.error('DAWA Autocomplete2 script loaded but window.dawaAutocomplete is not available')
      setTimeout(() => setDawaFailed(true), 0)
    }
  }, [scriptsLoaded, router])

  // Set fallback mode after a timeout if DAWA doesn't load
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!scriptsLoaded) {
        console.log('DAWA scripts taking too long, enabling fallback mode')
        setDawaFailed(true)
      }
    }, 5000) // 5 second timeout

    return () => clearTimeout(timeout)
  }, [scriptsLoaded])

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Load required scripts - NO QUERY STRINGS for proper caching */}
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/core-js/2.4.1/core.min.js"
        onLoad={() => {
          console.log('Core.js loaded successfully')
          // Core.js loaded, now load fetch
          const fetchScript = document.createElement('script')
          fetchScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/fetch/2.0.3/fetch.min.js'
          fetchScript.onload = () => {
            console.log('Fetch polyfill loaded successfully')
            // Fetch loaded, now load DAWA - NO QUERY STRING
            const dawaScript = document.createElement('script')
            dawaScript.src = '/dawa-autocomplete2.min.js'
            dawaScript.onload = () => {
              console.log('DAWA Autocomplete2 script loaded successfully')
              setScriptsLoaded(true)
            }
            dawaScript.onerror = (error) => {
              console.error('Failed to load DAWA Autocomplete2 script:', error)
              setDawaFailed(true)
            }
            document.head.appendChild(dawaScript)
          }
          fetchScript.onerror = (error) => {
            console.error('Failed to load fetch polyfill:', error)
            setDawaFailed(true)
          }
          document.head.appendChild(fetchScript)
        }}
        onError={(error) => {
          console.error('Failed to load core.js:', error)
          setDawaFailed(true)
        }}
      />

      <button
        onClick={handleLocationClick}
        className="w-full bg-[#F97316] text-white py-4 px-6 rounded-full flex items-center justify-center gap-2 hover:bg-[#EA580C] transition-colors"
        disabled={loading}
      >
        {loading ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Henter din position...</span>
          </>
        ) : (
          <>
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
            </svg>
            <span>Brug min nuværende position</span>
          </>
        )}
      </button>

      <div className="text-center text-gray-400">eller</div>

      <div className="relative w-full">
        {dawaFailed && (
          <div className="mb-2 p-2 bg-yellow-900/20 border border-yellow-600/30 rounded-lg text-yellow-200 text-sm">
            <p>⚠️ DAWA Autocomplete er ikke tilgængelig. Prøv at genindlæse siden.</p>
          </div>
        )}
        
        <div className="autocomplete-container w-full">
          <svg
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            id="adresse"
            placeholder="Søg efter en adresse i Danmark"
            className="w-full bg-[#1a1a1a] text-white py-3 px-12 rounded-full border border-[#E97B4D] focus:outline-none focus:border-[#E97B4D] focus:bg-[#141414] transition-all placeholder-gray-400"
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