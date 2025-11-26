/**
 * AgentQA Logger Utility
 * Centralized logging with colored output and file logging
 */

import winston from 'winston';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const customFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
  return `${timestamp} [${level.toUpperCase()}] ${message} ${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    customFormat
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log')
    }),
  ],
});

// Add console transport with colors in non-production
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

/**
 * Console output helpers with colors
 */
export const console_log = {
  info: (message: string) => console.log(chalk.blue('ℹ'), message),
  success: (message: string) => console.log(chalk.green('✓'), message),
  warning: (message: string) => console.log(chalk.yellow('⚠'), message),
  error: (message: string) => console.log(chalk.red('✗'), message),
  debug: (message: string) => console.log(chalk.gray('🔍'), message),
  step: (step: number, message: string) => console.log(chalk.cyan(`[${step}]`), message),
  title: (message: string) => console.log(chalk.bold.magenta(`\n${message}\n${'='.repeat(message.length)}`)),
  subtitle: (message: string) => console.log(chalk.bold.white(`\n${message}`)),
  bullet: (message: string) => console.log(chalk.gray('  •'), message),
  divider: () => console.log(chalk.gray('─'.repeat(60))),
};

export default logger;
