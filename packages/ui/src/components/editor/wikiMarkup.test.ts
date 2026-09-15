import { describe, expect, it } from "vitest";
import {
  editorHtmlToJiraWiki,
  jiraWikiToEditorHtml,
  jiraWikiToDisplayHtml,
  jiraWikiToPlainText,
  safeJiraWikiToEditorHtml,
  sanitizeJiraRenderedHtml,
} from "./wikiMarkup";

describe("Jira wiki markup conversion", () => {
  it("converts common Jira wiki marks to editor HTML", () => {
    expect(jiraWikiToEditorHtml("*Bold* and _italic_ with {{code}}")).toContain(
      "<strong>Bold</strong>",
    );
    expect(jiraWikiToEditorHtml("*Bold* and _italic_ with {{code}}")).toContain(
      "<em>italic</em>",
    );
    expect(jiraWikiToEditorHtml("*Bold* and _italic_ with {{code}}")).toContain(
      "<code>code</code>",
    );
  });

  it("round-trips basic editor HTML back to Jira wiki markup", () => {
    expect(
      editorHtmlToJiraWiki("<p><strong>Bold</strong> and <em>italic</em></p>"),
    ).toBe("*Bold* and _italic_");
    expect(editorHtmlToJiraWiki("<p><s>Strike</s> and <u>Under</u></p>")).toBe(
      "-Strike- and +Under+",
    );
  });

  it("round-trips supported headings, lists, quotes, code blocks, dividers, and tables", () => {
    expect(editorHtmlToJiraWiki("<h2>Plan</h2><ul><li>One</li><li>Two</li></ul>")).toBe(
      "h2. Plan\n\n* One\n* Two",
    );
    expect(editorHtmlToJiraWiki("<ol><li>First</li><li>Second</li></ol>")).toBe(
      "# First\n# Second",
    );
    expect(editorHtmlToJiraWiki("<blockquote><p>Quoted</p></blockquote>")).toBe(
      "bq. Quoted",
    );
    expect(editorHtmlToJiraWiki("<pre><code>const value = 1;</code></pre>")).toBe(
      "{code}\nconst value = 1;\n{code}",
    );
    expect(editorHtmlToJiraWiki("<hr><table><tbody><tr><th>Key</th><td>Value</td></tr></tbody></table>")).toBe(
      "----\n\n||Key|Value|",
    );

    expect(jiraWikiToEditorHtml("h2. Plan\n* One\n* Two")).toContain("<h2>Plan</h2>");
    expect(jiraWikiToEditorHtml("h2. Plan\n* One\n* Two")).toContain("<ul>");
    expect(jiraWikiToEditorHtml("||Key|Value|")).toContain("<table>");
  });

  it("falls back when unsupported Jira macros would be lossy", () => {
    const result = safeJiraWikiToEditorHtml("{panel}Keep raw{panel}");

    expect(result.ok).toBe(false);
    expect(jiraWikiToPlainText("*Bold* [Tudu|https://tudu.test]")).toBe(
      "Bold Tudu",
    );
  });

  it("renders wiki comments when Jira does not return renderedBody", () => {
    const html = jiraWikiToDisplayHtml(
      "h3. Code review\n\n* One\n* [PR|https://example.com/pr]",
    );

    expect(html).toContain("<h3>Code review</h3>");
    expect(html).toContain("<ul>");
    expect(html).toContain('href="https://example.com/pr"');
  });

  it("prefers rendered Jira HTML when Jira returns it", () => {
    expect(
      jiraWikiToDisplayHtml("h3. Wiki title", "<p>Rendered panel</p>"),
    ).toBe("<p>Rendered panel</p>");
    expect(
      jiraWikiToDisplayHtml("{panel}Keep raw{panel}", "<p>Rendered panel</p>"),
    ).toBe("<p>Rendered panel</p>");
  });

  it("sanitizes rendered Jira HTML before embedding it", () => {
    expect(
      sanitizeJiraRenderedHtml(
        '<p onclick="alert(1)">Safe <script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://jira.example.test/browse/EGS-1">good</a></p>',
      ),
    ).toBe(
      '<p>Safe <a>bad</a><a href="https://jira.example.test/browse/EGS-1" rel="noreferrer" target="_blank">good</a></p>',
    );
  });
});
