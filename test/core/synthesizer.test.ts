import { Synthesizer, DependencyGraph } from '../../src/core/synthesizer';
import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { KubernetesResource } from '../../src/core/kubernetes-resource';
import { KubernetesManifest, V1ConfigMap, V1Deployment } from '../../src/core/types';

// Mock KubernetesResource implementations for testing
class MockConfigMap extends KubernetesResource {
  public readonly apiVersion = 'v1';
  public readonly kind = 'ConfigMap';

  constructor(scope: any, id: string, private data: { [key: string]: string } = {}) {
    super(scope, id);
  }

  public toManifest(): V1ConfigMap {
    return {
      ...this.createBaseManifest(),
      apiVersion: 'v1' as const,
      kind: 'ConfigMap' as const,
      data: this.data,
    };
  }
}

class MockDeployment extends KubernetesResource {
  public readonly apiVersion = 'apps/v1';
  public readonly kind = 'Deployment';

  constructor(scope: any, id: string, private replicas: number = 1, private configMapName?: string) {
    super(scope, id);
  }

  public toManifest(): V1Deployment {
    const manifest: V1Deployment = {
      ...this.createBaseManifest(),
      apiVersion: 'apps/v1' as const,
      kind: 'Deployment' as const,
      spec: {
        replicas: this.replicas,
        selector: {
          matchLabels: { app: this.node.id }
        },
        template: {
          metadata: {
            labels: { app: this.node.id }
          },
          spec: {
            containers: [{
              name: 'app',
              image: 'nginx:latest'
            }]
          }
        }
      }
    };

    // Add ConfigMap reference if specified
    if (this.configMapName && manifest.spec?.template.spec) {
      manifest.spec.template.spec.containers[0].env = [{
        name: 'CONFIG_VALUE',
        valueFrom: {
          configMapKeyRef: {
            name: this.configMapName,
            key: 'config'
          }
        }
      }];
    }

    return manifest;
  }
}

