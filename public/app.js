// The bar at the top of a story shows how far the reader has read.
const progress = document.querySelector('.progress span');
const story = document.querySelector('.story .prose');
if (progress && story) {
  const update = () => {
    const rect = story.getBoundingClientRect();
    const total = rect.height - window.innerHeight * 0.6;
    const ratio = Math.min(Math.max(-rect.top / Math.max(total, 1), 0), 1);
    progress.style.transform = `scaleX(${ratio})`;
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  update();
}

// Claps: click repeatedly; sent in one request after a short pause.
const clap = document.querySelector('.clap');
if (clap) {
  const button = clap.querySelector('.clap-button');
  const count = clap.querySelector('.clap-count');
  const burst = clap.querySelector('.clap-burst');
  const key = `clapped:${clap.dataset.slug}`;
  let pending = 0;
  let session = 0;
  let timer;

  try { if (localStorage.getItem(key)) clap.dataset.clapped = ''; } catch {}

  const send = async () => {
    const amount = pending;
    pending = 0;
    try {
      const res = await fetch(`/p/${clap.dataset.slug}/clap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: amount }),
      });
      if (!res.ok) throw new Error(res.statusText);
      count.textContent = (await res.json()).claps;
    } catch {
      count.textContent = Number(count.textContent) - amount;
    }
  };

  button.addEventListener('click', () => {
    if (session >= 50) return;
    session += 1;
    pending += 1;
    count.textContent = Number(count.textContent) + 1;
    clap.dataset.clapped = '';
    burst.textContent = `+${session}`;
    burst.classList.remove('animate-burst');
    void burst.offsetWidth;
    burst.classList.add('animate-burst');
    try { localStorage.setItem(key, '1'); } catch {}
    clearTimeout(timer);
    timer = setTimeout(send, 600);
  });
}

// Editor fields grow with their content.
document.querySelectorAll('textarea.autogrow').forEach((el) => {
  const grow = () => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  el.addEventListener('input', grow);
  grow();
});

// Enter in the title moves to the subtitle instead of adding a line.
document.querySelectorAll('.editor-title, .editor-subtitle').forEach((el) => {
  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = el.classList.contains('editor-title') ? '#subtitle' : '#body';
    document.querySelector(next).focus();
  });
});

// Copy buttons on code snapshots.
document.querySelectorAll('.code-copy').forEach((button) => {
  button.addEventListener('click', async () => {
    const code = button.closest('.code-snap').querySelector('code').innerText;
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select and copy';
    }
    setTimeout(() => { button.textContent = 'Copy'; }, 1600);
  });
});

// Theme button: follows the device until tapped, then switches between light and dark.
// Tapping back to the device's own mode forgets the choice, so the page follows the device again.
const themeToggle = document.querySelector('[data-theme-toggle]');
if (themeToggle) {
  const root = document.documentElement;
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const current = () => root.dataset.theme || (systemDark.matches ? 'dark' : 'light');
  const label = () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    themeToggle.setAttribute('aria-label', `Switch to ${next} mode`);
    themeToggle.title = `Switch to ${next} mode`;
  };

  themeToggle.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    const followSystem = next === (systemDark.matches ? 'dark' : 'light');
    if (followSystem) delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (followSystem) localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {}
    label();
  });
  systemDark.addEventListener('change', label);

  themeToggle.hidden = false;
  label();
}
