import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export function logEmailToFile(email: string) {
  if (!email || typeof email !== 'string' || !email.trim()) return false

  const trimmedEmail = email.trim()
  const filePath = path.join(process.cwd(), 'emaillogs.txt')

  try {
    let existingLogs = ''
    if (fs.existsSync(filePath)) {
      existingLogs = fs.readFileSync(filePath, 'utf-8')
    }

    const lines = existingLogs
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)

    const emailExists = lines.some(
      line => line.toLowerCase() === trimmedEmail.toLowerCase()
    )

    if (!emailExists) {
      lines.push(trimmedEmail)
      const fileContent = lines.join('\n') + '\n'
      fs.writeFileSync(filePath, fileContent, 'utf-8')
      return true // Newly added
    }

    return false // Already existed
  } catch (err) {
    console.error('Failed to write to emaillogs.txt:', err)
    return false
  }
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (!email) {
      return NextResponse.json({ isSuccess: false, message: 'Email is required' }, { status: 400 })
    }

    const added = logEmailToFile(email)
    return NextResponse.json({ isSuccess: true, added })
  } catch (error) {
    console.error('Log email error:', error)
    return NextResponse.json({ isSuccess: false, message: 'Server error' }, { status: 500 })
  }
}
