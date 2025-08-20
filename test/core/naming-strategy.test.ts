/**
 * Unit tests for NamingStrategy class.
 */

import { NamingStrategy } from '../../src/core/naming-strategy';
import { Construct } from '../../src/core/construct';
import { Stack } from '../../src/core/stack';
import { App } from '../../src/core/app';

describe('NamingStrategy', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack', {
      namespace: 'test-namespace',
      labels: { 'env': 'test' }
    });
  });

  describe('generateResourceName', () => {
    it('should generate a valid resource name from construct hierarchy', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'MyResource');
      
      const name = NamingStrategy.generateResourceName(construct);
      
      expect(name).toBeDefined();
      expect(name.length).toBeLessThanOrEqual(63);
      expect(name).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
    });

    it('should handle long construct paths by truncating and adding hash', () => {
      class TestConstruct extends Construct {}
      const longId = 'a'.repeat(50);
      const construct = new TestConstruct(stack, longId);
      
      const name = NamingStrategy.generateResourceName(construct);
      
      expect(name.length).toBeLessThanOrEqual(63);
      expect(name).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
    });

    it('should sanitize invalid characters in names', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'My_Resource.With@Invalid#Chars');
      
      const name = NamingStrategy.generateResourceName(construct);
      
      expect(name).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
      expect(name).not.toContain('_');
      expect(name).not.toContain('.');
      expect(name).not.toContain('@');
      expect(name).not.toContain('#');
    });

    it('should respect maxLength option', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'VeryLongResourceName');
      
      const name = NamingStrategy.generateResourceName(construct, { maxLength: 20 });
      
      expect(name.length).toBeLessThanOrEqual(20);
    });

    it('should respect includeHash option', () => {
      class TestConstruct extends Construct {}
      const longId = 'a'.repeat(70);
      const construct = new TestConstruct(stack, longId);
      
      const nameWithHash = NamingStrategy.generateResourceName(construct, { includeHash: true });
      const nameWithoutHash = NamingStrategy.generateResourceName(construct, { includeHash: false });
      
      expect(nameWithHash).toContain('-');
      expect(nameWithoutHash.length).toBeLessThanOrEqual(63);
    });

    it('should respect custom separator', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'My_Resource');
      
      const nameWithDash = NamingStrategy.generateResourceName(construct, { separator: '-' });
      const nameWithUnderscore = NamingStrategy.generateResourceName(construct, { separator: '_' });
      
      // Since underscores get sanitized to the separator, we should see different behavior
      expect(nameWithDash).toContain('-');
      // The underscore separator will be sanitized to hyphens for DNS compliance
      expect(nameWithUnderscore).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
    });

    it('should handle empty or invalid construct IDs', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, '');
      
      const name = NamingStrategy.generateResourceName(construct);
      
      expect(name).toBeDefined();
      expect(name.length).toBeGreaterThan(0);
      expect(name).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
    });
  });

  describe('generateLabels', () => {
    it('should generate standard Kubernetes labels', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'MyResource');
      
      const labels = NamingStrategy.generateLabels(construct);
      
      expect(labels['app.kubernetes.io/name']).toBe('MyResource');
      expect(labels['app.kubernetes.io/managed-by']).toBe('konverge');
      expect(labels['konverge.io/construct-id']).toBeDefined();
    });

    it('should include stack labels when construct is in a stack', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'MyResource');
      
      const labels = NamingStrategy.generateLabels(construct);
      
      expect(labels['konverge.io/stack-name']).toBe('TestStack');
      expect(labels['env']).toBe('test'); // From stack labels
    });

    it('should truncate long construct paths in labels', () => {
      class TestConstruct extends Construct {}
      const longId = 'a'.repeat(70);
      const construct = new TestConstruct(stack, longId);
      
      const labels = NamingStrategy.generateLabels(construct);
      
      expect(labels['konverge.io/construct-id'].length).toBeLessThanOrEqual(63);
    });

    it('should handle constructs not in a stack', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(app, 'MyResource');
      
      const labels = NamingStrategy.generateLabels(construct);
      
      expect(labels['app.kubernetes.io/name']).toBe('MyResource');
      expect(labels['app.kubernetes.io/managed-by']).toBe('konverge');
      expect(labels['konverge.io/stack-name']).toBeUndefined();
    });
  });

  describe('generateAnnotations', () => {
    it('should generate construct path annotation', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'MyResource');
      
      const annotations = NamingStrategy.generateAnnotations(construct);
      
      expect(annotations['konverge.io/construct-path']).toBe(construct.node.path);
    });

    it('should include stack information when available', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'MyResource');
      
      const annotations = NamingStrategy.generateAnnotations(construct);
      
      expect(annotations['konverge.io/stack-name']).toBe('TestStack');
      expect(annotations['konverge.io/stack-namespace']).toBe('test-namespace');
    });

    it('should handle constructs not in a stack', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(app, 'MyResource');
      
      const annotations = NamingStrategy.generateAnnotations(construct);
      
      expect(annotations['konverge.io/construct-path']).toBe(construct.node.path);
      expect(annotations['konverge.io/stack-name']).toBeUndefined();
    });
  });

  describe('detectNameCollision', () => {
    it('should detect name collisions between siblings', () => {
      class TestConstruct extends Construct {}
      new TestConstruct(stack, 'MyResource');
      const construct2 = new TestConstruct(stack, 'MyResource2');
      
      // Mock the generateResourceName to return the same name
      const originalGenerate = NamingStrategy.generateResourceName;
      jest.spyOn(NamingStrategy, 'generateResourceName').mockReturnValue('same-name');
      
      const hasCollision = NamingStrategy.detectNameCollision(construct2, 'same-name');
      
      expect(hasCollision).toBe(true);
      
      // Restore original method
      NamingStrategy.generateResourceName = originalGenerate;
    });

    it('should not detect collision when names are different', () => {
      class TestConstruct extends Construct {}
      new TestConstruct(stack, 'MyResource1');
      const construct2 = new TestConstruct(stack, 'MyResource2');
      
      const hasCollision = NamingStrategy.detectNameCollision(construct2, 'unique-name');
      
      expect(hasCollision).toBe(false);
    });

    it('should return false for root constructs', () => {
      const hasCollision = NamingStrategy.detectNameCollision(app, 'any-name');
      
      expect(hasCollision).toBe(false);
    });
  });

  describe('resolveNameCollision', () => {
    it('should resolve name collisions by appending counter', () => {
      class TestConstruct extends Construct {}
      new TestConstruct(stack, 'MyResource');
      const construct2 = new TestConstruct(stack, 'MyResource2');
      
      // Mock detectNameCollision to return true for first few attempts
      let callCount = 0;
      jest.spyOn(NamingStrategy, 'detectNameCollision').mockImplementation(() => {
        callCount++;
        return callCount <= 2; // First two calls return true (collision), third returns false
      });
      
      const resolvedName = NamingStrategy.resolveNameCollision(construct2, 'base-name');
      
      expect(resolvedName).toBe('base-name-3');
    });

    it('should throw error if unable to resolve after many attempts', () => {
      class TestConstruct extends Construct {}
      const construct = new TestConstruct(stack, 'MyResource');
      
      // Mock detectNameCollision to always return true
      jest.spyOn(NamingStrategy, 'detectNameCollision').mockReturnValue(true);
      
      expect(() => {
        NamingStrategy.resolveNameCollision(construct, 'base-name');
      }).toThrow('Unable to resolve name collision');
    });
  });

  describe('validateResourceName', () => {
    it('should validate correct DNS names', () => {
      const result = NamingStrategy.validateResourceName('valid-name-123');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty names', () => {
      const result = NamingStrategy.validateResourceName('');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name cannot be empty');
    });

    it('should reject names that are too long', () => {
      const longName = 'a'.repeat(64);
      const result = NamingStrategy.validateResourceName(longName);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Name cannot exceed 63 characters');
    });

    it('should reject names with invalid characters', () => {
      const result = NamingStrategy.validateResourceName('Invalid_Name.With@Chars');
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject names starting or ending with hyphens', () => {
      const result1 = NamingStrategy.validateResourceName('-invalid-name');
      const result2 = NamingStrategy.validateResourceName('invalid-name-');
      
      expect(result1.isValid).toBe(false);
      expect(result2.isValid).toBe(false);
    });

    it('should provide suggested names for invalid inputs', () => {
      const result = NamingStrategy.validateResourceName('Invalid_Name');
      
      expect(result.isValid).toBe(false);
      expect(result.suggestedName).toBeDefined();
      expect(result.suggestedName).toMatch(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/);
    });
  });

  describe('validateLabelKey', () => {
    it('should validate correct label keys', () => {
      const result = NamingStrategy.validateLabelKey('app.kubernetes.io/name');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate simple label keys', () => {
      const result = NamingStrategy.validateLabelKey('environment');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty label keys', () => {
      const result = NamingStrategy.validateLabelKey('');
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Label key cannot be empty');
    });

    it('should reject label keys that are too long', () => {
      const longKey = 'a'.repeat(64);
      const result = NamingStrategy.validateLabelKey(longKey);
      
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateLabelValue', () => {
    it('should validate correct label values', () => {
      const result = NamingStrategy.validateLabelValue('production');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate empty label values', () => {
      const result = NamingStrategy.validateLabelValue('');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject label values that are too long', () => {
      const longValue = 'a'.repeat(64);
      const result = NamingStrategy.validateLabelValue(longValue);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Label value cannot exceed 63 characters');
    });

    it('should validate label values with allowed special characters', () => {
      const result = NamingStrategy.validateLabelValue('value-with_dots.and-hyphens');
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});