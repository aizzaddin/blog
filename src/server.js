const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const db = require('./db');
const posts = require('./posts');
const auth = require('./auth');
const { languages } = require('./languages');
const social = require('./social');
const {
  renderBody, streamBody, excerpt, isBlank, formatDate, parseTags,
} = require('./content');

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Behind a reverse proxy or load balancer (e.g. TRUST_PROXY=1), so req.ip is the visitor's address.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

// For container health checks: is the app up and can it reach the database?
app.get('/healthz', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use(express.static(PUBLIC_DIR));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(express.json());

app.locals.ui = require('./ui');
app.locals.excerpt = excerpt;
app.locals.streamBody = streamBody;
app.locals.formatDate = formatDate;
app.locals.socialLinks = social.socialLinks;
app.locals.initials = (name = '') => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
app.locals.siteName = process.env.SITE_NAME || 'wildanaizzaddin.';

// Versioned URLs for CSS and JS (/style.css?v=…), so browsers fetch the new file after every change
// instead of reusing a cached copy. Versions are cached in production, where files don't change.
const assetVersions = new Map();
app.locals.asset = (file) => {
  let version = assetVersions.get(file);
  if (!version) {
    try {
      version = Math.round(fs.statSync(path.join(PUBLIC_DIR, file)).mtimeMs).toString(36);
    } catch {
      version = '0';
    }
    if (process.env.NODE_ENV === 'production') assetVersions.set(file, version);
  }
  return `/${file}?v=${version}`;
};
// Defaults so error pages render even if the session couldn't be loaded.
app.locals.me = null;
app.locals.siteOwner = null;
app.locals.currentPath = '';


const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use(wrap(auth.loadSession));
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// The writer's name and photo for the header. Cleared when the about page is saved.
let siteOwner;
app.use(wrap(async (req, res, next) => {
  siteOwner ??= await posts.defaultAuthor();
  res.locals.siteOwner = siteOwner || null;
  next();
}));

const requireWriter = auth.requireAuth;

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const now = new Date();
      const dir = path.join(UPLOAD_DIR, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + IMAGE_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
});

app.get('/', wrap(async (req, res) => {
  res.render('home', { title: null, list: await posts.feed() });
}));

app.get('/tag/:slug', wrap(async (req, res) => {
  const tags = await posts.popularTags(100);
  const tag = tags.find((t) => t.slug === req.params.slug);
  if (!tag) return res.status(404).render('not-found', { title: 'Topic not found' });
  res.render('tag', { title: tag.name, tag, list: await posts.feed({ tag: tag.slug, limit: 50 }) });
}));

app.get('/topics', wrap(async (req, res) => {
  res.render('topics', { title: 'Topics', topics: await posts.topics() });
}));

// The about page belongs to the blog's first writer.
app.get('/about', wrap(async (req, res) => {
  const owner = await posts.defaultAuthor();
  if (!owner) return res.status(404).render('not-found', { title: 'Page not found' });
  const recent = await posts.feed({ username: owner.username, limit: 3 });
  res.render('about', { title: 'About', owner, html: renderBody(owner.about_html), recent });
}));

app.get('/about/edit', requireWriter, wrap(async (req, res) => {
  const owner = await posts.defaultAuthor();
  if (owner.id !== req.author.id) return res.status(403).render('not-found', { title: 'Only the blog owner can edit this page' });
  res.render('about-edit', { title: 'Edit about page', owner, error: null, languages, networks: social.networks });
}));

app.post('/about/edit', requireWriter, wrap(async (req, res) => {
  const owner = await posts.defaultAuthor();
  if (owner.id !== req.author.id) return res.status(403).render('not-found', { title: 'Only the blog owner can edit this page' });
  const input = {
    name: String(req.body.name || '').trim().slice(0, 80),
    bio: String(req.body.bio || '').trim().slice(0, 200),
    avatarUrl: cleanImage(req.body.avatar_url),
    aboutHtml: String(req.body.body || ''),
    social: {},
  };
  const badHandles = [];
  for (const network of social.networks) {
    const handle = social.cleanHandle(network, req.body[`social_${network.key}`]);
    if (handle === null) badHandles.push(network.label);
    else if (handle) input.social[network.key] = handle;
  }
  const error = !input.name ? 'Add your name before saving.'
    : badHandles.length ? `Check your ${badHandles.join(' and ')} username. Use the name only, like the part after @.`
    : null;
  if (error) {
    return res.status(422).render('about-edit', {
      title: 'Edit about page', languages, networks: social.networks, error,
      owner: { ...owner, ...input, avatar_url: input.avatarUrl, about_html: input.aboutHtml },
    });
  }
  await posts.updateAbout(owner.id, input);
  siteOwner = null;
  res.redirect('/about');
}));

// Sign in ---------------------------------------------------------------------

app.get('/login', (req, res) => {
  if (req.author) return res.redirect(auth.safeNext(req.query.next));
  res.render('login', { title: 'Sign in', noindex: true, email: '', next: auth.safeNext(req.query.next), error: null });
});

app.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim();
  const next = auth.safeNext(req.body.next);
  const fail = (status, error) => res.status(status).render('login', { title: 'Sign in', noindex: true, email, next, error });

  if (!auth.sameOrigin(req)) return fail(403, 'This sign-in came from another site and was blocked.');
  const wait = auth.loginBlocked(req.ip);
  if (wait) return fail(429, `Too many attempts. Try again in ${wait} minute${wait === 1 ? '' : 's'}.`);

  const authorId = await auth.signIn(email, req.body.password);
  if (!authorId) {
    auth.recordFailure(req.ip);
    return fail(401, 'That email and password don’t match. Check both and try again.');
  }
  auth.clearFailures(req.ip);
  await auth.startSession(res, authorId);
  res.redirect(next);
}));

