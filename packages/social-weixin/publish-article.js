import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError } from '@jackwener/opencli/errors';
import {
  addDraft,
  buildArticle,
  compactArticleForOutput,
  getAccessToken,
  preflightArticleInput,
  publishStatusRow,
  readContentInput,
  requireExecute,
  rewriteInlineImages,
  submitPublish,
  uploadContentImage,
  uploadPermanentImage,
  waitForPublishCompletion,
} from './lib/weixin.js';

cli({
  site: 'social-weixin',
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
    { name: 'upload-inline-images', type: 'bool', default: false, help: 'Upload local HTML inline images and replace src values' },
    { name: 'show-cover-pic', type: 'bool', default: false, help: 'Show cover image in article body' },
    { name: 'need-open-comment', type: 'bool', default: false, help: 'Enable comments' },
    { name: 'only-fans-can-comment', type: 'bool', default: false, help: 'Restrict comments to followers' },
    { name: 'pic-crop-235-1', required: false, help: 'Cover crop for 2.35:1 format' },
    { name: 'pic-crop-1-1', required: false, help: 'Cover crop for 1:1 format' },
    { name: 'publish', type: 'bool', default: false, help: 'Submit the created draft for publication' },
    { name: 'wait', type: 'bool', default: false, help: 'Poll until the publish task reaches a terminal state' },
    { name: 'timeout-seconds', type: 'number', default: 300, help: 'Maximum wait time when --wait is set' },
    { name: 'interval-seconds', type: 'number', default: 5, help: 'Polling interval when --wait is set' },
    { name: 'execute', type: 'bool', default: false, help: 'Actually create draft and optionally publish' },
  ],
  columns: ['status', 'draft_media_id', 'publish_id', 'publish_status', 'article_id', 'article_url', 'fail_idx', 'title', 'detail'],
  func: async (kwargs) => {
    const contentInput = readContentInput(kwargs);
    const shouldPublish = kwargs.publish === true;
    const shouldWait = kwargs.wait === true;
    if (shouldWait && !shouldPublish) {
      throw new ArgumentError('--wait requires --publish.');
    }
    const isExecute = requireExecute(kwargs);
    const preflight = await preflightArticleInput(kwargs, contentInput, { allowMissingThumb: !isExecute });
    if (!isExecute) {
      const thumbMediaId = String(kwargs['thumb-media-id'] || '');
      return [{
        status: shouldPublish
          ? shouldWait ? 'dry_run_draft_publish_and_wait' : 'dry_run_draft_and_publish'
          : 'dry_run_draft',
        draft_media_id: '',
        publish_id: '',
        publish_status: '',
        article_id: '',
        article_url: '',
        fail_idx: '',
        title: preflight.article.title,
        detail: JSON.stringify({ ...compactArticleForOutput(preflight.article), inline_images: preflight.rewritten.images }),
      }];
    }

    const token = await getAccessToken();
    let thumbMediaId = String(kwargs['thumb-media-id'] || '');
    if (!thumbMediaId && kwargs['cover-image']) {
      const uploaded = await uploadPermanentImage(kwargs['cover-image'], token.accessToken);
      thumbMediaId = uploaded.mediaId;
    }
    const rewritten = await rewriteInlineImages(contentInput.content, {
      enabled: kwargs['upload-inline-images'],
      baseDir: contentInput.baseDir,
      uploadImage: (filePath) => uploadContentImage(filePath, token.accessToken),
    });
    const article = buildArticle(kwargs, rewritten.content, thumbMediaId);
    const draft = await addDraft(article, token.accessToken);

    if (!shouldPublish) {
      return [{
        status: 'draft_created',
        draft_media_id: draft.mediaId,
        publish_id: '',
        publish_status: '',
        article_id: '',
        article_url: '',
        fail_idx: '',
        title: article.title,
        detail: JSON.stringify({ ...compactArticleForOutput(article), inline_images: rewritten.images }),
      }];
    }

    const submitted = await submitPublish(draft.mediaId, token.accessToken);
    if (shouldWait) {
      const status = await waitForPublishCompletion(submitted.publishId, token.accessToken, {
        timeoutSeconds: kwargs['timeout-seconds'],
        intervalSeconds: kwargs['interval-seconds'],
        failOnFailure: true,
      });
      const row = publishStatusRow(status, submitted.publishId);
      return [{
        ...row,
        draft_media_id: draft.mediaId,
        title: article.title,
        detail: JSON.stringify({ ...compactArticleForOutput(article), inline_images: rewritten.images, msg_data_id: submitted.msgDataId }),
      }];
    }
    return [{
      status: 'submitted',
      draft_media_id: draft.mediaId,
      publish_id: submitted.publishId,
      publish_status: '',
      article_id: '',
      article_url: '',
      fail_idx: '',
      title: article.title,
      detail: JSON.stringify({ ...compactArticleForOutput(article), inline_images: rewritten.images, msg_data_id: submitted.msgDataId }),
    }];
  },
});
