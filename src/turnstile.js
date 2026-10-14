// Cloudflare Turnstile on the response and sign-in forms, to keep bots out.
// Off unless both keys are set, so local development needs neither.
const siteKey = process.env.TURNSTILE_SITE_KEY || '';
const secretKey = process.env.TURNSTILE_SECRET_KEY || '';
const enabled = Boolean(siteKey && secretKey);
// Sites allowed to have issued the token, e.g. "example.com,www.example.com". Empty: the host serving the form.
const hostnames = (process.env.TURNSTILE_HOSTNAMES || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

if (Boolean(siteKey) !== Boolean(secretKey)) {
  console.warn('Turnstile is off: set both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to turn it on.');
}

// True when Cloudflare confirms the token was solved for this form (`action`) on this site (`hostname`).
// If Cloudflare can't be reached, the response is turned away rather than let through,
// and the reader is asked to try again. Tokens work once, so a replayed one fails here too.
async function verify(token, { ip, action, host }) {
  if (!enabled) return true;
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret: secretKey, response: token, remoteip: ip || '' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`siteverify answered ${res.status}`);
    const result = await res.json();
    if (result.success !== true) return false;
    // Cloudflare's test keys report no action and the hostname example.com.
    if (result.metadata?.result_with_testing_key) return true;
    const allowed = hostnames.length ? hostnames : [String(host || '').toLowerCase()];
    return result.action === action && allowed.includes(String(result.hostname || '').toLowerCase());
  } catch (err) {
    console.error(`Turnstile check failed: ${err.message}`);
    return false;
  }
}

module.exports = { enabled, siteKey, verify };
