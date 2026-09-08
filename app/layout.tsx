import React from "react"
import type { Metadata } from 'next'
import Script from "next/script"
import { Geist, Geist_Mono } from 'next/font/google'
import ParticleWrapper from '@/components/particle-wrapper'

import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Time Tracking System',
  description: 'Employee time tracking and attendance management system',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-black text-white">

        {/* Global particle background */}
        <ParticleWrapper />

        {/* Google AdSense Script */}
        <Script
          async
          strategy="afterInteractive"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
          crossOrigin="anonymous"
        />

        {children}

      </body>
    </html>
  )
}
