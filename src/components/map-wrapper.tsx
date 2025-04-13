'use client'

import dynamic from 'next/dynamic'

const NationalMap = dynamic(() => import('./national-map'), { ssr: false })

export default function MapWrapper() {
  return <NationalMap />
} 