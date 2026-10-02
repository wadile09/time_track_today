import { NextResponse } from 'next/server';

// This endpoint returns the VAPID public key so the client can subscribe to push notifications
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BKfFxryu2PKuFLJn8VU2qY3mXdJALbB2jML-6Q4Qqs6PxCVTR1L8O3fO-kEfAmkSHWV29QcwjdJ7u9I52LJgZeo';

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC_KEY });
}
