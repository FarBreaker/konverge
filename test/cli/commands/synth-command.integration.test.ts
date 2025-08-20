/**
 * Integration tests for the synth command.
 */

import { SynthCommand } from '../../../src/cli/commands/synth-command';
import { App } from '../../../src/core';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { ArgumentsCamelCase } from 'yargs';

// Helper function to create test arguments
function createTestArgs(overrides: any = {}): ArgumentsCamelCase<any> {
  return {
    _: [],
    $0: 'konverge',
    app: 'app.ts',
    output: 'dist',
    quiet: false,
    ...overrides
  } as ArgumentsCamelCase<any>;
}

describe('SynthCommand Integration Tests', () => {
  let synthCommand: SynthCommand;
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    synthCommand = new SynthCommand();
    originalCwd = process.cwd();
    
    // Clear global app registration
    if (typeof global !== 'undefined') {
      delete (global as any).__k8sCdkApp;
    }
    
    // Create a temporary test directory
    testDir = path.join(__dirname, '..', '..', '..', 'test-temp', `synth-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);
  });

  afterEach(() => {
    // Clean up
    process.chdir(originalCwd);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('execute', () => {
    it('should synthesize a simple app with compiled JavaScript', async () => {
      // Create lib directory and compiled app
      fs.mkdirSync('lib', { recursive: true });
      
      const appCode = `
        const { App, Stack } = require('../../../src/core');
        const { Deployment, Service, ConfigMap } = require('../../../src/constructs');
        
        class TestStack extends Stack {
          constructor(scope, id) {
            super(scope, id, { namespace: 'test' });
            
            const configMap = new ConfigMap(this, 'test-config', {
              metadata: { name: 'test-config' }
            });
            configMap.addData('key1', 'value1');
            
            const deployment = new Deployment(this, 'test-deployment', {
              metadata: { name: 'test-app' },
              replicas: 2,
              selector: { matchLabels: { app: 'test' } },
              template: {
                metadata: { labels: { app: 'test' } },
                spec: {
                  containers: [{
                    name: 'app',
                    image: 'nginx:latest',
                    ports: [{ containerPort: 80 }]
                  }]
                }
              }
            });
            
            const service = new Service(this, 'test-service', {
              metadata: { name: 'test-service' },
              selector: { app: 'test' },
              ports: [{ port: 80, targetPort: 80 }],
              type: 'ClusterIP'
            });
          }
        }
        
        const app = new App();
        new TestStack(app, 'TestStack');
        
        module.exports = { app };
      `;
      
      fs.writeFileSync('lib/app.js', appCode);
      
      // Execute synth command
      await synthCommand.execute(createTestArgs({
        app: 'lib/app.js',
        output: 'output',
        quiet: true
      }));
      
      // Verify output directory was created
      expect(fs.existsSync('output')).toBe(true);
      
      // Verify stack YAML file was created
      const stackFile = path.join('output', 'TestStack.yaml');
      expect(fs.existsSync(stackFile)).toBe(true);
      
      // Verify assembly manifest was created
      const manifestFile = path.join('output', 'assembly-manifest.json');
      expect(fs.existsSync(manifestFile)).toBe(true);
      
      // Parse and verify the generated YAML
      const yamlContent = fs.readFileSync(stackFile, 'utf8');
      const documents = yaml.loadAll(yamlContent);
      
      expect(documents).toHaveLength(3); // ConfigMap, Deployment, Service
      
      // Verify ConfigMap
      const configMap = documents.find((doc: any) => doc.kind === 'ConfigMap') as any;
      expect(configMap).toBeDefined();
      expect(configMap.metadata.name).toBe('test-config');
      expect(configMap.metadata.namespace).toBe('test');
      expect(configMap.data.key1).toBe('value1');
      
      // Verify Deployment
      const deployment = documents.find((doc: any) => doc.kind === 'Deployment') as any;
      expect(deployment).toBeDefined();
      expect(deployment.metadata.name).toBe('test-app');
      expect(deployment.metadata.namespace).toBe('test');
      expect(deployment.spec.replicas).toBe(2);
      
      // Verify Service
      const service = documents.find((doc: any) => doc.kind === 'Service') as any;
      expect(service).toBeDefined();
      expect(service.metadata.name).toBe('test-service');
      expect(service.metadata.namespace).toBe('test');
      expect(service.spec.ports[0].port).toBe(80);
      
      // Verify assembly manifest
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      expect(manifest.stacks).toHaveLength(1);
      expect(manifest.stacks[0].name).toBe('TestStack');
      expect(manifest.stacks[0].resourceCount).toBe(3);
      expect(manifest.totalResources).toBe(3);
    });

    it('should handle TypeScript files by looking for compiled JavaScript', async () => {
      // Create src directory with TypeScript file
      fs.mkdirSync('src', { recursive: true });
      fs.mkdirSync('lib', { recursive: true });
      
      const jsCode = `
        const { App, Stack } = require('../../../src/core');
        const { ConfigMap } = require('../../../src/constructs');
        
        class SimpleStack extends Stack {
          constructor(scope, id) {
            super(scope, id);
            
            const configMap = new ConfigMap(this, 'simple-config', {
              metadata: { name: 'simple-config' }
            });
            configMap.addData('key1', 'value1');
          }
        }
        
        const app = new App();
        new SimpleStack(app, 'SimpleStack');
        
        module.exports = { app };
      `;
      
      fs.writeFileSync('src/app.ts', 'console.log("TypeScript file");');
      fs.writeFileSync('lib/app.js', jsCode);
      
      // Execute synth command with TypeScript file
      await synthCommand.execute(createTestArgs({
        app: 'src/app.ts',
        output: 'output',
        quiet: true
      }));
      
      // Verify output was generated
      expect(fs.existsSync('output')).toBe(true);
      expect(fs.existsSync('output/SimpleStack.yaml')).toBe(true);
    });

    it('should throw error when app file does not exist', async () => {
      await expect(synthCommand.execute(createTestArgs({
        app: 'nonexistent.js',
        output: 'output',
        quiet: true
      }))).rejects.toThrow('App file not found');
    });

    it('should throw error when TypeScript file exists but compiled JavaScript does not', async () => {
      fs.mkdirSync('src', { recursive: true });
      fs.writeFileSync('src/app.ts', 'console.log("test");');
      
      await expect(synthCommand.execute(createTestArgs({
        app: 'src/app.ts',
        output: 'output',
        quiet: true
      }))).rejects.toThrow('compiled JavaScript not found');
    });

    it('should throw error when no App instance is found in module', async () => {
      fs.mkdirSync('lib', { recursive: true });
      fs.writeFileSync('lib/app.js', 'module.exports = { notAnApp: "test" };');
      
      await expect(synthCommand.execute(createTestArgs({
        app: 'lib/app.js',
        output: 'output',
        quiet: true
      }))).rejects.toThrow('No App instance found');
    });

    it('should handle multiple stacks in a single app', async () => {
      fs.mkdirSync('lib', { recursive: true });
      
      const appCode = `
        const { App, Stack } = require('../../../src/core');
        const { ConfigMap } = require('../../../src/constructs');
        
        class Stack1 extends Stack {
          constructor(scope, id) {
            super(scope, id, { namespace: 'ns1' });
            const configMap = new ConfigMap(this, 'config1', {
              metadata: { name: 'config1' }
            });
            configMap.addData('key1', 'value1');
          }
        }
        
        class Stack2 extends Stack {
          constructor(scope, id) {
            super(scope, id, { namespace: 'ns2' });
            const configMap = new ConfigMap(this, 'config2', {
              metadata: { name: 'config2' }
            });
            configMap.addData('key2', 'value2');
          }
        }
        
        const app = new App();
        new Stack1(app, 'Stack1');
        new Stack2(app, 'Stack2');
        
        module.exports = { app };
      `;
      
      fs.writeFileSync('lib/app.js', appCode);
      
      await synthCommand.execute(createTestArgs({
        app: 'lib/app.js',
        output: 'output',
        quiet: true
      }));
      
      // Verify both stack files were created
      expect(fs.existsSync('output/Stack1.yaml')).toBe(true);
      expect(fs.existsSync('output/Stack2.yaml')).toBe(true);
      
      // Verify assembly manifest shows both stacks
      const manifest = JSON.parse(fs.readFileSync('output/assembly-manifest.json', 'utf8'));
      expect(manifest.stacks).toHaveLength(2);
      expect(manifest.totalResources).toBe(2);
    });

    it('should handle empty stacks gracefully', async () => {
      fs.mkdirSync('lib', { recursive: true });
      
      const appCode = `
        const { App, Stack } = require('../../../src/core');
        
        class EmptyStack extends Stack {
          constructor(scope, id) {
            super(scope, id);
            // No resources added
          }
        }
        
        const app = new App();
        new EmptyStack(app, 'EmptyStack');
        
        module.exports = { app };
      `;
      
      fs.writeFileSync('lib/app.js', appCode);
      
      await synthCommand.execute(createTestArgs({
        app: 'lib/app.js',
        output: 'output',
        quiet: true
      }));
      
      // Verify stack file was created but is empty
      expect(fs.existsSync('output/EmptyStack.yaml')).toBe(true);
      const yamlContent = fs.readFileSync('output/EmptyStack.yaml', 'utf8');
      expect(yamlContent.trim()).toBe('');
      
      // Verify assembly manifest shows zero resources
      const manifest = JSON.parse(fs.readFileSync('output/assembly-manifest.json', 'utf8'));
      expect(manifest.stacks[0].resourceCount).toBe(0);
      expect(manifest.totalResources).toBe(0);
    });

    it('should use default output directory when not specified', async () => {
      fs.mkdirSync('lib', { recursive: true });
      
      const appCode = `
        const { App, Stack } = require('../../../src/core');
        const { ConfigMap } = require('../../../src/constructs');
        
        class TestStack extends Stack {
          constructor(scope, id) {
            super(scope, id);
            const configMap = new ConfigMap(this, 'test-config', {
              metadata: { name: 'test-config' }
            });
            configMap.addData('key1', 'value1');
          }
        }
        
        const app = new App();
        new TestStack(app, 'TestStack');
        
        module.exports = { app };
      `;
      
      fs.writeFileSync('lib/app.js', appCode);
      
      await synthCommand.execute(createTestArgs({
        app: 'lib/app.js',
        quiet: true
      }));
      
      // Should use default 'dist' directory
      expect(fs.existsSync('dist')).toBe(true);
      expect(fs.existsSync('dist/TestStack.yaml')).toBe(true);
    });
  });

  describe('findAppInstance', () => {
    it('should find App instance exported as default', () => {
      const app = new App();
      const module = { default: app };
      
      const found = (synthCommand as any).findAppInstance(module);
      expect(found).toBe(app);
    });

    it('should find App instance exported as app property', () => {
      const app = new App();
      const module = { app };
      
      const found = (synthCommand as any).findAppInstance(module);
      expect(found).toBe(app);
    });

    it('should find App instance when module itself is an App', () => {
      const app = new App();
      
      const found = (synthCommand as any).findAppInstance(app);
      expect(found).toBe(app);
    });

    it('should find App instance in any exported property', () => {
      const app = new App();
      const module = { myApp: app, other: 'value' };
      
      const found = (synthCommand as any).findAppInstance(module);
      expect(found).toBe(app);
    });

    it('should return undefined when no App instance is found', () => {
      const module = { notAnApp: 'test', other: 42 };
      
      const found = (synthCommand as any).findAppInstance(module);
      expect(found).toBeUndefined();
    });
  });
});