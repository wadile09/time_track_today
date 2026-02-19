export interface LoginRequest {
  username: string
  password: string
  otp: any
}

export interface LoginResponse {
  isSuccess: boolean
  statusCode: number
  message: string
  data: {
    token: string
    userModel: {
      employeeCode: string
      employeeName: string
      email: string
    }
  }
}

export interface ClockInDetail {
  inOutType: 'IN' | 'OUT'
  clockTime: string
  deviceName: string
  latitude: string
  longitude: string
  officeName: string
  sourceName: string
}

export interface ClockDetailsResponse {
  isSuccess: boolean
  statusCode: number
  message: string
  data: {
    attendanceDate: string
    policyName: string
    shiftName: string
    shiftStartTime: string
    shiftEndTime: string
    clockInDetails: ClockInDetail[]
    originalClockInDetails: ClockInDetail[]
    regularizationType: string | null
    regularizationReason: string | null
  }
}

export interface AuthSession {
  token: string
  employeeCode: string
  employeeName: string
  email: string
}

const API_BASE_URL = 'https://app.mewurk.com/api/v1'

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  try {
    console.log('[v0] Calling login API with credentials:', { username: credentials.username })

    const response = await fetch(
      `${API_BASE_URL}/userservice/account/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      }
    )
    //console.log('[v0] API response status111:', await response.json())
    // console.log('[v0] API response status:', response.status)

    if (!response.ok) {
      const errorData = await response.json()
      console.error('[v0] API error response:', errorData)
      throw new Error(`Login failed with status ${response.status}: ${errorData}`)
    }

    const data = await response.json()
    console.log('[v0] Login response received:', data)
    return data
  } catch (error) {
    console.error('[v0] Login API error:', error)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error - please check your connection and ensure CORS is enabled on the server')
    }
    throw error
  }
}

export async function getClockInDetails(
  token: string,
  employeeCode: string,
  clockDate: string
): Promise<ClockDetailsResponse> {
  try {
    console.log('[v0] Calling clock details API with:', { employeeCode, clockDate })

    const response = await fetch(
      `${API_BASE_URL}/attendanceservice/attendancelogs/clockindetails`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          employeeCode,
          clockDate,
        }),
      }
    )

    console.log('[v0] Clock details response status:', response.status)

    if (!response.ok) {
      const errorData = await response.text()
      console.error('[v0] API error response:', errorData)
      throw new Error(`Failed to fetch clock details with status ${response.status}`)
    }

    const data = await response.json()
    console.log('[v0] Clock details received:', data)
    return data
  } catch (error) {
    console.error('[v0] Clock details API error:', error)
    throw error
  }
}

export interface HolidayDetail {
  day: string
  month: string
  holidayName: string
  isOptional: boolean
  stateName: string[]
  status: string | null
}

export interface UpcomingEventsResponse {
  isSuccess: boolean
  statusCode: number
  message: string
  data: {
    holidayDetails: HolidayDetail[]
    leaveDetails: any[]
  }
}

export async function getUpcomingEvents(token: string): Promise<UpcomingEventsResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/leaveservice/dashboard/upcoming/events`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.text()
      console.error('[v0] Upcoming events API error:', errorData)
      throw new Error(`Failed to fetch upcoming events with status ${response.status}`)
    }

    const data = await response.json()
    console.log('[v0] Upcoming events received:', data)
    return data
  } catch (error) {
    console.error('[v0] Upcoming events API error:', error)
    throw error
  }
}
