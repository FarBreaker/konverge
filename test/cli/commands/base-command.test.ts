/**
 * Tests for base command functionality.
 */

import { BaseCommand } from '../../../src/cli/commands/base-command';
import { ArgumentsCamelCase, Argv } from 'yargs';

// Concrete implementation for testing
class TestCommand extends BaseCommand {
  public readonly name = 'test';
  public readonly description = 'Test command';

  public async execute(_args: ArgumentsCamelCase<any>): Promise<void> {
    // Test implementation
  }
}

describe('BaseCommand', () => {
  let command: TestCommand;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    command = new TestCommand();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('validateArgs', () => {
    it('should not throw for valid arguments', () => {
      const args = { name: 'test', value: 123, _: [], $0: 'test' };
      expect(() => command['validateArgs'](args, ['name', 'value'])).not.toThrow();
    });

    it('should throw for missing required arguments', () => {
      const args = { name: 'test', _: [], $0: 'test' };
      expect(() => command['validateArgs'](args, ['name', 'missing']))
        .toThrow('Missing required arguments: missing');
    });

    it('should throw for multiple missing arguments', () => {
      const args = { _: [], $0: 'test' };
      expect(() => command['validateArgs'](args, ['name', 'value']))
        .toThrow('Missing required arguments: name, value');
    });

    it('should handle null and undefined values as missing', () => {
      const args = { name: null, value: undefined, _: [], $0: 'test' };
      expect(() => command['validateArgs'](args, ['name', 'value']))
        .toThrow('Missing required arguments: name, value');
    });
  });

  describe('logging methods', () => {
    it('should log info messages with correct format', () => {
      command['logInfo']('test message');
      expect(consoleSpy).toHaveBeenCalledWith('ℹ test message');
    });

    it('should log success messages with correct format', () => {
      command['logSuccess']('test success');
      expect(consoleSpy).toHaveBeenCalledWith('✅ test success');
    });

    it('should log warning messages with correct format', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
      command['logWarning']('test warning');
      expect(warnSpy).toHaveBeenCalledWith('⚠️  test warning');
      warnSpy.mockRestore();
    });

    it('should log error messages with correct format', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      command['logError']('test error');
      expect(errorSpy).toHaveBeenCalledWith('❌ test error');
      errorSpy.mockRestore();
    });
  });

  describe('configure', () => {
    it('should return yargs instance unchanged by default', () => {
      const mockYargs = {} as Argv;
      const result = command.configure(mockYargs);
      expect(result).toBe(mockYargs);
    });
  });
});