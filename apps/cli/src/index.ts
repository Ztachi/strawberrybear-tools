#!/usr/bin/env node

/**
 * @description: CLI 入口文件
 * @return {void}
 */

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

program
  .name('strawberry-cli')
  .description('🍓 个人工具 CLI')
  .version('0.0.0');

program
  .command('greet')
  .description('向用户打招呼')
  .action(() => {
    console.log(chalk.green('你好！欢迎使用 strawberry-cli！'));
  });

program.parse();
