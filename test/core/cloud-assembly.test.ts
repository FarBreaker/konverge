import { CloudAssembly } from '../../src/core/app';
import { KubernetesManifest } from '../../src/core/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('CloudAssembly', () => {
  let tempDir: string;
  let assembly: CloudAssembly;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-assembly-test-'));
    assembly = new CloudAssembly(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    it('should create assembly with default directory', () => {
      const defaultAssembly = new CloudAssembly();
      expect(defaultAssembly.directory).toBe('./cdk.out');
    });

    it('should create assembly with custom directory', () => {
      expect(assembly.directory).toBe(tempDir);
    });
  });

  describe('addStackManifests', () => {
    it('should add stack manifests correctly', () => {
      const manifests: KubernetesManifest[] = [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'test-config' }
        }
      ];

      assembly.addStackManifests('test-stack', manifests);

      expect(assembly.stacks).toHaveLength(1);
      expect(assembly.stacks[0].stackName).toBe('test-stack');
      expect(assembly.stacks[0].manifests).toEqual(manifests);
    });

    it('should handle multiple stacks', () => {
      const manifests1: KubernetesManifest[] = [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'config1' }
        }
      ];

      const manifests2: KubernetesManifest[] = [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'deploy1' }
        }
      ];

      assembly.addStackManifests('stack1', manifests1);
      assembly.addStackManifests('stack2', manifests2);

      expect(assembly.stacks).toHaveLength(2);
      expect(assembly.resourceCount).toBe(2);
    });
  });

  describe('getStackManifests', () => {
    it('should return stack manifests by name', () => {
      const manifests: KubernetesManifest[] = [
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'test-service' }
        }
      ];

      assembly.addStackManifests('test-stack', manifests);

      const retrieved = assembly.getStackManifests('test-stack');
      expect(retrieved).toBeDefined();
      expect(retrieved!.stackName).toBe('test-stack');
      expect(retrieved!.manifests).toEqual(manifests);
    });

    it('should return undefined for non-existent stack', () => {
      const retrieved = assembly.getStackManifests('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('resourceCount', () => {
    it('should return zero for empty assembly', () => {
      expect(assembly.resourceCount).toBe(0);
    });

    it('should count resources across all stacks', () => {
      assembly.addStackManifests('stack1', [
        { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'config1' } },
        { apiVersion: 'v1', kind: 'Service', metadata: { name: 'service1' } }
      ]);

      assembly.addStackManifests('stack2', [
        { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'deploy1' } }
      ]);

      expect(assembly.resourceCount).toBe(3);
    });
  });

  describe('getAllManifests', () => {
    it('should return empty array for empty assembly', () => {
      expect(assembly.getAllManifests()).toEqual([]);
    });

    it('should return all manifests from all stacks', () => {
      const manifests1 = [
        { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'config1' } }
      ];
      const manifests2 = [
        { apiVersion: 'v1', kind: 'Service', metadata: { name: 'service1' } }
      ];

      assembly.addStackManifests('stack1', manifests1);
      assembly.addStackManifests('stack2', manifests2);

      const allManifests = assembly.getAllManifests();
      expect(allManifests).toHaveLength(2);
      expect(allManifests).toContain(manifests1[0]);
      expect(allManifests).toContain(manifests2[0]);
    });
  });

  describe('writeToDirectory', () => {
    it('should create output directory if it does not exist', async () => {
      const nonExistentDir = path.join(tempDir, 'nested', 'directory');
      const assemblyWithNestedDir = new CloudAssembly(nonExistentDir);

      assemblyWithNestedDir.addStackManifests('test-stack', [
        { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'test-config' } }
      ]);

      await assemblyWithNestedDir.writeToDirectory();

      expect(fs.existsSync(nonExistentDir)).toBe(true);
    });

    it('should write stack YAML files', async () => {
      const manifests: KubernetesManifest[] = [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'test-config' }
        }
      ];

      assembly.addStackManifests('test-stack', manifests);
      await assembly.writeToDirectory();

      const stackFile = path.join(tempDir, 'test-stack.yaml');
      expect(fs.existsSync(stackFile)).toBe(true);

      const content = fs.readFileSync(stackFile, 'utf8');
      expect(content).toContain('ConfigMap');
      expect(content).toContain('test-config');
    });

    it('should write assembly manifest file', async () => {
      assembly.addStackManifests('stack1', [
        { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'config1' } }
      ]);
      assembly.addStackManifests('stack2', [
        { apiVersion: 'v1', kind: 'Service', metadata: { name: 'service1' } },
        { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'deploy1' } }
      ]);

      await assembly.writeToDirectory();

      const manifestFile = path.join(tempDir, 'assembly-manifest.json');
      expect(fs.existsSync(manifestFile)).toBe(true);

      const manifestContent = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      expect(manifestContent.version).toBe('1.0.0');
      expect(manifestContent.stacks).toHaveLength(2);
      expect(manifestContent.totalResources).toBe(3);
      expect(manifestContent.generatedAt).toBeDefined();

      // Check stack entries
      const stack1Entry = manifestContent.stacks.find((s: any) => s.name === 'stack1');
      expect(stack1Entry).toBeDefined();
      expect(stack1Entry.file).toBe('stack1.yaml');
      expect(stack1Entry.resourceCount).toBe(1);

      const stack2Entry = manifestContent.stacks.find((s: any) => s.name === 'stack2');
      expect(stack2Entry).toBeDefined();
      expect(stack2Entry.file).toBe('stack2.yaml');
      expect(stack2Entry.resourceCount).toBe(2);
    });

    it('should handle multiple stacks with document separators', async () => {
      assembly.addStackManifests('multi-resource-stack', [
        { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'config1' } },
        { apiVersion: 'v1', kind: 'Service', metadata: { name: 'service1' } }
      ]);

      await assembly.writeToDirectory();

      const stackFile = path.join(tempDir, 'multi-resource-stack.yaml');
      const content = fs.readFileSync(stackFile, 'utf8');
      
      // Should contain document separator between resources
      expect(content).toContain('---');
      expect(content).toContain('ConfigMap');
      expect(content).toContain('Service');
    });

    it('should handle empty stacks', async () => {
      assembly.addStackManifests('empty-stack', []);
      await assembly.writeToDirectory();

      const stackFile = path.join(tempDir, 'empty-stack.yaml');
      expect(fs.existsSync(stackFile)).toBe(true);

      const content = fs.readFileSync(stackFile, 'utf8');
      expect(content).toBe('');
    });
  });
});