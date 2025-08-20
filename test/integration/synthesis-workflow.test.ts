import { App, Stack } from '../../src/core';
import { Deployment, Service, ConfigMap } from '../../src/constructs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

describe('Synthesis Workflow Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synthesis-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Complete synthesis workflow', () => {
    it('should synthesize a complete application with multiple resources', async () => {
      // Create a complete application
      const app = new App();
      const stack = new Stack(app, 'MyStack', {
        namespace: 'test-namespace'
      });

      // Add a ConfigMap
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: {
          'app.properties': 'debug=true\nport=8080',
          'database.url': 'postgresql://localhost:5432/mydb'
        }
      });

      // Add a Deployment that references the ConfigMap
      new Deployment(stack, 'MyDeployment', {
        replicas: 3,
        selector: {
          matchLabels: { app: 'my-app' }
        },
        template: {
          metadata: {
            labels: { app: 'my-app' }
          },
          spec: {
            containers: [{
              name: 'app',
              image: 'nginx:1.21',
              ports: [{ containerPort: 8080 }],
              env: [{
                name: 'CONFIG_FILE',
                valueFrom: {
                  configMapKeyRef: {
                    name: configMap.metadata.name!,
                    key: 'app.properties'
                  }
                }
              }]
            }]
          }
        }
      });

      // Add a Service
      new Service(stack, 'MyService', {
        selector: { app: 'my-app' },
        ports: [{
          port: 80,
          targetPort: 8080,
          protocol: 'TCP'
        }],
        type: 'ClusterIP'
      });

      // Synthesize the application
      const assembly = app.synth(tempDir);

      // Verify assembly structure
      expect(assembly.stacks).toHaveLength(1);
      expect(assembly.resourceCount).toBe(3);

      // Write to directory
      await assembly.writeToDirectory();

      // Verify files were created
      const stackFile = path.join(tempDir, 'MyStack.yaml');
      const manifestFile = path.join(tempDir, 'assembly-manifest.json');

      expect(fs.existsSync(stackFile)).toBe(true);
      expect(fs.existsSync(manifestFile)).toBe(true);

      // Verify YAML content
      const yamlContent = fs.readFileSync(stackFile, 'utf8');
      expect(yamlContent).toContain('apiVersion: v1');
      expect(yamlContent).toContain('kind: ConfigMap');
      expect(yamlContent).toContain('kind: Deployment');
      expect(yamlContent).toContain('kind: Service');
      expect(yamlContent).toContain('---'); // Document separators

      // Parse and validate YAML structure
      const documents = yaml.loadAll(yamlContent);
      expect(documents).toHaveLength(3);

      // Verify resource ordering (ConfigMap should come before Deployment)
      const kinds = documents.map((doc: any) => doc.kind);
      const configMapIndex = kinds.indexOf('ConfigMap');
      const deploymentIndex = kinds.indexOf('Deployment');
      expect(configMapIndex).toBeLessThan(deploymentIndex);

      // Verify assembly manifest
      const assemblyManifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      expect(assemblyManifest.version).toBe('1.0.0');
      expect(assemblyManifest.stacks).toHaveLength(1);
      expect(assemblyManifest.totalResources).toBe(3);
      expect(assemblyManifest.stacks[0].name).toBe('MyStack');
      expect(assemblyManifest.stacks[0].resourceCount).toBe(3);
    });

    it('should handle multiple stacks with proper resource ordering', async () => {
      const app = new App();
      
      // Create first stack with infrastructure resources
      const infraStack = new Stack(app, 'InfraStack');
      new ConfigMap(infraStack, 'SharedConfig', {
        data: { 'shared.key': 'shared.value' }
      });

      // Create second stack with application resources
      const appStack = new Stack(app, 'AppStack');
      new Deployment(appStack, 'WebApp', {
        replicas: 2,
        selector: { matchLabels: { app: 'webapp' } },
        template: {
          metadata: { labels: { app: 'webapp' } },
          spec: {
            containers: [{
              name: 'web',
              image: 'nginx:latest',
              ports: [{ containerPort: 80 }]
            }]
          }
        }
      });

      new Service(appStack, 'WebService', {
        selector: { app: 'webapp' },
        ports: [{ port: 80, targetPort: 80 }]
      });

      // Synthesize
      const assembly = app.synth(tempDir);
      await assembly.writeToDirectory();

      // Verify both stack files exist
      expect(fs.existsSync(path.join(tempDir, 'InfraStack.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'AppStack.yaml'))).toBe(true);

      // Verify assembly manifest shows both stacks
      const assemblyManifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'assembly-manifest.json'), 'utf8'));
      expect(assemblyManifest.stacks).toHaveLength(2);
      expect(assemblyManifest.totalResources).toBe(3);
    });

    it('should validate YAML output against Kubernetes schemas', async () => {
      const app = new App();
      const stack = new Stack(app, 'ValidationStack');

      // Create a deployment with all required fields
      new Deployment(stack, 'ValidDeployment', {
        replicas: 1,
        selector: {
          matchLabels: { app: 'valid-app' }
        },
        template: {
          metadata: {
            labels: { app: 'valid-app' }
          },
          spec: {
            containers: [{
              name: 'app',
              image: 'nginx:1.21'
            }]
          }
        }
      });

      // Synthesize and write
      const assembly = app.synth(tempDir);
      await assembly.writeToDirectory();

      // Read and parse the generated YAML
      const yamlContent = fs.readFileSync(path.join(tempDir, 'ValidationStack.yaml'), 'utf8');
      const documents = yaml.loadAll(yamlContent);

      // Validate the deployment structure
      const deployment = documents.find((doc: any) => doc.kind === 'Deployment') as any;
      expect(deployment).toBeDefined();
      expect(deployment.apiVersion).toBe('apps/v1');
      expect(deployment.metadata.name).toBeDefined();
      expect(deployment.spec.replicas).toBe(1);
      expect(deployment.spec.selector).toBeDefined();
      expect(deployment.spec.template).toBeDefined();
    });

    it('should handle empty stacks gracefully', async () => {
      const app = new App();
      new Stack(app, 'EmptyStack');

      const assembly = app.synth(tempDir);
      await assembly.writeToDirectory();

      // Verify empty stack file is created but empty
      const stackFile = path.join(tempDir, 'EmptyStack.yaml');
      expect(fs.existsSync(stackFile)).toBe(true);
      
      const content = fs.readFileSync(stackFile, 'utf8');
      expect(content.trim()).toBe('');

      // Verify assembly manifest reflects empty stack
      const assemblyManifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'assembly-manifest.json'), 'utf8'));
      expect(assemblyManifest.stacks[0].resourceCount).toBe(0);
      expect(assemblyManifest.totalResources).toBe(0);
    });

    it('should preserve resource metadata and annotations', async () => {
      const app = new App();
      const stack = new Stack(app, 'MetadataStack');

      // Create a resource with custom metadata
      new ConfigMap(stack, 'MetadataConfigMap', {
        metadata: {
          labels: {
            'app.kubernetes.io/name': 'my-app',
            'app.kubernetes.io/version': '1.0.0'
          },
          annotations: {
            'description': 'Configuration for my application',
            'owner': 'platform-team'
          }
        },
        data: {
          'config.yaml': 'key: value'
        }
      });

      const assembly = app.synth(tempDir);
      await assembly.writeToDirectory();

      // Parse the generated YAML
      const yamlContent = fs.readFileSync(path.join(tempDir, 'MetadataStack.yaml'), 'utf8');
      const documents = yaml.loadAll(yamlContent);
      const configMap = documents[0] as any;

      // Verify custom metadata is preserved
      expect(configMap.metadata.labels['app.kubernetes.io/name']).toBe('my-app');
      expect(configMap.metadata.labels['app.kubernetes.io/version']).toBe('1.0.0');
      expect(configMap.metadata.annotations['description']).toBe('Configuration for my application');
      expect(configMap.metadata.annotations['owner']).toBe('platform-team');

      // Verify synthesis annotations are added
      expect(configMap.metadata.annotations['konverge.io/synthesized-at']).toBeDefined();
      expect(configMap.metadata.annotations['konverge.io/construct-path']).toBeDefined();
    });
  });

  describe('YAML formatting validation', () => {
    it('should produce valid YAML with proper document separators', async () => {
      const app = new App();
      const stack = new Stack(app, 'FormatStack');

      new ConfigMap(stack, 'Config1', { data: { key1: 'value1' } });
      new ConfigMap(stack, 'Config2', { data: { key2: 'value2' } });

      const assembly = app.synth(tempDir);
      await assembly.writeToDirectory();

      const yamlContent = fs.readFileSync(path.join(tempDir, 'FormatStack.yaml'), 'utf8');
      
      // Should contain document separator
      expect(yamlContent).toContain('---');
      
      // Should be parseable as multiple YAML documents
      const documents = yaml.loadAll(yamlContent);
      expect(documents).toHaveLength(2);
      
      // Each document should be valid
      documents.forEach((doc: any) => {
        expect(doc.apiVersion).toBeDefined();
        expect(doc.kind).toBeDefined();
        expect(doc.metadata).toBeDefined();
      });
    });

    it('should handle special characters and multiline strings in YAML', async () => {
      const app = new App();
      const stack = new Stack(app, 'SpecialCharsStack');

      new ConfigMap(stack, 'SpecialConfig', {
        data: {
          'multiline': 'line1\nline2\nline3',
          'special-chars': 'value with "quotes" and \'apostrophes\'',
          'unicode': 'Hello 世界 🌍',
          'yaml-special': 'key: value\n- item1\n- item2'
        }
      });

      const assembly = app.synth(tempDir);
      await assembly.writeToDirectory();

      const yamlContent = fs.readFileSync(path.join(tempDir, 'SpecialCharsStack.yaml'), 'utf8');
      
      // Should be parseable despite special characters
      const documents = yaml.loadAll(yamlContent);
      expect(documents).toHaveLength(1);
      
      const configMap = documents[0] as any;
      expect(configMap.data['multiline']).toContain('\n');
      expect(configMap.data['special-chars']).toContain('"');
      expect(configMap.data['unicode']).toContain('世界');
    });
  });

  describe('Error handling and validation', () => {
    it('should throw error for invalid resource names', () => {
      const app = new App();
      const stack = new Stack(app, 'ErrorStack');

      // Create a resource with invalid name
      const configMap = new ConfigMap(stack, 'InvalidConfig', {
        data: { key: 'value' }
      });

      // Manually set invalid name to test validation
      configMap.metadata.name = 'Invalid_Name_With_Underscores';

      // Should throw validation error during synthesis
      expect(() => app.synth(tempDir)).toThrow(/Validation failed/);
    });

    it('should throw error for missing required fields', () => {
      const app = new App();
      const stack = new Stack(app, 'ErrorStack');

      const configMap = new ConfigMap(stack, 'MissingFieldsConfig', {
        data: { key: 'value' }
      });

      // Remove required field to test validation
      delete (configMap as any).metadata.name;

      // Should throw validation error during synthesis
      expect(() => app.synth(tempDir)).toThrow(/Validation failed/);
    });

    it('should validate label key and value formats during YAML generation', async () => {
      const app = new App();
      const stack = new Stack(app, 'LabelValidationStack');

      new ConfigMap(stack, 'LabelConfig', {
        metadata: {
          labels: {
            'valid-label': 'valid-value',
            'kubernetes.io/name': 'also-valid'
          }
        },
        data: { key: 'value' }
      });

      // Synthesize first (this should work)
      const assembly = app.synth(tempDir);

      // Manually add invalid label after synthesis to test YAML validation
      const stackManifest = assembly.getStackManifests('LabelValidationStack')!;
      const manifest = stackManifest.manifests[0];
      manifest.metadata.labels!['invalid label with spaces'] = 'value';

      // Should throw validation error during YAML generation
      await expect(assembly.writeToDirectory()).rejects.toThrow(/Invalid labels key/);
    });

    it('should validate API versions for known resource kinds', async () => {
      const app = new App();
      const stack = new Stack(app, 'ApiValidationStack');

      new ConfigMap(stack, 'TestConfig', {
        data: { key: 'value' }
      });

      const assembly = app.synth(tempDir);

      // Manually change API version to invalid one
      const stackManifest = assembly.getStackManifests('ApiValidationStack')!;
      const manifest = stackManifest.manifests[0];
      manifest.apiVersion = 'invalid/v1';

      // Should throw validation error for invalid API version
      await expect(assembly.writeToDirectory()).rejects.toThrow(/Invalid apiVersion/);
    });
  });
});