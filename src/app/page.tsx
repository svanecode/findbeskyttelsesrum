'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useLoadScript, Autocomplete } from '@react-google-maps/api'

const libraries: ("places")[] = ['places']

export default function Home() {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const router = useRouter()

  const { isLoaded: mapsLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries
  })

  useEffect(() => {
    setIsLoaded(true)
  }, [])

  const handleLocationClick = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          })
          router.push(`/shelters/nearby?lat=${position.coords.latitude}&lng=${position.coords.longitude}`)
        },
        (error) => {
          console.error('Error getting location:', error)
          alert('Kunne ikke få adgang til din lokation. Prøv at søge efter en adresse i stedet.')
        }
      )
    } else {
      alert('Din browser understøtter ikke geolokation. Prøv at søge efter en adresse i stedet.')
    }
  }

  const handlePlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace()
      if (place.geometry?.location) {
        setLocation({
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        })
        router.push(`/shelters/nearby?lat=${place.geometry.location.lat()}&lng=${place.geometry.location.lng()}`)
      }
    }
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-[#111111] text-white p-8">
        <div className="max-w-2xl mx-auto">
          <div className="glass-effect p-6 rounded-xl animate-fade-in">
            <div className="flex items-center space-x-3 text-red-400">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p>Der opstod en fejl ved indlæsning af kort. Prøv at genindlæse siden.</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#111111] text-white p-8 flex flex-col">
      <div className="max-w-2xl mx-auto flex-1">
        <div className="text-center mb-16">
          <div className={`mb-8 animate-float icon-container ${isLoaded ? 'animate-fade-in' : ''}`}>
            <svg
              className="w-16 h-16 mx-auto text-[#F97316]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <h1 className={`text-5xl font-bold mb-4 tracking-tight ${isLoaded ? 'animate-fade-in' : ''}`} style={{ animationDelay: '0.1s' }}>
            Find Beskyttelsesrum
          </h1>
          <p className={`text-[#E5E7EB] text-lg ${isLoaded ? 'animate-fade-in' : ''}`} style={{ animationDelay: '0.2s' }}>
            Find det nærmeste beskyttelsesrum i dit område
          </p>
        </div>
        
        <div className={`glass-effect p-8 rounded-xl ${isLoaded ? 'animate-fade-in' : ''}`} style={{ animationDelay: '0.3s' }}>
          <div className="space-y-6">
            <div className="relative">
              {mapsLoaded && (
                <>
                  <Autocomplete
                    onLoad={(autocomplete) => setAutocomplete(autocomplete)}
                    onPlaceChanged={handlePlaceChanged}
                    options={{
                      componentRestrictions: { country: 'dk' },
                      types: ['address']
                    }}
                  >
                    <div className="relative">
                      <svg
                        className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#9CA3AF]"
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
                        className="w-full p-4 pl-12 text-white placeholder-[#9CA3AF] rounded-lg input-focus"
                      />
                    </div>
                  </Autocomplete>
                  <style jsx global>{`
                    .pac-container {
                      background-color: rgba(17, 17, 17, 0.98);
                      border: 1px solid rgba(255, 255, 255, 0.1);
                      border-radius: 0.75rem;
                      margin-top: 0.5rem;
                      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
                      backdrop-filter: blur(12px);
                      z-index: 1000;
                    }
                    .pac-item {
                      padding: 0.75rem 1rem;
                      border-top: 1px solid rgba(255, 255, 255, 0.05);
                      color: #E5E7EB;
                      cursor: pointer;
                      transition: all 0.2s ease;
                      font-size: 0.95rem;
                      line-height: 1.4;
                    }
                    .pac-item:first-child {
                      border-top: none;
                    }
                    .pac-item:hover {
                      background-color: rgba(249, 115, 22, 0.1);
                      color: #F97316;
                    }
                    .pac-item-query {
                      color: #F97316;
                      font-size: 1rem;
                      font-weight: 500;
                    }
                    .pac-matched {
                      color: #9CA3AF;
                      opacity: 0.8;
                    }
                    .pac-icon {
                      display: none;
                    }
                    .pac-item-selected {
                      background-color: rgba(249, 115, 22, 0.15) !important;
                      color: #F97316;
                    }
                    .pac-item-selected .pac-item-query {
                      color: #F97316;
                    }
                    .pac-item-selected .pac-matched {
                      color: #9CA3AF;
                    }
                  `}</style>
                </>
              )}
            </div>
            
            <div className="separator">
              eller
            </div>
            
            <button
              onClick={handleLocationClick}
              className="w-full text-white py-4 px-6 rounded-lg button-hover font-medium"
            >
              Brug min nuværende position
            </button>
          </div>
        </div>
      </div>

      <footer className="footer">
        <p>Bemærk: Denne tjeneste er uafhængig og er ikke tilknyttet, drevet eller godkendt af den danske stat eller nogen offentlige myndigheder.</p>
      </footer>
    </main>
  )
}
