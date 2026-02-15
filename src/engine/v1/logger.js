/**
 * Comprehensive Logging Module
 * Provides structured logging with multiple transports
 * Supports file logging, console output, and error tracking
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../logs');
    this.logLevel = options.logLevel || 'info';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile !== false;

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Log level hierarchy
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4
    };

    this.currentLevel = this.levels[this.logLevel] || this.levels.info;
  }

  /**
   * Format log message
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   * @returns {string} - Formatted log message
   */
  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const metadataStr = Object.keys(metadata).length > 0 
      ? ` | ${JSON.stringify(metadata)}` 
      : '';
    
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metadataStr}`;
  }

  /**
   * Get log file path for level
   * @param {string} level - Log level
   * @returns {string} - File path
   */
  getLogFilePath(level) {
    return path.join(this.logDir, `${level}.log`);
  }

  /**
   * Write to log file
   * @param {string} level - Log level
   * @param {string} message - Formatted message
   */
  writeToFile(level, message) {
    if (!this.enableFile) return;

    const filePath = this.getLogFilePath(level);
    const combinedPath = path.join(this.logDir, 'combined.log');

    try {
      // Write to level-specific file
      fs.appendFileSync(filePath, message + '\n', 'utf8');

      // Write to combined log
      fs.appendFileSync(combinedPath, message + '\n', 'utf8');

      // Check file size and rotate if needed
      this.rotateLogFile(filePath);
      this.rotateLogFile(combinedPath);
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }

  /**
   * Rotate log file if it exceeds max size
   * @param {string} filePath - Path to log file
   */
  rotateLogFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return;

      const stats = fs.statSync(filePath);
      if (stats.size > this.maxFileSize) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = `${filePath}.${timestamp}`;
        fs.renameSync(filePath, rotatedPath);

        // Clean up old rotated files
        this.cleanupOldLogFiles(filePath);
      }
    } catch (error) {
      console.error(`Failed to rotate log file: ${error.message}`);
    }
  }

  /**
   * Clean up old rotated log files
   * @param {string} baseFilePath - Base file path
   */
  cleanupOldLogFiles(baseFilePath) {
    try {
      const dir = path.dirname(baseFilePath);
      const basename = path.basename(baseFilePath);
      const files = fs.readdirSync(dir);

      const rotatedFiles = files
        .filter(f => f.startsWith(basename) && f !== basename)
        .sort()
        .reverse();

      // Keep only maxFiles rotated files
      for (let i = this.maxFiles; i < rotatedFiles.length; i++) {
        fs.unlinkSync(path.join(dir, rotatedFiles[i]));
      }
    } catch (error) {
      console.error(`Failed to cleanup old log files: ${error.message}`);
    }
  }

  /**
   * Log message at specified level
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  log(level, message, metadata = {}) {
    if (this.levels[level] === undefined) {
      throw new Error(`Invalid log level: ${level}`);
    }

    if (this.levels[level] < this.currentLevel) {
      return; // Skip logging if level is below current threshold
    }

    const formattedMessage = this.formatMessage(level, message, metadata);

    // Write to console
    if (this.enableConsole) {
      const consoleMethod = level === 'error' || level === 'fatal' ? 'error' : 'log';
      console[consoleMethod](formattedMessage);
    }

    // Write to file
    this.writeToFile(level, formattedMessage);
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  debug(message, metadata = {}) {
    this.log('debug', message, metadata);
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  info(message, metadata = {}) {
    this.log('info', message, metadata);
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  warn(message, metadata = {}) {
    this.log('warn', message, metadata);
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} error - Error object or metadata
   */
  error(message, error = {}) {
    const metadata = error instanceof Error 
      ? {
          errorMessage: error.message,
          errorStack: error.stack,
          errorName: error.name
        }
      : error;

    this.log('error', message, metadata);
  }

  /**
   * Log fatal error
   * @param {string} message - Log message
   * @param {Object} error - Error object or metadata
   */
  fatal(message, error = {}) {
    const metadata = error instanceof Error 
      ? {
          errorMessage: error.message,
          errorStack: error.stack,
          errorName: error.name
        }
      : error;

    this.log('fatal', message, metadata);
  }

  /**
   * Set log level
   * @param {string} level - New log level
   */
  setLevel(level) {
    if (this.levels[level] === undefined) {
      throw new Error(`Invalid log level: ${level}`);
    }
    this.logLevel = level;
    this.currentLevel = this.levels[level];
  }

  /**
   * Get current log level
   * @returns {string} - Current log level
   */
  getLevel() {
    return this.logLevel;
  }

  /**
   * Clear all log files
   */
  clearLogs() {
    try {
      const files = fs.readdirSync(this.logDir);
      files.forEach(file => {
        if (file.endsWith('.log')) {
          fs.unlinkSync(path.join(this.logDir, file));
        }
      });
      this.info('All log files cleared');
    } catch (error) {
      console.error(`Failed to clear log files: ${error.message}`);
    }
  }

  /**
   * Get log file contents
   * @param {string} level - Log level
   * @param {number} lines - Number of lines to retrieve (0 = all)
   * @returns {string} - Log file contents
   */
  getLogContents(level, lines = 0) {
    try {
      const filePath = this.getLogFilePath(level);
      if (!fs.existsSync(filePath)) {
        return '';
      }

      let content = fs.readFileSync(filePath, 'utf8');

      if (lines > 0) {
        const logLines = content.split('\n');
        content = logLines.slice(-lines).join('\n');
      }

      return content;
    } catch (error) {
      return `Error reading log file: ${error.message}`;
    }
  }

  /**
   * Get statistics about logs
   * @returns {Object} - Log statistics
   */
  getStats() {
    try {
      const stats = {};
      const files = fs.readdirSync(this.logDir);

      files.forEach(file => {
        if (file.endsWith('.log')) {
          const filePath = path.join(this.logDir, file);
          const fileStats = fs.statSync(filePath);
          stats[file] = {
            size: fileStats.size,
            sizeKB: (fileStats.size / 1024).toFixed(2),
            modified: fileStats.mtime.toISOString()
          };
        }
      });

      return stats;
    } catch (error) {
      return { error: error.message };
    }
  }
}

// Create default logger instance
const defaultLogger = new Logger({
  logLevel: process.env.LOG_LEVEL || 'info',
  enableConsole: process.env.NODE_ENV !== 'production',
  enableFile: true
});

module.exports = {
  Logger,
  logger: defaultLogger,
  // Convenience exports
  debug: (msg, meta) => defaultLogger.debug(msg, meta),
  info: (msg, meta) => defaultLogger.info(msg, meta),
  warn: (msg, meta) => defaultLogger.warn(msg, meta),
  error: (msg, err) => defaultLogger.error(msg, err),
  fatal: (msg, err) => defaultLogger.fatal(msg, err),
  setLevel: (level) => defaultLogger.setLevel(level),
  getLevel: () => defaultLogger.getLevel(),
  clearLogs: () => defaultLogger.clearLogs(),
  getLogContents: (level, lines) => defaultLogger.getLogContents(level, lines),
  getStats: () => defaultLogger.getStats()
};
