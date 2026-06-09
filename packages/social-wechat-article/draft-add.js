import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  addDraft,
  buildArticle,
  compactArticleForOutput,
  getAccessToken,
  preflightArticleInput,
  profileAuditFields,
  readContentInput,
  requireExecute,
  rewriteInlineImages,
  uploadContentImage,
  uploadPermanentImage,
} from './lib/wechat-article.js';

const articleArgs = [
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
  { name: 'execute', type: 'bool', default: false, help: 'Actually create the draft' },
];

cli({
  site: 'social-wechat-article',
  name: 'draft-add',
  access: 'write',
  description: 'Create a single-article WeChat Article draft',
  strategy: Strategy.LOCAL,
  browser: false,
  args: articleArgs,
  columns: ['status', 'profile', 'account_name', 'account_id_masked', 'media_id', 'title', 'thumb_media_id', 'detail'],
  func: async (kwargs) => {
    const contentInput = readContentInput(kwargs);
    const isExecute = requireExecute(kwargs);
    const audit = profileAuditFields();
    const preflight = await preflightArticleInput(kwargs, contentInput, { allowMissingThumb: !isExecute });
    if (!isExecute) {
      return [{
        status: 'dry_run',
        ...audit,
        media_id: '',
        title: preflight.article.title,
        thumb_media_id: preflight.article.thumb_media_id,
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
    return [{
      status: 'draft_created',
      profile: token.profile,
      account_name: token.account_name,
      account_id_masked: token.account_id_masked,
      media_id: draft.mediaId,
      title: article.title,
      thumb_media_id: article.thumb_media_id,
      detail: JSON.stringify({ ...compactArticleForOutput(article), inline_images: rewritten.images }),
    }];
  },
});
