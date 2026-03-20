import { describe, it, expect } from 'vitest';
import { extractTextBlocks } from '@/lib/translator/extractor';

function createPage(html: string): Document {
  document.body.innerHTML = html;
  return document;
}

describe('extractTextBlocks', () => {
  it('extracts paragraphs from simple page', () => {
    createPage('<p>Hello world</p><p>Second paragraph</p>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe('Hello world');
    expect(blocks[1].text).toBe('Second paragraph');
  });

  it('extracts headings', () => {
    createPage('<h1>Title</h1><p>Content</p>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe('Title');
  });

  it('skips script and style elements', () => {
    createPage('<p>Visible</p><script>alert(1)</script><style>.x{}</style>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Visible');
  });

  it('skips code and pre elements', () => {
    createPage('<p>Text</p><pre>code block</pre><code>inline code</code>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
  });

  it('skips nav, footer, header elements', () => {
    createPage('<nav><p>Nav link</p></nav><p>Content</p><footer><p>Footer</p></footer>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Content');
  });

  it('prioritizes article/main content', () => {
    createPage('<p>Outside</p><article><p>Inside article</p></article>');
    const blocks = extractTextBlocks(document.body);
    // When article exists, only extract from article
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Inside article');
  });

  it('falls back to body when no article/main', () => {
    createPage('<div><p>Paragraph 1</p><p>Paragraph 2</p></div>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(2);
  });

  it('skips already-translated elements', () => {
    createPage('<p>Original</p><p class="mytr-translation">已翻译</p>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
    expect(blocks[0].text).toBe('Original');
  });

  it('skips empty or whitespace-only text', () => {
    createPage('<p>   </p><p>Real text</p>');
    const blocks = extractTextBlocks(document.body);
    expect(blocks.length).toBe(1);
  });

  it('assigns unique IDs to each block', () => {
    createPage('<p>A</p><p>B</p><p>C</p>');
    const blocks = extractTextBlocks(document.body);
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(3);
  });
});
