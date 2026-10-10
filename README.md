# wildanaizzaddin

A personal, minimalist blog with a single writer. Stories are written in a rich text editor with images, YouTube videos and syntax-highlighted code blocks.

Built with Express, EJS, PostgreSQL, Tailwind CSS and TipTap.

## Run it locally

Requirements: Node.js 24 or newer and a PostgreSQL database.

1. Put the database address in `.env.local`:

   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/blog
   ```

2. Install, create the tables, and set your sign-in details:

   ```
   npm install
   npm run db:migrate
   npm run set-password
   ```

   On an empty database, `set-password` also creates your writer account. `npm run db:seed` adds sample stories if you want something to look at.

3. Start the dev server at http://localhost:3000:

   ```
   npm run dev
   ```

   CSS and the editor script rebuild when you save, and the server restarts on code changes. Reload the browser to see changes.

Sign in at `/login`. The writing pages (`/write`, `/drafts`, `/about/edit`) show "Page not found" to anyone who isn't signed in.

## Deploy with Docker

The image builds the CSS and editor script, runs database migrations on start, and connects to your existing PostgreSQL.

```
docker build -t blog .
docker run -d --name blog -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@your-db-host:5432/blog" \
  -e TRUST_PROXY=1 \
  -v blog-uploads:/app/public/uploads \
  blog
docker exec -it blog npm run set-password
```

Or put `DATABASE_URL` in `.env` and run `docker compose up -d --build`.

- **Mount `/app/public/uploads`.** Uploaded images are stored there. Without a volume they're lost on every redeploy. For a bind mount, the folder must be writable by UID 1000.
- **Serve it over HTTPS.** Sign-in cookies are secure-only in production.
- **`localhost` inside a container is the container itself.** For a database on the same machine, use `host.docker.internal`.
- **`TRUST_PROXY`** is the number of reverse proxies in front of the app. Remove it if there are none.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string (`postgresql://…` or `jdbc:postgresql://…`) |
| `PORT` | no | Port to listen on, default `3000` |
| `NODE_ENV` | no | `production` in the Docker image |
| `TRUST_PROXY` | no | Number of proxies in front of the app |
| `SITE_NAME` | no | Title in the header and browser tabs, default `wildanaizzaddin` |

## Image guidelines

Uploads accept JPG, PNG, WebP, GIF and AVIF up to 8 MB. SVG isn't accepted.

### Cover images

The cover is shown in story lists. Without one, the first image in the story is used. Each spot has a fixed size, and the image is cropped to fill it, keeping the centre. It's never stretched.

| Where | Display size | Shape |
|---|---|---|
| Top story on the home page, desktop | 680 × 320 px | about 2.1 : 1 |
| Top story on the home page, phone | full width × 200 px | about 1.7 : 1 |
| Other stories in lists, desktop | 160 × 107 px | 3 : 2 |
| Other stories in lists, phone | 80 × 80 px | square |

**Recommended: 1600 × 900 px (16:9).** It sits between the wide banner and the square thumbnail, so no spot crops it badly, and it stays sharp on high-resolution screens.

- **Keep the subject in the centre.** The square phone thumbnail keeps only the middle.
- **Avoid text in the image.** Some spots cut it off.
- **Aim for under 500 KB.** Export as JPG or WebP and compress before uploading.

### Square (1:1) covers

Square images work, but they lose their top and bottom in the wide spots:

| Where | Part of a square image that shows |
|---|---|
| Top story banner, desktop | the middle 47% of the height |
| Top story banner, phone | the middle 58% of the height |
| List thumbnail, desktop | the middle 67% of the height |
| List thumbnail, phone | all of it |

Keep the subject in the middle band, and use at least 1400 × 1400 px so the banner stays sharp.

### Images inside a story

Images in a story are shown at their own shape, up to the text column's width of 680 px. Use about 1400 px wide so they stay sharp on high-resolution screens. Paste or drag images straight into the editor, or use the image button in the toolbar.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with CSS/JS rebuilds and server restarts |
| `npm start` | Build CSS and JS, then start the server |
| `npm run build` | Build `public/style.css` and `public/editor.js` |
| `npm run db:migrate` | Create or update the database tables (safe to repeat) |
| `npm run db:seed` | Add a sample writer and stories to an empty database |
| `npm run set-password` | Set the sign-in email and password; creates the writer account on an empty database |
