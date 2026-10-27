const linkPattern = /\[(?:\\.|[^\]])*\]\(([^)\s]+)\)/g;

/** Href targets from inline markdown links. The surrounding text is not rewritten. */
export function markdownHrefs(text: string): string[] {
  const hrefs: string[] = [];
  for (const match of text.matchAll(linkPattern)) {
    if (match[1]) hrefs.push(match[1]);
  }
  return hrefs;
}

export function safeHref(href: string): string | null {
  if (/^#[A-Za-z0-9-]+$/.test(href)) return href;
  if (/^https?:\/\/[^\s"'<>]+$/.test(href)) return href;
  if (/^\/cases\/[a-z0-9-]+\/?(#[A-Za-z0-9-]+)?$/.test(href)) return href;
  return null;
}

/** Visible label for a gist line that came from a markdown paragraph. */
export function stripInlineMarkdown(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*`]/g, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markdown only: code, strong, emphasis, and links. The result is HTML. */
export function inlineMarkdownToHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, href: string) => {
    const safe = safeHref(href);
    if (!safe) return match;
    return `<a href="${safe}">${label}</a>`;
  });
  return html;
}
