// Run Atmosphere — Canvas-based particle system with phase-based behavior.
// Maps workflow phases to visual atmosphere (colors, motion, particle behavior).

const PHASE_CONFIG = {
  idle: { primary: '#3b82f6', secondary: '#64748b', intensity: 0.12, speed: 0.3, spread: 1.0 },
  research: { primary: '#06b6d4', secondary: '#0891b2', intensity: 0.20, speed: 0.5, spread: 1.2 },
  planning: { primary: '#f59e0b', secondary: '#d97706', intensity: 0.18, speed: 0.4, spread: 1.1 },
  refactor: { primary: '#2563eb', secondary: '#06b6d4', intensity: 0.28, speed: 0.6, spread: 1.3 },
  'gap-analysis': { primary: '#6366f1', secondary: '#8b5cf6', intensity: 0.22, speed: 0.5, spread: 1.1 },
  evaluation: { primary: '#6366f1', secondary: '#8b5cf6', intensity: 0.22, speed: 0.45, spread: 1.0 },
  validation: { primary: '#f59e0b', secondary: '#d97706', intensity: 0.15, speed: 0.35, spread: 0.9 },
  building: { primary: '#10b981', secondary: '#34d399', intensity: 0.30, speed: 0.65, spread: 1.4 },
  hashing: { primary: '#10b981', secondary: '#34d399', intensity: 0.25, speed: 0.4, spread: 1.0 },
  terminal: { primary: '#10b981', secondary: '#34d399', intensity: 0.35, speed: 0.3, spread: 1.0 },
  success: { primary: '#10b981', secondary: '#34d399', intensity: 0.40, speed: 0.5, spread: 1.5 },
  failure: { primary: '#ef4444', secondary: '#f87171', intensity: 0.10, speed: 0.2, spread: 0.7 },
};

const PARTICLE_COUNT = 24;
const REDUCED_MOTION = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

export function createRunAtmosphere(canvas) {
  if (!canvas) return { setPhase: () => {}, destroy: () => {} };

  const ctx = canvas.getContext('2d');
  let currentPhase = 'idle';
  let animationId = null;
  let particles = [];
  let width = canvas.width;
  let height = canvas.height;
  let reducedMotion = REDUCED_MOTION;

  // Initialize particles
  function initParticles() {
    particles = [];
    const count = reducedMotion ? Math.floor(PARTICLE_COUNT / 3) : PARTICLE_COUNT;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // Resize canvas to match display size
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = reducedMotion ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    width = canvas.width;
    height = canvas.height;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
    initParticles();
  }

  // Draw particles
  function draw(config) {
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(
      width * 0.5, height * 0.3, 0,
      width * 0.5, height * 0.3, height * 0.8
    );
    gradient.addColorStop(0, config.primary + '40');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw particles
    particles.forEach(p => {
      p.phase += 0.02 * config.speed;
      p.x += Math.cos(p.phase) * 0.3 * config.speed;
      p.y += Math.sin(p.phase) * 0.3 * config.speed;

      // Wrap around edges
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * config.spread, 0, Math.PI * 2);
      ctx.fillStyle = config.primary + '60';
      ctx.fill();
    });
  }

  // Animation loop
  function animate() {
    const config = PHASE_CONFIG[currentPhase] || PHASE_CONFIG.idle;
    draw(config);
    animationId = requestAnimationFrame(animate);
  }

  // Start animation
  function start() {
    if (animationId) return;
    resize();
    animate();
  }

  // Stop animation
  function stop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  // Set current phase
  function setPhase(phase) {
    currentPhase = phase;
    start();
  }

  // Pulse effect for events
  function pulse(type) {
    // Could add visual pulse overlay here
    console.log('Atmosphere pulse:', type);
  }

  // Destroy
  function destroy() {
    stop();
    particles = [];
  }

  // Initialize
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resize);
    start();
  }

  return { setPhase, pulse, destroy, getCurrentPhase: () => currentPhase };
}
