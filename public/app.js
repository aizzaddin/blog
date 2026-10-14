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

// Claps: one per reader. Clicking again takes the clap back. The count changes at once and
// settles on the server's total; if the request fails, it goes back to how it was.
const clap = document.querySelector('.clap');
if (clap) {
  const button = clap.querySelector('.clap-button');
  const count = clap.querySelector('.clap-count');
  let busy = false;

  const show = (clapped, total) => {
    button.setAttribute('aria-pressed', String(clapped));
    button.title = clapped ? 'Take back your clap' : 'Clap for this story';
    count.textContent = total;
  };

  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    const was = button.getAttribute('aria-pressed') === 'true';
    const before = Number(count.textContent);
    show(!was, before + (was ? -1 : 1));
    try {
      const res = await fetch(`/p/${clap.dataset.slug}/clap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clapped: !was }),
      });
      if (!res.ok) throw new Error(res.statusText);
      const json = await res.json();
      show(json.clapped, json.claps);
    } catch {
      show(was, before);
    }
    busy = false;
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
    // Pages have no subtitle: go straight to the editor.
    (document.querySelector(next) || document.querySelector('#editor .ProseMirror'))?.focus();
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

// Forms that can't be undone (deleting a page) ask first.
document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!confirm(form.dataset.confirm)) event.preventDefault();
  });
});
