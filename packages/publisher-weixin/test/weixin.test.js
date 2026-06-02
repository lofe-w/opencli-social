import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArticle, parseBool } from '../lib/weixin.js';

test('parseBool accepts common truthy and falsey values', () => {
  assert.equal(parseBool(true), true);
  assert.equal(parseBool('yes'), true);
  assert.equal(parseBool('0'), false);
  assert.equal(parseBool(undefined, true), true);
});

test('buildArticle maps draft fields to WeChat API shape', () => {
  const article = buildArticle({
    title: '标题',
    author: '作者',
    digest: '摘要',
    'source-url': 'https://example.com',
    'show-cover-pic': true,
    'need-open-comment': true,
    'only-fans-can-comment': false,
  }, '<p>content</p>', 'thumb123');

  assert.equal(article.title, '标题');
  assert.equal(article.thumb_media_id, 'thumb123');
  assert.equal(article.show_cover_pic, 1);
  assert.equal(article.need_open_comment, 1);
  assert.equal(article.only_fans_can_comment, 0);
  assert.equal(article.content_source_url, 'https://example.com');
});

