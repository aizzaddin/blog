// Shared Tailwind class lists for elements used across several templates.
// Tailwind scans this file (see src/styles/app.css), so keep classes as full literal strings.
module.exports = {
  column: 'mx-auto max-w-measure',
  button: 'inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-full border border-ink bg-ink px-[18px] text-sm leading-none font-medium text-paper hover:bg-paper hover:text-ink',
  buttonQuiet: 'inline-flex min-h-[38px] cursor-pointer items-center justify-center rounded-full border border-rule bg-transparent px-[18px] text-sm leading-none font-medium text-ink hover:border-ink',
  tag: 'underline decoration-rule decoration-1 underline-offset-[3px] hover:text-ink hover:decoration-ink',
  input: 'w-full rounded-md border border-rule bg-surface px-3.5 py-3 text-base text-ink placeholder:text-ink-soft/80 focus:border-ink focus:outline-none',
  meta: 'flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-soft',
  pageTitle: 'mt-12 mb-2 text-[2.5rem] leading-[1.1] font-semibold tracking-[-0.03em]',
  storyTitle: 'text-[clamp(2rem,6vw,2.75rem)] leading-[1.08] font-semibold tracking-[-0.03em]',
  empty: 'py-16 text-lg text-ink-soft',
  quiet: 'text-sm text-ink-soft',
};
