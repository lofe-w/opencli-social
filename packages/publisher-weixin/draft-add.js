import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  addDraft,
  buildArticle,
  compactArticleForOutput,
  getAccessToken,
  readTextArg,
  requireExecute,
  uploadPermanentImage,
} from './lib/weixin.js';

const articleArgs = [
  { name: 'content', positional: true, required: false, help: 'Article HTML content' },
  { name: 'content-file', required: false, help: 'Read article HTML content from file' },
  { name: 'title', required: true, help: 'Article title' },
  { name: 'author', required: false, help: 'Author name' },
  { name: 'digest', required: false, help: 'Article digest/summary' },
  { name: 'source-url', required: false, help: 'Original source URL' },
  { name: 'thumb-media-id', required: false, help: 'Existing permanent image media_id for cover' },
  { name: 'cover-image', required: false, help: 'Local cover image to upload as permanent material first' },
  { name: 'show-cover-pic', type: 'bool', default: false, help: 'Show cover image in article body' },
  { name: 'need-open-comment', type: 'bool', default: false, help: 'Enable comments' },
  { name: 'only-fans-can-comment', type: 'bool', default: false, help: 'Restrict comments to followers' },
  { name: 'pic-crop-235-1', required: false, help: 'Cover crop for 2.35:1 format' },
  { name: 'pic-crop-1-1', required: false, help: 'Cover crop for 1:1 format' },
  { name: 'execute', type: 'bool', default: false, help: 'Actually create the draft' },
];

cli({
  site: 'publisher-weixin',
  name: 'draft-add',
  access: 'write',
  description: 'Create a single-article WeChat Official Account draft',
  strategy: Strategy.LOCAL,
  browser: false,
  args: articleArgs,
  columns: ['status', 'media_id', 'title', 'thumb_media_id', 'detail'],
  func: async (kwargs) => {
    const content = readTextArg(kwargs);
    if (!requireExecute(kwargs)) {
      const thumbMediaId = String(kwargs['thumb-media-id'] || '');
      const dryArticle = buildArticle(kwargs, content, thumbMediaId || 'dry_run_thumb_media_id');
      return [{
        status: 'dry_run',
        media_id: '',
        title: dryArticle.title,
        thumb_media_id: thumbMediaId,
        detail: JSON.stringify(compactArticleForOutput(dryArticle)),
      }];
    }

    const token = await getAccessToken();
    let thumbMediaId = String(kwargs['thumb-media-id'] || '');
    if (!thumbMediaId && kwargs['cover-image']) {
      const uploaded = await uploadPermanentImage(kwargs['cover-image'], token.accessToken);
      thumbMediaId = uploaded.mediaId;
    }
    const article = buildArticle(kwargs, content, thumbMediaId);
    const draft = await addDraft(article, token.accessToken);
    return [{
      status: 'draft_created',
      media_id: draft.mediaId,
      title: article.title,
      thumb_media_id: article.thumb_media_id,
      detail: JSON.stringify(compactArticleForOutput(article)),
    }];
  },
});