app.post('/logout', wrap(async (req, res) => {
  if (!auth.sameOrigin(req)) return res.status(403).send('This request came from another site and was blocked.');
  await auth.endSession(req, res);
  res.redirect('/');
}));

app.get('/@:username', wrap(async (req, res) => {
  const author = await posts.author(req.params.username);
  if (!author) return res.status(404).render('not-found', { title: 'Writer not found' });
  const list = await posts.feed({ username: author.username, limit: 50 });
  res.render('author', { title: author.name, author, list });
}));

app.get('/p/:slug', wrap(async (req, res) => {
  const post = await posts.bySlug(req.params.slug);
  if (!post || post.status !== 'published') {
    return res.status(404).render('not-found', { title: 'Story not found' });
  }
  const [replies, more] = await Promise.all([
    posts.responses(post.id),
    posts.feed({ username: post.username, limit: 4 }),
  ]);
  res.render('post', {
    title: post.title,
    description: excerpt(post),
    post,
    html: renderBody(post.body_html),
    replies,
    more: more.filter((p) => p.id !== post.id).slice(0, 3),
  });
}));

app.post('/p/:slug/clap', wrap(async (req, res) => {
  const count = Math.min(Math.max(parseInt(req.body.count, 10) || 1, 1), 50);
  const result = await posts.clap(req.params.slug, count);
  if (!result) return res.status(404).json({ error: 'Story not found.' });
  res.json(result);
}));

app.post('/p/:slug/responses', wrap(async (req, res) => {
  const post = await posts.bySlug(req.params.slug);
  if (!post || post.status !== 'published') return res.status(404).render('not-found', { title: 'Story not found' });
  const name = String(req.body.name || '').trim().slice(0, 60);
  const body = String(req.body.body || '').trim().slice(0, 2000);
  if (name && body) await posts.addResponse(post.id, name, body);
  res.redirect(`/p/${post.slug}#responses`);
}));

app.post('/uploads', requireWriter, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Images can be up to 8 MB.' });
    if (err) return res.status(400).json({ error: 'The image couldn’t be uploaded. Try again.' });
    if (!req.file) return res.status(415).json({ error: 'Use a JPG, PNG, WebP, GIF or AVIF image.' });
    res.json({ url: '/' + path.relative(PUBLIC_DIR, req.file.path).split(path.sep).join('/') });
  });
});

app.get('/drafts', requireWriter, wrap(async (req, res) => {
  res.render('drafts', { title: 'Drafts', list: await posts.drafts(req.author.id) });
}));

const renderEditor = (res, { post, title, error = null, status = 200 }) =>
  res.status(status).render('write', { title, post, error, languages });

app.get('/write', requireWriter, (req, res) => renderEditor(res, { post: null, title: 'Write' }));

// Writers can only open and save their own stories.
async function ownStory(req, res) {
  const post = await posts.byId(parseInt(req.params.id, 10) || 0);
  if (!post || post.author_id !== req.author.id) {
    res.status(404).render('not-found', { title: 'Story not found' });
    return null;
  }
  return post;
}

app.get('/write/:id', requireWriter, wrap(async (req, res) => {
  const post = await ownStory(req, res);
  if (!post) return;
  renderEditor(res, { post, title: 'Edit story' });
}));

// Only images stored on this blog can be used as a cover or profile photo.
const cleanImage = (url) => (/^\/(uploads|samples)\/[\w/.-]+$/.test(url || '') && !url.includes('..') ? url : null);

app.post(['/write', '/write/:id'], requireWriter, wrap(async (req, res) => {
  const existing = req.params.id ? await ownStory(req, res) : null;
  if (req.params.id && !existing) return;
  const id = existing ? existing.id : null;
  const input = {
    title: String(req.body.title || '').trim(),
    subtitle: String(req.body.subtitle || '').trim(),
    body: String(req.body.body || ''),
    coverUrl: cleanImage(req.body.cover_url),
    tags: parseTags(req.body.tags),
    publish: req.body.action === 'publish',
  };
  if (!input.title || isBlank(input.body)) {
    const draft = {
      ...existing, id, title: input.title, subtitle: input.subtitle, body_html: input.body,
      cover_url: input.coverUrl, tags: input.tags, status: existing?.status || 'draft',
    };
    return renderEditor(res, {
      post: draft, title: id ? 'Edit story' : 'Write', status: 422,
      error: !input.title ? 'Add a title before saving.' : 'Write something in the story before saving.',
    });
  }
  const saved = await posts.save({ ...input, id, authorId: req.author.id });
  res.redirect(saved.status === 'published' ? `/p/${saved.slug}` : '/drafts');
}));

app.use((req, res) => res.status(404).render('not-found', { title: 'Page not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('not-found', { title: 'Something went wrong on the server', error: true });
});

const server = app.listen(PORT, () => console.log(`Blog running at http://localhost:${PORT}`))
  .on('error', (err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    console.error(`Port ${PORT} is already in use, probably by another copy of the blog that is still running.`);
    console.error(`Stop it with: lsof -ti tcp:${PORT} | xargs kill   (or run with PORT=3001)`);
    process.exit(1);
  });

// Containers stop the app with SIGTERM: finish open requests, close the database pool, exit.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(() => db.pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
