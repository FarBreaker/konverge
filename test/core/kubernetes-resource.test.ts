/**
 * Tests for the base KubernetesResource class.
 */

import { KubernetesResource, KubernetesResourceProps } from '../../src/core/kubernetes-resource';
import { Construct } from '../../src/core/construct';
import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { KubernetesManifest } from '../../src/core/types';

// Test implementation of KubernetesResource
class TestResource extends KubernetesResource {
  public readonly apiVersion = 'v1';
  public readonly kind = 'TestResource';

  constructor(scope: Construct, id: string, props?: KubernetesResourceProps) {
    super(scope, id, props);
  }

  public toManifest(): KubernetesManifest {
    return this.createBaseManifest();
  }
}

describe('KubernetesResource', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  describe('Basic Resource Creation', () => {
    it('should create a resource with automatic name generation', () => {
      const resource = new TestResource(stack, 'MyResource');

      expect(resource.metadata.name).toBe('app-teststack-myresource');
      expect(resource.apiVersion).toBe('v1');
      expect(resource.kind).toBe('TestResource');
    });

    it('should create a resource with custom metadata', () => {
      const resource = new TestResource(stack, 'MyResource', {
        metadata: {
          name: 'custom-name',
          labels: { 'custom-label': 'custom-value' },
          annotations: { 'custom-annotation': 'custom-value' },
        },
      });

      expect(resource.metadata.name).toBe('custom-name');
      expect(resource.metadata.labels?.['custom-label']).toBe('custom-value');
      expect(resource.metadata.annotations?.['custom-annotation']).toBe('custom-value');
    });

    it('should merge automatic and custom labels', () => {
      const resource = new TestResource(stack, 'MyResource', {
        metadata: {
          labels: { 'custom-label': 'custom-value' },
        },
      });

      const completeMetadata = resource.getCompleteMetadata();
      expect(completeMetadata.labels?.['custom-label']).toBe('custom-value');
      expect(completeMetadata.labels?.['app.kubernetes.io/name']).toBe('MyResource');
      expect(completeMetadata.labels?.['app.kubernetes.io/managed-by']).toBe('konverge');
    });

    it('should merge automatic and custom annotations', () => {
      const resource = new TestResource(stack, 'MyResource', {
        metadata: {
          annotations: { 'custom-annotation': 'custom-value' },
        },
      });

      const completeMetadata = resource.getCompleteMetadata();
      expect(completeMetadata.annotations?.['custom-annotation']).toBe('custom-value');
      expect(completeMetadata.annotations?.['konverge.io/construct-path']).toBe('App/TestStack/MyResource');
    });
  });

  describe('Automatic Labeling', () => {
    it('should generate standard Kubernetes labels', () => {
      const resource = new TestResource(stack, 'WebServer');

      const completeMetadata = resource.getCompleteMetadata();
      expect(completeMetadata.labels?.['app.kubernetes.io/name']).toBe('WebServer');
      expect(completeMetadata.labels?.['app.kubernetes.io/managed-by']).toBe('konverge');
    });

    it('should inherit labels from stack', () => {
      const stackWithLabels = new Stack(app, 'LabeledStack', {
        labels: { 'environment': 'production', 'team': 'backend' },
      });
      const resource = new TestResource(stackWithLabels, 'MyResource');

      const completeMetadata = resource.getCompleteMetadata();
      expect(completeMetadata.labels?.['environment']).toBe('production');
      expect(completeMetadata.labels?.['team']).toBe('backend');
      expect(completeMetadata.labels?.['app.kubernetes.io/name']).toBe('MyResource');
    });

    it('should allow custom labels to override stack labels', () => {
      const stackWithLabels = new Stack(app, 'LabeledStack', {
        labels: { 'environment': 'staging' },
      });
      const resource = new TestResource(stackWithLabels, 'MyResource', {
        metadata: {
          labels: { 'environment': 'production' },
        },
      });

      const completeMetadata = resource.getCompleteMetadata();
      expect(completeMetadata.labels?.['environment']).toBe('production');
    });
  });

  describe('Namespace Propagation', () => {
    it('should inherit namespace from stack', () => {
      const namespacedStack = new Stack(app, 'NamespacedStack', {
        namespace: 'my-namespace',
      });
      const resource = new TestResource(namespacedStack, 'MyResource');

      expect(resource.metadata.namespace).toBe('my-namespace');
    });

    it('should allow custom namespace to override stack namespace', () => {
      const namespacedStack = new Stack(app, 'NamespacedStack', {
        namespace: 'stack-namespace',
      });
      const resource = new TestResource(namespacedStack, 'MyResource', {
        metadata: {
          namespace: 'custom-namespace',
        },
      });

      expect(resource.metadata.namespace).toBe('custom-namespace');
    });

    it('should not set namespace if stack has no namespace', () => {
      const resource = new TestResource(stack, 'MyResource');

      expect(resource.metadata.namespace).toBeUndefined();
    });
  });

  describe('Name Generation', () => {
    it('should generate valid DNS names from construct paths', () => {
      const resource = new TestResource(stack, 'MyResource');
      expect(resource.metadata.name).toBe('app-teststack-myresource');
    });

    it('should handle special characters in construct IDs', () => {
      const resource = new TestResource(stack, 'My_Resource.With@Special#Chars');
      expect(resource.metadata.name).toBe('app-teststack-my-resource-with-special-chars');
    });

    it('should handle long names by truncating and adding hash', () => {
      const longId = 'a'.repeat(70);
      const resource = new TestResource(stack, longId);
      
      expect(resource.metadata.name).toHaveLength(63);
      expect(resource.metadata.name?.startsWith('app-teststack-')).toBe(true);
      expect(resource.metadata.name?.includes('-')).toBe(true);
    });

    it('should handle empty or invalid construct paths', () => {
      // Create a resource with minimal ID
      const resource = new TestResource(stack, 'a');
      expect(resource.metadata.name).toBe('app-teststack-a');
    });

    it('should generate unique names for different resources', () => {
      const resource1 = new TestResource(stack, 'Resource1');
      const resource2 = new TestResource(stack, 'Resource2');

      expect(resource1.metadata.name).not.toBe(resource2.metadata.name);
      expect(resource1.metadata.name).toBe('app-teststack-resource1');
      expect(resource2.metadata.name).toBe('app-teststack-resource2');
    });
  });

  describe('Validation', () => {
    it('should validate valid resource configuration', () => {
      const resource = new TestResource(stack, 'ValidResource');
      const errors = resource.validate();

      expect(errors).toHaveLength(0);
    });

    it('should detect invalid resource names', () => {
      const resource = new TestResource(stack, 'ValidResource', {
        metadata: { name: 'Invalid_Name!' },
      });
      const errors = resource.validate();

      expect(errors).toContain('Name: Name must be a valid DNS subdomain (lowercase alphanumeric characters, hyphens, and periods only)');
    });

    it('should detect names that are too long', () => {
      const longName = 'a'.repeat(70);
      const resource = new TestResource(stack, 'ValidResource', {
        metadata: { name: longName },
      });
      const errors = resource.validate();

      expect(errors).toContain('Name: Name cannot exceed 63 characters');
    });

    it('should detect invalid namespace names', () => {
      const resource = new TestResource(stack, 'ValidResource', {
        metadata: { namespace: 'Invalid_Namespace!' },
      });
      const errors = resource.validate();

      expect(errors).toContain('Namespace: Name must be a valid DNS subdomain (lowercase alphanumeric characters, hyphens, and periods only)');
    });

    it('should detect label keys that are too long', () => {
      const longKey = 'a'.repeat(70);
      const resource = new TestResource(stack, 'ValidResource', {
        metadata: {
          labels: { [longKey]: 'value' },
        },
      });
      const errors = resource.validate();

      expect(errors).toContain(`Label key "${longKey}": Label key cannot exceed 63 characters`);
    });

    it('should detect label values that are too long', () => {
      const longValue = 'a'.repeat(70);
      const resource = new TestResource(stack, 'ValidResource', {
        metadata: {
          labels: { 'key': longValue },
        },
      });
      const errors = resource.validate();

      expect(errors).toContain('Label value for "key": Label value cannot exceed 63 characters');
    });
  });

  describe('Manifest Generation', () => {
    it('should create base manifest with correct structure', () => {
      const resource = new TestResource(stack, 'MyResource');
      const manifest = resource.toManifest();

      expect(manifest.apiVersion).toBe('v1');
      expect(manifest.kind).toBe('TestResource');
      expect(manifest.metadata).toBeDefined();
      expect(manifest.metadata.name).toBe('app-teststack-myresource');
    });

    it('should include all metadata in manifest', () => {
      const resource = new TestResource(stack, 'MyResource', {
        metadata: {
          labels: { 'custom': 'label' },
          annotations: { 'custom': 'annotation' },
        },
      });
      const manifest = resource.toManifest();

      expect(manifest.metadata.labels?.['custom']).toBe('label');
      expect(manifest.metadata.labels?.['app.kubernetes.io/name']).toBe('MyResource');
      expect(manifest.metadata.annotations?.['custom']).toBe('annotation');
      expect(manifest.metadata.annotations?.['konverge.io/construct-path']).toBe('App/TestStack/MyResource');
    });

    it('should create independent manifest copies', () => {
      const resource = new TestResource(stack, 'MyResource');
      const manifest1 = resource.toManifest();
      const manifest2 = resource.toManifest();

      // Modify one manifest
      manifest1.metadata.name = 'modified-name';

      // Other manifest should be unchanged
      expect(manifest2.metadata.name).toBe('app-teststack-myresource');
      expect(resource.metadata.name).toBe('app-teststack-myresource');
    });
  });

  describe('Nested Constructs', () => {
    it('should handle deeply nested construct hierarchies', () => {
      class NestedConstruct extends Construct {
        constructor(scope: Construct, id: string) {
          super(scope, id);
        }
      }

      const nested1 = new NestedConstruct(stack, 'Level1');
      const nested2 = new NestedConstruct(nested1, 'Level2');
      const resource = new TestResource(nested2, 'DeepResource');

      expect(resource.metadata.name).toBe('app-teststack-level1-level2-deepresource');
      expect(resource.getCompleteMetadata().annotations?.['konverge.io/construct-path']).toBe('App/TestStack/Level1/Level2/DeepResource');
    });

    it('should propagate namespace through nested constructs', () => {
      class NestedConstruct extends Construct {
        constructor(scope: Construct, id: string) {
          super(scope, id);
        }
      }

      const namespacedStack = new Stack(app, 'NamespacedStack', {
        namespace: 'deep-namespace',
      });
      const nested = new NestedConstruct(namespacedStack, 'Nested');
      const resource = new TestResource(nested, 'DeepResource');

      expect(resource.metadata.namespace).toBe('deep-namespace');
    });
  });
});