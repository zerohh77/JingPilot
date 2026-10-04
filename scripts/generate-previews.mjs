import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { previewData } from '../docs/previews/preview-data.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(projectRoot, 'docs', 'images');

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function text(x, y, value, attributes = '') {
  return `<text x="${x}" y="${y}" ${attributes}>${escapeXml(value)}</text>`;
}

function documentShell({ width, height, title, description, content }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${escapeXml(title)}</title>
  <desc id="description">${escapeXml(description)}</desc>
  <style>
    .sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
    .mono { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; }
  </style>
${content}
</svg>
`;
}

function renderNotification(data, meta) {
  const messageLines = data.messageLines.map((line, index) => text(
    164,
    448 + index * 56,
    line,
    `class="sans" font-size="29" ${index === 0 ? 'font-weight="600"' : ''} fill="#111111"`,
  )).join('\n    ');

  const content = `
  <rect width="900" height="1360" fill="#ededed"/>

  <!-- Mobile status bar -->
  <rect width="900" height="78" fill="#f7f7f7"/>
  ${text(48, 52, data.statusTime, 'class="sans" font-size="28" font-weight="600" fill="#111111"')}
  ${text(752, 52, '5G', 'class="sans" font-size="26" font-weight="600" fill="#111111"')}
  <rect x="806" y="25" width="54" height="29" rx="7" fill="none" stroke="#111111" stroke-width="3"/>
  <rect x="812" y="30" width="39" height="19" rx="4" fill="#111111"/>
  <rect x="862" y="33" width="5" height="13" rx="2.5" fill="#111111"/>

  <!-- Conversation navigation -->
  <rect y="78" width="900" height="102" fill="#f7f7f7"/>
  <path d="M48 112 L27 129 L48 146" fill="none" stroke="#111111" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  ${text(450, 143, data.conversationTitle, 'class="sans" font-size="31" font-weight="600" text-anchor="middle" fill="#111111"')}
  <circle cx="814" cy="129" r="5" fill="#111111"/>
  <circle cx="838" cy="129" r="5" fill="#111111"/>
  <circle cx="862" cy="129" r="5" fill="#111111"/>
  <line x1="0" y1="179" x2="900" y2="179" stroke="#dddddd"/>

  <!-- Explicit preview disclosure -->
  <rect x="280" y="216" width="340" height="46" rx="23" fill="#dde8f7"/>
  ${text(450, 247, `${meta.badge} · 虚拟脱敏数据`, 'class="sans" font-size="18" font-weight="600" text-anchor="middle" fill="#3f5f85"')}
  ${text(450, 318, data.messageTime, 'class="sans" font-size="22" text-anchor="middle" fill="#a8adb3"')}

  <!-- Sender avatar and message bubble -->
  <rect x="34" y="356" width="82" height="82" rx="18" fill="#1677ff"/>
  <circle cx="75" cy="397" r="28" fill="#ffffff" opacity="0.16"/>
  ${text(75, 409, 'J', 'class="sans" font-size="35" font-weight="700" text-anchor="middle" fill="#ffffff"')}
  ${text(142, 382, data.source, 'class="sans" font-size="23" fill="#8d9298"')}
  <path d="M142 408 L125 424 L142 438 Z" fill="#ffffff"/>
  <rect x="138" y="401" width="690" height="365" rx="18" fill="#ffffff"/>
  ${messageLines}
  <line x1="164" y1="704" x2="802" y2="704" stroke="#eeeeee"/>
  ${text(164, 742, data.footer, 'class="sans" font-size="19" fill="#8d9298"')}

  ${text(450, 842, meta.disclosure, 'class="sans" font-size="20" text-anchor="middle" fill="#a8adb3"')}

  <!-- Conversation input area -->
  <rect y="1194" width="900" height="166" fill="#f7f7f7"/>
  <circle cx="52" cy="1255" r="26" fill="none" stroke="#45494e" stroke-width="5"/>
  <path d="M43 1255 Q52 1245 61 1255 Q52 1265 43 1255" fill="none" stroke="#45494e" stroke-width="4" stroke-linecap="round"/>
  <rect x="94" y="1218" width="622" height="76" rx="14" fill="#ffffff"/>
  ${text(122, 1267, data.inputPlaceholder, 'class="sans" font-size="27" fill="#a8adb3"')}
  <circle cx="762" cy="1256" r="27" fill="none" stroke="#45494e" stroke-width="5"/>
  <circle cx="753" cy="1249" r="3.5" fill="#45494e"/>
  <circle cx="771" cy="1249" r="3.5" fill="#45494e"/>
  <path d="M751 1264 Q762 1273 773 1264" fill="none" stroke="#45494e" stroke-width="4" stroke-linecap="round"/>
  <circle cx="844" cy="1256" r="27" fill="none" stroke="#45494e" stroke-width="5"/>
  <line x1="844" y1="1242" x2="844" y2="1270" stroke="#45494e" stroke-width="5" stroke-linecap="round"/>
  <line x1="830" y1="1256" x2="858" y2="1256" stroke="#45494e" stroke-width="5" stroke-linecap="round"/>
  <rect x="338" y="1334" width="224" height="7" rx="3.5" fill="#111111"/>`;

  return documentShell({
    width: 900,
    height: 1360,
    title: `${data.title} — ${meta.badge}`,
    description: meta.disclosure,
    content,
  });
}

mkdirSync(outputDir, { recursive: true });
const previews = [
  [previewData.notification.fileName, renderNotification(previewData.notification, previewData.meta)],
];

for (const [fileName, svg] of previews) {
  writeFileSync(resolve(outputDir, fileName), svg, 'utf8');
  console.log(`generated docs/images/${fileName}`);
}
