import { createHmac } from 'crypto';
import { redact } from './masking.js';
import { formatWeComText } from './wecom-text.js';

/**
 * Parse a notify URL into scheme and path.
 * @param {string} url
 * @returns {{ scheme: string, path: string } | null}
 */
function parseNotifyUrl(url) {
  const m = url.match(/^(\w+):\/\/(.+)$/);
  if (!m) return null;
  return { scheme: m[1], path: m[2] };
}

const WECOM_WEBHOOK_ORIGIN = 'https://qyapi.weixin.qq.com';
const WECOM_WEBHOOK_PATH = '/cgi-bin/webhook/send';

/**
 * Convert a full Enterprise WeChat robot Webhook into JingPilot's secret URL
 * format. Other supported notification URLs are returned unchanged.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeNotifyUrl(value) {
  const input = String(value || '').trim();
  if (!input.startsWith('https://')) return input;
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return input;
  }
  if (parsed.origin !== WECOM_WEBHOOK_ORIGIN || parsed.pathname !== WECOM_WEBHOOK_PATH) return input;
  const key = parsed.searchParams.get('key');
  return key ? `wecom://${key}` : input;
}

export function getNotifyChannel(value) {
  const parsed = parseNotifyUrl(normalizeNotifyUrl(value));
  return parsed?.scheme || 'unknown';
}

export function isSupportedNotifyUrl(value) {
  return Object.hasOwn(handlers, getNotifyChannel(value));
}

// ── Channel handlers ────────────────────────────────────────────────

async function sendBark(path, title, body) {
  // bark://<key> (default server) or bark://<server>/<key>
  const parts = path.split('/');
  let server, key;
  if (parts.length === 1) {
    server = 'api.day.app';
    key = parts[0];
  } else {
    server = parts[0];
    key = parts.slice(1).join('/');
  }
  const url = `https://${server}/${key}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bark HTTP ${res.status}`);
}

async function sendTelegram(path, title, body) {
  // tgram://<bot_token>/<chat_id>
  const idx = path.lastIndexOf('/');
  if (idx === -1) throw new Error('Invalid Telegram URL: missing chat_id');
  const token = path.slice(0, idx);
  const chatId = path.slice(idx + 1);
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: `*${title}*\n${body}`,
      parse_mode: 'Markdown',
    }),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
}

async function sendDingTalk(path, title, body) {
  // dingtalk://<access_token>[/<secret>]
  const parts = path.split('/');
  const token = parts[0];
  const secret = parts[1];
  let url = `https://oapi.dingtalk.com/robot/send?access_token=${token}`;
  if (secret) {
    const ts = Date.now();
    const stringToSign = `${ts}\n${secret}`;
    const sign = encodeURIComponent(
      createHmac('sha256', secret).update(stringToSign).digest('base64'),
    );
    url += `&timestamp=${ts}&sign=${sign}`;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: `${title}\n${body}` } }),
  });
  if (!res.ok) throw new Error(`DingTalk HTTP ${res.status}`);
}

async function sendWeCom(path, title, body, displayDetails) {
  // wecom://<key>
  const key = decodeURIComponent(path);
  const url = `${WECOM_WEBHOOK_ORIGIN}${WECOM_WEBHOOK_PATH}?key=${encodeURIComponent(key)}`;
  const content = formatWeComText(title, body, displayDetails);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgtype: 'text', text: { content } }),
    });
  } catch {
    throw new Error('WeCom 网络请求失败');
  }
  if (!res.ok) throw new Error(`WeCom HTTP ${res.status}`);
  let result;
  try {
    result = await res.json();
  } catch {
    throw new Error('WeCom 响应不是有效 JSON');
  }
  if (Number(result?.errcode) !== 0) {
    throw new Error(`WeCom API ${Number(result?.errcode) || 'UNKNOWN'}: 发送失败`);
  }
}

async function sendFeishu(path, title, body) {
  // feishu://<hook_id>[/<secret>]
  const parts = path.split('/');
  const hookId = parts[0];
  const secret = parts[1];
  const url = `https://open.feishu.cn/open-apis/bot/v2/hook/${hookId}`;
  const payload = {
    msg_type: 'text',
    content: { text: `${title}\n${body}` },
  };
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = `${timestamp}\n${secret}`;
    const sign = createHmac('sha256', stringToSign).update(Buffer.alloc(0)).digest('base64');
    payload.timestamp = timestamp;
    payload.sign = sign;
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Feishu HTTP ${res.status}`);
}

async function sendSlack(path, title, body) {
  // slack://<T>/<B>/<token>
  const url = `https://hooks.slack.com/services/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `*${title}*\n${body}` }),
  });
  if (!res.ok) throw new Error(`Slack HTTP ${res.status}`);
}

async function sendJson(path, title, body) {
  // json://<host>/<path>
  const idx = path.indexOf('/');
  const host = idx === -1 ? path : path.slice(0, idx);
  const urlPath = idx === -1 ? '' : path.slice(idx);
  const url = `https://${host}${urlPath}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body }),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
}

// ── Dispatcher ──────────────────────────────────────────────────────

const handlers = {
  bark: sendBark,
  barks: sendBark,       // apprise 兼容：barks:// = bark:// over HTTPS
  tgram: sendTelegram,
  dingtalk: sendDingTalk,
  wecom: sendWeCom,
  feishu: sendFeishu,
  slack: sendSlack,
  json: sendJson,
};

/**
 * Send a notification to all configured URLs.
 * Best-effort: errors are logged but never thrown.
 *
 * @param {string[]} urls  Notification URLs (e.g. ["bark://key", "tgram://token/chatid"])
 * @param {string}   title Notification title
 * @param {string}   body  Notification body
 * @param {object}   displayDetails Optional presentation data for supported channels
 * @returns {Promise<PromiseSettledResult[]>}
 */
export async function notify(urls, title, body, displayDetails) {
  if (!urls || urls.length === 0) return [];

  const tasks = urls.map(async (rawUrl) => {
    const url = normalizeNotifyUrl(rawUrl);
    const parsed = parseNotifyUrl(url);
    if (!parsed) {
      console.error('[notifier] invalid notification URL');
      throw new Error('Invalid notify URL');
    }
    const handler = handlers[parsed.scheme];
    if (!handler) {
      console.error(`[notifier] unsupported scheme: ${parsed.scheme}`);
      throw new Error(`Unsupported notify scheme: ${parsed.scheme}`);
    }
    try {
      await handler(parsed.path, title, body, displayDetails);
    } catch (err) {
      console.error(`[notifier] ${parsed.scheme} failed:`, redact(err.message));
      throw err;
    }
  });

  return Promise.allSettled(tasks);
}

/**
 * Send a test notification to all configured URLs.
 *
 * @param {string[]} urls  Notification URLs
 * @returns {Promise<PromiseSettledResult[]>}
 */
export async function testNotify(urls) {
  return notify(urls, '测试通知 / Test Notification', '如果你看到这条消息，说明通知配置正确。');
}
