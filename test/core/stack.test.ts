import { App, Stack, KubernetesResource, KubernetesManifest } from '../../src/core';

// Test implementation of KubernetesResource
class TestResource extends KubernetesResource {
  public readonly apiVersion = 'v1';
  public readonly kind = 'ConfigMap';

  toManifest(): KubernetesManifest {
    return {
      apiVersion: this.apiVersion,
      kind: this.kind,
      metadata: { ...this.metadata },
      data: { test: 'value' }
    };
  }
}

describe('Stack', () => {
  test('should create a stack with proper properties', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', {
      namespace: 'test-namespace',
      labels: { environment: 'test' }
    });
    
    expect(stack.stackName).toBe('TestStack');
    expect(stack.namespace).toBe('test-namespace');
    expect(stack.labels).toEqual({
      'app.kubernetes.io/managed-by': 'konverge',
      'konverge.io/stack-name': 'TestStack',
      environment: 'test'
    });
  });

  test('should create a stack with default properties', () => {
    const app = new App();
    const stack = new Stack(app, 'DefaultStack');
    
    expect(stack.stackName).toBe('DefaultStack');
    expect(stack.namespace).toBeUndefined();
    expect(stack.labels).toEqual({
      'app.kubernetes.io/managed-by': 'konverge',
      'konverge.io/stack-name': 'DefaultStack'
    });
  });

  test('should register with parent app', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    
    expect(app.stacks).toContain(stack);
    expect(stack.node.scope).toBe(app);
  });

  test('should track resources added to it', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    const resource = new TestResource(stack, 'TestResource');
    
    stack.addResource(resource);
    
    expect(stack.resources).toContain(resource);
    expect(stack.resources).toHaveLength(1);
  });

  test('should not duplicate resources when added multiple times', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    const resource = new TestResource(stack, 'TestResource');
    
    stack.addResource(resource);
    stack.addResource(resource); // Add again
    
    expect(stack.resources).toHaveLength(1);
  });

  test('should synthesize resources with stack metadata', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', {
      namespace: 'test-namespace',
      labels: { environment: 'test' }
    });
    
    new TestResource(stack, 'TestResource');
    
    const manifests = stack.synthesize();
    
    expect(manifests).toHaveLength(1);
    
    const manifest = manifests[0];
    expect(manifest.metadata.namespace).toBe('test-namespace');
    expect(manifest.metadata.labels).toEqual({
      'app.kubernetes.io/managed-by': 'konverge',
      'app.kubernetes.io/name': 'TestResource',
      'konverge.io/construct-id': 'App-TestStack-TestResource',
      'konverge.io/stack-name': 'TestStack',
      environment: 'test'
    });
    expect(manifest.metadata.annotations).toMatchObject({
      'konverge.io/stack-name': 'TestStack',
      'konverge.io/synthesized-at': expect.any(String),
      'konverge.io/construct-path': expect.any(String)
    });
  });

  test('should preserve existing resource metadata', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', {
      namespace: 'test-namespace',
      labels: { environment: 'test' }
    });
    
    new TestResource(stack, 'TestResource', {
      metadata: {
        labels: { component: 'database' },
        annotations: { 'custom.io/annotation': 'value' }
      }
    });
    
    const manifests = stack.synthesize();
    const manifest = manifests[0];
    
    // Should merge labels, with stack labels taking precedence for conflicts
    expect(manifest.metadata.labels).toEqual({
      'app.kubernetes.io/managed-by': 'konverge',
      'app.kubernetes.io/name': 'TestResource',
      'konverge.io/construct-id': 'App-TestStack-TestResource',
      'konverge.io/stack-name': 'TestStack',
      environment: 'test',
      component: 'database'
    });
    
    // Should merge annotations
    expect(manifest.metadata.annotations).toMatchObject({
      'konverge.io/stack-name': 'TestStack',
      'custom.io/annotation': 'value',
      'konverge.io/synthesized-at': expect.any(String),
      'konverge.io/construct-path': expect.any(String)
    });
  });

  test('should not override existing namespace in resource', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack', {
      namespace: 'stack-namespace'
    });
    
    new TestResource(stack, 'TestResource', {
      metadata: {
        namespace: 'resource-namespace'
      }
    });
    
    const manifests = stack.synthesize();
    const manifest = manifests[0];
    
    // Should keep the resource's original namespace
    expect(manifest.metadata.namespace).toBe('resource-namespace');
  });

  test('should synthesize multiple resources', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    
    new TestResource(stack, 'Resource1');
    new TestResource(stack, 'Resource2');
    new TestResource(stack, 'Resource3');
    
    const manifests = stack.synthesize();
    
    expect(manifests).toHaveLength(3);
    
    const resourceNames = manifests.map(m => m.metadata.name);
    expect(resourceNames).toContain('app-teststack-resource1');
    expect(resourceNames).toContain('app-teststack-resource2');
    expect(resourceNames).toContain('app-teststack-resource3');
  });

  test('should handle nested constructs with resources', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    
    // Create a nested construct
    class NestedConstruct extends KubernetesResource {
      public readonly apiVersion = 'apps/v1';
      public readonly kind = 'Deployment';
      
      constructor(scope: any, id: string) {
        super(scope, id);
        // Add a child resource
        new TestResource(this, 'ChildResource');
      }
      
      toManifest(): KubernetesManifest {
        return {
          apiVersion: this.apiVersion,
          kind: this.kind,
          metadata: { ...this.metadata }
        };
      }
    }
    
    new NestedConstruct(stack, 'NestedConstruct');
    
    const manifests = stack.synthesize();
    
    // Should find both the nested construct and its child resource
    expect(manifests).toHaveLength(2);
    
    const kinds = manifests.map(m => m.kind);
    expect(kinds).toContain('Deployment');
    expect(kinds).toContain('ConfigMap');
  });
});