'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLoadScript, Autocomplete } from '@react-google-maps/api'
import Link from 'next/link'

const libraries: ("places")[] = ['places']

export default function Search() {
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const { isLoaded: mapsLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries
  })

  const handlePlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace()
      if (place.geometry?.location) {
        router.push(`/shelters/nearby?lat=${place.geometry.location.lat()}&lng=${place.geometry.location.lng()}`)
      }
    }
  }

  // Debounce the input
  const handleInputChange = useCallback(
    debounce((event: React.ChangeEvent<HTMLInputElement>) => {
      // The actual search will be handled by Google Places Autocomplete
      console.log('Input changed:', event.target.value)
    }, 300),
    []
  )

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

  // Debounce helper function
  function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout
    return (...args: any[]) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  }

  if (loadError) {
    return (
      <div className="max-w-[700px] mx-auto">
        <div className="glass-effect p-4 sm:p-8 rounded-[32px] shadow-2xl backdrop-blur-md bg-[#1A1A1A]/50 border border-white/10 relative overflow-hidden">
          <div className="flex items-center space-x-3 text-red-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>Der opstod en fejl ved indlæsning af Google Maps. Prøv at genindlæse siden.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[700px] mx-auto">
      <div className="glass-effect p-4 sm:p-8 rounded-[32px] shadow-2xl backdrop-blur-md bg-[#1A1A1A]/50 border border-white/10 relative overflow-hidden">
        <div className="space-y-3 sm:space-y-6">
          <button
            onClick={handleLocationClick}
            className="w-full bg-[#E97B4D] text-white py-4 px-6 rounded-full flex items-center justify-center gap-2 hover:bg-[#d16b43] transition-colors"
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
            {mapsLoaded && (
              <Autocomplete
                onLoad={(autocomplete) => setAutocomplete(autocomplete)}
                onPlaceChanged={handlePlaceChanged}
                options={{
                  componentRestrictions: { country: 'dk' },
                  types: ['address']
                }}
              >
                <div className="relative group">
                  <svg
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-[#E97B4D] transition-colors duration-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Søg efter en adresse i Danmark"
                    className="w-full bg-[#2A2A2A] text-white py-3 px-11 rounded-full focus:outline-none focus:ring-2 focus:ring-[#E97B4D] focus:ring-opacity-50 transition-all duration-300"
                    onChange={handleInputChange}
                    disabled={loading}
                  />
                </div>
              </Autocomplete>
            )}
          </div>

          <div className="text-center">
            <Link 
              href={{ pathname: '/tell-me-more' }}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#2A2A2A] text-white rounded-full hover:bg-[#3a3a3a] transition-colors text-sm"
            >
              Læs mere om data
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" fill="currentColor"/>
              </svg>
            </Link>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .pac-container {
          margin-top: 12px;
          padding: 8px;
          background: rgba(23, 23, 23, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          box-shadow: 
            0 20px 48px -12px rgba(0, 0, 0, 0.4),
            0 8px 16px -8px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.1);
          z-index: 1000;
        }

        .pac-item {
          padding: 12px 16px;
          margin: 4px 0;
          border: none;
          border-radius: 12px;
          color: rgba(229, 231, 235, 0.8);
          cursor: pointer;
          background: transparent;
          display: flex;
          align-items: center;
          font-family: var(--font-inter);
          position: relative;
          overflow: hidden;
        }

        .pac-item:hover {
          background: rgba(249, 115, 22, 0.08);
          color: white;
          padding-left: 20px;
        }

        .pac-item-selected,
        .pac-item-selected:hover {
          background: rgba(249, 115, 22, 0.15);
          color: white;
        }

        .pac-icon {
          display: none;
        }

        .pac-item-query {
          font-size: 14px;
          color: white;
          font-weight: 500;
          padding-right: 8px;
        }

        .pac-matched {
          color: #E97B4D;
          font-weight: 600;
          position: relative;
          display: inline-block;
        }
      `}</style>
    </div>
  )
} 