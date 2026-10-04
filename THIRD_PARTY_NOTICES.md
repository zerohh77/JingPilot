# Third-party notices

## fichas/cross_beijing_cli

- Repository: <https://github.com/fichas/cross_beijing_cli>
- Repository owner: `fichas`
- Upstream license: MIT
- Upstream copyright notice: `Copyright (c) 2026 Chaos`
- Audited upstream revision: `3c41085c4f65da6340f5c72856d48c56310e077e`

JingPilot was initially developed from `fichas/cross_beijing_cli` and has
since received extensive compatibility, session-management, renewal-safety,
idempotency, Keychain, launchd, logging, recovery, and testing work.

The following current files or assets remain identical to the audited upstream
revision and are provided under the upstream MIT License:

- `models/common_old.json`
- `models/common_old.onnx`
- `src/output.js`
- `src/lib/crypto-utils.js`
- `src/lib/ocr.js`

The following files were modified from upstream and still contain substantial
upstream code. Their inherited upstream portions remain under MIT:

- `bin/cross-bj.js`
- `src/commands/cron.js`
- `src/commands/init.js`
- `src/commands/notify.js`
- `src/commands/run.js`
- `src/commands/set.js`
- `src/commands/status.js`
- `src/commands/vehicle.js`
- `src/lib/api-manager.js`
- `src/lib/bjt-login.js`
- `src/lib/config-manager.js`
- `src/lib/models.js`
- `src/lib/notifier.js`
- `src/constants.js`
- `.npmignore`
- the project README, package metadata, and former `cross-bj` skill document

No claim is made that those inherited portions are exclusively owned by
JingPilot or covered only by the PolyForm license. The complete upstream MIT
text is preserved in `LICENSES/MIT-upstream.txt`.
