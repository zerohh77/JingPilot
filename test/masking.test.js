import test from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../src/lib/masking.js';

test('日志脱敏完整 applyId 和 applyIdOld，保留其他内容', () => {
  const message = '二次确认 applyId=130123456152 {"applyIdOld":"123456"} 状态=审核中';
  const safe = redact(message);
  assert.match(safe, /applyId=\*\*\*/);
  assert.match(safe, /"applyIdOld":"\*\*\*"/);
  assert.match(safe, /状态=审核中/);
  assert.doesNotMatch(safe, /130123456152|123456/);
});
