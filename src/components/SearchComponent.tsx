'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLoadScript } from '@react-google-maps/api'
import { motion } from 'framer-motion'
import { Autocomplete } from '@react-google-maps/api'

const libraries: ("places")[] = ['places']

export default function SearchComponent() {
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const router = useRouter()
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null)

  const { isLoaded: mapsLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries,
    version: 'weekly',
    id: `google-maps-${retryCount}`
  })

  useEffect(() => {
    console.log('Maps loaded:', mapsLoaded)
    console.log('Load error:', loadError)
    console.log('API Key:', process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'Present' : 'Missing')
    
    if (loadError) {
      console.error('Google Maps API load error:', loadError)
      if (retryCount < 3) {
        console.log(`Retrying in 2 seconds... (Attempt ${retryCount + 1}/3)`)
        const timer = setTimeout(() => {
          setRetryCount(prev => prev + 1)
        }, 2000)
        return () => clearTimeout(timer)
      }
    }
  }, [loadError, retryCount, mapsLoaded])

  const handleLocationClick = () => {
    setIsLoadingLocation(true)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          router.push(`/shelters/nearby?lat=${position.coords.latitude}&lng=${position.coords.longitude}`)
          setIsLoadingLocation(false)
        },
        (error) => {
          console.error('Error getting location:', error)
          alert('Kunne ikke få adgang til din lokation. Prøv at søge efter en adresse i stedet.')
          setIsLoadingLocation(false)
        }
      )
    } else {
      alert('Din browser understøtter ikke geolokation. Prøv at søge efter en adresse i stedet.')
      setIsLoadingLocation(false)
    }
  }

  const handlePlaceChanged = (place: google.maps.places.PlaceResult) => {
    console.log('Place selected:', place)
    if (!place.geometry?.location) {
      console.error('No geometry found for place:', place)
      return
    }
    router.push(`/shelters/nearby?lat=${place.geometry.location.lat()}&lng=${place.geometry.location.lng()}`)
  }

  return (
    <>
      <button
        onClick={handleLocationClick}
        className="w-full text-white py-4 px-6 rounded-full font-medium bg-[#F97316] hover:bg-[#EA580C] flex items-center justify-center space-x-2 text-sm relative overflow-hidden group shadow-[0_0_0_1px_rgba(255,255,255,0.1)] hover:shadow-[0_0_0_2px_rgba(255,255,255,0.2)]"
        disabled={isLoadingLocation}
      >
        {/* Inner glow effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100" />
        
        {/* Button content */}
        <div className="relative z-10 flex items-center justify-center space-x-2">
          {isLoadingLocation ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Henter din position...</span>
            </>
          ) : (
            <>
              <svg 
                className="w-5 h-5" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24" 
                xmlns="http://www.w3.org/2000/svg"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-medium">Brug min nuværende position</span>
            </>
          )}
        </div>
      </button>

      {!loadError && (
        <>
          <div className="separator text-[#9CA3AF] text-xs sm:text-sm font-medium my-2 sm:my-4">
            eller
          </div>
          
          <div className="relative">
            {mapsLoaded && (
              <Autocomplete
                onLoad={(autocomplete) => {
                  console.log('Autocomplete loaded')
                  setAutocomplete(autocomplete)
                }}
                onPlaceChanged={() => {
                  console.log('Place changed')
                  if (autocomplete) {
                    const place = autocomplete.getPlace()
                    console.log('Selected place:', place)
                    handlePlaceChanged(place)
                  }
                }}
                options={{
                  componentRestrictions: { country: 'dk' },
                  types: ['address'],
                  fields: ['geometry', 'formatted_address']
                }}
              >
                <div className="relative group">
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#9CA3AF] group-focus-within:text-[#F97316] transition-colors duration-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="Søg efter en adresse i Danmark"
                    className="w-full p-4 pl-12 text-sm text-white placeholder-[#9CA3AF] rounded-full input-focus bg-[#1a1a1a] border border-white/10 focus:border-[#F97316] transition-all duration-300 focus:ring-2 focus:ring-orange-400 focus:ring-opacity-20 group-hover:bg-[#1f1f1f]"
                  />
                </div>
              </Autocomplete>
            )}
            {!mapsLoaded && !loadError && (
              <div className="flex items-center justify-center space-x-3">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p>Indlæser søgning...</p>
              </div>
            )}
          </div>
        </>
      )}
      <style jsx global>{`
        .pac-container {
          margin-top: 8px;
          padding: 8px;
          background: rgba(23, 23, 23, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          box-shadow: 
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06);
          z-index: 1000;
          animation: dropdownFadeIn 0.15s ease-out;
          transform-origin: top center;
        }

        .pac-item {
          padding: 8px 12px;
          margin: 4px 0;
          border: none;
          border-radius: 8px;
          color: rgba(229, 231, 235, 0.9);
          cursor: pointer;
          transition: all 0.15s ease;
          background: transparent;
          display: flex;
          align-items: center;
          font-family: var(--font-inter);
          font-size: 14px;
          position: relative;
        }

        .pac-item:hover {
          background: rgba(249, 115, 22, 0.1);
          color: white;
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
          color: #F97316;
          font-weight: 600;
        }

        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Hide the Google logo */
        .pac-container:after {
          display: none;
        }
      `}</style>
    </>
  )
} 