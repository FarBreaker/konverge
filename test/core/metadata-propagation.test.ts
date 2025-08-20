import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { Construct } from '../../src/core/construct';
import { MetadataPropagation } from '../../src/core/metadata-propagation';
import { ObjectMeta } from '../../src/core/types';

// Mock KubernetesResource for testing
class MockKubernetesResource extends Construct {
  public readonly apiVersion = 'v1';
  public readonly kind = 'MockResource';
  public metadata: ObjectMeta;

  constructor(scope: Construct, id: string, metadata: Partial<ObjectMeta> = {}) {
    super(scope, id);
    this.metadata = { ...metadata };
  }
}

describe('MetadataPropagation', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack', {
      namespace: 'test-namespace',
      labels: {
        'stack-label': 'stack-value',
        'environment': 'test'
      }
    });
  });

  describe('propagateMetadata', () => {
    it('should inherit namespace from parent stack', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      
      const result = MetadataPropagation.propagateMetadata(resource);
      
      expect(result.metadata.namespace).toBe('test-namespace');
      expect(result.namespaceInherited).toBe(true);
      expect(result.sourceStack).toBe(stack);
    });

    it('should not override existing namespace', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      const baseMetadata = { namespace: 'custom-namespace' };
      
      const result = MetadataPropagation.propagateMetadata(resource, baseMetadata);
      
      expect(result.metadata.namespace).toBe('custom-namespace');
      expect(result.namespaceInherited).toBe(false);
    });

    it('should inherit labels from parent stack', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      
      const result = MetadataPropagation.propagateMetadata(resource);
      
      expect(result.metadata.labels).toMatchObject({
        'stack-label': 'stack-value',
        'environment': 'test',
        'app.kubernetes.io/managed-by': 'konverge',
        'konverge.io/stack-name': 'TestStack'
      });
      expect(result.inheritedLabelsCount).toBeGreaterThan(0);
    });

    it('should merge labels with correct precedence', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      const baseMetadata = {
        labels: {
          'custom-label': 'custom-value',
          'stack-label': 'overridden-value' // Should override stack label
        }
      };
      const additionalLabels = {
        'additional-label': 'additional-value'
      };
      
      const result = MetadataPropagation.propagateMetadata(
        resource, 
        baseMetadata, 
        { additionalLabels }
      );
      
      expect(result.metadata.labels).toMatchObject({
        'custom-label': 'custom-value',
        'stack-label': 'overridden-value', // Base metadata has highest precedence
        'additional-label': 'additional-value',
        'environment': 'test'
      });
    });

    it('should add automatic annotations', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      
      const result = MetadataPropagation.propagateMetadata(resource);
      
      expect(result.metadata.annotations).toMatchObject({
        'konverge.io/construct-path': 'App/TestStack/TestResource',
        'konverge.io/stack-name': 'TestStack',
        'konverge.io/stack-namespace': 'test-namespace'
      });
    });

    it('should merge additional annotations', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      const baseMetadata = {
        annotations: {
          'custom-annotation': 'custom-value'
        }
      };
      const additionalAnnotations = {
        'additional-annotation': 'additional-value'
      };
      
      const result = MetadataPropagation.propagateMetadata(
        resource, 
        baseMetadata, 
        { additionalAnnotations }
      );
      
      expect(result.metadata.annotations).toMatchObject({
        'custom-annotation': 'custom-value',
        'additional-annotation': 'additional-value',
        'konverge.io/construct-path': 'App/TestStack/TestResource'
      });
    });

    it('should work with constructs not in a stack', () => {
      const rootConstruct = new MockKubernetesResource(app, 'RootResource');
      
      const result = MetadataPropagation.propagateMetadata(rootConstruct);
      
      expect(result.sourceStack).toBeUndefined();
      expect(result.namespaceInherited).toBe(false);
      expect(result.metadata.namespace).toBeUndefined();
      expect(result.metadata.labels).toMatchObject({
        'app.kubernetes.io/name': 'RootResource',
        'app.kubernetes.io/managed-by': 'konverge'
      });
    });

    it('should respect inheritance options', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      
      const result = MetadataPropagation.propagateMetadata(resource, {}, {
        inheritNamespace: false,
        inheritLabels: false,
        addAnnotations: false
      });
      
      expect(result.metadata.namespace).toBeUndefined();
      expect(result.namespaceInherited).toBe(false);
      expect(result.inheritedLabelsCount).toBe(0);
      expect(result.metadata.annotations).not.toMatchObject({
        'konverge.io/construct-path': expect.any(String)
      });
    });
  });

  describe('validateMetadata', () => {
    it('should validate valid metadata', () => {
      const metadata: ObjectMeta = {
        name: 'valid-name',
        namespace: 'valid-namespace',
        labels: {
          'app': 'test',
          'version': '1.0.0'
        }
      };
      
      const errors = MetadataPropagation.validateMetadata(metadata);
      
      expect(errors).toHaveLength(0);
    });

    it('should detect invalid resource names', () => {
      const metadata: ObjectMeta = {
        name: 'Invalid_Name!',
        namespace: 'valid-namespace'
      };
      
      const errors = MetadataPropagation.validateMetadata(metadata);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Name:'))).toBe(true);
    });

    it('should detect invalid namespace names', () => {
      const metadata: ObjectMeta = {
        name: 'valid-name',
        namespace: 'Invalid_Namespace!'
      };
      
      const errors = MetadataPropagation.validateMetadata(metadata);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Namespace:'))).toBe(true);
    });

    it('should detect invalid label keys', () => {
      const metadata: ObjectMeta = {
        name: 'valid-name',
        labels: {
          'invalid key with spaces': 'value'
        }
      };
      
      const errors = MetadataPropagation.validateMetadata(metadata);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Label key'))).toBe(true);
    });

    it('should detect invalid label values', () => {
      const metadata: ObjectMeta = {
        name: 'valid-name',
        labels: {
          'valid-key': 'invalid value with spaces and special chars!'
        }
      };
      
      const errors = MetadataPropagation.validateMetadata(metadata);
      
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Label value'))).toBe(true);
    });
  });

  describe('ensureConsistentLabeling', () => {
    it('should generate consistent labels for all constructs in stack', () => {
      new MockKubernetesResource(stack, 'Resource1');
      new MockKubernetesResource(stack, 'Resource2');
      
      const labelMap = MetadataPropagation.ensureConsistentLabeling(stack);
      
      expect(labelMap.size).toBeGreaterThan(0);
      
      // Check that stack labels are included for all resources
      for (const [, labels] of labelMap.entries()) {
        expect(labels).toMatchObject({
          'app.kubernetes.io/managed-by': 'konverge',
          'konverge.io/stack-name': 'TestStack',
          'stack-label': 'stack-value',
          'environment': 'test'
        });
      }
    });

    it('should include construct-specific labels', () => {
      new MockKubernetesResource(stack, 'TestResource');
      
      const labelMap = MetadataPropagation.ensureConsistentLabeling(stack);
      const resourceLabels = labelMap.get('App/TestStack/TestResource');
      
      expect(resourceLabels).toMatchObject({
        'app.kubernetes.io/name': 'TestResource'
      });
    });
  });

  describe('detectLabelInconsistencies', () => {
    it('should detect no inconsistencies in properly labeled stack', () => {
      new MockKubernetesResource(stack, 'Resource1');
      new MockKubernetesResource(stack, 'Resource2');
      
      const warnings = MetadataPropagation.detectLabelInconsistencies(stack);
      
      expect(warnings).toHaveLength(0);
    });

    it('should detect label inconsistencies', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      
      // Manually set inconsistent metadata
      resource.node.setMetadata('labels', {
        'konverge.io/stack-name': 'WrongStackName'
      });
      
      const warnings = MetadataPropagation.detectLabelInconsistencies(stack);
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.includes('inconsistent label'))).toBe(true);
    });
  });

  describe('applyNamespacePropagation', () => {
    it('should apply stack namespace to all constructs', () => {
      const resource1 = new MockKubernetesResource(stack, 'Resource1');
      const resource2 = new MockKubernetesResource(stack, 'Resource2');
      
      MetadataPropagation.applyNamespacePropagation(stack);
      
      expect(resource1.metadata.namespace).toBe('test-namespace');
      expect(resource2.metadata.namespace).toBe('test-namespace');
    });

    it('should apply custom namespace when specified', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      
      MetadataPropagation.applyNamespacePropagation(stack, 'custom-namespace');
      
      expect(resource.metadata.namespace).toBe('custom-namespace');
    });

    it('should not override existing namespaces', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource', {
        namespace: 'existing-namespace'
      });
      
      MetadataPropagation.applyNamespacePropagation(stack);
      
      expect(resource.metadata.namespace).toBe('existing-namespace');
    });

    it('should handle stack without namespace', () => {
      const stackWithoutNamespace = new Stack(app, 'NoNamespaceStack');
      const resource = new MockKubernetesResource(stackWithoutNamespace, 'TestResource');
      
      MetadataPropagation.applyNamespacePropagation(stackWithoutNamespace);
      
      expect(resource.metadata.namespace).toBeUndefined();
    });
  });

  describe('nested constructs', () => {
    it('should propagate metadata through nested construct hierarchy', () => {
      // Create a nested construct structure
      const parentConstruct = new MockKubernetesResource(stack, 'Parent');
      const childConstruct = new MockKubernetesResource(parentConstruct, 'Child');
      
      const result = MetadataPropagation.propagateMetadata(childConstruct);
      
      expect(result.sourceStack).toBe(stack);
      expect(result.metadata.namespace).toBe('test-namespace');
      expect(result.metadata.labels).toMatchObject({
        'konverge.io/stack-name': 'TestStack',
        'app.kubernetes.io/name': 'Child'
      });
      expect(result.metadata.annotations).toMatchObject({
        'konverge.io/construct-path': 'App/TestStack/Parent/Child'
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty metadata gracefully', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      
      const result = MetadataPropagation.propagateMetadata(resource, {});
      
      expect(result.metadata).toBeDefined();
      expect(result.metadata.labels).toBeDefined();
      expect(result.metadata.annotations).toBeDefined();
    });

    it('should handle constructs with very long paths', () => {
      let current: Construct = stack;
      
      // Create a deeply nested structure
      for (let i = 0; i < 10; i++) {
        current = new MockKubernetesResource(current, `Level${i}`);
      }
      
      const result = MetadataPropagation.propagateMetadata(current);
      
      expect(result.metadata.annotations?.['konverge.io/construct-path']).toBeDefined();
      expect(result.sourceStack).toBe(stack);
    });
  });
});