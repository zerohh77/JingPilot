#!/usr/bin/env node

import { rotateSchedulerLogs } from '../src/lib/scheduler-log.js';

if (process.env.JINGPILOT_LAUNCHD === '1' || process.env.CROSS_BJ_LAUNCHD === '1') {
  rotateSchedulerLogs();
}

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

import { program } from 'commander';

program
  .name('jingpilot')
  .description('JingPilot - 进京证自动查询、续办与无人值守管理工具')
  .version(version);

import { registerInitCommand } from '../src/commands/init.js';
import { registerStatusCommand } from '../src/commands/status.js';
import { registerRunCommand } from '../src/commands/run.js';
import { registerVehicleCommand } from '../src/commands/vehicle.js';
import { registerNotifyCommand } from '../src/commands/notify.js';
import { registerSetCommand } from '../src/commands/set.js';
import { registerAuthCommand } from '../src/commands/auth.js';
import { registerConfigCommand } from '../src/commands/config.js';
import { registerStateCommand } from '../src/commands/state.js';
import { registerSchedulerCommand } from '../src/commands/scheduler.js';

registerInitCommand(program);
registerStatusCommand(program);
registerRunCommand(program);
registerVehicleCommand(program);
registerNotifyCommand(program);
registerSetCommand(program);
registerAuthCommand(program);
registerConfigCommand(program);
registerStateCommand(program);
registerSchedulerCommand(program);

program.action(async () => {
  const { runCommand } = await import('../src/commands/run.js');
  await runCommand();
});

program.parse();
