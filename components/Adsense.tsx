"use client"

import { useEffect } from "react"

declare global {
  interface Window {
    adsbygoogle: any[]
  }
}

export default function Adsense() {
  useEffect(() => {
    try {
      window.adsbygoogle = window.adsbygoogle || []
      window.adsbygoogle.push({})
    } catch (err) {
      console.error(err)
    }
  }, [])

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client="ca-pub-8170196982539525"
      data-ad-slot="8486666155"
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  )
}
