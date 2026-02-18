'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, LogOut, Clock } from 'lucide-react'
import { getClockInDetails, AuthSession } from '@/lib/api'
import { calculateTimeFromSessions, minutesToHMString } from '@/lib/timeCalculation'
import { useToast } from '@/hooks/use-toast'

/* ─── Mini Analog Clock (header) ─── */
function MiniAnalogClock({ size = 44 }: { size?: number }) {
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

    function draw() {
      if (!ctx) return
      const now = new Date()
      const cx = size / 2, cy = size / 2, r = size / 2 - 3
      ctx.clearRect(0, 0, size, size)

      // face
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke()

      // ticks
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI * 2) / 12 - Math.PI / 2
        ctx.beginPath()
        ctx.moveTo(cx + (r - 4) * Math.cos(a), cy + (r - 4) * Math.sin(a))
        ctx.lineTo(cx + (r - 1) * Math.cos(a), cy + (r - 1) * Math.sin(a))
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke()
      }

      const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds()
      // hour
      const ha = ((h + m / 60) * Math.PI * 2) / 12 - Math.PI / 2
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.45 * Math.cos(ha), cy + r * 0.45 * Math.sin(ha))
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke()
      // minute
      const ma = ((m + s / 60) * Math.PI * 2) / 60 - Math.PI / 2
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.65 * Math.cos(ma), cy + r * 0.65 * Math.sin(ma))
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5; ctx.stroke()
      // second
      const sa = (s * Math.PI * 2) / 60 - Math.PI / 2
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.75 * Math.cos(sa), cy + r * 0.75 * Math.sin(sa))
      ctx.strokeStyle = 'rgba(239,68,68,0.7)'; ctx.lineWidth = 0.8; ctx.stroke()
      // center
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(239,68,68,0.8)'; ctx.fill()
    }

    let id: number
    function tick() { draw(); id = requestAnimationFrame(tick) }
    tick()
    return () => cancelAnimationFrame(id)
  }, [size])

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />
}

/* ─── Live Digital Clock ─── */
function LiveDigitalClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => { const i = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(i) }, [])
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    <span className="font-mono text-sm tracking-widest text-white/60">
      {pad(time.getHours())}
      <span className="animate-pulse text-white/25">:</span>
      {pad(time.getMinutes())}
      <span className="animate-pulse text-white/25">:</span>
      <span className="text-red-400/70">{pad(time.getSeconds())}</span>
    </span>
  )
}

/* ─── Stat Card ─── */
function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-5 transition-all duration-300 hover:bg-white/[0.05] hover:border-white/[0.1]">
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/25 mb-2 font-light">{label}</p>
      <p className={`text-2xl font-light tracking-wide ${accent || 'text-white/80'}`}>{value}</p>
    </div>
  )
}

/* ─── Progress Ring ─── */
function ProgressRing({ percentage, size = 140 }: { percentage: number; size?: number }) {
  const stroke = 4
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(percentage, 100) / 100) * circ

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={percentage >= 100 ? 'rgba(52,211,153,0.6)' : 'rgba(239,68,68,0.5)'}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        className="transition-all duration-1000 ease-out"
      />
    </svg>
  )
}

