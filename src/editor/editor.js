// Rich text editor for /write and /about/edit. Bundled to public/editor.js by esbuild (npm run build:js).
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { Placeholder } from '@tiptap/extensions';
import { createLowlight } from 'lowlight';
// Keep in sync with src/languages.js (the language picker).
import plaintext from 'highlight.js/lib/languages/plaintext';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const form = document.querySelector('[data-editor-form]');
const surface = document.getElementById('editor');
const field = document.getElementById('body');
const status = document.getElementById('editor-status');
const toolbar = document.querySelector('[role="toolbar"]');
const blockType = document.getElementById('block-type');
const languageWrap = document.getElementById('code-language-wrap');
const languageSelect = document.getElementById('code-language');
const imageFile = document.getElementById('image-file');

const say = (message) => { status.textContent = message; };

async function uploadImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Use a JPG, PNG, WebP, GIF or AVIF image.');
  const data = new FormData();
  data.append('image', file);
  const res = await fetch('/uploads', { method: 'POST', body: data });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'The image couldn’t be uploaded. Try again.');
  return json.url;
}

const altFrom = (file) => file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');

async function insertImages(files, at) {
  for (const file of files) {
    say(`Uploading ${file.name}…`);
    try {
      const src = await uploadImage(file);
      const node = { type: 'image', attrs: { src, alt: altFrom(file) } };
      if (typeof at === 'number') editor.chain().focus().insertContentAt(at, node).run();
      else editor.chain().focus().insertContent(node).run();
      say('Image added.');
    } catch (err) {
      say(err.message);
    }
  }
}

const imagesIn = (list) => Array.from(list || []).filter((f) => f.type.startsWith('image/'));

const editor = new Editor({
  element: surface,
  extensions: [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    Placeholder.configure({ placeholder: surface.dataset.placeholder || 'Start writing…' }),
    Image,
    Youtube.configure({ nocookie: true, width: 640, height: 360 }),
    CodeBlockLowlight.configure({ lowlight: createLowlight({ plaintext, bash, c, cpp, csharp, css, diff, go, java, javascript, json, kotlin, markdown, php, python, ruby, rust, sql, swift, typescript, xml, yaml }), defaultLanguage: 'plaintext' }),
  ],
  content: field.value,
  editorProps: {
    attributes: { class: 'min-h-[50vh] focus:outline-none', 'aria-labelledby': 'body-label', 'aria-multiline': 'true', role: 'textbox' },
    handlePaste(view, event) {
      const files = imagesIn(event.clipboardData?.files);
      if (!files.length) return false;
      insertImages(files);
      return true;
    },
    handleDrop(view, event, slice, moved) {
      const files = imagesIn(event.dataTransfer?.files);
      if (moved || !files.length) return false;
      const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
      insertImages(files, pos?.pos);
      return true;
    },
  },
});

// Toolbar ---------------------------------------------------------------

const commands = {
  bold: () => editor.chain().focus().toggleBold().run(),
  italic: () => editor.chain().focus().toggleItalic().run(),
  underline: () => editor.chain().focus().toggleUnderline().run(),
  code: () => editor.chain().focus().toggleCode().run(),
  bulletList: () => editor.chain().focus().toggleBulletList().run(),
  orderedList: () => editor.chain().focus().toggleOrderedList().run(),
  blockquote: () => editor.chain().focus().toggleBlockquote().run(),
  codeBlock: () => editor.chain().focus().toggleCodeBlock().run(),
  horizontalRule: () => editor.chain().focus().setHorizontalRule().run(),
  undo: () => editor.chain().focus().undo().run(),
  redo: () => editor.chain().focus().redo().run(),
  image: () => imageFile.click(),
  link: () => openPrompt('link'),
  video: () => openPrompt('video'),
};

toolbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-cmd]');
  if (button) commands[button.dataset.cmd]();
});

blockType.addEventListener('change', () => {
  const chain = editor.chain().focus();
  if (blockType.value === 'paragraph') chain.setParagraph().run();
  else chain.setHeading({ level: blockType.value === 'h2' ? 2 : 3 }).run();
});

