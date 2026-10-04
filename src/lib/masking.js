export function maskPhone(value = '') {
  return String(value).replace(/(\d{3})\d{4}(\d{4})/g, '$1****$2');
}

export function maskId(value = '') {
  const text = String(value);
  if (text.length < 8) return text ? '***' : '';
  return `${text.slice(0, 3)}***********${text.slice(-4)}`;
}

export function maskPlate(value = '') {
  const text = String(value);
  if (text.length <= 3) return text ? '***' : '';
  return `${text.slice(0, 1)}***${text.slice(-2)}`;
}

export function maskSecret(value = '') {
  const text = String(value);
  if (!text) return '';
  if (text.length <= 6) return '***';
  return `${text.slice(0, 3)}***${text.slice(-3)}`;
}

export function redact(text = '') {
  return String(text)
    .replace(/(\bapplyId(?:Old)?["']?\s*[:=：]\s*["']?)([^"'\s,}]+)/gi, '$1***')
    .replace(/(Authorization\s*[:=]\s*)([^\s,}]+)/gi, '$1***')
    .replace(/(barks?:\/\/[^/\s]+\/)([^\s]+)/gi, '$1***')
    .replace(/(wecom:\/\/)([^\s]+)/gi, '$1***')
    .replace(/(qyapi\.weixin\.qq\.com\/cgi-bin\/webhook\/send\?key=)([^\s&]+)/gi, '$1***')
    .replace(/\b\d{17}[\dXx]\b/g, (value) => maskId(value))
    .replace(/\b1\d{10}\b/g, (value) => maskPhone(value));
}
