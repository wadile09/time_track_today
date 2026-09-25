import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Force Node.js runtime (not Edge) so we can use fs
export const runtime = 'nodejs';

// Force dynamic — prevents Next.js from caching GET responses
export const dynamic = 'force-dynamic';

// File-based store — shared across ALL workers/processes
const DATA_FILE = path.join(process.cwd(), '.chat-messages.json');

function readMessages(): any[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[chat] Error reading messages:', err);
  }
  return [];
}

function writeMessages(messages: any[]) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (err) {
    console.error('[chat] Error writing messages:', err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const messages = readMessages();

  if (!userId) {
    return NextResponse.json(messages);
  }

  const userMessages = messages.filter(
    (m: any) => m.senderId === userId || m.receiverId === userId || m.receiverId === 'group1'
  );

  return NextResponse.json(userMessages);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const newMessage = {
      id: Date.now().toString() + Math.random().toString(36).substring(7),
      text: body.text,
      senderId: body.senderId,
      receiverId: body.receiverId,
      timestamp: new Date().toISOString(),
      status: 'sent',
    };

    const messages = readMessages();
    messages.push(newMessage);
    writeMessages(messages);

    console.log(`[chat] Message sent: ${body.senderId} → ${body.receiverId}: "${body.text}"`);
    return NextResponse.json(newMessage);
  } catch (error) {
    console.error('[chat] POST error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { messageIds, status } = body;

    const messages = readMessages();
    const updated = messages.map((m: any) => {
      if (messageIds.includes(m.id)) {
        return { ...m, status };
      }
      return m;
    });
    writeMessages(updated);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[chat] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 });
  }
}
