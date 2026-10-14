// Social accounts shown in the footer. The writer saves a username for each; links are built here,
// so nothing but a known profile address ever reaches the page.
const networks = [
  {
    key: 'instagram',
    label: 'Instagram',
    pattern: /^[A-Za-z0-9._]{1,30}$/,
    url: (name) => `https://www.instagram.com/${name}/`,
    icon: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>',
  },
  {
    key: 'github',
    label: 'GitHub',
    pattern: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/,
    url: (name) => `https://github.com/${name}`,
    icon: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57l-.02-2.04c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.08-.74.09-.73.09-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.01 3.29c0 .32.21.7.82.58A12 12 0 0 0 12 .3"/></svg>',
  },
  {
    key: 'x',
    label: 'X',
    pattern: /^[A-Za-z0-9_]{1,15}$/,
    url: (name) => `https://x.com/${name}`,
    icon: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.47l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41Z"/></svg>',
  },
];

// "@name", "name" or a pasted profile link all become "name". Returns null when it isn't a valid username.
function cleanHandle(network, input) {
  const handle = String(input || '').trim()
    .replace(/^(https?:\/\/)?(www\.)?(instagram\.com|github\.com|x\.com|twitter\.com)\//i, '')
    .replace(/^@/, '')
    .replace(/[/?#].*$/, '');
  if (!handle) return '';
  return network.pattern.test(handle) ? handle : null;
}

// The writer's accounts, in a fixed order, for the footer.
function socialLinks(owner) {
  if (!owner || !owner.social) return [];
  return networks
    .filter((n) => owner.social[n.key])
    .map((n) => ({ label: n.label, href: n.url(owner.social[n.key]), icon: n.icon }));
}

module.exports = { networks, cleanHandle, socialLinks };
