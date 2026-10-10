// Seeds a writer and a few sample stories (only when the database has no stories yet).
// Samples are written in Markdown here for readability and stored as HTML, like editor output.
const { marked } = require('marked');
const { pool } = require('../src/db');
const posts = require('../src/posts');
const { parseTags } = require('../src/content');

// Starter text for the about page; edit it at /about/edit after signing in.
const ABOUT_HTML = marked.parse(`Hi, I'm Wildan. This is where I write things down so I can think them through.

## What you'll find here

- Notes from building software, usually JavaScript and Postgres, with code you can copy.
- Small experiments with routines, reading and writing.
- Short notes from places I've travelled.

## Get in touch

If something here was useful, or wrong, I'd like to hear about it.`);

const samples = [
  {
    title: 'A debounce helper you can read in one breath',
    subtitle: 'Twelve lines of JavaScript, why each one is there, and a typed version for TypeScript.',
    tags: 'Programming, JavaScript',
    cover: '/samples/code.svg',
    claps: 211,
    days: 0,
    body: `Search boxes, resize handlers, autosave: they all fire far more often than the work behind them needs to run. A debounce waits until the calls stop, then runs once.

Most libraries ship one, but it's small enough to own. Here's the whole thing:

\`\`\`javascript
export function debounce(fn, wait = 250) {
  let timer;

  function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  }

  // Let callers drop a pending call, e.g. when a component unmounts.
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
\`\`\`

## Why each line is there

- \`clearTimeout\` on every call is the whole trick: only the last call in a burst survives.
- \`fn.apply(this, args)\` keeps \`this\` and the arguments of that last call, so it works as a method too.
- \`cancel\` matters more than it looks. Without it, a debounced save can fire after the page that owned it is gone.

Using it for a search box:

\`\`\`javascript
const search = debounce(async (query) => {
  const res = await fetch(\`/api/search?q=\${encodeURIComponent(query)}\`);
  render(await res.json());
}, 300);

input.addEventListener('input', (event) => search(event.target.value));
\`\`\`

## The typed version

In TypeScript, the generic keeps the original function's parameters, so callers still get autocomplete:

\`\`\`typescript
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait = 250,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const debounced = (...args: Args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };

  return Object.assign(debounced, { cancel: () => clearTimeout(timer) });
}
\`\`\`

---

If you need a version that runs on the first call instead of the last, that's a throttle with a leading edge. That's a story for another day.`,
  },
  {
    title: 'Writing every morning, before I touch my phone',
    subtitle: 'Three months of a small habit that changed how I think.',
    tags: 'Writing, Habits',
    cover: '/samples/notebook.svg',
    claps: 128,
    days: 1,
    body: `For years, the first thing I touched every morning was my phone. Notifications, headlines, unread group chats. Before I had a thought of my own, my head was already full of other people's.

Three months ago I tried a simple rule: **write one page first, then pick up the phone.**

## The rule is small on purpose

One page, not an essay. It doesn't have to be good, and nobody has to read it. Some days it's a list of things bothering me. Some days it's a single paragraph about last night's dream.

> Writing isn't the result of thinking. Writing is the thinking.

The surprise wasn't the writing itself, but what came after. Mornings felt longer. Small decisions felt clearer.

## What changed after three months

- I rarely feel rushed in the morning anymore.
- Ideas for work often show up on the pages I didn't plan.
- I've started to notice my own patterns, including the worries that keep coming back.

---

If you want to try it, start tomorrow. Put a notebook by your bed and leave your phone in another room.`,
  },
  {
    title: 'Why I went back to using Postgres for everything',
    subtitle: 'Queues, full-text search, even caching. One database turned out to be enough.',
    tags: 'Programming, Databases',
    cover: '/samples/table.svg',
    claps: 342,
    days: 6,
    body: `Every new project used to start with the same questions: which database for the main data, which for queues, which for search, which for caching. The result was four services to babysit for an app with a few hundred users.

## One boring tool

Postgres is boring, and that's a compliment. It's been around for more than twenty-five years, the documentation is thorough, and almost every problem I hit has already been asked about by someone else.

For a job queue, one table and \`FOR UPDATE SKIP LOCKED\` is enough:

\`\`\`sql
SELECT id, payload FROM jobs
WHERE run_at <= now()
ORDER BY run_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
\`\`\`

For search, \`tsvector\` holds up well until your data reaches millions of rows.

## When to split things up

I'm not saying Postgres is right for everything forever. But split your system when you have a real, measured problem, not because you fear one that hasn't arrived.`,
  },
  {
    title: 'A cup of coffee in Beringharjo Market',
    subtitle: 'A short note from an unplanned morning in Yogyakarta.',
    tags: 'Travel, Coffee',
    cover: '/samples/coffee.svg',
    claps: 57,
    days: 13,
    body: `The train arrived earlier than scheduled, and I couldn't check in until noon. So I walked with no destination, following the smell of spices into the back alleys of Beringharjo Market.

There was a tiny coffee stall with three stools. The owner, who has been selling coffee there since the eighties, brewed a cup of kopi tubruk without asking whether I wanted sugar.

> "What matters with coffee is drinking it slowly. Not how much it costs."

I sat there for almost an hour. I listened to people haggling over batik, watched porters walk past with sacks on their heads, and for the first time in months, didn't feel like I had to do anything.

Maybe that's what I was looking for on this trip all along.`,
  },
  {
    title: 'Reading fewer books, but more deeply',
    subtitle: '',
    tags: 'Reading, Habits',
    cover: '/samples/books.svg',
    claps: 89,
    days: 21,
    body: `Last year my goal was fifty books. I hit it, and I barely remember half of them.

This year the goal is different: **twelve books, each with notes.** After every chapter, I write three sentences about what I understood, in my own words.

## Notes change how you read

Knowing I have to write a summary makes me read slower. I stop when I don't understand something, instead of skipping ahead to keep the count up.

It turns out what makes a book stick isn't how much you read, but how often you come back to think about it.`,
  },
];

(async () => {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM posts');
  if (rows[0].n > 0) {
    console.log('Database already has stories; skipping sample data.');
    return pool.end();
  }

  const { rows: [author] } = await pool.query(
    `INSERT INTO authors (username, name, bio, about_html) VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE SET name = EXCLUDED.name, bio = EXCLUDED.bio, about_html = EXCLUDED.about_html
     RETURNING id`,
    ['aizzaddin', 'Wildan Aizzaddin', 'Writing about software, small habits, and the cities I pass through.', ABOUT_HTML],
  );

  for (const s of samples) {
    const saved = await posts.save({
      authorId: author.id, title: s.title, subtitle: s.subtitle, body: marked.parse(s.body), coverUrl: s.cover,
      tags: parseTags(s.tags), publish: true,
    });
    await pool.query(
      `UPDATE posts SET claps = $2, published_at = now() - make_interval(days => $3) WHERE id = $1`,
      [saved.id, s.claps, s.days],
    );
  }

  await posts.save({
    authorId: author.id, title: 'Notes on working remotely', subtitle: '',
    body: '<p>Still a draft. Points to cover: daily rhythm, written communication, and loneliness.</p>',
    tags: parseTags('Work'), publish: false,
  });

  console.log(`Sample data created: ${samples.length} published stories and 1 draft.`);
  await pool.end();
})().catch((err) => { console.error(err.message); process.exit(1); });
