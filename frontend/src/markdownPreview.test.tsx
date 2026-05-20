import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MarkdownPreview } from './markdownPreview';

describe('MarkdownPreview', () => {
  it('renders markdown tables as table elements', () => {
    const markup = renderToStaticMarkup(
      <MarkdownPreview
        content={`| Task | Owner | Status |
| :--- | :---: | ---: |
| API sync | Lin | **Done** |
| Preview | Mei | In progress |`}
        maxBlocks={null}
      />,
    );

    expect(markup).toContain('<table class="markdown-table">');
    expect(markup).toContain('<th style="text-align:left">Task</th>');
    expect(markup).toContain('<th style="text-align:center">Owner</th>');
    expect(markup).toContain('<th style="text-align:right">Status</th>');
    expect(markup).toContain('<strong>Done</strong>');
  });

  it('honors maxBlocks so compact board notes can still truncate previews', () => {
    const markup = renderToStaticMarkup(
      <MarkdownPreview
        content={`# Title

First paragraph

Second paragraph`}
        maxBlocks={2}
      />,
    );

    expect(markup).toContain('First paragraph');
    expect(markup).not.toContain('Second paragraph');
  });

  it('renders safe inline markdown links', () => {
    const markup = renderToStaticMarkup(
      <MarkdownPreview
        content="Open [Planvas](https://example.com/docs) or [email](mailto:test@example.com)."
        maxBlocks={null}
      />,
    );

    expect(markup).toContain(
      '<a class="markdown-link" href="https://example.com/docs" target="_blank" rel="noreferrer">Planvas</a>',
    );
    expect(markup).toContain(
      '<a class="markdown-link" href="mailto:test@example.com" target="_blank" rel="noreferrer">email</a>',
    );
  });
});
