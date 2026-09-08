'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * ParticleBackground
 * -------------------
 * Full-screen ambient particle field that covers the entire site background.
 * Particles are scattered across the viewport with twinkling, orbiting motion.
 * Interactive: particles scatter away from the mouse and spring back.
 */

interface Particle {
  baseX: number
  baseY: number
  x: number
  y: number
  vx: number
  vy: number
  orbitRadius: number
  orbitSpeed: number
  orbitPhase: number
  size: number
  baseAlpha: number
  alpha: number
  twinkleSpeed: number
  twinklePhase: number
  brightness: number // 0 = dim, 1 = medium, 2 = bright star
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animIdRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const dimRef = useRef({ w: 0, h: 0 })
  const mouseRef = useRef({ x: -9999, y: -9999, active: false })
  const [mounted, setMounted] = useState(false)

  // Mouse interaction constants
  const MOUSE_RADIUS = 130
  const REPEL_STRENGTH = 7
  const RETURN_SPEED = 0.035
  const FRICTION = 0.88

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    function buildParticles(w: number, h: number) {
      // ~1 particle per 800px² — dense star field
      const count = Math.min(2000, Math.max(500, Math.floor((w * h) / 800)))
      const particles: Particle[] = []

      for (let i = 0; i < count; i++) {
        const rng = Math.random()
        let brightness = 0
        if (rng > 0.97) brightness = 2      // ~3% bright stars
        else if (rng > 0.84) brightness = 1 // ~13% medium

        particles.push({
          baseX: Math.random() * w,
          baseY: Math.random() * h,
          x: Math.random() * w,
          y: Math.random() * h,
          vx: 0,
          vy: 0,
          orbitRadius: 2 + Math.random() * 15,
          orbitSpeed: (0.08 + Math.random() * 0.35) * (Math.random() > 0.5 ? 1 : -1),
          orbitPhase: Math.random() * Math.PI * 2,
          size:
            brightness === 2
              ? 2.0 + Math.random() * 1.5
              : brightness === 1
                ? 1.2 + Math.random() * 0.8
                : 0.4 + Math.random() * 0.6,
          baseAlpha:
            brightness === 2
              ? 0.80 + Math.random() * 0.20
              : brightness === 1
                ? 0.40 + Math.random() * 0.25
                : 0.08 + Math.random() * 0.14,
          alpha: 0,
          twinkleSpeed: 0.3 + Math.random() * 2.0,
          twinklePhase: Math.random() * Math.PI * 2,
          brightness,
        })
      }

      particlesRef.current = particles
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dimRef.current = { w, h }
      buildParticles(w, h)
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
      mouseRef.current.active = true
    }
    const handleMouseLeave = () => {
      mouseRef.current.active = false
      mouseRef.current.x = -9999
      mouseRef.current.y = -9999
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouseRef.current.x = e.touches[0].clientX
        mouseRef.current.y = e.touches[0].clientY
        mouseRef.current.active = true
      }
    }
    const handleTouchEnd = () => {
      mouseRef.current.active = false
      mouseRef.current.x = -9999
      mouseRef.current.y = -9999
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd)

    const startTime = performance.now()

    const draw = (now: number) => {
      const elapsed = (now - startTime) / 1000
      const { w, h } = dimRef.current
      const particles = particlesRef.current
      const mouse = mouseRef.current

      ctx.clearRect(0, 0, w, h)

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        // Home position = base + orbit
        const angle = p.orbitPhase + elapsed * p.orbitSpeed
        const homeX = p.baseX + Math.cos(angle) * p.orbitRadius
        const homeY = p.baseY + Math.sin(angle) * p.orbitRadius

        // Mouse repulsion
        if (mouse.active) {
          const dx = p.x - mouse.x
          const dy = p.y - mouse.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < MOUSE_RADIUS && dist > 0) {
            const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS
            const mult = force * force * REPEL_STRENGTH
            p.vx += (dx / dist) * mult
            p.vy += (dy / dist) * mult
          }
        }

        // Spring back to home
        p.vx += (homeX - p.x) * RETURN_SPEED
        p.vy += (homeY - p.y) * RETURN_SPEED

        // Friction
        p.vx *= FRICTION
        p.vy *= FRICTION

        // Update position
        p.x += p.vx
        p.y += p.vy

        // Twinkle
        const twinkle = 0.5 + 0.5 * Math.sin(elapsed * p.twinkleSpeed + p.twinklePhase)
        p.alpha = p.baseAlpha * (0.4 + 0.6 * twinkle)

        // Glow halo for bright stars
        if (p.brightness === 2) {
          const glowR = p.size * 7
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR)
          glow.addColorStop(0, `rgba(210, 220, 255, ${p.alpha * 0.4})`)
          glow.addColorStop(0.4, `rgba(190, 205, 255, ${p.alpha * 0.1})`)
          glow.addColorStop(1, 'rgba(190, 205, 255, 0)')
          ctx.beginPath()
          ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        }

        // Core dot
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle =
          p.brightness >= 1
            ? `rgba(230, 235, 255, ${p.alpha})`
            : `rgba(180, 190, 220, ${p.alpha})`
        ctx.fill()
      }

      animIdRef.current = requestAnimationFrame(draw)
    }

    animIdRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      cancelAnimationFrame(animIdRef.current)
    }
  }, [mounted])

  if (!mounted) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
