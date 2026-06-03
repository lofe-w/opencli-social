import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const title = process.env.SOCIAL_WEIXIN_LIVE_TITLE || 'OpenCLI 微信发布测试';

run('npm', ['run', 'prepare:weixin-live-sample']);

if (dryRun) {
  run('opencli', publishArgs({ title, execute: false }));
  process.exit(0);
}

if (!hasCredentials(process.env)) {
  console.error([
    'Missing WeChat credentials for live publish.',
    'Set SOCIAL_WEIXIN_ACCESS_TOKEN, or set SOCIAL_WEIXIN_APP_ID and SOCIAL_WEIXIN_APP_SECRET.',
  ].join('\n'));
  process.exit(2);
}

run('opencli', ['social-weixin', 'auth']);
run('opencli', publishArgs({ title, execute: true }));

function publishArgs(options) {
  const command = [
    'social-weixin',
    'publish-article',
    '--content-file',
    'tmp/weixin-live/article.html',
    '--title',
    options.title,
    '--cover-image',
    'tmp/weixin-live/cover.png',
    '--upload-inline-images',
    '--publish',
    '--wait',
  ];
  if (options.execute) command.push('--execute');
  return command;
}

function hasCredentials(env) {
  if (env.SOCIAL_WEIXIN_ACCESS_TOKEN) return true;
  const appId = env.SOCIAL_WEIXIN_APP_ID;
  const secret = env.SOCIAL_WEIXIN_APP_SECRET;
  return Boolean(appId && secret);
}

function run(command, argsToRun) {
  const result = spawnSync(command, argsToRun, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
