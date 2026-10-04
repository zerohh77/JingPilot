---
name: jingpilot
version: 1.0.0
description: "在 macOS 本机安全查询、模拟或续办进京证，并管理通知与 LaunchAgent。"
---

# JingPilot

使用当前 JingPilot 项目。不要用 npm 上的旧 `cross-bj` 包替代本地代码。

## 不可越过的边界

- `status` 只查询，绝不提交。
- 不绕过 `live-submit`、二次 `stateList`、pending、文件锁或防重复保护。
- 不在消息、日志或命令中回显密码、Authorization、身份证号或通知 key。
- 不手工拼造 `applyIdOld`、地点或道路字段；缺字段时停止。
- 出现 pending/unconfirmed 状态时不得再次提交，除非用户已经人工核验。
- 不通过修改日期或状态来制造真实申请测试。

## 推荐检查流程

```bash
cd /path/to/JingPilot
npm test
node bin/jingpilot.js auth test
node bin/jingpilot.js status
node bin/jingpilot.js run --dry-run
node bin/jingpilot.js scheduler status
```

## 常用命令

```bash
jingpilot status
jingpilot run --dry-run
jingpilot auth test
jingpilot config show
jingpilot state show
jingpilot scheduler status
```

只有人工确认北京交警端不存在新申请后，才可执行：

```bash
jingpilot state clear-pending --confirm
```

详细行为、文件位置和许可证边界见项目 `README.md`、
`LICENSE.md` 与 `THIRD_PARTY_NOTICES.md`。
