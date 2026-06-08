import { spawnSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const title = process.env.SOCIAL_WEIXIN_LIVE_TITLE || 'OpenCLI 微信发布测试';

run('npm', ['run', 'prepare:weixin-live-sample']);

if (dryRun) {
  run('opencli', publishArgs({ title, execute: false }));
  process.exit(0);
}

if (!process.env.OPENCLI_PROFILE) {
  console.error([
    'Missing OpenCLI profile for live publish.',
    'Run with opencli --profile <name> or set an OpenCLI default profile before publishing.',
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
