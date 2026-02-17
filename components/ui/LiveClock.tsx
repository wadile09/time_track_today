// components/LiveClock.tsx
'use client'

import { useState, useEffect } from 'react'

export function LiveClock() {
    const [time, setTime] = useState(new Date())

    useEffect(() => {
        const interval = setInterval(() => setTime(new Date()), 1000)
        return () => clearInterval(interval)
    }, [])

    const pad = (n: number) => n.toString().padStart(2, '0')

    return (
        <div className="font-mono text-6xl md:text-8xl font-bold tracking-wider text-white drop-shadow-[0_8px_25px_rgba(0,0,0,0.9)] [text-shadow:_0_0_30px_rgba(59,130,246,0.7)]">
            {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())}
        </div>
    )
}