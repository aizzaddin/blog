const sanitizeHtml = require('sanitize-html');
const hljs = require('highlight.js/lib/common');
const crypto = require('crypto');
const { languages, languageLabel } = require('./languages');

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Medium-style: title plus a short random suffix so slugs are always unique.
function postSlug(title) {
  return `${slugify(title) || 'story'}-${crypto.randomBytes(3).toString('hex')}`;
}

// What the editor is allowed to store. Anything else is stripped on save.
function sanitizeBody(html) {
  return sanitizeHtml(html || '', {
    allowedTags: [
      'p', 'br', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'a',
      'ul', 'ol', 'li', 'blockquote', 'pre', 'hr', 'img', 'div', 'iframe',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      div: ['data-youtube-video'],
      iframe: ['src', 'width', 'height', 'allowfullscreen', 'allow'],
    },
    allowedClasses: { code: ['language-*'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedIframeHostnames: ['www.youtube-nocookie.com', 'www.youtube.com'],
    transformTags: {
      h1: 'h2',
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }),
    },
    exclusiveFilter: (frame) => (frame.tag === 'div' && !('data-youtube-video' in frame.attribs))
      || (frame.tag === 'iframe' && !frame.attribs.src),
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  });
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Code blocks become "snapshots": a panel with the language name and a copy button.
function renderCodeBlock(_, lang, escaped) {
  const code = decodeEntities(escaped).replace(/\n$/, '');
  const language = lang && languages[lang] && hljs.getLanguage(lang) ? lang : null;
  const highlighted = language ? hljs.highlight(code, { language }).value : escapeHtml(code);
  return `<figure class="code-snap">`
    + `<figcaption class="code-snap-bar"><span>${escapeHtml(languageLabel(language))}</span>`
    + `<button type="button" class="code-copy">Copy</button></figcaption>`
    + `<pre><code class="hljs${language ? ` language-${language}` : ''}">${highlighted}</code></pre></figure>`;
}

function renderBody(html) {
  return sanitizeBody(html)
    .replace(/<pre><code(?: class="language-([\w+#-]+)")?>([\s\S]*?)<\/code><\/pre>/g, renderCodeBlock)
    .replace(/<img /g, '<img loading="lazy" ')
    .replace(/<iframe /g, '<iframe loading="lazy" title="Embedded video" ');
}

// Readable text only: code blocks and markup removed.
function plainText(html) {
  const withoutCode = String(html || '').replace(/<pre[\s\S]*?<\/pre>/g, ' ');
  return decodeEntities(sanitizeHtml(withoutCode.replace(/<\/(p|h2|h3|li|blockquote)>/g, ' $&'), {
    allowedTags: [], allowedAttributes: {},
  })).replace(/\s+/g, ' ').trim();
}

// Reading effort in words: a line of code counts as three.
function wordWeight(html) {
  const words = plainText(html).split(' ').filter(Boolean).length;
  const code = (String(html).match(/<pre[\s\S]*?<\/pre>/g) || []).join('');
  return words + (code ? code.split('\n').length * 3 : 0);
}

function readingMinutes(html) {
  return Math.max(1, Math.round(wordWeight(html) / 200));
}

const VOID_TAGS = new Set(['br', 'hr', 'img']);

// The body's top-level blocks (paragraphs, headings, lists, code, images…) as HTML strings.
function topBlocks(html) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const end = m.index + m[0].length;
    if (!VOID_TAGS.has(m[2].toLowerCase())) depth += m[1] ? -1 : 1;
    if (depth === 0) {
      blocks.push(html.slice(start, end));
      start = end;
    }
  }
  if (html.slice(start).trim()) blocks.push(html.slice(start));
  return blocks;
}

// For the home page: short stories in full, long ones cut after their opening at a block boundary.
function streamBody(post, keep = 140) {
  const html = sanitizeBody(post.body_html);
  if (post.reading_min <= 2) return { html: renderBody(html), cut: false };
  const blocks = topBlocks(html);
  const kept = [];
  let weight = 0;
  for (const block of blocks) {
    if (weight >= keep) break;
    kept.push(block);
    weight += wordWeight(block);
  }
  while (kept.length > 1 && /^\s*<h[23]\b/.test(kept.at(-1))) kept.pop();
  return { html: renderBody(kept.join('')), cut: kept.length < blocks.length };
}

function truncate(text, length) {
  return text.length > length ? text.slice(0, length).replace(/\s+\S*$/, '') + '…' : text;
}

// The opening of the story, for the page description when there's no subtitle.
function preview(post, length = 240) {
  return truncate(plainText(post.body_html), length);
}

function excerpt(post, length = 160) {
  return post.subtitle || preview(post, length);
}

function isBlank(html) {
  return !plainText(html) && !/<(img|iframe|pre)\b/.test(html || '');
}

const dateFmt = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
function formatDate(d) {
  return d ? dateFmt.format(new Date(d)) : '';
}

function parseTags(input) {
  return [...new Set(String(input || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean))]
    .slice(0, 5)
    .map((name) => ({ name, slug: slugify(name) }))
    .filter((t) => t.slug);
}

module.exports = {
  slugify, postSlug, sanitizeBody, renderBody, streamBody, readingMinutes, preview, excerpt,
  isBlank, formatDate, parseTags,
};
