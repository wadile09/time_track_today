'use client'

import React from "react"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { login } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

export function LoginForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState(null)



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

      const COMPANY_CODE = '100299';
      const raw = `${username}|${COMPANY_CODE}`;
      const encoded = Buffer.from(raw).toString("base64");

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
      // Store auth data in localStorage
      const sessionData = {
        token: response.data.token,
        employeeCode: response.data.userModel.employeeCode,
        employeeName: response.data.userModel.employeeName,
        email: response.data.userModel.email,
      }

      localStorage.setItem('authSession', JSON.stringify(sessionData))

      toast({
        title: 'Success',
        description: `Welcome back, ${response.data.employeeName}!`,
      })

      // Redirect to time details page

      router.push('/time-details')
    } catch (error) {

      const errorMessage = error instanceof Error ? error.message : 'An error occurred during login'

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      })
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-teal-50 p-4">
      <Card className="w-full max-w-md border-0 shadow-lg">
        <CardHeader className="space-y-2 bg-gradient-to-r from-primary to-accent p-6 text-white">
          <CardTitle className="text-2xl font-bold">Time Tracking</CardTitle>
          <CardDescription className="text-blue-100">
            Employee Attendance System
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700 border border-blue-200">
            <p className="font-semibold mb-2">For Testing:</p>
            <p className="text-xs">Open your browser console (F12) to see detailed login logs</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium text-foreground">
                Username
              </Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                className="border-border bg-background focus:border-primary focus:ring-primary"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="border-border bg-background focus:border-primary focus:ring-primary"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-accent py-2 text-white font-semibold hover:opacity-90"
            >
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
