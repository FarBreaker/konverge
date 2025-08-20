/**
 * Tests for init command.
 */

import { InitCommand } from '../../../src/cli/commands/init-command';
import { Argv } from 'yargs';

describe('InitCommand', () => {
  let command: InitCommand;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    command = new InitCommand();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('properties', () => {
    it('should have correct name and description', () => {
      expect(command.name).toBe('init');
      expect(command.description).toBe('Initialize a new Konverge project');
    });
  });

  describe('configure', () => {
    it('should configure yargs with correct options', () => {
      const mockYargs = {
        option: jest.fn().mockReturnThis(),
        example: jest.fn().mockReturnThis(),
      } as unknown as Argv;

      command.configure(mockYargs);

      expect(mockYargs.option).toHaveBeenCalledWith('name', expect.objectContaining({
        alias: 'n',
        type: 'string',
        description: expect.stringContaining('Project name'),
      }));

      expect(mockYargs.option).toHaveBeenCalledWith('force', expect.objectContaining({
        alias: 'f',
        type: 'boolean',
        default: false,
        description: expect.stringContaining('Force initialization'),
      }));

      expect(mockYargs.example).toHaveBeenCalledTimes(3);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      // Mock process.cwd
      jest.spyOn(process, 'cwd').mockReturnValue('/test/dir');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should validate arguments and show project name', async () => {
      // This test focuses on the argument handling logic
      // The actual file operations are tested in integration tests
      
      const args = { name: 'my-custom-app', _: [], $0: 'konverge' };
      
      // Mock the private methods to avoid file system operations
      const createStructureSpy = jest.spyOn(command as any, 'createProjectStructure').mockResolvedValue(undefined);
      const generatePackageSpy = jest.spyOn(command as any, 'generatePackageJson').mockResolvedValue(undefined);
      const generateTsConfigSpy = jest.spyOn(command as any, 'generateTsConfig').mockResolvedValue(undefined);
      const generateSampleSpy = jest.spyOn(command as any, 'generateSampleApp').mockResolvedValue(undefined);
      const generateGitIgnoreSpy = jest.spyOn(command as any, 'generateGitIgnore').mockResolvedValue(undefined);
      const isEmptySpy = jest.spyOn(command as any, 'isDirectoryNotEmpty').mockReturnValue(false);

      await command.execute(args);

      expect(consoleSpy).toHaveBeenCalledWith('ℹ Initializing Konverge project...');
      expect(consoleSpy).toHaveBeenCalledWith('ℹ Project name: my-custom-app');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Project initialized successfully!');
      
      expect(createStructureSpy).toHaveBeenCalled();
      expect(generatePackageSpy).toHaveBeenCalled();
      expect(generateTsConfigSpy).toHaveBeenCalled();
      expect(generateSampleSpy).toHaveBeenCalled();
      expect(generateGitIgnoreSpy).toHaveBeenCalled();
      expect(isEmptySpy).toHaveBeenCalled();
    });
  });
});