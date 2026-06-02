import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  addDraft,
  buildArticle,
  compactArticleForOutput,
  getAccessToken,
  readTextArg,
  requireExecute,
  submitPublish,
  uploadPermanentImage,
} from './lib/weixin.js';

cli({
  site: 'publisher-weixin',
  name: 'publish-article',
  access: 'write',
  description: 'Create a WeChat Official Account article draft and optionally submit it',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [
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
    { name: 'publish', type: 'bool', default: false, help: 'Submit the created draft for publication' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually create draft and optionally publish' },
  ],
  columns: ['status', 'draft_media_id', 'publish_id', 'title', 'detail'],
  func: async (kwargs) => {
    const content = readTextArg(kwargs);
    const shouldPublish = kwargs.publish === true;
    if (!requireExecute(kwargs)) {
      const thumbMediaId = String(kwargs['thumb-media-id'] || '');
      const dryArticle = buildArticle(kwargs, content, thumbMediaId || 'dry_run_thumb_media_id');
      return [{
        status: shouldPublish ? 'dry_run_draft_and_publish' : 'dry_run_draft',
        draft_media_id: '',
        publish_id: '',
        title: dryArticle.title,
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

    if (!shouldPublish) {
      return [{
        status: 'draft_created',
        draft_media_id: draft.mediaId,
        publish_id: '',
        title: article.title,
        detail: JSON.stringify(compactArticleForOutput(article)),
      }];
    }

    const submitted = await submitPublish(draft.mediaId, token.accessToken);
    return [{
      status: 'submitted',
      draft_media_id: draft.mediaId,
      publish_id: submitted.publishId,
      title: article.title,
      detail: JSON.stringify({ ...compactArticleForOutput(article), msg_data_id: submitted.msgDataId }),
    }];
  },
});

