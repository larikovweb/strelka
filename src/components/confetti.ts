let canvas: HTMLCanvasElement | null = null
let parts: { x: number; y: number; vx: number; vy: number; r: number; c: string; rot: number; vr: number; life: number }[] = []
let raf = 0

export function burst(x: number, y: number, colors: string[]) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.className = 'confetti'
    document.body.appendChild(canvas)
  }
  canvas.width = innerWidth; canvas.height = innerHeight
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2, v = 5 + Math.random() * 9
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, r: 4 + Math.random() * 5, c: colors[i % colors.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, life: 80 + Math.random() * 50 })
  }
  if (!raf) raf = requestAnimationFrame(tick)
}

function tick() {
  const cx = canvas!.getContext('2d')!
  cx.clearRect(0, 0, canvas!.width, canvas!.height)
  parts = parts.filter((p) => p.life > 0)
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.32; p.vx *= 0.985; p.rot += p.vr; p.life--
    cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.globalAlpha = Math.min(1, p.life / 30); cx.fillStyle = p.c
    cx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); cx.restore()
  }
  raf = parts.length ? requestAnimationFrame(tick) : 0
}
