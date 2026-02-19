'use client'

import React from "react"
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

function AnalogClock({ size = 280 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    function drawClock() {
      if (!ctx) return
      const now = new Date()
      const cx = size / 2
      const cy = size / 2
      const radius = size / 2 - 10

      ctx.clearRect(0, 0, size, size)

      // Outer glow ring
      const glowGrad = ctx.createRadialGradient(cx, cy, radius - 4, cx, cy, radius + 6)
      glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.06)')
      glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2)
      ctx.fillStyle = glowGrad
      ctx.fill()

      // Clock face background
      const faceGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      faceGrad.addColorStop(0, 'rgba(30, 30, 30, 0.5)')
      faceGrad.addColorStop(1, 'rgba(10, 10, 10, 0.7)')
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fillStyle = faceGrad
      ctx.fill()

      // Clock border
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Minute marks
      for (let i = 0; i < 60; i++) {
        const angle = (i * Math.PI * 2) / 60 - Math.PI / 2
        const isHour = i % 5 === 0
        const innerR = radius - (isHour ? 18 : 10)
        const outerR = radius - 4

        ctx.beginPath()
        ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle))
        ctx.lineTo(cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle))
        ctx.strokeStyle = isHour ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.15)'
        ctx.lineWidth = isHour ? 2 : 0.8
        ctx.stroke()
      }

      // Hour numbers
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.font = `${size * 0.055}px "Inter", "SF Pro Display", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (let i = 1; i <= 12; i++) {
        const angle = (i * Math.PI * 2) / 12 - Math.PI / 2
        const numR = radius - 32
        ctx.fillText(i.toString(), cx + numR * Math.cos(angle), cy + numR * Math.sin(angle))
      }

      const hours = now.getHours() % 12
      const minutes = now.getMinutes()
      const seconds = now.getSeconds()
      const millis = now.getMilliseconds()

      // Hour hand
      const hourAngle = ((hours + minutes / 60) * Math.PI * 2) / 12 - Math.PI / 2
      const hourLen = radius * 0.5
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + hourLen * Math.cos(hourAngle), cy + hourLen * Math.sin(hourAngle))
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      ctx.stroke()

      // Minute hand
      const minAngle = ((minutes + seconds / 60) * Math.PI * 2) / 60 - Math.PI / 2
      const minLen = radius * 0.7
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + minLen * Math.cos(minAngle), cy + minLen * Math.sin(minAngle))
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.stroke()

      // Second hand (smooth sweep)
      const secAngle = ((seconds + millis / 1000) * Math.PI * 2) / 60 - Math.PI / 2
      const secLen = radius * 0.8
      const secTail = radius * 0.15

      // Second hand tail
      ctx.beginPath()
      ctx.moveTo(cx - secTail * Math.cos(secAngle), cy - secTail * Math.sin(secAngle))
      ctx.lineTo(cx + secLen * Math.cos(secAngle), cy + secLen * Math.sin(secAngle))
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'
      ctx.lineWidth = 1.2
      ctx.lineCap = 'round'
      ctx.stroke()

      // Center dot
      ctx.beginPath()
      ctx.arc(cx, cy, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)'
      ctx.fill()

      // Inner center dot
      ctx.beginPath()
      ctx.arc(cx, cy, 2, 0, Math.PI * 2)
      ctx.fillStyle = '#fff'
      ctx.fill()
    }

    let animId: number
    function tick() {
      drawClock()
      animId = requestAnimationFrame(tick)
    }
    tick()

    return () => cancelAnimationFrame(animId)
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="opacity-100"
    />
  )
}

function DigitalTime() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const hours = time.getHours().toString().padStart(2, '0')
  const minutes = time.getMinutes().toString().padStart(2, '0')
  const seconds = time.getSeconds().toString().padStart(2, '0')

  const day = time.toLocaleDateString('en-US', { weekday: 'long' })
  const date = time.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="text-center space-y-1">
      <div className="flex items-center justify-center gap-1 font-mono tracking-widest">
        <span className="text-4xl font-extralight text-white/90">{hours}</span>
        <span className="text-4xl font-extralight text-white/30 animate-pulse">:</span>
        <span className="text-4xl font-extralight text-white/90">{minutes}</span>
        <span className="text-4xl font-extralight text-white/30 animate-pulse">:</span>
        <span className="text-4xl font-extralight text-red-400/80">{seconds}</span>
      </div>
      <p className="text-[11px] uppercase tracking-[0.3em] text-white/25 font-light">
        {day} &middot; {date}
      </p>
    </div>
  )
}

export function LoginForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Auto-redirect if already logged in
    const existing = localStorage.getItem('authSession')
    if (existing) {
      router.push('/time-details')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (!username || !password) {
      toast({
        title: 'Validation Error',
        description: 'Please enter both username and password',
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    try {
      const COMPANY_CODE = '100299'
      const raw = `${username}|${COMPANY_CODE}`
      const encoded = Buffer.from(raw).toString("base64")

      const response = await login({ username: encoded, password, otp })

      if (!response.isSuccess) {
        toast({
          title: 'Login Failed',
          description: response.message || 'Invalid credentials',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }

      const sessionData = {
        token: response.data.token,
        employeeCode: response.data.userModel.employeeCode,
        employeeName: response.data.userModel.employeeName,
        email: response.data.userModel.email,
      }

      localStorage.setItem('authSession', JSON.stringify(sessionData))

      toast({
        title: 'Success',
        description: `Welcome back, ${response.data.userModel.employeeName}!`,
      })

      router.push('/time-details')
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'An error occurred during login'

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black font-sans">
      {/* Premium Mesh Gradient Background */}
      <div className="absolute inset-0 z-0 bg-black overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full bg-purple-600/5 blur-[100px]" />

        {/* Grain texture overlay */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
      </div>

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {mounted && [...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${1 + i * 0.2}px`,
              height: `${1 + i * 0.2}px`,
              left: `${(i * 15) % 100}%`,
              top: `${(i * 25) % 100}%`,
              background: 'rgba(255, 255, 255, 0.05)',
              boxShadow: '0 0 15px rgba(255, 255, 255, 0.05)',
              animation: `float-${i % 8} ${15 + i * 2}s infinite ease-in-out`,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-12 p-6 w-full max-w-md">
        {/* Analog Clock Container with Depth */}
        <div className="relative group transition-all duration-1000 hover:scale-105">
          <div className="absolute inset-0 rounded-full bg-white/5 blur-3xl group-hover:bg-blue-500/5 transition-colors duration-1000" />
          {mounted && <AnalogClock size={260} />}
        </div>

        {/* Digital Time & Card Section */}
        <div className="w-full space-y-8 flex flex-col items-center">
          {mounted && <DigitalTime />}

          {/* Login Card */}
          <div className="w-full backdrop-blur-[40px] rounded-[2.5rem] border border-white/[0.08] bg-white/[0.01] p-10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.7)] relative overflow-hidden group">
            {/* Glossy Edge Glow */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

            {/* Card Header */}
            <div className="text-center mb-10">
              <h1 className="text-2xl font-extralight tracking-[0.25em] text-white/95 uppercase mb-1.5 leading-none">
                Chronos
              </h1>
              <p className="text-[10px] tracking-[0.4em] text-white/20 uppercase font-light">
                Enterprise Node 0x99
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-[9px] uppercase tracking-[0.3em] text-white/30 font-light ml-2">
                  Identity
                </Label>
                <div className="relative group/input">
                  <Input
                    id="username"
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    className="h-14 bg-white/[0.02] border-white/[0.06] text-white/90 placeholder:text-white/15 
                      focus:border-white/20 focus:ring-0 focus:bg-white/[0.04] rounded-2xl
                      transition-all duration-500 text-sm font-light tracking-widest px-6 w-full outline-none ring-0 appearance-none"
                    required
                  />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent group-focus-within/input:w-[80%] transition-all duration-1000" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[9px] uppercase tracking-[0.3em] text-white/30 font-light ml-2">
                  Access Key
                </Label>
                <div className="relative group/input">
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="h-14 bg-white/[0.02] border-white/[0.06] text-white/90 placeholder:text-white/15 
                      focus:border-white/20 focus:ring-0 focus:bg-white/[0.04] rounded-2xl
                      transition-all duration-500 text-sm font-light tracking-widest px-6 w-full outline-none ring-0"
                    required
                  />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/40 to-transparent group-focus-within/input:w-[80%] transition-all duration-1000" />
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-14 mt-4 bg-white text-black hover:bg-neutral-200 font-medium 
                  tracking-[0.25em] uppercase text-[10px] rounded-2xl
                  transition-all duration-700 disabled:opacity-20 shadow-[0_0_30px_-5px_rgba(255,255,255,0.1)] 
                  active:scale-[0.98] active:duration-300"
              >
                {loading ? (
                  <span className="flex items-center gap-3">
                    <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Decrypting
                  </span>
                ) : (
                  'Authorize Access'
                )}
              </Button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-3 opacity-20 hover:opacity-50 transition-all duration-1000 cursor-default group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-px bg-gradient-to-r from-transparent to-white/40 group-hover:w-16 transition-all duration-1000" />
            <p className="text-[8px] tracking-[0.5em] uppercase font-thin">
              Secure Terminal Protocol v2.4
            </p>
            <div className="w-12 h-px bg-gradient-to-l from-transparent to-white/40 group-hover:w-16 transition-all duration-1000" />
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes float-0 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(25px, -40px); } }
        @keyframes float-1 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-30px, 30px); } }
        @keyframes float-2 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, -35px); } }
        @keyframes float-3 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-25px, 45px); } }
        @keyframes float-4 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(35px, -30px); } }
        @keyframes float-5 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-45px, 20px); } }
        @keyframes float-6 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(20px, 35px); } }
        @keyframes float-7 { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(-35px, -25px); } }
      `}} />
    </div>
  )
}
