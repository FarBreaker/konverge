/**
 * Base command interface and abstract class for CLI commands.
 */

import { Argv, ArgumentsCamelCase } from 'yargs';

/**
 * Interface for CLI command implementations.
 */
export interface CLICommand {
  /** Command name used in CLI */
  readonly name: string;
  
  /** Command description shown in help */
  readonly description: string;
  
  /**
   * Configure yargs for this command (add options, arguments, etc.)
   */
  configure(yargs: Argv): Argv;
  
  /**
   * Execute the command with parsed arguments.
   */
  execute(args: ArgumentsCamelCase<any>): Promise<void>;
}

/**
 * Abstract base class for CLI commands with common functionality.
 */
export abstract class BaseCommand implements CLICommand {
  public abstract readonly name: string;
  public abstract readonly description: string;

  /**
   * Default configuration - can be overridden by subclasses.
   */
  public configure(yargs: Argv): Argv {
    return yargs;
  }

  /**
   * Abstract execute method to be implemented by subclasses.
   */
  public abstract execute(args: ArgumentsCamelCase<any>): Promise<void>;

  /**
   * Validate required arguments are present.
   */
  protected validateArgs(args: ArgumentsCamelCase<any>, required: string[]): void {
    const missing = required.filter(arg => args[arg] === undefined || args[arg] === null);
    if (missing.length > 0) {
      throw new Error(`Missing required arguments: ${missing.join(', ')}`);
    }
  }

  /**
   * Log info message with consistent formatting.
   */
  protected logInfo(message: string): void {
    console.log(`ℹ ${message}`);
  }

  /**
   * Log success message with consistent formatting.
   */
  protected logSuccess(message: string): void {
    console.log(`✅ ${message}`);
  }

  /**
   * Log warning message with consistent formatting.
   */
  protected logWarning(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  /**
   * Log error message with consistent formatting.
   */
  protected logError(message: string): void {
    console.error(`❌ ${message}`);
  }
}