'use client'

import dynamic from 'next/dynamic'

const ParticleBackground = dynamic(() => import('@/components/particle-background'), { ssr: false })

export default function ParticleWrapper() {
  return <ParticleBackground />
}
