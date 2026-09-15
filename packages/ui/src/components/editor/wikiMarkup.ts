import { plainTextToRichHtml, sanitizeRichTextHtml } from "@tudu/shared";
import { WikiMarkupTransformer } from "@atlaskit/editor-wikimarkup-transformer";

type AtlaskitNode = {
  type: string;
  text?: string;
  attrs?: { level?: number };
  marks?: { type: string; attrs?: { href?: string } }[];
  content?: AtlaskitNode[];
};

const transformer = new WikiMarkupTransformer();

const SUPPORTED_NODES = new Set([
  "doc",
  "paragraph",
  "text",
  "hardBreak",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "rule",
  "table",
  "tableRow",
  "tableHeader",
  "tableCell",
]);
const SUPPORTED_MARKS = new Set(["strong", "em", "code", "link"]);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unsupportedNode(node: AtlaskitNode): boolean {
  if (!SUPPORTED_NODES.has(node.type)) {
    return true;
  }
  if (node.marks?.some((mark) => !SUPPORTED_MARKS.has(mark.type))) {
    return true;
  }
  return node.content?.some(unsupportedNode) ?? false;
}

function inlineHtml(node: AtlaskitNode): string {
  if (node.type === "hardBreak") {
    return "<br>";
  }
  let html = escapeHtml(node.text ?? "");
  for (const mark of node.marks ?? []) {
    if (mark.type === "strong") {
      html = `<strong>${html}</strong>`;
    } else if (mark.type === "em") {
      html = `<em>${html}</em>`;
    } else if (mark.type === "code") {
      html = `<code>${html}</code>`;
    } else if (mark.type === "link" && mark.attrs?.href) {
      html = `<a href="${escapeHtml(mark.attrs.href)}">${html}</a>`;
    }
  }
  return html;
}

function blockHtml(node: AtlaskitNode): string {
  if (node.type === "doc") {
    return (node.content ?? []).map(blockHtml).join("");
  }
  if (node.type === "paragraph") {
    return `<p>${(node.content ?? []).map(inlineHtml).join("")}</p>`;
  }
  if (node.type === "heading") {
    const level = node.attrs?.level === 3 ? 3 : 2;
    return `<h${level}>${(node.content ?? []).map(inlineHtml).join("")}</h${level}>`;
  }
  if (node.type === "bulletList") {
    return `<ul>${(node.content ?? []).map(blockHtml).join("")}</ul>`;
  }
  if (node.type === "orderedList") {
    return `<ol>${(node.content ?? []).map(blockHtml).join("")}</ol>`;
  }
  if (node.type === "listItem") {
    return `<li>${(node.content ?? []).map(blockHtml).join("")}</li>`;
  }
  if (node.type === "blockquote") {
    return `<blockquote>${(node.content ?? []).map(blockHtml).join("")}</blockquote>`;
  }
  if (node.type === "codeBlock") {
    const text = escapeHtml((node.content ?? []).map((child) => child.text ?? "").join("\n"));
    return `<pre><code>${text}</code></pre>`;
  }
  if (node.type === "rule") {
    return "<hr>";
  }
  if (node.type === "table") {
    return `<table><tbody>${(node.content ?? []).map(blockHtml).join("")}</tbody></table>`;
  }
  if (node.type === "tableRow") {
    return `<tr>${(node.content ?? []).map(blockHtml).join("")}</tr>`;
  }
  if (node.type === "tableHeader") {
    return `<th>${(node.content ?? []).map(blockHtml).join("")}</th>`;
  }
  if (node.type === "tableCell") {
    return `<td>${(node.content ?? []).map(blockHtml).join("")}</td>`;
  }
  return "";
}

export function safeJiraWikiToEditorHtml(value: string): {
  ok: boolean;
  html: string;
  raw: string;
} {
  try {
    const parsed = transformer.parse(value).toJSON() as AtlaskitNode;
    if (unsupportedNode(parsed)) {
      return { ok: false, html: "", raw: value };
    }
    return { ok: true, html: blockHtml(parsed), raw: value };
  } catch {
    return { ok: false, html: "", raw: value };
  }
}

export function jiraWikiToEditorHtml(value: string): string {
  const parsed = safeJiraWikiToEditorHtml(value);
  if (!parsed.ok) {
    throw new Error("Unsupported Jira wiki markup");
  }
  return parsed.html;
}

