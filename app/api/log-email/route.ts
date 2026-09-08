import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

declare global {
  var __EMAIL_LOGS__: Set<string> | undefined
}

function getEmailSet(): Set<string> {
  if (!globalThis.__EMAIL_LOGS__) {
    globalThis.__EMAIL_LOGS__ = new Set<string>()

    const localPaths = [
      path.join(process.cwd(), 'emaillogs.txt'),
      path.join(process.cwd(), 'public', 'emaillogs.txt'),
      path.join('/tmp', 'emaillogs.txt'),
    ]

    for (const filePath of localPaths) {
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8')
          content
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .forEach(e => globalThis.__EMAIL_LOGS__!.add(e))
        }
      } catch {
        /* ignore read errors */
      }
    }
  }

  return globalThis.__EMAIL_LOGS__
}

export function logEmailToFile(email: string) {
  if (!email || typeof email !== 'string' || !email.trim()) return false

  const trimmedEmail = email.trim()
  const emailSet = getEmailSet()

  const emailExists = Array.from(emailSet).some(
    e => e.toLowerCase() === trimmedEmail.toLowerCase()
  )

  if (!emailExists) {
    emailSet.add(trimmedEmail)
    const fileContent = Array.from(emailSet).join('\n') + '\n'

    const localPaths = [
      path.join(process.cwd(), 'emaillogs.txt'),
      path.join(process.cwd(), 'public', 'emaillogs.txt'),
      path.join('/tmp', 'emaillogs.txt'),
    ]

    for (const filePath of localPaths) {
      try {
        fs.writeFileSync(filePath, fileContent, 'utf-8')
      } catch {
        /* ignore write errors on read-only serverless filesystem */
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

    const added = logEmailToFile(email)
    return NextResponse.json({ isSuccess: true, added })
  } catch (error) {
    console.error('Log email error:', error)
    return NextResponse.json({ isSuccess: false, message: 'Server error' }, { status: 500 })
  }
}
