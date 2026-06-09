import * as fs from 'node:fs';
import * as path from 'node:path';
import { deflateSync } from 'node:zlib';

const outputDir = path.resolve('tmp/wechat-article-live');
const coverPath = path.join(outputDir, 'cover.png');
const inlinePath = path.join(outputDir, 'inline.png');
const articlePath = path.join(outputDir, 'article.html');

fs.mkdirSync(outputDir, { recursive: true });

writePng(coverPath, 900, 383, (x, y) => {
  const warm = Math.round(245 - (y / 383) * 32);
  const cool = Math.round(90 + (x / 900) * 45);
  const band = Math.sin((x + y) / 58) > 0 ? 18 : 0;
  return [warm, 110 + band, cool, 255];
});

writePng(inlinePath, 480, 240, (x, y) => {
  const center = Math.hypot(x - 240, y - 120);
  const glow = Math.max(0, 1 - center / 260);
  return [
    Math.round(40 + glow * 120),
    Math.round(130 + glow * 70),
    Math.round(170 + glow * 45),
    255,
  ];
});

fs.writeFileSync(articlePath, [
  '<h1>OpenCLI 微信发布测试</h1>',
  '<p>这是一篇由 social-wechat-article 生成的测试文章，用于验证微信公众号草稿创建、素材上传和发布等待链路。</p>',
  '<p><img src="./inline.png" alt="OpenCLI live publish sample"></p>',
  '<p>如果你在公众号后台看到这篇文章，说明 OpenCLI Social 已经跑通真实发布流程。</p>',
].join('\n'), 'utf8');

console.log(`Created ${articlePath}`);
console.log(`Created ${coverPath}`);
console.log(`Created ${inlinePath}`);

function writePng(filePath, width, height, pixelAt) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + 1 + x * 4;
      const [red, green, blue, alpha] = pixelAt(x, y);
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
      raw[offset + 3] = alpha;
    }
  }

  const chunks = [
    chunk('IHDR', Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 6, 0, 0, 0]),
    ])),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ];

  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ...chunks,
  ]));
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  return Buffer.concat([
    uint32(data.length),
    typeBuffer,
    data,
    uint32(crc32(Buffer.concat([typeBuffer, data]))),
  ]);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
