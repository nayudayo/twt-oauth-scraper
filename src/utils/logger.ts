import chalk from 'chalk'

export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(chalk.blue('ℹ'), chalk.blue(message), ...args)
  },
  
  success: (message: string, ...args: unknown[]) => {
    console.log(chalk.green('✓'), chalk.green(message), ...args)
  },
  
  error: (message: string, ...args: unknown[]) => {
    console.error(chalk.red('✖'), chalk.red(message), ...args)
  },
  
  warn: (message: string, ...args: unknown[]) => {
    console.warn(chalk.yellow('⚠'), chalk.yellow(message), ...args)
  }
} 