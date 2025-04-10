'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLoadScript, Autocomplete } from '@react-google-maps/api'
import { motion, AnimatePresence } from 'framer-motion'
import ShelterCounter from '@/components/ShelterCounter'
import GlobalFooter from '@/components/GlobalFooter'
import Link from 'next/link'

const libraries: ("places")[] = ['places']

// Background animation component
const BackgroundAnimation = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#0f0f0f] to-[#1a1a1a] animate-gradient-shift" />
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-black/20" />
    </div>
  )
}

export default function Home() {
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null)
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const router = useRouter()

  const { isLoaded: mapsLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    libraries
  })

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

  const handlePlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace()
      if (place.geometry?.location) {
        router.push(`/shelters/nearby?lat=${place.geometry.location.lat()}&lng=${place.geometry.location.lng()}`)
      }
    }
  }

  // Debounce the input
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout
    return (...args: any[]) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  }

  const handleInputChange = useCallback(
    debounce((event: React.ChangeEvent<HTMLInputElement>) => {
      // The actual search will be handled by Google Places Autocomplete
      console.log('Input changed:', event.target.value)
    }, 300),
    []
  )

  if (loadError) {
    console.error('Google Maps load error details:', loadError);
    return (
      <main className="min-h-screen text-white p-8">
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
              <p>Der opstod en fejl ved indlæsning af Google Maps. Prøv at genindlæse siden.</p>
            </div>
            <div className="mt-4 text-sm text-gray-400">
              <p>Fejldetaljer: {loadError.message || 'Ukendt fejl'}</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen text-white p-2 sm:p-8 flex flex-col relative">
      <BackgroundAnimation />
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="max-w-2xl mx-auto flex-1 w-full px-2 sm:px-4 relative z-10"
        >
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-center mb-6 sm:mb-16"
          >
            <motion.h1 
              className="text-2xl sm:text-5xl font-bold mb-2 sm:mb-4 tracking-tight font-space-grotesk"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              Find Beskyttelsesrum
            </motion.h1>
            <motion.p 
              className="text-sm sm:text-lg text-[#E5E7EB] font-inter mb-4 sm:mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              Find det nærmeste beskyttelsesrum i dit område
            </motion.p>
            <ShelterCounter targetNumber={1903819} />
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 1 }}
            className="glass-effect p-4 sm:p-8 rounded-2xl shadow-2xl backdrop-blur-md bg-white/10 border border-white/10 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="space-y-3 sm:space-y-6 relative z-10">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleLocationClick}
                className="w-full text-white py-4 px-6 rounded-full font-medium bg-[#F97316] hover:bg-[#EA580C] transition-all duration-200 flex items-center justify-center space-x-2 text-sm relative overflow-hidden group shadow-[0_0_0_1px_rgba(255,255,255,0.1)] hover:shadow-[0_0_0_2px_rgba(255,255,255,0.2)]"
                disabled={isLoadingLocation}
              >
                {/* Inner glow effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                
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
              </motion.button>

              <div className="separator text-[#9CA3AF] text-xs sm:text-sm font-medium my-2 sm:my-4">
                eller
              </div>
              
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
                          className="w-full p-4 pl-12 text-sm text-white placeholder-[#9CA3AF] rounded-full input-focus bg-white/5 backdrop-blur-sm border border-white/10 focus:border-[#F97316] transition-all duration-300 focus:ring-2 focus:ring-orange-400 focus:ring-opacity-20 group-hover:bg-white/10"
                          onChange={handleInputChange}
                        />
                      </div>
                    </Autocomplete>
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
                        animation: dropdownFadeIn 0.2s ease-out;
                        transform-origin: top center;
                      }

                      /* Fix Google logo */
                      .pac-container:after {
                        background-image: url(https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png);
                        background-position: right;
                        background-size: 120px 14px;
                        background-repeat: no-repeat;
                        padding: 9px;
                        content: "";
                        position: sticky;
                        bottom: 0;
                        right: 0;
                        left: 0;
                        height: 32px;
                        pointer-events: none;
                        background-color: rgba(23, 23, 23, 0.95);
                        margin: 8px -8px -8px -8px;
                        border-radius: 0 0 20px 20px;
                        border-top: 1px solid rgba(255, 255, 255, 0.05);
                        padding-right: 16px;
                      }

                      @keyframes dropdownFadeIn {
                        from {
                          opacity: 0;
                          transform: translateY(-8px) scale(0.98);
                        }
                        to {
                          opacity: 1;
                          transform: translateY(0) scale(1);
                        }
                      }
                      
                      .pac-item {
                        padding: 12px 16px;
                        margin: 4px 0;
                        border: none;
                        border-radius: 12px;
                        color: rgba(229, 231, 235, 0.8);
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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
                        transition: all 0.2s ease;
                      }
                      
                      .pac-matched {
                        color: #F97316;
                        font-weight: 600;
                        position: relative;
                        display: inline-block;
                      }

                      .pac-matched::after {
                        content: '';
                        position: absolute;
                        bottom: -1px;
                        left: 0;
                        width: 100%;
                        height: 1px;
                        background: #F97316;
                        transform: scaleX(0);
                        transition: transform 0.2s ease;
                        transform-origin: left;
                      }

                      .pac-item:hover .pac-matched::after {
                        transform: scaleX(1);
                      }

                      /* Remove the gradient overlay that was conflicting with the Google logo */
                      .pac-container::after {
                        display: none;
                      }

                      /* Custom scrollbar for the dropdown */
                      .pac-container::-webkit-scrollbar {
                        width: 8px;
                        height: 8px;
                      }

                      .pac-container::-webkit-scrollbar-track {
                        background: transparent;
                      }

                      .pac-container::-webkit-scrollbar-thumb {
                        background: rgba(249, 115, 22, 0.3);
                        border-radius: 4px;
                        border: 2px solid transparent;
                        background-clip: padding-box;
                      }

                      .pac-container::-webkit-scrollbar-thumb:hover {
                        background: rgba(249, 115, 22, 0.5);
                        border: 2px solid transparent;
                        background-clip: padding-box;
                      }
                    `}</style>
                  </>
                )}
              </div>

              <div className="text-center mt-4">
                <Link 
                  href="/tell-me-more" 
                  className="text-sm text-[#9CA3AF] hover:text-white transition-colors duration-200 inline-flex items-center"
                >
                  <span>Læs mere om data</span>
                  <svg 
                    className="w-4 h-4 ml-1" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <GlobalFooter />
    </main>
  )
}
