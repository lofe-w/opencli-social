import * as os from 'node:os';
import * as path from 'node:path';

export const SITE = 'social-weixin-channels';
export const DOMAIN = 'channels.weixin.qq.com';
export const HOME_URL = 'https://channels.weixin.qq.com';
export const PUBLISH_URL = 'https://channels.weixin.qq.com/platform/post/create';
export const POSTS_URL = 'https://channels.weixin.qq.com/platform/post/list';
export const DEFAULT_JOB_DIR = path.join(os.homedir(), '.opencli-social', 'channels', 'jobs');
export const JOB_SCHEMA_VERSION = 1;
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm']);
export const COVER_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

export function jobDir(env = process.env) {
  return env.SOCIAL_WEIXIN_CHANNELS_JOB_DIR || DEFAULT_JOB_DIR;
}
