export interface TimeSession {
  inTime: string
  outTime: string
  durationMinutes: number
}

export interface TimeCalculationResult {
  sessions: TimeSession[]
  totalWorkMinutes: number
  totalWorkFormatted: string
  totalBreakMinutes: number
  totalBreakFormatted: string
  requiredMinutes: number
  requiredFormatted: string
  differenceMinutes: number
  differenceFormatted: string
  firstPunchIn: string | null
  status: 'complete' | 'incomplete' | 'overtime'
}

export function minutesToHMString(minutes: number): string {
  const hours = Math.floor(Math.abs(minutes) / 60)
  const mins = Math.floor(Math.abs(minutes) % 60)
  const sign = minutes < 0 ? '-' : ''
  return `${sign}${hours}h ${mins.toString().padStart(2, '0')}m`
}

export function parseUTCTime(timeString: string): Date {
  if (!timeString) return new Date()
  // Append Z if missing to treat as UTC
  const utcString = timeString.endsWith('Z') ? timeString : `${timeString}Z`
  return new Date(utcString)
}

export function formatToIST(date: Date): string {
  return date.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).toUpperCase()
}

export function calculateDurationMinutes(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60)
}

/**
 * Clamp a date to 9:30 AM IST if it's before 9:30 AM IST on the same day.
 * Returns a new Date clamped to 9:30 AM IST (04:00 UTC).
 */
function clampTo930AM(date: Date): Date {
  // 9:30 AM IST = 04:00 UTC
  const clamped = new Date(date)
  const utcHours = clamped.getUTCHours()
  const utcMinutes = clamped.getUTCMinutes()

  // 9:30 AM IST = 04:00 AM UTC
  if (utcHours < 4 || (utcHours === 4 && utcMinutes < 0)) {
    clamped.setUTCHours(4, 0, 0, 0)
  }
  return clamped
}

export function calculateTimeFromSessions(
  clockInDetails: Array<{ inOutType: 'IN' | 'OUT'; clockTime: string }>
): TimeCalculationResult & { firstPunchInDate: Date | null } {
  // Required working hours: 8 hours 15 minutes = 495 minutes
  const REQUIRED_MINUTES = 8 * 60 + 15

  // Sort details by time just in case
  const sortedDetails = [...clockInDetails].sort((a, b) =>
    parseUTCTime(a.clockTime).getTime() - parseUTCTime(b.clockTime).getTime()
  )

  // Find first punch in and clamp to 9:30 AM IST if before
  const firstInEvent = sortedDetails.find(d => d.inOutType === 'IN')
  let firstPunchInDate: Date | null = null
  let firstPunchIn: string | null = null

  if (firstInEvent) {
    const rawDate = parseUTCTime(firstInEvent.clockTime)
    firstPunchInDate = clampTo930AM(rawDate)
    firstPunchIn = formatToIST(firstPunchInDate)
  }

  const sessions: TimeSession[] = []
  let totalWorkMinutes = 0
  let totalBreakMinutes = 0

  let i = 0
  while (i < sortedDetails.length) {
    const current = sortedDetails[i]

    // Look for a complete session (IN followed by OUT)
    if (current.inOutType === 'IN') {
      let nextSessionIndex = i + 1

      if (nextSessionIndex < sortedDetails.length && sortedDetails[nextSessionIndex].inOutType === 'OUT') {
        const outEvent = sortedDetails[nextSessionIndex]

        const inDate = parseUTCTime(current.clockTime)
        const outDate = parseUTCTime(outEvent.clockTime)
        const duration = calculateDurationMinutes(inDate, outDate)

        sessions.push({
          inTime: formatToIST(inDate),
          outTime: formatToIST(outDate),
          durationMinutes: Math.max(0, duration)
        })

        totalWorkMinutes += Math.max(0, duration)

        // Check for break (gap until next IN)
        const nextInIndex = nextSessionIndex + 1
        if (nextInIndex < sortedDetails.length && sortedDetails[nextInIndex].inOutType === 'IN') {
          const nextInDate = parseUTCTime(sortedDetails[nextInIndex].clockTime)
          const breakDuration = calculateDurationMinutes(outDate, nextInDate)
          totalBreakMinutes += Math.max(0, breakDuration)
        }

        i = nextSessionIndex + 1
      } else {
        // Orphaned IN (or end of list), skip it
        i++
      }
    } else {
      // Orphaned OUT or out of order, skip
      i++
    }
  }

  // Calculate difference from required
  const differenceMinutes = totalWorkMinutes - REQUIRED_MINUTES

  // Determine status
  let status: 'complete' | 'incomplete' | 'overtime'
  if (totalWorkMinutes >= REQUIRED_MINUTES) {
    status = differenceMinutes > 0 ? 'overtime' : 'complete'
  } else {
    status = 'incomplete'
  }

  return {
    sessions,
    totalWorkMinutes,
    totalWorkFormatted: minutesToHMString(totalWorkMinutes),
    totalBreakMinutes,
    totalBreakFormatted: minutesToHMString(totalBreakMinutes),
    requiredMinutes: REQUIRED_MINUTES,
    requiredFormatted: minutesToHMString(REQUIRED_MINUTES),
    differenceMinutes,
    differenceFormatted: minutesToHMString(differenceMinutes),
    firstPunchIn,
    firstPunchInDate,
    status,
  }
}
