'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, LogOut, Clock } from 'lucide-react'
import { login, getClockInDetails, getUpcomingEvents, AuthSession, HolidayDetail } from '@/lib/api'
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
      // numbers
      const fontSize = Math.max(size * 0.13, 7)
      ctx.font = `${fontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      const numR = r - 10  // radius for number placement
      for (let i = 1; i <= 12; i++) {
        const a = (i * Math.PI * 2) / 12 - Math.PI / 2
        const nx = cx + numR * Math.cos(a)
        const ny = cy + numR * Math.sin(a)
        ctx.fillText(String(i), nx, ny)
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
      <p style={{ fontWeight: 'bold' }} className="text-[15px] uppercase tracking-[0.2em] text-white/25 mb-2 font-light">{label}</p>
      <p style={{ fontWeight: 'bold' }} className={`text-2xl font-light tracking-wide ${accent || 'text-white/80'}`}>{value}</p>
    </div>
  )
}

/* ─── Progress Ring ─── */
function ProgressRing({ percentage, size = 140 }: { percentage: number; size?: number }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(percentage, 100) / 100) * circ

  const [animatedOffset, setAnimatedOffset] = useState(circ) // start empty
  const [glowing, setGlowing] = useState(false)

  useEffect(() => {
    // Slight delay so the animation is visible on mount
    const t1 = setTimeout(() => setAnimatedOffset(offset), 100)
    const t2 = setTimeout(() => setGlowing(true), 200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [offset])

  const isComplete = percentage >= 100
  const color = isComplete ? 'rgba(52,211,153,0.7)' : 'rgba(239,68,68,0.55)'
  const glowColor = isComplete ? 'rgba(52,211,153,0.35)' : 'rgba(239,68,68,0.25)'

  return (
    <svg width={size} height={size} className="-rotate-90" style={{ overflow: 'visible' }}>
      <defs>
        <filter id="ring-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={stroke}
      />

      {/* Glow layer (blurred duplicate) */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={glowColor}
        strokeWidth={stroke + 4}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={animatedOffset}
        style={{
          transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
          filter: 'blur(4px)',
          opacity: glowing ? 1 : 0,
        }}
      />

      {/* Main progress arc */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={animatedOffset}
        style={{
          transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.5s ease',
        }}
      />

      {/* Spark dot at the tip */}
      {!isComplete && (
        <circle
          cx={size / 2 + r * Math.cos((animatedOffset / circ - 1) * 2 * Math.PI)}
          cy={size / 2 + r * Math.sin((animatedOffset / circ - 1) * 2 * Math.PI)}
          r={stroke / 2 + 1}
          fill={color}
          style={{
            filter: 'blur(1px)',
            opacity: glowing ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}
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
  const [liveWorkMinutes, setLiveWorkMinutes] = useState<number>(0)
  const [liveBreakMinutes, setLiveBreakMinutes] = useState<number>(0)
  const [mounted, setMounted] = useState(false)
  const [showNikalPopup, setShowNikalPopup] = useState(false)
  const nikalShownRef = useRef(false)
  const [showGetReadyPopup, setShowGetReadyPopup] = useState(false)
  const getReadyShownRef = useRef(false)
  const [upcomingHolidays, setUpcomingHolidays] = useState<HolidayDetail[]>([])

  useEffect(() => { setMounted(true) }, [])

  // Silent re-login using stored credentials — returns a fresh AuthSession or null
  const silentReLogin = async (): Promise<AuthSession | null> => {
    const credsStr = localStorage.getItem('authCredentials')
    if (!credsStr) return null
    try {
      const creds = JSON.parse(credsStr)
      const loginResp = await login(creds)
      if (!loginResp.isSuccess) return null
      const freshSession: AuthSession = {
        token: loginResp.data.token,
        employeeCode: loginResp.data.userModel.employeeCode,
        employeeName: `${loginResp.data.userModel.firstName} ${loginResp.data.userModel.lastName}`.trim(),
        email: loginResp.data.userModel.email,
        firstName: loginResp.data.userModel.firstName,
        lastName: loginResp.data.userModel.lastName,
        mobileNumber: loginResp.data.userModel.mobileNumber,
      }
      localStorage.setItem('authSession', JSON.stringify(freshSession))
      return freshSession
    } catch {
      return null
    }
  }

  useEffect(() => {
    const initializeData = async () => {
      let authSession: AuthSession | null = null

      // 1. Try to read stored session
      const sessionStr = localStorage.getItem('authSession')
      if (sessionStr) {
        try { authSession = JSON.parse(sessionStr) } catch { /* fall through */ }
      }

      // 2. If no valid session, try silent re-login before giving up
      if (!authSession) {
        authSession = await silentReLogin()
        if (!authSession) { router.push('/'); return }
      }

      try {
        setSession(authSession)

        const today = new Date()
        const clockDate = today.toISOString().split('T')[0]

        let response = await getClockInDetails(authSession.token, authSession.employeeCode, clockDate)

        // 3. If the stored token has expired, silently refresh it once
        if (!response.isSuccess) {
          const msg = (response.message || '').toLowerCase()
          const isExpired =
            response.statusCode === 401 ||
            msg.includes('unauthorized') ||
            msg.includes('token') ||
            msg.includes('expired') ||
            msg.includes('invalid')

          if (isExpired) {
            const fresh = await silentReLogin()
            if (fresh) {
              authSession = fresh
              setSession(fresh)
              response = await getClockInDetails(fresh.token, fresh.employeeCode, clockDate)
            } else {
              // Credentials are also invalid — must log in manually
              localStorage.removeItem('authSession')
              localStorage.removeItem('authCredentials')
              toast({ title: 'Session Expired', description: 'Please log in again.', variant: 'destructive' })
              router.push('/')
              return
            }
          }
        }

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
        setLiveWorkMinutes(result.totalWorkMinutes)
        setLiveBreakMinutes(result.totalBreakMinutes)

        // Fetch upcoming events (holidays) – non-blocking
        try {
          const eventsRes = await getUpcomingEvents(authSession.token)
          if (eventsRes.isSuccess && eventsRes.data?.holidayDetails) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const filtered = eventsRes.data.holidayDetails.filter((h) => {
              // Parse the day string e.g. "Wed, 04 Mar 2026"
              const holidayDate = new Date(h.day)
              holidayDate.setHours(0, 0, 0, 0)
              const diffDays = Math.round((holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              // Show only 0, 1, or 2 days ahead (not past holidays)
              return diffDays >= 0 && diffDays <= 2
            })
            setUpcomingHolidays(filtered)
          }
        } catch {
          // Silently ignore holiday fetch errors
        }
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
    localStorage.removeItem('authCredentials')
    router.push('/')
  }

  // Live updates for countdown, work time, and breaks
  useEffect(() => {
    if (!calculation?.firstPunchInDate) return

    const updateLiveValues = () => {
      const now = new Date()
      const firstPunch = new Date(calculation.firstPunchInDate)
      const elapsedMinutes = Math.max(0, (now.getTime() - firstPunch.getTime()) / (1000 * 60))

      if (calculation.isCurrentlyIn) {
        setLiveWorkMinutes(elapsedMinutes - calculation.totalBreakMinutes)
        setLiveBreakMinutes(calculation.totalBreakMinutes)
      } else {
        setLiveWorkMinutes(calculation.totalWorkMinutes)
        setLiveBreakMinutes(elapsedMinutes - calculation.totalWorkMinutes)
      }

      // Trigger Get Ready popup once between 90%–95%
      if (!getReadyShownRef.current && calculation.requiredMinutes > 0) {
        const workDone = calculation.isCurrentlyIn
          ? (elapsedMinutes - calculation.totalBreakMinutes)
          : calculation.totalWorkMinutes
        const pct = (workDone / calculation.requiredMinutes) * 100
        if (pct >= 90 && pct <= 95) {
          getReadyShownRef.current = true
          setShowGetReadyPopup(true)
        }
      }

      // Trigger NIKAL popup once when time is complete
      if (!nikalShownRef.current && calculation.requiredMinutes > 0) {
        const workDone = calculation.isCurrentlyIn
          ? (elapsedMinutes - calculation.totalBreakMinutes)
          : calculation.totalWorkMinutes
        if (workDone >= calculation.requiredMinutes) {
          nikalShownRef.current = true
          setShowNikalPopup(true)
        }
      }

      // Countdown logic
      if (calculation.status === 'incomplete') {
        const requiredMs = (calculation.requiredMinutes + calculation.totalBreakMinutes) * 60 * 1000
        const estimatedCompletion = new Date(firstPunch.getTime() + requiredMs)
        const diff = estimatedCompletion.getTime() - now.getTime()

        if (diff <= 0) {
          setTimeRemaining('00:00:00')
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60))
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
          const seconds = Math.floor((diff % (1000 * 60)) / 1000)
          setTimeRemaining(
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
          )
        }
      } else {
        setTimeRemaining('--:--:--')
      }
    }

    updateLiveValues()
    const interval = setInterval(updateLiveValues, 1000)
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

  const progressPercentage = Math.min(100, (liveWorkMinutes / calculation.requiredMinutes) * 100)
  const isComplete = liveWorkMinutes >= calculation.requiredMinutes

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    })

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* ─── Get Ready Popup (90%) ─── */}
      {showGetReadyPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.80)' }}>
          <div className="relative flex flex-col items-center gap-6 text-center p-10 max-w-sm">
            {/* Glow rings */}
            <div className="absolute inset-0 rounded-full bg-amber-500/5 blur-[120px] pointer-events-none" />
            <div className="absolute inset-0 rounded-full bg-amber-500/10 blur-[60px] scale-75 pointer-events-none" />

            {/* Bag icon */}
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full border border-amber-500/20 bg-amber-500/10">
              <svg className="w-12 h-12 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 2v4m6-4v4" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h8" />
              </svg>
            </div>

            {/* Main text */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.5em] text-white/25 font-light">90% Done</p>
              <h2
                className="text-4xl font-black tracking-tight text-transparent bg-clip-text leading-tight"
                style={{ backgroundImage: 'linear-gradient(135deg, #fbbf24, #fde68a, #fff)' }}
              >
                Get Ready and<br />Pack your bag
              </h2>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => setShowGetReadyPopup(false)}
              className="mt-2 px-10 py-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-400/80
                hover:bg-amber-500/20 hover:text-amber-300 transition-all duration-500 text-xs tracking-[0.3em] uppercase font-light"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      {/* ─── NIKAL Popup ─── */}
      {showNikalPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backdropFilter: 'blur(12px)', background: 'rgba(0,0,0,0.85)' }}>
          <div className="relative flex flex-col items-center gap-8 text-center p-10 max-w-sm">
            {/* Glow rings */}
            <div className="absolute inset-0 rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
            <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-[60px] scale-75 pointer-events-none" />

            {/* Tick icon */}
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full border border-emerald-500/20 bg-emerald-500/10">
              <svg className="w-12 h-12 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Main text */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-[0.5em] text-white/25 font-light">Time Complete</p>
              <h1
                className="text-8xl font-black tracking-tighter text-transparent bg-clip-text"
                style={{ backgroundImage: 'linear-gradient(135deg, #34d399, #6ee7b7, #fff)' }}
              >
                A Aavjo!!! Kale Maliye
              </h1>
              <p className="text-white/30 text-sm font-light tracking-wide">
                You&apos;ve served your time. Your freedom awaits.
              </p>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => setShowNikalPopup(false)}
              className="mt-2 px-10 py-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400/80
                hover:bg-emerald-500/20 hover:text-emerald-300 transition-all duration-500 text-xs tracking-[0.3em] uppercase font-light"
            >
              Acknowledged
            </button>
          </div>
        </div>
      )}

      {/* Subtle ambient glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(20, 20, 30, 1) 0%, rgba(0, 0, 0, 1) 60%)',
      }} />

      {/* ─── Header ─── */}
      <header className="relative z-10 border-b border-white/[0.05]">
        <div className="mx-auto max-w-2xl px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {mounted && <MiniAnalogClock size={120} />}
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-white/25">Welcome</p>
              <p style={{ fontWeight: 'bold' }} className="text-lg font-bold text-white/80 font-light">
                {session.firstName && session.lastName
                  ? `${session.firstName} ${session.lastName}`
                  : session.employeeName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              {/* <p className="text-[10px] uppercase tracking-[0.2em] text-white/20 mb-1">Date</p> */}
              <p style={{ fontWeight: 'bold' }} className="text-sm text-white/60 font-light">{formatDate(data.attendanceDate)}</p>
            </div>
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
      <main className="relative z-10 mx-auto max-w-2xl px-5 py-2 space-y-6">
        {/* ─── Shift Info (compact) ─── */}
        {/* <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-3">
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
        </div> */}
        {/* ─── Hero: Completion / Status ─── */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
          <div className="relative p-4 text-center">
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
                  <p className="text-lg font-extralight uppercase tracking-[0.25em] text-white/85 tracking-tight">Completes at</p>
                  <p style={{ fontWeight: 'bold' }} className="text-4xl font-extralight text-white/85 tracking-tight">
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
                  {minutesToHMString(liveWorkMinutes)} worked
                  {liveWorkMinutes > calculation.requiredMinutes && (
                    <span className="text-emerald-400/50"> · +{minutesToHMString(liveWorkMinutes - calculation.requiredMinutes)} overtime</span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Stats Grid ─── */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Started" value={calculation.firstPunchIn || '--:--'} />
          <StatCard label="Worked" value={minutesToHMString(liveWorkMinutes)} accent="text-blue-400/70" />
          <StatCard label="Breaks" value={minutesToHMString(liveBreakMinutes)} accent="text-orange-400/70" />
          <StatCard label="Required" value={calculation.requiredFormatted} />
        </div>

        {/* ─── Upcoming Holidays Banner ─── */}
        {upcomingHolidays.length > 0 && (
          <div className="space-y-2">
            <p className="text-[9px] uppercase tracking-[0.25em] text-white/20">Upcoming Holiday{upcomingHolidays.length > 1 ? 's' : ''}</p>
            {upcomingHolidays.map((h, i) => {
              const holidayDate = new Date(h.day)
              holidayDate.setHours(0, 0, 0, 0)
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const diffDays = Math.round((holidayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : 'In 2 days'
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-500/[0.06] backdrop-blur-sm px-5 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-amber-400/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-white/75 font-light">{h.holidayName}</p>
                      <p className="text-[10px] text-white/30 mt-0.5">{h.day}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium uppercase tracking-widest px-2.5 py-1 rounded-lg ${diffDays === 0
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-amber-500/10 text-amber-500/70'
                    }`}>
                    {label}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Footer spacer */}
        <div className="h-4" />
      </main>
    </div>
  )
}
