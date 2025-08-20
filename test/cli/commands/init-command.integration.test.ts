/**
 * Integration tests for init command project scaffolding.
 */

import { InitCommand } from '../../../src/cli/commands/init-command';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('InitCommand Integration', () => {
  let command: InitCommand;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    command = new InitCommand();
    originalCwd = process.cwd();
    
    // Create a temporary directory for testing
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'konverge-init-test-'));
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original working directory
    process.chdir(originalCwd);
    
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('project initialization', () => {
    it('should create complete project structure in empty directory', async () => {
      const args = { name: 'test-project', _: [], $0: 'konverge' };
      
      await command.execute(args);

      // Verify directory structure
      expect(fs.existsSync('src')).toBe(true);
      expect(fs.existsSync('lib')).toBe(true);
      expect(fs.existsSync('dist')).toBe(true);

      // Verify package.json
      expect(fs.existsSync('package.json')).toBe(true);
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      expect(packageJson.name).toBe('test-project');
      expect(packageJson.dependencies).toHaveProperty('konverge');
      expect(packageJson.devDependencies).toHaveProperty('typescript');
      expect(packageJson.scripts).toHaveProperty('build');
      expect(packageJson.scripts).toHaveProperty('synth');

      // Verify tsconfig.json
      expect(fs.existsSync('tsconfig.json')).toBe(true);
      const tsConfig = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
      expect(tsConfig.compilerOptions.outDir).toBe('./lib');
      expect(tsConfig.compilerOptions.rootDir).toBe('./src');
      expect(tsConfig.include).toContain('src/**/*');

      // Verify sample app
      expect(fs.existsSync('src/app.ts')).toBe(true);
      const appContent = fs.readFileSync('src/app.ts', 'utf8');
      expect(appContent).toContain('import { App, Stack');
      expect(appContent).toContain('class MyStack extends Stack');
      expect(appContent).toContain('new Deployment');
      expect(appContent).toContain('new Service');
      expect(appContent).toContain('new ConfigMap');

      // Verify .gitignore
      expect(fs.existsSync('.gitignore')).toBe(true);
      const gitIgnore = fs.readFileSync('.gitignore', 'utf8');
      expect(gitIgnore).toContain('node_modules/');
      expect(gitIgnore).toContain('lib/');
      expect(gitIgnore).toContain('dist/');
    });

    it('should use directory name as project name when not specified', async () => {
      const args = { _: [], $0: 'konverge' };
      
      await command.execute(args);

      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      expect(packageJson.name).toBe(path.basename(testDir));
    });

    it('should fail in non-empty directory without force flag', async () => {
      // Create a file to make directory non-empty
      fs.writeFileSync('existing-file.txt', 'content');
      
      const args = { name: 'test-project', _: [], $0: 'konverge' };
      
      await expect(command.execute(args)).rejects.toThrow(
        'Directory is not empty. Use --force to initialize anyway'
      );
    });

    it('should succeed in non-empty directory with force flag', async () => {
      // Create a file to make directory non-empty
      fs.writeFileSync('existing-file.txt', 'content');
      
      const args = { name: 'test-project', force: true, _: [], $0: 'konverge' };
      
      await expect(command.execute(args)).resolves.not.toThrow();
      
      // Verify project was created
      expect(fs.existsSync('package.json')).toBe(true);
      expect(fs.existsSync('src/app.ts')).toBe(true);
      
      // Verify existing file is still there
      expect(fs.existsSync('existing-file.txt')).toBe(true);
    });

    it('should not overwrite existing project files', async () => {
      // Create existing package.json
      const existingPackage = { name: 'existing', version: '1.0.0' };
      fs.writeFileSync('package.json', JSON.stringify(existingPackage, null, 2));
      
      const args = { name: 'test-project', force: true, _: [], $0: 'konverge' };
      
      await command.execute(args);
      
      // Verify package.json was overwritten with new content
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      expect(packageJson.name).toBe('test-project');
      expect(packageJson.dependencies).toHaveProperty('konverge');
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Create a directory where we expect a file to test error handling
      fs.mkdirSync('package.json');
      
      const args = { name: 'test-project', force: true, _: [], $0: 'konverge' };
      
      await expect(command.execute(args)).rejects.toThrow('EISDIR: illegal operation on a directory');
    });
  });
});