import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const KV_URL = 'https://kvdb.io/time_track_today_logs_7f8a9b/emails'

async function getStoredEmails(): Promise<string[]> {
  const emailsSet = new Set<string>()

  // 1. Try reading from Cloud KV
  try {
    const res = await fetch(KV_URL, { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data)) {
        data.forEach(e => {
          if (typeof e === 'string' && e.trim()) emailsSet.add(e.trim())
        })
      }
    }
  } catch (err) {
    console.error('Failed to fetch from KVDB:', err)
  }

  // 2. Try reading from local files (for local dev)
  const localPaths = [
    path.join(process.cwd(), 'emaillogs.txt'),
    path.join(process.cwd(), 'public', 'emaillogs.txt'),
  ]

  for (const filePath of localPaths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        content
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .forEach(e => emailsSet.add(e))
      }
    } catch {
      /* Ignore local read errors on Vercel read-only filesystem */
    }
  }

  return Array.from(emailsSet)
}

export async function logEmailToFile(email: string) {
  if (!email || typeof email !== 'string' || !email.trim()) return false

  const trimmedEmail = email.trim()
  const existingEmails = await getStoredEmails()

  const emailExists = existingEmails.some(
    e => e.toLowerCase() === trimmedEmail.toLowerCase()
  )

  if (!emailExists) {
    existingEmails.push(trimmedEmail)
    const fileContent = existingEmails.join('\n') + '\n'

    // Save to Cloud KV (works persistently on Vercel serverless)
    try {
      await fetch(KV_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existingEmails),
      })
    } catch (kvErr) {
      console.error('Failed to save to KVDB:', kvErr)
    }

    // Also write to local disk (if writable, e.g. local dev)
    const localPaths = [
      path.join(process.cwd(), 'emaillogs.txt'),
      path.join(process.cwd(), 'public', 'emaillogs.txt'),
    ]
    for (const filePath of localPaths) {
      try {
        fs.writeFileSync(filePath, fileContent, 'utf-8')
      } catch {
        /* Ignore on read-only serverless filesystem */
      }
    }
    return true
  }

  return false
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (!email) {
      return NextResponse.json({ isSuccess: false, message: 'Email is required' }, { status: 400 })
    }

    const added = await logEmailToFile(email)
    return NextResponse.json({ isSuccess: true, added })
  } catch (error) {
    console.error('Log email error:', error)
    return NextResponse.json({ isSuccess: false, message: 'Server error' }, { status: 500 })
  }
}
