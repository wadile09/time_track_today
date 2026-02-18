'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Clock, LogOut } from 'lucide-react'
import { getClockInDetails, AuthSession } from '@/lib/api'
import { calculateTimeFromSessions, minutesToHMString } from '@/lib/timeCalculation'
import { useToast } from '@/hooks/use-toast'
import { LiveClock } from '@/components/ui/LiveClock' // ← import here
import type { ClockInDetail } from '@/lib/api'
import { parseUTCTime } from '@/lib/timeCalculation'

export function TimeDetails() {
  const router = useRouter()
  const { toast } = useToast()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [calculation, setCalculation] = useState<any>(null)
  const [timeRemaining, setTimeRemaining] = useState<string>('--:--:--')

  useEffect(() => {
    const initializeData = async () => {
      const sessionStr = localStorage.getItem('authSession')
      if (!sessionStr) {
        // Only redirect to login if no session exists
        router.push('/')
        return
      }

      try {
        const authSession: AuthSession = JSON.parse(sessionStr)
        setSession(authSession)

        const today = new Date()
        const clockDate = today.toISOString().split('T')[0]

        const response = await getClockInDetails(
          authSession.token,
          authSession.employeeCode,
          clockDate
        )

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

  // Update countdown every second
  useEffect(() => {
    if (!calculation?.firstPunchIn || !data?.clockInDetails || calculation?.status !== 'incomplete') {
      setTimeRemaining('--:--:--')
      return
    }

    const updateCountdown = () => {
      // Find the first IN timestamp
      const firstInEvent = data.clockInDetails.find((d: ClockInDetail) => d.inOutType === 'IN')
      if (!firstInEvent) {
        setTimeRemaining('--:--:--')
        return
      }

      const firstInDate = parseUTCTime(firstInEvent.clockTime)
      const requiredMs = (calculation.requiredMinutes + calculation.totalBreakMinutes) * 60 * 1000
      const estimatedCompletion = new Date(firstInDate.getTime() + requiredMs)

      // Get current time
      const now = new Date()
      const diff = estimatedCompletion.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeRemaining('00:00:00')
        return
      }

      // Convert to hours, minutes, seconds
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
  }, [calculation, data])

  // Calculate estimated completion time
  const calculateCompletionTime = () => {
    if (!calculation?.firstPunchIn || !data?.clockInDetails) return null

    // Find the first IN timestamp
    const firstInEvent = data.clockInDetails.find((d: ClockInDetail) => d.inOutType === 'IN')
    if (!firstInEvent) return null

    const firstInDate = parseUTCTime(firstInEvent.clockTime)

    // Required time in milliseconds (8h 15m + breaks taken so far)
    const requiredMs = (calculation.requiredMinutes + calculation.totalBreakMinutes) * 60 * 1000

    // Calculate estimated completion time
    const estimatedCompletion = new Date(firstInDate.getTime() + requiredMs)

    return estimatedCompletion.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toUpperCase()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center text-white">
          <Loader2 className="mx-auto mb-6 h-12 w-12 animate-spin text-blue-500" />
          <p className="text-xl">Loading your attendance...</p>
        </div>
      </div>
    )
  }

  if (!session || !data || !calculation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Card className="max-w-md bg-gray-900 text-white border-gray-700">
          <CardHeader>
            <CardTitle>No Data Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400">We couldn't load your attendance records.</p>
            <Button onClick={handleLogout} variant="outline" className="mt-6 w-full">
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-green-900/50 text-green-300 border-green-700'
      case 'overtime': return 'bg-blue-900/50 text-blue-300 border-blue-700'
      case 'incomplete': return 'bg-orange-900/50 text-orange-300 border-orange-700'
      default: return 'bg-gray-800 text-gray-300 border-gray-600'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const progressPercentage = Math.min(100, (calculation.totalWorkMinutes / calculation.requiredMinutes) * 100)
  const isComplete = calculation.status !== 'incomplete'

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center">
            <div>
              {/* <h1 className="text-xl font-semibold text-gray-900">Time Tracker</h1> */}
              <p className="text-sm text-gray-600">{session.employeeName}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="items-center">
                <p className="text-xs text-gray-500 text-center">Current Time</p>
                <LiveClock />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="border-gray-300"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section - Completion Time */}
        {!isComplete ? (
          <Card className="mb-8 border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white overflow-hidden">
            <CardContent className="pt-12 pb-12 text-center relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24"></div>
              <div className="relative z-10">
                <p className="text-sm uppercase tracking-wider text-blue-100 mb-2">Your work will complete at</p>
                <p className="text-6xl md:text-7xl font-light mb-4 tracking-tight">
                  {calculateCompletionTime() || '--:--'}
                </p>
                <p className="text-2xl md:text-3xl font-light text-blue-50 mb-1">
                  {timeRemaining}
                </p>
                <p className="text-sm text-blue-100">
                  remaining
                </p>
                {/* <p className="text-lg text-blue-50">
                  {calculation.differenceFormatted.replace('-', '')} remaining
                </p>
                <div className="mt-6 max-w-md mx-auto">
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all duration-500"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                  <p className="text-sm text-blue-100 mt-2">{Math.round(progressPercentage)}% complete</p>
                </div> */}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-8 border-0 shadow-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
            <CardContent className="pt-12 pb-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-3xl md:text-4xl font-light mb-2">Work Complete!</p>
              <p className="text-lg text-emerald-50">
                You've completed {calculation.totalWorkFormatted}
              </p>
              {calculation.status === 'overtime' && (
                <p className="text-sm text-emerald-100 mt-2">
                  Overtime: +{calculation.differenceFormatted}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Quick Stats */}
        <div className="space-y-6">
          {/* Shift Info */}
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Shift</p>
                  <p className="text-sm font-semibold text-gray-900">{data.shiftName}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{data.policyName}</p>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Date</p>
                <p className="text-sm text-gray-900">{formatDate(data.attendanceDate)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Summary Card */}
          {/* <Card className="border border-gray-200 shadow-sm">
              <CardContent className="pt-6 pb-6">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Summary</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Work</span>
                    <span className="text-sm font-semibold text-gray-900">{calculation.totalWorkFormatted}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Required</span>
                    <span className="text-sm font-semibold text-gray-900">{calculation.requiredFormatted}</span>
                  </div>
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-700">Difference</span>
                      <span className={`text-sm font-semibold ${calculation.differenceMinutes >= 0 ? 'text-emerald-600' : 'text-orange-600'
                        }`}>
                        {calculation.differenceFormatted}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card> */}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 mt-5">
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6 pb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Started</p>
              <p className="text-2xl font-semibold text-gray-900">{calculation.firstPunchIn || '--:--'}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6 pb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Worked</p>
              <p className="text-2xl font-semibold text-blue-600">{calculation.totalWorkFormatted}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6 pb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Breaks</p>
              <p className="text-2xl font-semibold text-orange-600">{calculation.totalBreakFormatted}</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="pt-6 pb-6">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Required</p>
              <p className="text-2xl font-semibold text-gray-900">{calculation.requiredFormatted}</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline - Takes 2 columns */}
          <div className="lg:col-span-2">
            {/* <Card className="border border-gray-200 shadow-sm">
              <CardHeader className="border-b border-gray-100 bg-gray-50/50">
                <CardTitle className="text-base font-semibold text-gray-900">Activity Timeline</CardTitle>
                <CardDescription className="text-sm text-gray-600">
                  {calculation.sessions.length} {calculation.sessions.length === 1 ? 'entry' : 'entries'} today
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6 pb-6">
                {calculation.sessions.length > 0 ? (
                  <div className="space-y-4">
                    {calculation.sessions.map((session: any, i: number) => {
                      const isWalkIn = i % 2 === 0
                      return (
                        <div key={i} className="flex items-start gap-4 group">
                          <div className="flex-shrink-0 mt-1">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isWalkIn ? 'bg-emerald-100' : 'bg-orange-100'
                              }`}>
                              <div className={`w-2 h-2 rounded-full ${isWalkIn ? 'bg-emerald-600' : 'bg-orange-600'
                                }`} />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0  pb-4 border-b border-gray-100 group-last:border-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-sm font-medium text-gray-900">
                                {isWalkIn ? 'Walk In' : 'Walk Out'}
                              </p>
                              <p className="text-sm font-medium text-gray-700">
                                {isWalkIn ? session.inTime : session.outTime}
                              </p>
                            </div>
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-gray-500">
                                Session {Math.floor(i / 2) + 1}
                              </p>
                              <p className="text-xs text-blue-600 font-medium">
                                {minutesToHMString(session.durationMinutes)}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Clock className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-gray-500">No activity recorded today</p>
                  </div>
                )}
              </CardContent>
            </Card> */}
          </div>

          {/* Right Column - Details */}

        </div>
      </main>
    </div>
  )
}
