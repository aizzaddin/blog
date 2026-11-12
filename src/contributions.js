// The GitHub contribution calendar for the about page.
// Read from the public profile page (no token needed), parsed into weeks of days, and kept in memory
// for a few hours so a busy about page doesn't ask GitHub on every visit. When GitHub can't be
// reached the page simply leaves the calendar out.

const TTL_MS = 6 * 60 * 60 * 1000;
const FAILED_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 5000;
const cache = new Map(); // username -> { at, ttl, value }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Turns the HTML of github.com/users/<name>/contributions into
// { total, weeks: [[{ date, level, count }, ...7], ...], months: [{ index, label }] }.
function parse(html) {
  const counts = new Map();
  for (const m of html.matchAll(/<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = /^\s*([\d,]+)\s+contribution/.exec(m[2]);
    counts.set(m[1], n ? Number(n[1].replace(/,/g, '')) : 0);
  }

  const days = [];
  for (const m of html.matchAll(/<td\b[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})"[^>]*>/g)) {
    const tag = m[0];
    const id = (/\bid="([^"]+)"/.exec(tag) || [])[1];
    const level = Number((/\bdata-level="(\d)"/.exec(tag) || [])[1] || 0);
    days.push({ date: m[1], level, count: counts.get(id) ?? 0 });
  }
  if (!days.length) return null;
  days.sort((a, b) => a.date.localeCompare(b.date));

  // Weeks start on Sunday, as on GitHub. The first week is padded so every column has seven rows.
  const weeks = [];
  let week = new Array(new Date(`${days[0].date}T00:00:00Z`).getUTCDay()).fill(null);
  for (const day of days) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  if (week.length) weeks.push(week.concat(new Array(7 - week.length).fill(null)));

  // A month label above the first week that starts in that month.
  const months = [];
  let last = -1;
  weeks.forEach((w, index) => {
    const first = w.find(Boolean);
    const month = Number(first.date.slice(5, 7)) - 1;
    if (month !== last) {
      months.push({ index, label: MONTHS[month] });
      last = month;
    }
  });
  // Drop a label squeezed against its neighbour at either end.
  if (months.length > 1 && months[1].index - months[0].index < 3) months.shift();
  if (months.length > 1 && weeks.length - months[months.length - 1].index < 3) months.pop();

  const heading = /([\d,]+)\s+contributions?\s+in the last year/.exec(html.replace(/\s+/g, ' '));
  const total = heading ? Number(heading[1].replace(/,/g, '')) : days.reduce((sum, d) => sum + d.count, 0);
  return { total, weeks, months };
}

async function fetchCalendar(username) {
  const res = await fetch(`https://github.com/users/${encodeURIComponent(username)}/contributions`, {
    headers: { 'User-Agent': 'blog-about-page', Accept: 'text/html' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  return parse(await res.text());
}

// The calendar for *username*, or null when there is no username or GitHub can't be read.
async function calendar(username) {
  if (!username) return null;
  const hit = cache.get(username);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
  try {
    const value = await fetchCalendar(username);
    cache.set(username, { at: Date.now(), ttl: value ? TTL_MS : FAILED_TTL_MS, value });
    return value;
  } catch (err) {
    console.warn(`GitHub contributions for ${username}: ${err.message}`);
    // Keep showing the last good calendar rather than dropping it on a hiccup.
    const value = hit ? hit.value : null;
    cache.set(username, { at: Date.now(), ttl: FAILED_TTL_MS, value });
    return value;
  }
}

module.exports = { calendar, parse };
