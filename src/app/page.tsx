'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLoadScript, Autocomplete } from '@react-google-maps/api'
import { motion, AnimatePresence } from 'framer-motion'
import ShelterCounter from '@/components/ShelterCounter'
import GlobalFooter from '@/components/GlobalFooter'

const libraries: ("places")[] = ['places']

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

  if (loadError) {
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
              <p>Der opstod en fejl ved indlæsning af kort. Prøv at genindlæse siden.</p>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen text-white p-4 sm:p-8 flex flex-col">
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="max-w-2xl mx-auto flex-1 w-full px-4"
        >
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-center mb-8 sm:mb-16"
          >
            <motion.h1 
              className="text-3xl sm:text-5xl font-bold mb-2 sm:mb-4 tracking-tight font-space-grotesk"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              Find Beskyttelsesrum
            </motion.h1>
            <motion.p 
              className="text-base sm:text-lg text-[#E5E7EB] font-inter"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              Find det nærmeste beskyttelsesrum i dit område
            </motion.p>
            <ShelterCounter targetNumber={1856746} />
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 1 }}
            className="glass-effect p-6 sm:p-8 rounded-2xl shadow-2xl backdrop-blur-md bg-white/10"
          >
            <div className="space-y-4 sm:space-y-6">
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
                          className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-[#9CA3AF]"
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
                          className="w-full p-3 sm:p-4 pl-10 sm:pl-12 text-sm sm:text-base text-white placeholder-[#9CA3AF] rounded-xl input-focus bg-white/5 backdrop-blur-sm border border-white/10 focus:border-[#F97316] transition-all duration-300 focus:ring-2 focus:ring-orange-400 focus:ring-opacity-20"
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
              
              <div className="separator text-[#9CA3AF] text-xs sm:text-sm font-medium">
                eller
              </div>
              
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleLocationClick}
                className="w-full text-white py-3 sm:py-4 px-6 rounded-full button-hover font-medium bg-[#F97316] hover:bg-[#EA580C] transition-all duration-300 flex items-center justify-center space-x-2 text-sm sm:text-base"
                disabled={isLoadingLocation}
              >
                {isLoadingLocation ? (
                  <>
                    <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Henter din position...</span>
                  </>
                ) : (
                  <>
                    <motion.svg 
                      className="w-4 h-4 sm:w-5 sm:h-5" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24" 
                      xmlns="http://www.w3.org/2000/svg"
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </motion.svg>
                    <span>Brug min nuværende position</span>
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <GlobalFooter />
    </main>
  )
}
