'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder'
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css'

export default function Search() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout>()

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

  useEffect(() => {
    if (!searchContainerRef.current) return

    const geocoder = new MapboxGeocoder({
      accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '',
      countries: 'dk',
      types: 'address',
      language: 'da',
      placeholder: 'Søg efter en adresse i Danmark',
      marker: false,
      flyTo: false,
      minLength: 3
    })

    // Add debouncing to the search
    const originalQuery = geocoder.query.bind(geocoder)
    geocoder.query = function(searchInput: string) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        originalQuery(searchInput)
      }, 500)
      return geocoder
    }

    geocoder.on('result', (e: any) => {
      const [lng, lat] = e.result.center
      router.push(`/shelters/nearby?lat=${lat}&lng=${lng}`)
    })

    const searchContainer = searchContainerRef.current
    geocoder.addTo(searchContainer)

    return () => {
      if (searchContainer.querySelector('.mapboxgl-ctrl-geocoder')) {
        geocoder.onRemove()
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [router])

  return (
    <div className="space-y-3 sm:space-y-6">
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

      <div className="relative">
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <div ref={searchContainerRef} className="geocoder-container" />
        </div>
      </div>

      <style jsx global>{`
        .geocoder-container {
          position: relative;
          z-index: 30;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder {
          width: 100% !important;
          max-width: none !important;
          background: transparent !important;
          box-shadow: none !important;
          font-family: inherit !important;
          position: relative !important;
          z-index: 30 !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--input {
          width: 100% !important;
          background: #1a1a1a !important;
          color: #ffffff !important;
          padding: 12px 40px !important;
          height: 48px !important;
          border-radius: 9999px !important;
          font-size: 16px !important;
          transition: all 0.3s !important;
          border: 1px solid #E97B4D !important;
          box-sizing: border-box !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--input:focus {
          outline: none !important;
          border-color: #E97B4D !important;
          background: #141414 !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--input::placeholder {
          color: #9CA3AF !important;
          opacity: 0.8 !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--icon {
          display: none !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--icon-search {
          display: none !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--icon-loading {
          display: none !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--icon-close {
          margin-right: 12px !important;
          width: 20px !important;
          height: 20px !important;
          background-color: rgba(255, 255, 255, 0.3) !important;
          border-radius: 50% !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
        }

        /* Style suggestions */
        .geocoder-container .suggestions {
          background-color: #1a1a1a !important;
          color: #ffffff !important;
          border: 2px solid rgba(255, 255, 255, 0.3) !important;
          border-radius: 12px !important;
          margin-top: 8px !important;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 255, 255, 0.1) !important;
          overflow: hidden !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--suggestion {
          color: #ffffff !important;
          padding: 10px 16px !important;
          cursor: pointer !important;
          border-radius: 4px !important;
          margin: 0 !important;
          font-size: 14px !important;
          font-weight: 400 !important;
          line-height: 1.5 !important;
          background: #1a1a1a !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--suggestion:last-child {
          border-bottom: none !important;
        }

        .geocoder-container .suggestions-wrapper {
          background-color: #1a1a1a !important;
          color: #ffffff !important;
          border-radius: 12px !important;
          overflow: hidden !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--suggestions {
          background-color: #1a1a1a !important;
          border-radius: 12px !important;
          border: 2px solid rgba(255, 255, 255, 0.3) !important;
          padding: 8px !important;
          margin-top: 8px !important;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.6), 0 0 15px rgba(255, 255, 255, 0.1) !important;
          position: absolute !important;
          width: 100% !important;
          z-index: 40 !important;
          top: 100% !important;
          left: 0 !important;
          color: #ffffff !important;
          overflow: hidden !important;
        }

        /* Force dark background on all elements */
        .geocoder-container .suggestions > *,
        .geocoder-container .suggestions > * > *,
        .geocoder-container .suggestions-wrapper > *,
        .geocoder-container .suggestions-wrapper > * > *,
        .geocoder-container .mapboxgl-ctrl-geocoder--suggestion > *,
        .geocoder-container .mapboxgl-ctrl-geocoder--suggestion > * > * {
          background-color: #1a1a1a !important;
        }

        .geocoder-container .mapboxgl-ctrl-geocoder--suggestion strong {
          color: #E97B4D !important;
          font-weight: 500 !important;
        }

        /* Ensure list items are white */
        .geocoder-container .mapboxgl-ctrl-geocoder--suggestion > * {
          color: #ffffff !important;
        }

        /* Override any Mapbox default styles */
        .suggestions,
        .suggestions > *,
        .suggestions .active,
        .suggestions .active > *,
        .suggestions .active:hover,
        .suggestions > li,
        .suggestions > li > *,
        .suggestions > li:hover {
          background-color: #1a1a1a !important;
        }
      `}</style>
    </div>
  )
} 