export function editorHtmlToJiraWiki(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const convertInline = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? "";
    }
    if (!(node instanceof HTMLElement)) {
      return "";
    }
    const body = Array.from(node.childNodes).map(convertInline).join("");
    switch (node.tagName.toLowerCase()) {
      case "strong":
      case "b":
        return `*${body}*`;
      case "em":
      case "i":
        return `_${body}_`;
      case "s":
      case "del":
        return `-${body}-`;
      case "u":
        return `+${body}+`;
      case "mark":
        return body;
      case "sub":
      case "sup":
        return body;
      case "code":
        return `{{${body}}}`;
      case "a": {
        const href = node.getAttribute("href");
        return href ? `[${body}|${href}]` : body;
      }
      case "br":
        return "\n";
      default:
        return body;
    }
  };
  const convertBlock = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent?.trim() ?? "";
    }
    if (!(node instanceof HTMLElement)) {
      return "";
    }
    const tagName = node.tagName.toLowerCase();
    const inline = () => Array.from(node.childNodes).map(convertInline).join("").trim();
    const blocks = () =>
      Array.from(node.childNodes)
        .map(convertBlock)
        .filter(Boolean)
        .join("\n\n");
    if (/^h[1-6]$/.test(tagName)) {
      const level = Number(tagName.slice(1));
      return `h${Math.min(Math.max(level, 1), 6)}. ${inline()}`;
    }
    if (tagName === "p") {
      return inline();
    }
    if (tagName === "ul" || tagName === "ol") {
      const marker = tagName === "ul" ? "*" : "#";
      return Array.from(node.children)
        .filter((child) => child.tagName.toLowerCase() === "li")
        .map((child) => `${marker} ${convertInline(child).trim()}`)
        .join("\n");
    }
    if (tagName === "blockquote") {
      return `bq. ${blocks() || inline()}`;
    }
    if (tagName === "pre") {
      return `{code}\n${node.textContent?.trim() ?? ""}\n{code}`;
    }
    if (tagName === "hr") {
      return "----";
    }
    if (tagName === "table") {
      return Array.from(node.querySelectorAll("tr"))
        .map((row) => {
          const cells = Array.from(row.children).filter((child) =>
            ["td", "th"].includes(child.tagName.toLowerCase()),
          );
          const hasHeader = cells.some((cell) => cell.tagName.toLowerCase() === "th");
          const body = cells.map((cell) => convertInline(cell).trim()).join("|");
          return `${hasHeader ? "||" : "|"}${body}|`;
        })
        .join("\n");
    }
    return blocks() || inline();
  };
  return Array.from(doc.body.childNodes)
    .map(convertBlock)
    .join("\n\n")
    .trim();
}

const SAFE_RENDERED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const SAFE_RENDERED_ATTRS = new Set(["href", "title", "colspan", "rowspan"]);
const UNSAFE_RENDERED_CONTAINERS = new Set([
  "embed",
  "iframe",
  "math",
  "object",
  "script",
  "style",
  "svg",
]);

function safeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) {
    return true;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function sanitizeRenderedElement(element: Element): void {
  for (const child of Array.from(element.children)) {
    const tagName = child.tagName.toLowerCase();
    if (!SAFE_RENDERED_TAGS.has(tagName)) {
      if (UNSAFE_RENDERED_CONTAINERS.has(tagName)) {
        child.remove();
      } else {
        child.replaceWith(document.createTextNode(child.textContent ?? ""));
      }
      continue;
    }

    for (const attr of Array.from(child.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || !SAFE_RENDERED_ATTRS.has(name)) {
        child.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" && !safeUrl(attr.value)) {
        child.removeAttribute(attr.name);
      }
    }

    if (tagName === "a" && child.getAttribute("href")) {
      child.setAttribute("rel", "noreferrer");
      child.setAttribute("target", "_blank");
    }

    sanitizeRenderedElement(child);
  }
}

export function sanitizeJiraRenderedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  sanitizeRenderedElement(doc.body);
  return doc.body.innerHTML;
}

export function jiraWikiToDisplayHtml(
  wiki: string,
  renderedHtml?: string | null,
): string {
  if (renderedHtml?.trim()) {
    return sanitizeJiraRenderedHtml(renderedHtml);
  }
  const trimmed = wiki.trim();
  if (!trimmed) {
    return "";
  }
  const parsed = safeJiraWikiToEditorHtml(trimmed);
  if (parsed.ok) {
    return sanitizeRichTextHtml(parsed.html);
  }
  return plainTextToRichHtml(trimmed);
}

export function jiraWikiToPlainText(value: string): string {
  return value
    .replace(/\[([^\]|]+)\|[^\]]+\]/g, "$1")
    .replace(/\{\{([^}]*)\}\}/g, "$1")
    .replace(/[*_+~-]/g, "")
    .replace(/\{[^}]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