languageSelect.addEventListener('change', () => {
  editor.chain().focus().updateAttributes('codeBlock', { language: languageSelect.value }).run();
});

imageFile.addEventListener('change', () => {
  insertImages(imagesIn(imageFile.files));
  imageFile.value = '';
});

function refreshToolbar() {
  toolbar.querySelectorAll('[aria-pressed]').forEach((button) => {
    button.setAttribute('aria-pressed', String(editor.isActive(button.dataset.cmd)));
  });
  toolbar.querySelector('[data-cmd="undo"]').disabled = !editor.can().undo();
  toolbar.querySelector('[data-cmd="redo"]').disabled = !editor.can().redo();

  if (editor.isActive('heading', { level: 2 })) blockType.value = 'h2';
  else if (editor.isActive('heading', { level: 3 })) blockType.value = 'h3';
  else blockType.value = 'paragraph';
  blockType.disabled = editor.isActive('codeBlock');

  const inCode = editor.isActive('codeBlock');
  languageWrap.hidden = !inCode;
  if (inCode) languageSelect.value = editor.getAttributes('codeBlock').language || 'plaintext';
}

editor.on('transaction', refreshToolbar);
refreshToolbar();

// Link and video prompt ------------------------------------------------------

const promptBar = document.getElementById('prompt-bar');
const promptInput = document.getElementById('prompt-input');
const promptLabel = document.getElementById('prompt-label');
const promptRemove = document.getElementById('prompt-remove');
let promptMode = null;

function openPrompt(mode) {
  promptMode = mode;
  const isLink = mode === 'link';
  promptLabel.textContent = isLink ? 'Link address' : 'YouTube link';
  promptInput.placeholder = isLink ? 'Paste or type a link' : 'Paste a YouTube link';
  promptInput.value = isLink ? editor.getAttributes('link').href || '' : '';
  promptRemove.hidden = !(isLink && editor.isActive('link'));
  promptBar.hidden = false;
  promptInput.focus();
}

function closePrompt() {
  promptBar.hidden = true;
  promptMode = null;
  editor.commands.focus();
}

function applyPrompt() {
  const value = promptInput.value.trim();
  if (promptMode === 'link') {
    if (!value) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
  } else if (promptMode === 'video') {
    if (!editor.chain().focus().setYoutubeVideo({ src: value }).run()) {
      say('That isn’t a YouTube link. Copy the address of a YouTube video and try again.');
      return;
    }
    say('Video added.');
  }
  closePrompt();
}

document.getElementById('prompt-apply').addEventListener('click', applyPrompt);
document.getElementById('prompt-cancel').addEventListener('click', closePrompt);
promptRemove.addEventListener('click', () => {
  editor.chain().focus().extendMarkRange('link').unsetLink().run();
  closePrompt();
});
promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') { event.preventDefault(); applyPrompt(); }
  if (event.key === 'Escape') closePrompt();
});

// Image fields (story cover, profile photo) ------------------------------------

document.querySelectorAll('[data-image-field]').forEach((wrap) => {
  const part = (role) => wrap.querySelector(`[data-role="${role}"]`);
  const [input, preview, upload, remove, file] = ['input', 'preview', 'upload', 'remove', 'file'].map(part);

  const set = (url) => {
    input.value = url || '';
    preview.src = url || '';
    preview.hidden = !url;
    remove.hidden = !url;
    upload.textContent = url ? 'Replace image' : 'Upload image';
    dirty = true;
  };

  upload.addEventListener('click', () => file.click());
  remove.addEventListener('click', () => set(null));
  file.addEventListener('change', async () => {
    const [chosen] = file.files;
    file.value = '';
    if (!chosen) return;
    say('Uploading image…');
    try {
      set(await uploadImage(chosen));
      say('Image added.');
    } catch (err) {
      say(err.message);
    }
  });
});

// Saving ------------------------------------------------------------------------

let dirty = false;
editor.on('update', () => { dirty = true; });
form.addEventListener('input', () => { dirty = true; });

form.addEventListener('submit', () => {
  field.value = editor.isEmpty ? '' : editor.getHTML();
  dirty = false;
});

addEventListener('beforeunload', (event) => {
  if (dirty) event.preventDefault();
});
