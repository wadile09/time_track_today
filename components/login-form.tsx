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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black">
      {/* Subtle animated gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 30%, rgba(20, 20, 25, 1) 0%, rgba(0, 0, 0, 1) 70%)',
        }}
      />

      {/* Floating particles effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {mounted && [...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: `${2 + i * 0.5}px`,
              height: `${2 + i * 0.5}px`,
              left: `${15 + i * 14}%`,
              top: `${20 + (i % 3) * 25}%`,
              background: 'rgba(255, 255, 255, 0.03)',
              boxShadow: '0 0 20px rgba(255, 255, 255, 0.02)',
              animation: `float-${i} ${8 + i * 2}s infinite ease-in-out`,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-8 p-4 w-full max-w-md">
        {/* Analog Clock */}
        <div className="relative">
          {mounted && <AnalogClock size={240} />}
        </div>

        {/* Digital Time */}
        {mounted && <DigitalTime />}

        {/* Login Card */}
        <div className="w-full backdrop-blur-xl rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 shadow-2xl shadow-black/50">
          {/* Card Header */}
          <div className="text-center mb-8">
            <h1 className="text-xl font-light tracking-[0.15em] text-white/90 uppercase">
              Time Tracker
            </h1>
            <div className="mt-2 mx-auto w-8 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <p className="mt-3 text-[11px] tracking-[0.2em] text-white/25 uppercase">
              Employee Attendance System
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-light">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="h-11 bg-white/[0.04] border-white/[0.06] text-white/90 placeholder:text-white/15 
                  focus:border-white/20 focus:ring-0 focus:bg-white/[0.06] rounded-xl
                  transition-all duration-300 text-sm font-light tracking-wide"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[11px] uppercase tracking-[0.15em] text-white/30 font-light">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-11 bg-white/[0.04] border-white/[0.06] text-white/90 placeholder:text-white/15 
                  focus:border-white/20 focus:ring-0 focus:bg-white/[0.06] rounded-xl
                  transition-all duration-300 text-sm font-light tracking-wide"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 mt-2 bg-white/10 hover:bg-white/[0.15] text-white/80 font-light 
                tracking-[0.15em] uppercase text-xs border border-white/[0.08] rounded-xl
                transition-all duration-300 hover:border-white/[0.15] hover:text-white
                disabled:opacity-30 backdrop-blur-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Authenticating
                </span>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-white/10 tracking-[0.2em] uppercase">
          Secure Connection
        </p>
      </div>

      {/* Floating animation keyframes */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes float-0 { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-30px) scale(1.5); } }
        @keyframes float-1 { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(25px) scale(1.3); } }
        @keyframes float-2 { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-20px) scale(1.4); } }
        @keyframes float-3 { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(35px) scale(1.2); } }
        @keyframes float-4 { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-25px) scale(1.5); } }
        @keyframes float-5 { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(20px) scale(1.3); } }
      `}} />
    </div>
  )
}
