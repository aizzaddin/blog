# wildanaizzaddin

A personal, minimalist blog with a single writer. The home page is a stream: short stories appear in full, long ones show their opening with a link to the rest. Stories are written in a rich text editor with images, YouTube videos and syntax-highlighted code blocks.

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

Sign in at `/login`. The writing pages (`/write`, `/drafts`, `/pages`, `/about/edit`) show "Page not found" to anyone who isn't signed in.

Standalone pages such as `/now` or `/uses` are made under **Pages** → **New page**. Each lives at its own address and can be shown in the header menu. The Pages list sets the menu's order, Topics and About included, with its up and down buttons.

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
| `SITE_NAME` | no | Name in the header, default `wildanaizzaddin.`. The home page tab shows the writer's name instead |

## Image guidelines

Uploads accept JPG, PNG, WebP, GIF and AVIF up to 8 MB. SVG isn't accepted.

### Cover images

The cover is shown above the story on the home page, at its own shape and never cropped, up to the text column's width of 680 px. It isn't shown on the story's own page, so put an image in the story too if readers should see it there.

**Recommended: about 1400 px wide, any shape.** Landscape images sit best in the stream. A tall portrait cover pushes the story's opening far down the page.

- **Aim for under 500 KB.** Export as JPG or WebP and compress before uploading.

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
