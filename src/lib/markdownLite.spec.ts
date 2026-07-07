import { describe, it, expect } from 'vitest';
import { mdToHtml } from './markdownLite';

describe('mdToHtml — the doc subset', () => {
  it('renders ATX headings', () => {
    expect(mdToHtml('# Title')).toBe('<h1>Title</h1>');
    expect(mdToHtml('### Sub')).toBe('<h3>Sub</h3>');
  });

  it('renders inline bold, italic and code', () => {
    expect(mdToHtml('a **bold** and *em* and `code` here')).toBe(
      '<p>a <strong>bold</strong> and <em>em</em> and <code>code</code> here</p>'
    );
  });

  it('escapes HTML so a trusted doc can still be dropped through {@html}', () => {
    expect(mdToHtml('1 < 2 & <b>x</b>')).toBe('<p>1 &lt; 2 &amp; &lt;b&gt;x&lt;/b&gt;</p>');
  });

  it('joins a wrapped list item so bold spanning the wrap still resolves', () => {
    const md = '- **Considered:** every body in\n  the **whole** system';
    expect(mdToHtml(md)).toBe(
      '<ul><li><strong>Considered:</strong> every body in the <strong>whole</strong> system</li></ul>'
    );
  });

  it('keeps separate list items separate', () => {
    expect(mdToHtml('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('renders a pipe table with a header row', () => {
    const md = '| A | B |\n|---|---|\n| **x** | y |';
    expect(mdToHtml(md)).toBe(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><strong>x</strong></td><td>y</td></tr></tbody></table>'
    );
  });

  it('a blank line then a col-0 paragraph ends the list', () => {
    const html = mdToHtml('- item one\n\nAfter the list.');
    expect(html).toBe('<ul><li>item one</li></ul>\n<p>After the list.</p>');
  });

  it('joins soft-wrapped paragraph lines with a space', () => {
    expect(mdToHtml('line one\nline two')).toBe('<p>line one line two</p>');
  });
});
