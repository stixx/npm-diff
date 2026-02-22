/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const { test } = require('node:test');
const assert = require('node:assert');
const { formatMarkdown, getCompareLink } = require('../../src/formatter.ts');

test('getCompareLink returns Compare link for upgrades', () => {
  const link = getCompareLink('pkg', '1.0.0', '1.1.0');
  assert.strictEqual(link, '[Compare](https://npmdiff.dev/pkg/1.0.0/1.1.0/)');
});

test('getCompareLink returns Details link for new packages', () => {
  const link = getCompareLink('pkg', undefined, '1.0.0');
  assert.strictEqual(link, '[Details](https://www.npmjs.com/package/pkg?activeTab=versions)');
});

test('getCompareLink URL-encodes scoped package names', () => {
  const link = getCompareLink('@types/node', '20.0.0', '20.0.1');
  assert.strictEqual(link, '[Compare](https://npmdiff.dev/%40types%2Fnode/20.0.0/20.0.1/)');

  const detailsLink = getCompareLink('@types/node', undefined, '20.0.1');
  assert.strictEqual(
    detailsLink,
    '[Details](https://www.npmjs.com/package/%40types%2Fnode?activeTab=versions)'
  );
});

test('formatMarkdown returns message for no changes', () => {
  const changes = { added: [], removed: [], updated: [] };
  const markdown = formatMarkdown(changes);
  assert.match(markdown, /_No package changes detected_/);
});

test('formatMarkdown formats changes as a table', () => {
  const changes = {
    added: [{ name: 'a', version: '1.0.0' }],
    removed: [{ name: 'r', version: '1.0.0' }],
    updated: [{ name: 'u', oldVersion: '1.0.0', newVersion: '1.1.0' }],
  };
  const markdown = formatMarkdown(changes);
  assert.match(markdown, /Packages \| Operation \| Base \| Target \| Link/);
  assert.match(markdown, /a \| Added \| - \| `1.0.0` \| \[Details\]/);
  assert.match(markdown, /r \| Removed \| `1.0.0` \| - \| \[Details\]/);
  assert.match(markdown, /u \| Upgraded \| `1.0.0` \| `1.1.0` \| \[Compare\]/);
});
