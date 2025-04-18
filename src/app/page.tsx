'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ShelterCounter from '@/components/ShelterCounter'
import GlobalFooter from '@/components/GlobalFooter'
import Link from 'next/link'
import dynamic from 'next/dynamic'

// Import the search component dynamically with SSR disabled
const SearchComponent = dynamic(() => import('@/components/SearchComponent'), {
  ssr: false,
  loading: () => (
    <div className="glass-effect p-6 rounded-xl">
      <div className="flex items-center justify-center space-x-3">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-500"></div>
        <p className="text-gray-400">Indlæser søgning...</p>
      </div>
    </div>
  )
})

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
  return (
    <main className="min-h-screen text-white p-2 sm:p-8 flex flex-col justify-center items-center relative">
      <BackgroundAnimation />
      <AnimatePresence mode="wait">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="max-w-2xl mx-auto flex-1 w-full px-2 sm:px-4 relative z-10 flex flex-col justify-center"
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
            <div className="text-center mt-8">
              <ShelterCounter targetNumber={3435834} />
            </div>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 1 }}
            className="glass-effect p-4 sm:p-8 rounded-2xl shadow-2xl backdrop-blur-md bg-white/10 border border-white/10 relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="space-y-3 sm:space-y-6 relative z-10">
              <div suppressHydrationWarning>
                <SearchComponent />
              </div>
              
              <div className="text-center mt-4">
                <Link 
                  href="/tell-me-more" 
                  className="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium bg-white/5 hover:bg-white/10 text-white transition-all duration-200 group"
                >
                  <span>Læs mere om data</span>
                  <svg 
                    className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform duration-200" 
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
