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

export function TimeDetails() {
  const router = useRouter()
  const { toast } = useToast()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [calculation, setCalculation] = useState<any>(null)

  useEffect(() => {
    const initializeData = async () => {
      const sessionStr = localStorage.getItem('authSession')
      if (!sessionStr) {
        router.push('/')
        return
      }

      const authSession: AuthSession = JSON.parse(sessionStr)
      setSession(authSession)

      try {
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

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      {/* Luxury skeleton watch background */}
      <div className="absolute inset-0 z-0">
        <div
          className="w-full h-full bg-cover bg-center opacity-30"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1541783245831-57d6fb0926d3?auto=format&fit=crop&q=80')`, // skeleton / transparent luxury watch
            filter: 'brightness(0.7) contrast(1.1) grayscale(0.3)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/80" />
      </div>

      {/* Live clock overlay */}
      <div className="relative z-10 flex flex-col items-center pt-16 pb-8">
        <div className="mb-3 text-2xl font-light tracking-widest opacity-80">Current Time</div>
        <LiveClock />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-16">
        {/* Header */}
        <div className="mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 to-teal-300 bg-clip-text text-transparent">
              Attendance Dashboard
            </h1>
            <p className="mt-2 text-xl text-gray-300">
              {session.employeeName} • {session.email}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}

          >
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        {/* Summary Card */}
        <Card className="mb-10 border-0 bg-black/50 backdrop-blur-xl shadow-2xl border-white/10">
          <CardHeader className="bg-gradient-to-r from-gray-900 to-black border-b border-white/10">
            <CardTitle className="flex items-center gap-3 text-2xl text-green-400">
              <Clock className="h-6 w-6 text-blue-400" />
              {formatDate(data.attendanceDate)}
            </CardTitle>
            <CardDescription className="text-gray-300 mt-2">
              {data.policyName} • Shift: {data.shiftName}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-8 grid gap-8 md:grid-cols-5 text-center">
            <div>
              <p className="text-sm text-gray-400">Punch In</p>
              <p className="text-3xl font-bold mt-1 text-green-400">{calculation.firstPunchIn || '--:--'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Work</p>
              <p className="text-3xl font-bold text-blue-400 mt-1">{calculation.totalWorkFormatted}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Total Break</p>
              <p className="text-3xl font-bold text-orange-500 mt-1">{calculation.totalBreakFormatted}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Required</p>
              <p className="text-3xl font-bold text-teal-300 mt-1">{calculation.requiredFormatted}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Incomplete Status</p>
              {/* <Badge className={`mt-2 text-base px-5 py-2 ${getStatusColor(calculation.status)} border`}>
                
              </Badge> */}
              <p className="text-3xl font-bold text-teal-300 mt-1 text-red-500">{calculation.status === 'complete' ? 'Complete' :
                calculation.status === 'overtime' ? `Overtime ${calculation.differenceFormatted}` :
                  ` ${calculation.differenceFormatted}`}</p>
            </div>
          </CardContent>
        </Card>

        {/* Sessions Card */}
        <Card className="border-0 bg-black/50 backdrop-blur-xl shadow-2xl border-white/10">
          <CardHeader>
            <CardTitle className="text-2xl">Today's Sessions</CardTitle>
            <CardDescription className="text-gray-300">
              {calculation.sessions.length} session{calculation.sessions.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {calculation.sessions.length > 0 ? (
              calculation.sessions.map((s: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-lg">Session {i + 1}</p>
                    <p className="text-sm text-gray-400 mt-1">
                      IN: <span className="text-white">{s.inTime}</span> • OUT: <span className="text-white">{s.outTime}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-400">{minutesToHMString(s.durationMinutes)}</p>
                    <p className="text-xs text-gray-500">{Math.round(s.durationMinutes)} min</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-gray-400 bg-white/5 rounded-xl border border-white/10">
                No clock in/out records today
              </div>
            )}

            {calculation.sessions.length > 0 && (
              <div className="mt-8 pt-6 border-t border-white/10 space-y-3 text-lg">
                <div className="flex justify-between font-semibold">
                  <span>Total Work Time</span>
                  <span className="text-blue-400">{calculation.totalWorkFormatted}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Required Time</span>
                  <span>{calculation.requiredFormatted}</span>
                </div>
                <div className={`flex justify-between font-medium ${calculation.differenceMinutes >= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                  <span>Difference</span>
                  <span>{calculation.differenceFormatted}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}