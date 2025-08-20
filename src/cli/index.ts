/**
 * CLI entry point for Konverge.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { CLICommand } from './commands/base-command';
import { InitCommand } from './commands/init-command';
import { SynthCommand } from './commands/synth-command';

/**
 * CLI application class that manages command registration and execution.
 */
export class CLI {
  private commands: Map<string, CLICommand> = new Map();

  constructor() {
    this.registerCommands();
  }

  /**
   * Register all available CLI commands.
   */
  private registerCommands(): void {
    this.registerCommand(new InitCommand());
    this.registerCommand(new SynthCommand());
  }

  /**
   * Register a single command with the CLI.
   */
  public registerCommand(command: CLICommand): void {
    this.commands.set(command.name, command);
  }

  /**
   * Get a registered command by name.
   */
  public getCommand(name: string): CLICommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Get all registered commands.
   */
  public getCommands(): CLICommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Run the CLI with the provided arguments.
   */
  public async run(argv: string[] = process.argv): Promise<void> {
    let yargsInstance = yargs(hideBin(argv))
      .scriptName('konverge')
      .usage('Usage: $0 <command> [options]')
      .help('h')
      .alias('h', 'help')
      .version()
      .demandCommand(1, 'You must specify a command')
      .strict()
      .fail((msg, err, _yargs) => {
        if (err) {
          console.error('Error:', err.message);
        } else {
          console.error('Error:', msg);
        }
        console.error('\nUse --help for usage information');
        process.exit(1);
      });

    // Register each command with yargs
    for (const command of this.commands.values()) {
      yargsInstance = yargsInstance.command(
        command.name,
        command.description,
        (yargs) => command.configure(yargs),
        async (argv) => {
          try {
            await command.execute(argv);
          } catch (error) {
            console.error(`Error executing ${command.name}:`, error instanceof Error ? error.message : error);
            process.exit(1);
          }
        }
      );
    }

    // Parse and execute
    await yargsInstance.parse();
  }
}

/**
 * Main CLI entry point.
 */
export async function main(): Promise<void> {
  const cli = new CLI();
  await cli.run();
}

// Run CLI if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}