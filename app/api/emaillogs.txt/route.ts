import fs from 'fs'
import path from 'path'

declare global {
  var __EMAIL_LOGS__: Set<string> | undefined
}

export async function GET() {
  const emailsSet = new Set<string>()

  // 1. Read from global memory store if initialized
  if (globalThis.__EMAIL_LOGS__) {
    globalThis.__EMAIL_LOGS__.forEach(e => emailsSet.add(e))
  }

  // 2. Read from disk files
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
          .forEach(e => emailsSet.add(e))
      }
    } catch {
      /* ignore read errors */
    }
  }

  // Update global memory store
  if (!globalThis.__EMAIL_LOGS__) {
    globalThis.__EMAIL_LOGS__ = emailsSet
  } else {
    emailsSet.forEach(e => globalThis.__EMAIL_LOGS__!.add(e))
  }

  const emailsList = Array.from(emailsSet)
  const textContent = emailsList.length > 0 ? emailsList.join('\n') + '\n' : 'No logged in users yet.\n'

  return new Response(textContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
