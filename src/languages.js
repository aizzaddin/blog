// Languages offered in the editor's code block picker. Keys are highlight.js names,
// shared by the editor (lowlight) and the server (highlight.js) so both colour code the same way.
const languages = {
  plaintext: 'Plain text',
  bash: 'Shell',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  kotlin: 'Kotlin',
  markdown: 'Markdown',
  php: 'PHP',
  python: 'Python',
  ruby: 'Ruby',
  rust: 'Rust',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
  xml: 'HTML / XML',
  yaml: 'YAML',
};

const languageLabel = (key) => languages[key] || 'Code';

module.exports = { languages, languageLabel };
