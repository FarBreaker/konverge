/**
 * Tests for CLI framework and command registration.
 */

import { CLI } from '../../src/cli';
import { BaseCommand } from '../../src/cli/commands/base-command';
import { ArgumentsCamelCase, Argv } from 'yargs';

// Mock command for testing
class MockCommand extends BaseCommand {
  public readonly name = 'mock';
  public readonly description = 'Mock command for testing';
  public executed = false;
  public executedArgs: any = null;

  public configure(yargs: Argv): Argv {
    return yargs.option('test', {
      type: 'string',
      description: 'Test option'
    });
  }

  public async execute(args: ArgumentsCamelCase<any>): Promise<void> {
    this.executed = true;
    this.executedArgs = args;
  }
}

// Second mock command for testing
class MockCommand2 extends BaseCommand {
  public readonly name = 'mock2';
  public readonly description = 'Second mock command for testing';

  public async execute(_args: ArgumentsCamelCase<any>): Promise<void> {
    // Test implementation
  }
}

describe('CLI', () => {
  let cli: CLI;

  beforeEach(() => {
    cli = new CLI();
  });

  describe('command registration', () => {
    it('should register commands correctly', () => {
      const mockCommand = new MockCommand();
      cli.registerCommand(mockCommand);

      const retrievedCommand = cli.getCommand('mock');
      expect(retrievedCommand).toBe(mockCommand);
    });

    it('should return undefined for non-existent commands', () => {
      const command = cli.getCommand('nonexistent');
      expect(command).toBeUndefined();
    });

    it('should return all registered commands', () => {
      const mockCommand1 = new MockCommand();
      const mockCommand2 = new MockCommand2();

      cli.registerCommand(mockCommand1);
      cli.registerCommand(mockCommand2);

      const commands = cli.getCommands();
      expect(commands).toHaveLength(4); // 2 mock + 2 default (init, synth)
      expect(commands).toContain(mockCommand1);
      expect(commands).toContain(mockCommand2);
    });
  });

  describe('default commands', () => {
    it('should have init command registered by default', () => {
      const initCommand = cli.getCommand('init');
      expect(initCommand).toBeDefined();
      expect(initCommand?.name).toBe('init');
      expect(initCommand?.description).toContain('Initialize');
    });

    it('should have synth command registered by default', () => {
      const synthCommand = cli.getCommand('synth');
      expect(synthCommand).toBeDefined();
      expect(synthCommand?.name).toBe('synth');
      expect(synthCommand?.description).toContain('Synthesize');
    });
  });
});