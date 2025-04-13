'use client'

import dynamic from 'next/dynamic'

const KommuneMap = dynamic(() => import('./map'), { ssr: false })

interface Props {
  kommunekode: string
}

export default function MapWrapper({ kommunekode }: Props) {
  return <KommuneMap kommunekode={kommunekode} />
} 