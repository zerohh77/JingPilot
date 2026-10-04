# JingPilot

进京证自动管理工具：在 macOS 上定时查询进京证状态，并在符合条件时自动续办六环外进京证。

**JingPilot 目前专注于已有进京证历史记录用户的六环外自动续办，不处理首次办证。** 尚无历史申请记录时，程序会安全停止，不会猜测申请参数。

JingPilot 是非官方第三方工具，与北京交警、北京通等机构没有隶属或授权关系。

## 能做什么

- **不用记续办日期。** 用户登录后以及每天 09:30、16:30 自动检查；可配置在检查前唤醒 Mac，并防止任务窗口内因空闲再次休眠。
- **需要时才提交。** 每次都重新登录并查询实时状态。当前证件尚无需续办、已有审核中或待生效申请时，正常退出。
- **只申请六环外。** 自动化模式在配置、判断、申请数据和提交入口都拒绝六环内申请。
- **可选地收到结果。** 配置企业微信群机器人后，可接收巡检、提交确认、新证审核通过或本轮异常通知；不配置也能正常查询和续办，通知失败不影响主流程。

## 工作原理

```text
定时触发或登录 → 登录北京通 → 查询进京证状态
                                 ├─ 无需续办 → 记录结果并退出
                                 └─ 需要续办 → 再次查询并核对
                                                 ↓
                                      满足安全条件后提交
                                                 ↓
                                      再次查询确认并通知
```

错过计划时间后，程序会重新查询实际状态，不会按过期的计划直接补交。Mac 关机时无法运行；用户主动睡眠、关机或合盖等硬件条件也可能阻止任务。

当前已验证查询、定时运行、唤醒和通知链路。首次在自然续办窗口内完成真实自动提交与确认，仍待实际业务周期验证。

## Quick Start：从全新安装开始

适用于已有进京证历史申请记录的用户。需要 macOS、Node.js 18 或更高版本，以及当前用户可访问的 macOS Keychain。以下命令在 JingPilot 项目目录中执行。

1. **安装 CLI 并初始化。**

   ```bash
   npm install
   npm link
   jingpilot init
   ```

   按提示输入北京通手机号和密码。凭据保存在当前用户的 Keychain。初始化时若出现“Bark URL（可留空）”，直接留空即可；无需企业微信或 Webhook。

2. **确认车辆。**

   ```bash
   jingpilot vehicle list
   ```

   只有一辆已绑定车辆时，确认列表中的车辆即可，程序会自动选择它。若有多辆车，运行 `jingpilot vehicle set <车牌>` 设置首选车辆：将 `<车牌>` 替换为自己的完整车牌，不要输入尖括号。随后再次运行 `jingpilot vehicle list` 核对。

   如果列表没有目标车辆或显示未绑定车辆，请先完成车辆绑定，再继续后续步骤；否则状态查询与自动续办无法正常进行。

3. **只查询当前状态。**

   ```bash
   jingpilot status
   ```

   这条命令不会提交申请。若当前账号没有任何历史进京证申请记录，JingPilot 不支持自动办理首次申请；进入办理分支时会安全停止，不会推测上一张证件的申请信息。

4. **可选：配置企业微信通知。** 不使用企业微信时直接跳到第 5 步；未配置通知不会阻止状态查询、模拟运行、调度安装或自动续办。

   ```bash
   jingpilot notify add
   jingpilot notify test
   ```

   **企业微信通知为可选功能。** 如需启用，先在自己的企业微信群创建机器人，再运行 `notify add`，按隐藏输入提示粘贴自己的 Webhook；它会保存在 Keychain，不必写入配置文件或环境变量。`notify test` 会实际发送一条测试消息，请仅在愿意发送时执行。配置后可运行 `jingpilot notify status` 核对渠道类型，输出不会显示 Webhook。通知发送失败只影响通知，不改变续办结果。

5. **运行安全模拟。**

   ```bash
   jingpilot run --dry-run
   ```

   `--dry-run` 绝不发送申请 POST。如果还没有进入续办窗口，它会在状态判断阶段正常退出：这只能证明本次认证、查询与当前决策链路正常，**不能证明续办日的申请数据一定满足真实提交条件**。

6. **安装并核对无人值守任务。**

   ```bash
   jingpilot scheduler install
   jingpilot scheduler status
   ```

   用户登录后及每天 09:30、16:30 自动检查。若希望在计划时间前从睡眠中唤醒 Mac，再执行：

   ```bash
   jingpilot scheduler wake-install
   jingpilot scheduler wake-status
   ```

   唤醒配置需要一次 macOS 管理员授权，计划在 09:24:30、16:24:30 唤醒。它不会主动点亮显示器，也不会让关机的 Mac 开机。

7. **最后由你决定是否开启真实提交。** 确认车辆、状态、模拟结果和调度状态后，才运行：

   ```bash
   jingpilot set live-submit enabled
   ```

   开启后，未来满足全部安全条件时将真实提交六环外申请。可用 `jingpilot set live-submit disabled` 关闭真实提交，保留自动查询。

## 安全机制

JingPilot 在结果不确定时停止本轮自动提交，不猜测，也不盲目重试。

- 文件锁防止并发运行；`pending_attempt` 和申请数据指纹防止重复提交。
- 提交前再次查询状态；提交后再次查询，确认是否产生新申请。
- 超时或提交结果不确定时保留待核验状态，不重复发送申请 POST。
- 401 每轮最多重新认证一次；未知接口结构、业务状态或车辆匹配结果会阻止提交。
- 旧证目的地无法由官方地图还原时，可使用用户已确认的固定目的地；新申请地点可能因此不同于旧证。其他申请参数仍须通过原有校验。
- 地图访问凭据不随源码发布。仅在旧证地点字段需要解析时使用；已有合法凭据的用户可运行 `jingpilot auth map-key`，通过隐藏输入保存到当前用户 Keychain。没有凭据且没有已确认的固定目的地时，本轮会安全停止，不会猜测地点或提交。
- 六环外是硬限制；持久化的 `live-submit` 开关还必须处于 enabled。
- 北京通凭据和通知 Webhook 保存在 Keychain；日志脱敏并轮转。

这些保护不会保证官方接口或业务规则始终可用。用户仍需自行确认申请资格和办理结果。

## 项目来源

JingPilot 最初基于 [fichas/cross_beijing_cli](https://github.com/fichas/cross_beijing_cli) 开发。感谢原作者在北京通登录、进京证 API 探索和 CLI 基础实现上的工作。

在此基础上，JingPilot 扩展了当前接口与 Session 兼容、安全提交与幂等保护、macOS Keychain、无人值守调度、自动唤醒、通知、日志和测试。上游继承代码仍保留原始 MIT 版权与许可证说明，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## License

JingPilot 自有代码采用 [PolyForm Noncommercial License 1.0.0](LICENSES/PolyForm-Noncommercial-1.0.0.txt)；上游继承部分继续遵循 [MIT License](LICENSES/MIT-upstream.txt)。适用范围见 [LICENSE.md](LICENSE.md)。
