/**
 * Fast, lightweight syntax highlighter for Code Note-Taking mode.
 * Supports Python, TypeScript, JavaScript, C++, Rust, Go, Java, SQL, HTML, CSS.
 * Renders tokens as sanitized HTML spans styled via CSS variables.
 */

export type SupportedLanguage =
  | "python"
  | "typescript"
  | "javascript"
  | "cpp"
  | "rust"
  | "go"
  | "java"
  | "sql"
  | "html"
  | "css";

export const LANGUAGE_OPTIONS: { value: SupportedLanguage; label: string; ext: string }[] = [
  { value: "python", label: "Python", ext: ".py" },
  { value: "typescript", label: "TypeScript", ext: ".ts" },
  { value: "javascript", label: "JavaScript", ext: ".js" },
  { value: "cpp", label: "C++", ext: ".cpp" },
  { value: "rust", label: "Rust", ext: ".rs" },
  { value: "go", label: "Go", ext: ".go" },
  { value: "java", label: "Java", ext: ".java" },
  { value: "sql", label: "SQL", ext: ".sql" },
  { value: "html", label: "HTML", ext: ".html" },
  { value: "css", label: "CSS", ext: ".css" },
];

const KEYWORDS_BY_LANG: Record<SupportedLanguage, RegExp> = {
  python: /\b(def|class|if|elif|else|for|while|try|except|finally|with|as|return|yield|import|from|in|is|and|or|not|lambda|global|nonlocal|pass|break|continue|async|await|raise|True|False|None)\b/g,
  typescript: /\b(function|const|let|var|class|interface|type|enum|if|else|for|while|do|switch|case|default|break|continue|return|try|catch|finally|throw|import|export|from|as|new|this|typeof|instanceof|async|await|extends|implements|public|private|protected|readonly|true|false|null|undefined)\b/g,
  javascript: /\b(function|const|let|var|class|if|else|for|while|do|switch|case|default|break|continue|return|try|catch|finally|throw|import|export|from|as|new|this|typeof|instanceof|async|await|extends|true|false|null|undefined)\b/g,
  cpp: /\b(int|float|double|char|void|bool|auto|struct|class|enum|public|private|protected|template|typename|const|static|inline|virtual|override|namespace|using|if|else|for|while|do|switch|case|default|break|continue|return|try|catch|throw|new|delete|nullptr|true|false|include)\b/g,
  rust: /\b(fn|let|mut|struct|enum|trait|impl|pub|mod|use|as|if|else|match|for|while|loop|break|continue|return|unsafe|async|await|type|self|Self|true|false|Some|None|Ok|Err)\b/g,
  go: /\b(func|package|import|var|const|type|struct|interface|if|else|for|range|switch|case|default|break|continue|return|go|defer|chan|select|map|make|new|nil|true|false)\b/g,
  java: /\b(public|private|protected|class|interface|enum|extends|implements|void|int|double|float|boolean|char|byte|short|long|static|final|abstract|if|else|for|while|do|switch|case|default|break|continue|return|try|catch|finally|throw|throws|new|this|super|import|package|null|true|false)\b/g,
  sql: /\b(SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|CREATE|TABLE|DROP|ALTER|ADD|COLUMN|PRIMARY|KEY|FOREIGN|REFERENCES|AND|OR|NOT|IN|LIKE|IS|NULL|AS|COUNT|SUM|AVG|MAX|MIN|DISTINCT|UNION|ALL|EXISTS|BETWEEN|CASE|WHEN|THEN|ELSE|END)\b/gi,
  html: /\b(html|head|body|div|span|p|a|h1|h2|h3|h4|h5|h6|ul|ol|li|table|tr|td|th|form|input|button|label|textarea|select|option|img|svg|path|canvas|script|style|link|meta)\b/gi,
  css: /\b(display|position|margin|padding|width|height|color|background|font|border|flex|grid|gap|align|justify|transform|transition|animation|overflow|opacity|z-index|box-shadow|radius)\b/g,
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function highlightCodeLine(line: string, lang: SupportedLanguage): string {
  if (!line) return "&nbsp;";

  let escaped = escapeHtml(line);

  // Single line comments
  let commentRegex = /\/\/.*$/;
  if (lang === "python") commentRegex = /#.*$/;
  if (lang === "sql") commentRegex = /--.*$/;

  const commentMatch = escaped.match(commentRegex);
  let comment = "";
  if (commentMatch) {
    comment = `<span class="code-token-comment">${commentMatch[0]}</span>`;
    escaped = escaped.slice(0, commentMatch.index);
  }

  // Strings: double or single quotes
  escaped = escaped.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (m) => `<span class="code-token-string">${m}</span>`);

  // Numbers
  escaped = escaped.replace(/\b\d+(\.\d+)?\b/g, (m) => `<span class="code-token-number">${m}</span>`);

  // Function calls: foo(...)
  escaped = escaped.replace(/\b([a-zA-Z_]\w*)(?=\s*\()/g, (m) => `<span class="code-token-function">${m}</span>`);

  // Keywords
  const kwRegex = KEYWORDS_BY_LANG[lang] || KEYWORDS_BY_LANG.python;
  escaped = escaped.replace(kwRegex, (m) => `<span class="code-token-keyword">${m}</span>`);

  return escaped + comment;
}