/* ─── Main Component ─── */
export function TimeDetails() {
  const router = useRouter()
  const { toast } = useToast()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [calculation, setCalculation] = useState<any>(null)
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--:--')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const initializeData = async () => {
      const sessionStr = localStorage.getItem('authSession')
      if (!sessionStr) { router.push('/'); return }

      try {
        const authSession: AuthSession = JSON.parse(sessionStr)
        setSession(authSession)

        const today = new Date()
        const clockDate = today.toISOString().split('T')[0]

        const response = await getClockInDetails(authSession.token, authSession.employeeCode, clockDate)

        if (!response.isSuccess) {
          toast({ title: 'Error', description: response.message, variant: 'destructive' })
          return
        }

        setData({
          clockInDetails: response.data.clockInDetails,
          shiftName: response.data.shiftName,
          attendanceDate: response.data.attendanceDate,
          policyName: response.data.policyName,
        })

        const result = calculateTimeFromSessions(response.data.clockInDetails)
        setCalculation(result)
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'An error occurred',
          variant: 'destructive',
        })
      } finally {
        setLoading(false)
      }
    }
    initializeData()
  }, [router, toast])

  const handleLogout = () => {
    localStorage.removeItem('authSession')
    router.push('/')
  }

  // Countdown timer
  useEffect(() => {
    if (!calculation?.firstPunchInDate || calculation?.status !== 'incomplete') {
      setTimeRemaining('--:--:--')
      return
    }

    const updateCountdown = () => {
      const requiredMs = (calculation.requiredMinutes + calculation.totalBreakMinutes) * 60 * 1000
      const estimatedCompletion = new Date(calculation.firstPunchInDate.getTime() + requiredMs)
      const now = new Date()
      const diff = estimatedCompletion.getTime() - now.getTime()

      if (diff <= 0) { setTimeRemaining('00:00:00'); return }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeRemaining(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      )
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [calculation])

  // Completion time
  const calculateCompletionTime = () => {
    if (!calculation?.firstPunchInDate) return null

    const requiredMs = (calculation.requiredMinutes + calculation.totalBreakMinutes) * 60 * 1000
    const estimatedCompletion = new Date(calculation.firstPunchInDate.getTime() + requiredMs)

    return estimatedCompletion.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toUpperCase()
  }

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-white/30" />
          <p className="text-xs uppercase tracking-[0.2em] text-white/20">Loading attendance</p>
        </div>
      </div>
    )
  }

  /* ─── No Data ─── */
  if (!session || !data || !calculation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center rounded-2xl border border-white/[0.06] bg-white/[0.03] p-10 max-w-sm">
          <Clock className="mx-auto mb-4 h-8 w-8 text-white/20" />
          <p className="text-white/60 text-sm mb-6">No attendance data found</p>
          <Button onClick={handleLogout} className="bg-white/10 hover:bg-white/15 text-white/70 border border-white/[0.08] rounded-xl text-xs tracking-wider uppercase">
            Back to Login
          </Button>
        </div>
      </div>
    )
  }

  const progressPercentage = Math.min(100, (calculation.totalWorkMinutes / calculation.requiredMinutes) * 100)
  const isComplete = calculation.status !== 'incomplete'

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Subtle ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(20, 20, 30, 1) 0%, rgba(0, 0, 0, 1) 60%)',
      }} />

      {/* ─── Header ─── */}
      <header className="relative z-10 border-b border-white/[0.05]">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {mounted && <MiniAnalogClock size={40} />}
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/25">Welcome</p>
              <p className="text-sm text-white/70 font-light">{session.employeeName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {mounted && <LiveDigitalClock />}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
            >
              <LogOut className="h-4 w-4 text-white/30 hover:text-white/50" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Content ─── */}
      <main className="relative z-10 mx-auto max-w-2xl px-5 py-8 space-y-6">
        {/* ─── Shift Info (compact) ─── */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-1">Shift</p>
              <p className="text-sm text-white/60 font-light">{data.shiftName}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-1">Date</p>
              <p className="text-sm text-white/60 font-light">{formatDate(data.attendanceDate)}</p>
            </div>
          </div>
          {data.policyName && (
            <div className="mt-3 pt-3 border-t border-white/[0.04]">
              <p className="text-[10px] text-white/15 tracking-wider">{data.policyName}</p>
            </div>
          )}
        </div>
        {/* ─── Hero: Completion / Status ─── */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
          <div className="relative p-8 text-center">
            {/* Progress ring behind text */}
            <div className="flex justify-center mb-4">
              <div className="relative">
                {mounted && <ProgressRing percentage={progressPercentage} size={160} />}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-3xl font-extralight text-white/90 tracking-tight">
                    {Math.round(progressPercentage)}%
                  </p>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-white/25 mt-1">complete</p>
                </div>
              </div>
            </div>

            {!isComplete ? (
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/20 mb-1">Completes at</p>
                  <p className="text-4xl font-extralight text-white/85 tracking-tight">
                    {calculateCompletionTime() || '--:--'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-white/20 mb-1">Time remaining</p>
                  <p className="text-2xl font-mono font-extralight text-red-400/70 tracking-widest">
                    {timeRemaining}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/10 mb-2">
                  <svg className="w-5 h-5 text-emerald-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-2xl font-extralight text-emerald-400/70">Day Complete</p>
                <p className="text-sm text-white/30 font-light">
                  {calculation.totalWorkFormatted} worked
                  {calculation.status === 'overtime' && (
                    <span className="text-emerald-400/50"> · +{calculation.differenceFormatted} overtime</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Stats Grid ─── */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Started" value={calculation.firstPunchIn || '--:--'} />
          <StatCard label="Worked" value={calculation.totalWorkFormatted} accent="text-blue-400/70" />
          <StatCard label="Breaks" value={calculation.totalBreakFormatted} accent="text-orange-400/70" />
          <StatCard label="Required" value={calculation.requiredFormatted} />
        </div>



        {/* ─── Sessions Timeline ─── */}


        {/* Footer spacer */}
        <div className="h-4" />
      </main>
    </div>
  )
}
