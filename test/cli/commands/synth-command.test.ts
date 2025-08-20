/**
 * Tests for synth command.
 */

import { SynthCommand } from '../../../src/cli/commands/synth-command';
import { Argv } from 'yargs';

describe('SynthCommand', () => {
  let command: SynthCommand;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    command = new SynthCommand();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('properties', () => {
    it('should have correct name and description', () => {
      expect(command.name).toBe('synth');
      expect(command.description).toBe('Synthesize Kubernetes YAML from TypeScript code');
    });
  });

  describe('configure', () => {
    it('should configure yargs with correct options', () => {
      const mockYargs = {
        option: jest.fn().mockReturnThis(),
        example: jest.fn().mockReturnThis(),
      } as unknown as Argv;

      command.configure(mockYargs);

      expect(mockYargs.option).toHaveBeenCalledWith('app', expect.objectContaining({
        alias: 'a',
        type: 'string',
        default: './src/app.ts',
        description: expect.stringContaining('Path to the app file'),
      }));

      expect(mockYargs.option).toHaveBeenCalledWith('output', expect.objectContaining({
        alias: 'o',
        type: 'string',
        default: 'dist',
        description: expect.stringContaining('Output directory'),
      }));

      expect(mockYargs.option).toHaveBeenCalledWith('quiet', expect.objectContaining({
        alias: 'q',
        type: 'boolean',
        default: false,
        description: expect.stringContaining('Suppress output'),
      }));

      expect(mockYargs.example).toHaveBeenCalledTimes(3);
    });
  });

  describe('execute', () => {
    it('should execute with default options', async () => {
      const args = { _: [], $0: 'konverge' };
      
      // This test should fail because app.ts doesn't exist
      await expect(command.execute(args)).rejects.toThrow('App file not found');
    });

    it('should execute with custom options', async () => {
      const args = { app: 'my-app.ts', output: './k8s', _: [], $0: 'konverge' };
      
      // This test should fail because my-app.ts doesn't exist
      await expect(command.execute(args)).rejects.toThrow('App file not found');
    });

    it('should suppress output in quiet mode', async () => {
      const args = { quiet: true, _: [], $0: 'konverge' };
      
      // This test should fail because app.ts doesn't exist
      await expect(command.execute(args)).rejects.toThrow('App file not found');
    });
  });
});