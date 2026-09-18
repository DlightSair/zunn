
const DOWNLOAD_BASE = "https://github.com/DlightSair/zunn/releases/latest/download/";

(() => {
  document.querySelectorAll("[data-file]").forEach((a) => {
    a.href = (DOWNLOAD_BASE || "downloads/").replace(/\/*$/, "/") + a.dataset.file;
  });

  const canvas = document.getElementById('stars');
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const layers = [
    { count: 90, speed: 0.08, size: 0.8, alpha: 0.35 },
    { count: 50, speed: 0.2, size: 1.2, alpha: 0.55 },
    { count: 24, speed: 0.45, size: 1.8, alpha: 0.85 },
  ];
  let w = 0, h = 0, current = scrollY, target = scrollY, stars = [];

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = layers.map((l) => Array.from({ length: l.count }, () => ({
      x: Math.random() * w, y: Math.random() * h, p: Math.random() * Math.PI * 2,
    })));
  }

  function draw(t) {
    current += (target - current) * 0.1;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    layers.forEach((l, i) => {
      for (const s of stars[i]) {
        const y = (((s.y - current * l.speed) % h) + h) % h;
        ctx.globalAlpha = l.alpha * (still ? 1 : 0.7 + 0.3 * Math.sin(t / 900 + s.p));
        ctx.beginPath();
        ctx.arc(s.x, y, l.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    requestAnimationFrame(draw);
  }

  addEventListener('scroll', () => { target = scrollY; }, { passive: true });
  addEventListener('resize', resize);
  resize();
  requestAnimationFrame(draw);

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  document.querySelectorAll('pre').forEach((pre) => {
    const text = pre.innerText.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n').trim();
    const b = document.createElement('button');
    b.className = 'copy';
    b.textContent = 'copy';
    b.onclick = async () => {
      try { await navigator.clipboard.writeText(text); b.textContent = 'copied'; } catch { b.textContent = 'failed'; }
      setTimeout(() => { b.textContent = 'copy'; }, 1400);
    };
    pre.appendChild(b);
  });

  const thumb = document.getElementById('thumb');
  const track = thumb.parentElement;
  function progress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(scrollY / max, 1) : 0;
    thumb.style.transform = `translateX(${p * (track.clientWidth - thumb.clientWidth)}px)`;
  }
  addEventListener('scroll', progress, { passive: true });
  addEventListener('resize', progress);
  progress();
})();
