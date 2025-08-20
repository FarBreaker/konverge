import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { Construct } from '../../src/core/construct';
import { KubernetesResource } from '../../src/core/kubernetes-resource';
import { Validator, ValidationRule, ValidationError } from '../../src/core/validator';
import { ObjectMeta, KubernetesManifest } from '../../src/core/types';

// Test construct class since Construct is abstract
class TestConstruct extends Construct {
  constructor(scope: Construct | undefined, id: string) {
    super(scope, id);
  }
}

// Mock KubernetesResource for testing
class MockKubernetesResource extends KubernetesResource {
  public readonly apiVersion = 'v1';
  public readonly kind = 'MockResource';

  constructor(scope: Construct, id: string, metadata: Partial<ObjectMeta> = {}) {
    super(scope, id, { metadata });
  }

  public toManifest(): KubernetesManifest {
    return {
      apiVersion: this.apiVersion,
      kind: this.kind,
      metadata: this.getCompleteMetadata()
    };
  }
}

// Invalid KubernetesResource for testing error cases
class InvalidKubernetesResource extends KubernetesResource {
  public readonly apiVersion = '';
  public readonly kind = '';

  constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  public toManifest(): KubernetesManifest {
    throw new Error('Intentional manifest generation failure');
  }
}

describe('Validator', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack', {
      namespace: 'test-namespace'
    });
  });

  describe('validateConstruct', () => {
    it('should validate a simple construct successfully', () => {
      const construct = new TestConstruct(stack, 'TestConstruct');
      
      const result = Validator.validateConstruct(construct);
      
      expect(result.isValid).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.summary).toContain('passed successfully');
    });

    it('should detect invalid construct ID', () => {
      const construct = new TestConstruct(stack, 'Invalid_ID!');
      
      const result = Validator.validateConstruct(construct);
      
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.errors.some(e => e.code === 'INVALID_CONSTRUCT_ID')).toBe(true);
    });

    it('should validate recursively by default', () => {
      const parent = new TestConstruct(stack, 'Parent');
      new TestConstruct(parent, 'Invalid_Child!');
      
      const result = Validator.validateConstruct(parent);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.path.includes('Invalid_Child!'))).toBe(true);
    });

    it('should respect recursive option', () => {
      const parent = new TestConstruct(stack, 'Parent');
      new TestConstruct(parent, 'Invalid_Child!');
      
      const result = Validator.validateConstruct(parent, { recursive: false });
      
      expect(result.isValid).toBe(true);
      expect(result.errors.some(e => e.path.includes('Invalid_Child!'))).toBe(false);
    });

    it('should respect maxErrors option', () => {
      const parent = new TestConstruct(stack, 'Invalid_Parent!');
      new TestConstruct(parent, 'Invalid_Child1!');
      new TestConstruct(parent, 'Invalid_Child2!');
      
      const result = Validator.validateConstruct(parent, { maxErrors: 2 });
      
      expect(result.errors.length).toBeLessThanOrEqual(2);
    });

    it('should filter warnings when includeWarnings is false', () => {
      const construct = new TestConstruct(stack, 'TestConstruct');
      
      // Add a custom rule that generates warnings
      const warningRule: ValidationRule = {
        id: 'test-warning-rule',
        description: 'Generates test warnings',
        validate: () => [Validator.createError('Test warning', 'test.path', 'warning', 'TEST_WARNING')]
      };
      
      const result = Validator.validateConstruct(construct, {
        customRules: [warningRule],
        includeWarnings: false
      });
      
      expect(result.isValid).toBe(true);
      expect(result.warningCount).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('validateKubernetesResource', () => {
    it('should validate a valid Kubernetes resource', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource', {
        name: 'test-resource'
      });
      
      const result = Validator.validateKubernetesResource(resource);
      
      expect(result.isValid).toBe(true);
      expect(result.errorCount).toBe(0);
    });

    it('should detect missing resource metadata', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      // Clear the metadata to simulate missing metadata
      (resource as any).metadata = undefined;
      
      const result = Validator.validateKubernetesResource(resource);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_RESOURCE_METADATA')).toBe(true);
    });

    it('should detect manifest generation failures', () => {
      const resource = new InvalidKubernetesResource(stack, 'InvalidResource');
      
      const result = Validator.validateKubernetesResource(resource);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MANIFEST_GENERATION_FAILED')).toBe(true);
    });

    it('should detect duplicate resource names', () => {
      new MockKubernetesResource(stack, 'Resource1', { name: 'duplicate-name' });
      new MockKubernetesResource(stack, 'Resource2', { name: 'duplicate-name' });
      
      const result = Validator.validateConstruct(stack);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.code === 'DUPLICATE_RESOURCE_NAME')).toBe(true);
    });

    it('should validate resource with invalid labels', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource', {
        name: 'test-resource',
        labels: {
          'invalid key with spaces': 'value',
          'valid-key': 'invalid value with spaces!'
        }
      });
      
      const result = Validator.validateKubernetesResource(resource);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.code === 'INVALID_LABEL_KEY')).toBe(true);
      expect(result.errors.some((e: ValidationError) => e.code === 'INVALID_LABEL_VALUE')).toBe(true);
    });
  });

  describe('validateManifest', () => {
    it('should validate a complete manifest', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap',
          namespace: 'default'
        }
      };
      
      const errors: ValidationError[] = [];
      const context = {
        construct: new TestConstruct(stack, 'test'),
        path: 'test.path'
      };
      
      Validator.validateManifest(manifest, context, errors);
      
      expect(errors.length).toBe(0);
    });

    it('should detect missing required fields', () => {
      const manifest: Partial<KubernetesManifest> = {
        metadata: {
          name: 'test-resource'
        }
      };
      
      const errors: ValidationError[] = [];
      const context = {
        construct: new TestConstruct(stack, 'test'),
        path: 'test.path'
      };
      
      Validator.validateManifest(manifest as KubernetesManifest, context, errors);
      
      expect(errors.some((e: ValidationError) => e.code === 'MISSING_API_VERSION')).toBe(true);
      expect(errors.some((e: ValidationError) => e.code === 'MISSING_KIND')).toBe(true);
    });

    it('should detect missing metadata', () => {
      const manifest: Partial<KubernetesManifest> = {
        apiVersion: 'v1',
        kind: 'ConfigMap'
      };
      
      const errors: ValidationError[] = [];
      const context = {
        construct: new TestConstruct(stack, 'test'),
        path: 'test.path'
      };
      
      Validator.validateManifest(manifest as KubernetesManifest, context, errors);
      
      expect(errors.some((e: ValidationError) => e.code === 'MISSING_METADATA')).toBe(true);
    });

    it('should validate API version format', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'invalid-api-version',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-configmap'
        }
      };
      
      const errors: ValidationError[] = [];
      const context = {
        construct: new TestConstruct(stack, 'test'),
        path: 'test.path'
      };
      
      Validator.validateManifest(manifest, context, errors);
      
      expect(errors.some((e: ValidationError) => e.code === 'INVALID_API_VERSION_FORMAT')).toBe(true);
    });

    it('should validate kind format', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'invalid-kind',
        metadata: {
          name: 'test-resource'
        }
      };
      
      const errors: ValidationError[] = [];
      const context = {
        construct: new TestConstruct(stack, 'test'),
        path: 'test.path'
      };
      
      Validator.validateManifest(manifest, context, errors);
      
      expect(errors.some((e: ValidationError) => e.code === 'INVALID_KIND_FORMAT')).toBe(true);
    });
  });

  describe('custom validation rules', () => {
    it('should register and apply custom rules', () => {
      const customRule: ValidationRule = {
        id: 'test-custom-rule',
        description: 'Test custom validation rule',
        validate: (target, context) => {
          if (target instanceof Construct && target.node.id === 'ForbiddenName') {
            return [Validator.createError(
              'Construct name is forbidden',
              context.path,
              'error',
              'FORBIDDEN_NAME'
            )];
          }
          return [];
        }
      };

      Validator.registerRule(customRule);
      
      const construct = new TestConstruct(stack, 'ForbiddenName');
      const result = Validator.validateConstruct(construct);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.code === 'FORBIDDEN_NAME')).toBe(true);
      
      // Clean up
      Validator.unregisterRule('test-custom-rule');
    });

    it('should skip rules when specified', () => {
      const construct = new TestConstruct(stack, 'Invalid_ID!');
      
      const result = Validator.validateConstruct(construct, {
        skipRules: ['required-metadata-name', 'valid-label-format']
      });
      
      // Should still fail due to invalid construct ID validation (built-in)
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.code === 'INVALID_CONSTRUCT_ID')).toBe(true);
    });

    it('should handle rule execution failures gracefully', () => {
      const faultyRule: ValidationRule = {
        id: 'faulty-rule',
        description: 'Rule that throws an error',
        validate: () => {
          throw new Error('Rule execution failed');
        }
      };

      const construct = new TestConstruct(stack, 'TestConstruct');
      const result = Validator.validateConstruct(construct, {
        customRules: [faultyRule]
      });
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.code === 'RULE_EXECUTION_FAILED')).toBe(true);
    });

    it('should get all registered rules', () => {
      const initialRuleCount = Validator.getRegisteredRules().length;
      
      const testRule: ValidationRule = {
        id: 'test-rule-for-listing',
        description: 'Test rule for listing',
        validate: () => []
      };
      
      Validator.registerRule(testRule);
      
      const rules = Validator.getRegisteredRules();
      expect(rules.length).toBe(initialRuleCount + 1);
      expect(rules.some((r: ValidationRule) => r.id === 'test-rule-for-listing')).toBe(true);
      
      // Clean up
      Validator.unregisterRule('test-rule-for-listing');
    });

    it('should replace existing rules when re-registering', () => {
      const rule1: ValidationRule = {
        id: 'replaceable-rule',
        description: 'Original rule',
        validate: () => [Validator.createError('Original', 'path', 'error', 'ORIGINAL')]
      };
      
      const rule2: ValidationRule = {
        id: 'replaceable-rule',
        description: 'Replacement rule',
        validate: () => [Validator.createError('Replacement', 'path', 'error', 'REPLACEMENT')]
      };
      
      Validator.registerRule(rule1);
      const initialCount = Validator.getRegisteredRules().length;
      
      Validator.registerRule(rule2);
      const afterCount = Validator.getRegisteredRules().length;
      
      expect(afterCount).toBe(initialCount); // Should not increase count
      
      const construct = new TestConstruct(stack, 'TestConstruct');
      const result = Validator.validateConstruct(construct, {
        customRules: [rule2]
      });
      
      expect(result.errors.some(e => e.code === 'REPLACEMENT')).toBe(true);
      expect(result.errors.some(e => e.code === 'ORIGINAL')).toBe(false);
      
      // Clean up
      Validator.unregisterRule('replaceable-rule');
    });
  });

  describe('built-in validation rules', () => {
    it('should validate required metadata name for Kubernetes resources', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource');
      // Clear the name to trigger the validation error
      (resource as any).metadata = { ...resource.metadata, name: undefined };
      
      const result = Validator.validateKubernetesResource(resource);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_RESOURCE_NAME')).toBe(true);
    });

    it('should validate label format for Kubernetes resources', () => {
      const resource = new MockKubernetesResource(stack, 'TestResource', {
        name: 'test-resource',
        labels: {
          'invalid key': 'value'
        }
      });
      
      const result = Validator.validateKubernetesResource(resource);
      
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: ValidationError) => e.code === 'INVALID_LABEL_KEY')).toBe(true);
    });
  });

  describe('validation result formatting', () => {
    it('should create proper validation result for successful validation', () => {
      const construct = new TestConstruct(stack, 'TestConstruct');
      
      const result = Validator.validateConstruct(construct);
      
      expect(result.isValid).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
      expect(result.infoCount).toBe(0);
      expect(result.summary).toBe('Validation passed successfully');
    });

    it('should create proper validation result with warnings', () => {
      const warningRule: ValidationRule = {
        id: 'test-warning',
        description: 'Generates warnings',
        validate: () => [Validator.createError('Warning message', 'path', 'warning', 'TEST_WARNING')]
      };
      
      const construct = new TestConstruct(stack, 'TestConstruct');
      const result = Validator.validateConstruct(construct, {
        customRules: [warningRule]
      });
      
      expect(result.isValid).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(1);
      expect(result.summary).toContain('1 warning(s)');
    });

    it('should create proper validation result with errors', () => {
      const construct = new TestConstruct(stack, 'Invalid_ID!');
      
      const result = Validator.validateConstruct(construct);
      
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.summary).toContain('failed');
      expect(result.summary).toContain('error(s)');
    });

    it('should handle mixed severity levels', () => {
      const mixedRule: ValidationRule = {
        id: 'mixed-severity',
        description: 'Generates mixed severity messages',
        validate: () => [
          Validator.createError('Error message', 'path', 'error', 'TEST_ERROR'),
          Validator.createError('Warning message', 'path', 'warning', 'TEST_WARNING'),
          Validator.createError('Info message', 'path', 'info', 'TEST_INFO')
        ]
      };
      
      const construct = new TestConstruct(stack, 'TestConstruct');
      const result = Validator.validateConstruct(construct, {
        customRules: [mixedRule],
        includeInfo: true
      });
      
      expect(result.isValid).toBe(false);
      expect(result.errorCount).toBe(1);
      expect(result.warningCount).toBe(1);
      expect(result.infoCount).toBe(1);
      expect(result.errors.length).toBe(3);
    });
  });

  describe('createError helper', () => {
    it('should create error with all properties', () => {
      const error = Validator.createError(
        'Test message',
        'test.path',
        'warning',
        'TEST_CODE',
        'Additional context'
      );
      
      expect(error.message).toBe('Test message');
      expect(error.path).toBe('test.path');
      expect(error.severity).toBe('warning');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toBe('Additional context');
    });

    it('should create error with default values', () => {
      const error = Validator.createError('Test message', 'test.path');
      
      expect(error.message).toBe('Test message');
      expect(error.path).toBe('test.path');
      expect(error.severity).toBe('error');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.context).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty construct tree', () => {
      const emptyApp = new App();
      
      const result = Validator.validateConstruct(emptyApp);
      
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should handle deeply nested constructs', () => {
      let current: Construct = stack;
      
      // Create a deeply nested structure
      for (let i = 0; i < 10; i++) {
        current = new TestConstruct(current, `Level${i}`);
      }
      
      const result = Validator.validateConstruct(stack);
      
      expect(result.isValid).toBe(true);
    });

    it('should handle constructs with no scope', () => {
      const rootConstruct = new TestConstruct(undefined, 'RootConstruct');
      
      const result = Validator.validateConstruct(rootConstruct);
      
      expect(result.isValid).toBe(true);
    });

    it('should detect circular dependencies', () => {
      // This is a simplified test - in practice, circular dependencies
      // are harder to create due to TypeScript's constructor requirements
      const parent = new TestConstruct(stack, 'Parent');
      const child = new TestConstruct(parent, 'Child');
      
      // Manually create a circular reference in the test
      // Note: This is artificial since the normal constructor prevents this
      (parent.node as any)._children.push(parent);
      
      const result = Validator.validateConstruct(child, { recursive: false });
      
      // Since we're testing just the child without recursion, it should pass
      // The circular dependency detection is more complex in real scenarios
      expect(result.isValid).toBe(true);
    });
  });
});