describe('Synthesizer', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  describe('synthesize', () => {
    it('should synthesize an app and return a CloudAssembly', () => {
      new MockConfigMap(stack, 'MyConfigMap', { key: 'value' });
      new MockDeployment(stack, 'MyDeployment', 3);

      const assembly = Synthesizer.synthesize(app);

      expect(assembly).toBeDefined();
      expect(assembly.stacks).toHaveLength(1);
      expect(assembly.stacks[0].stackName).toBe('TestStack');
      expect(assembly.stacks[0].manifests).toHaveLength(2);
    });

    it('should handle empty app', () => {
      const assembly = Synthesizer.synthesize(app);

      expect(assembly).toBeDefined();
      expect(assembly.stacks).toHaveLength(1);
      expect(assembly.stacks[0].manifests).toHaveLength(0);
    });
  });

  describe('visitConstruct', () => {
    it('should collect manifests from KubernetesResource constructs', () => {
      new MockConfigMap(stack, 'MyConfigMap', { key: 'value' });
      new MockDeployment(stack, 'MyDeployment', 2);

      const manifests = Synthesizer.visitConstruct(stack);

      expect(manifests).toHaveLength(2);
      expect(manifests.find(m => m.kind === 'ConfigMap')).toBeDefined();
      expect(manifests.find(m => m.kind === 'Deployment')).toBeDefined();
    });

    it('should recursively visit nested constructs', () => {
      new MockConfigMap(stack, 'MyConfigMap');
      
      // Create a nested construct
      const nestedStack = new Stack(app, 'NestedStack');
      new MockDeployment(nestedStack, 'NestedDeployment');

      const manifests = Synthesizer.visitConstruct(app);

      expect(manifests).toHaveLength(2);
      expect(manifests.find(m => m.metadata.name?.includes('myconfigmap'))).toBeDefined();
      expect(manifests.find(m => m.metadata.name?.includes('nesteddeployment'))).toBeDefined();
    });

    it('should skip non-KubernetesResource constructs', () => {
      new MockConfigMap(stack, 'MyConfigMap');

      const manifests = Synthesizer.visitConstruct(stack);

      // Should only include the ConfigMap, not the Stack itself
      expect(manifests).toHaveLength(1);
      expect(manifests[0].kind).toBe('ConfigMap');
    });
  });

  describe('generateManifest', () => {
    it('should generate manifest from KubernetesResource', () => {
      const configMap = new MockConfigMap(stack, 'MyConfigMap', { key: 'value' });

      const manifest = Synthesizer.generateManifest(configMap);

      expect(manifest).toBeDefined();
      expect(manifest.kind).toBe('ConfigMap');
      expect(manifest.apiVersion).toBe('v1');
      expect(manifest.metadata.name).toBeDefined();
      expect(manifest.metadata.annotations!['konverge.io/synthesized-at']).toBeDefined();
      expect(manifest.metadata.annotations!['konverge.io/construct-path']).toBeDefined();
    });

    it('should throw error for invalid resource', () => {
      // Create a resource that will fail validation by overriding metadata
      const invalidResource = new MockConfigMap(stack, 'ValidName');
      // Force invalid metadata
      (invalidResource as any).metadata.name = '';

      expect(() => {
        Synthesizer.generateManifest(invalidResource);
      }).toThrow('Validation failed for resource');
    });

    it('should add synthesis metadata to manifest', () => {
      const configMap = new MockConfigMap(stack, 'MyConfigMap');

      const manifest = Synthesizer.generateManifest(configMap);

      expect(manifest.metadata.annotations!['konverge.io/synthesized-at']).toBeDefined();
      expect(manifest.metadata.annotations!['konverge.io/construct-path']).toBeDefined();
      expect(manifest.metadata.annotations!['konverge.io/construct-path']).toBe(configMap.node.path);
    });
  });

  describe('orderResources', () => {
    it('should order resources by priority', () => {
      const manifests: KubernetesManifest[] = [
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'deployment' }
        },
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'configmap' }
        },
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'service' }
        }
      ];

      const ordered = Synthesizer.orderResources(manifests);

      expect(ordered).toHaveLength(3);
      expect(ordered[0].kind).toBe('ConfigMap'); // Higher priority
      expect(ordered[1].kind).toBe('Service');
      expect(ordered[2].kind).toBe('Deployment'); // Lower priority
    });

    it('should sort by name when priority is equal', () => {
      const manifests: KubernetesManifest[] = [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'zebra-config' }
        },
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'alpha-config' }
        }
      ];

      const ordered = Synthesizer.orderResources(manifests);

      expect(ordered[0].metadata.name).toBe('alpha-config');
      expect(ordered[1].metadata.name).toBe('zebra-config');
    });

    it('should handle unknown resource types', () => {
      const manifests: KubernetesManifest[] = [
        {
          apiVersion: 'custom/v1',
          kind: 'CustomResource',
          metadata: { name: 'custom' }
        },
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'configmap' }
        }
      ];

      const ordered = Synthesizer.orderResources(manifests);

      expect(ordered[0].kind).toBe('ConfigMap'); // Known type first
      expect(ordered[1].kind).toBe('CustomResource'); // Unknown type last
    });
  });

  describe('resolveDependencies', () => {
    it('should create dependency graph', () => {
      const manifests: KubernetesManifest[] = [
        {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'my-config', namespace: 'default' },
          data: { key: 'value' }
        },
        {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: 'my-deployment', namespace: 'default' },
          spec: {
            template: {
              spec: {
                containers: [{
                  name: 'app',
                  image: 'nginx',
                  env: [{
                    name: 'CONFIG_VALUE',
                    valueFrom: {
                      configMapKeyRef: {
                        name: 'my-config',
                        key: 'key'
                      }
                    }
                  }]
                }]
              }
            }
          }
        }
      ];

      const graph = Synthesizer.resolveDependencies(manifests);

      expect(graph).toBeDefined();
      expect(graph.getAllNodes()).toHaveLength(2);
      
      const dependencies = graph.getDependencies('default/Deployment/my-deployment');
      expect(dependencies).toContain('default/ConfigMap/my-config');
    });

    it('should handle resources without dependencies', () => {
      const manifests: KubernetesManifest[] = [
        {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: 'my-service', namespace: 'default' },
          spec: {
            selector: { app: 'my-app' },
            ports: [{ port: 80 }]
          }
        }
      ];

      const graph = Synthesizer.resolveDependencies(manifests);

      expect(graph.getAllNodes()).toHaveLength(1);
      const dependencies = graph.getDependencies('default/Service/my-service');
      expect(dependencies).toHaveLength(0);
    });
  });
});

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe('addNode', () => {
    it('should add node to graph', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'test' }
      };

      graph.addNode('test-id', manifest);

      expect(graph.getAllNodes()).toHaveLength(1);
      expect(graph.getAllNodes()[0]).toBe(manifest);
    });
  });

  describe('addEdge', () => {
    it('should add dependency edge', () => {
      const configMap: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'config' }
      };
      const deployment: KubernetesManifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'app' }
      };

      graph.addNode('config', configMap);
      graph.addNode('deployment', deployment);
      graph.addEdge('config', 'deployment');

      const dependencies = graph.getDependencies('deployment');
      expect(dependencies).toContain('config');
    });
  });

  describe('topologicalSort', () => {
    it('should sort nodes in dependency order', () => {
      const configMap: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'config' }
      };
      const deployment: KubernetesManifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'app' }
      };

      graph.addNode('config', configMap);
      graph.addNode('deployment', deployment);
      graph.addEdge('config', 'deployment'); // deployment depends on config

      const sorted = graph.topologicalSort();

      expect(sorted).toHaveLength(2);
      expect(sorted[0].kind).toBe('ConfigMap'); // Should come first
      expect(sorted[1].kind).toBe('Deployment'); // Should come second
    });

    it('should detect circular dependencies', () => {
      const manifest1: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'service1' }
      };
      const manifest2: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'service2' }
      };

      graph.addNode('service1', manifest1);
      graph.addNode('service2', manifest2);
      graph.addEdge('service1', 'service2');
      graph.addEdge('service2', 'service1'); // Circular dependency

      expect(() => {
        graph.topologicalSort();
      }).toThrow('Circular dependency detected');
    });

    it('should handle empty graph', () => {
      const sorted = graph.topologicalSort();
      expect(sorted).toHaveLength(0);
    });
  });

  describe('getDependencies', () => {
    it('should return dependencies for a resource', () => {
      const configMap: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'config' }
      };
      const deployment: KubernetesManifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'app' }
      };

      graph.addNode('config', configMap);
      graph.addNode('deployment', deployment);
      graph.addEdge('config', 'deployment');

      const dependencies = graph.getDependencies('deployment');
      expect(dependencies).toContain('config');
      expect(dependencies).toHaveLength(1);
    });

    it('should return empty array for resource with no dependencies', () => {
      const configMap: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'config' }
      };

      graph.addNode('config', configMap);

      const dependencies = graph.getDependencies('config');
      expect(dependencies).toHaveLength(0);
    });
  });
});