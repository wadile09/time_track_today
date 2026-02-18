'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/login-form'

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    // Check if user is already logged in
    const sessionStr = localStorage.getItem('authSession')
    if (sessionStr) {
      try {
        const session = JSON.parse(sessionStr)
        // If we have a valid session with token, redirect to time-details
        if (session.token) {
          router.push('/time-details')
        }
      } catch (error) {
        // Invalid session data, clear it
        localStorage.removeItem('authSession')
      }
    }
  }, [router])

  return <LoginForm />
}
