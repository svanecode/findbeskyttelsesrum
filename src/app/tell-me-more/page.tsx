'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

export default function TellMeMore() {
  return (
    <main className="min-h-screen text-white p-4 sm:p-8 relative">
      {/* Background gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#1a1a1a] via-[#0f0f0f] to-[#1a1a1a] -z-10" />
      <div className="fixed inset-0 bg-[url('/grid.svg')] opacity-10 -z-10" />
      
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative glass-effect p-6 sm:p-10 rounded-2xl overflow-hidden"
        >
          {/* Card background effects */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.1),transparent_50%)]" />
          
          {/* Card content */}
          <div className="relative z-10">
            <Link 
              href="/"
              className="inline-flex items-center text-base font-medium text-white hover:text-white transition-all duration-200 mb-8 group bg-[#F97316]/90 hover:bg-[#F97316] px-6 py-3 rounded-xl border border-white/20 backdrop-blur-sm relative overflow-hidden shadow-lg hover:shadow-xl"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              <div className="relative z-10 flex items-center">
                <svg 
                  className="w-5 h-5 mr-3 group-hover:-translate-x-1 transition-transform duration-200" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Tilbage til forsiden
              </div>
            </Link>

            <motion.h1 
              className="text-3xl sm:text-4xl font-bold mb-8 font-space-grotesk bg-gradient-to-r from-white to-[#E5E7EB] bg-clip-text text-transparent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Om Beskyttelsesrum
            </motion.h1>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="space-y-10 text-[#E5E7EB]"
            >
              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Datakilder
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  Data om beskyttelsesrum kommer fra to officielle kilder:
                </p>
                <ul className="space-y-3 pl-6">
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-white">BBR (Bygnings- og Boligregistret)</span>
                      <p className="text-sm text-[#9CA3AF]">Indeholder information om bygningers formål og egenskaber</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <div>
                      <span className="font-medium text-white">DAR (Danmarks Adresseregister)</span>
                      <p className="text-sm text-[#9CA3AF]">Indeholder præcise adresseoplysninger</p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Hvad er inkluderet?
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  For at sikre relevans og overskuelighed, viser vi kun beskyttelsesrum med:
                </p>
                <ul className="space-y-3 pl-6">
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>40 eller flere pladser</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>Offentligt tilgængelige lokationer</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Hvad er udeladt?
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  Vi har valgt at udelade:
                </p>
                <ul className="space-y-3 pl-6">
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>Private hjem</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>Lokationer med færre end 40 pladser</span>
                  </li>
                  <li className="flex items-start">
                    <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full mt-2 mr-3 flex-shrink-0"></span>
                    <span>Lokationer uden offentlig adgang</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center">
                  <span className="w-2 h-2 bg-[#F97316] rounded-full mr-3"></span>
                  Hvorfor?
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">
                  Dette gør det nemmere at finde de mest relevante beskyttelsesrum i en nødsituation, hvor tid og overskuelighed er afgørende.
                </p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </main>
  )
} 