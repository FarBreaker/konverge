import { App, CloudAssembly, Stack } from '../../src/core';

describe('App', () => {
  test('should create an app with proper node structure', () => {
    const app = new App();
    
    expect(app.node.id).toBe('App');
    expect(app.node.scope).toBeUndefined();
    expect(app.node.path).toBe('App');
    expect(app.stacks).toHaveLength(0);
  });

  test('should register stacks when they are created', () => {
    const app = new App();
    const stack1 = new Stack(app, 'Stack1');
    const stack2 = new Stack(app, 'Stack2');
    
    expect(app.stacks).toHaveLength(2);
    expect(app.stacks).toContain(stack1);
    expect(app.stacks).toContain(stack2);
  });

  test('should not duplicate stacks when added multiple times', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    
    // Try to add the same stack again
    app.addStack(stack);
    
    expect(app.stacks).toHaveLength(1);
    expect(app.stacks[0]).toBe(stack);
  });

  test('should synthesize all stacks', () => {
    const app = new App();
    new Stack(app, 'Stack1');
    new Stack(app, 'Stack2');
    
    const assembly = app.synth();
    
    expect(assembly).toBeInstanceOf(CloudAssembly);
    expect(assembly.stacks).toHaveLength(2);
    
    const stackNames = assembly.stacks.map(s => s.stackName);
    expect(stackNames).toContain('Stack1');
    expect(stackNames).toContain('Stack2');
  });

  test('should maintain parent-child relationships with stacks', () => {
    const app = new App();
    const stack = new Stack(app, 'TestStack');
    
    expect(stack.node.scope).toBe(app);
    expect(app.node.children).toContain(stack);
  });
});

describe('CloudAssembly', () => {
  test('should create empty assembly', () => {
    const assembly = new CloudAssembly();
    
    expect(assembly.stacks).toHaveLength(0);
  });

  test('should add and retrieve stack manifests', () => {
    const assembly = new CloudAssembly();
    const manifests = [
      { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'test' } }
    ];
    
    assembly.addStackManifests('TestStack', manifests);
    
    expect(assembly.stacks).toHaveLength(1);
    expect(assembly.stacks[0].stackName).toBe('TestStack');
    expect(assembly.stacks[0].manifests).toBe(manifests);
  });

  test('should retrieve specific stack manifests', () => {
    const assembly = new CloudAssembly();
    const manifests1 = [{ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'config1' } }];
    const manifests2 = [{ apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'deploy1' } }];
    
    assembly.addStackManifests('Stack1', manifests1);
    assembly.addStackManifests('Stack2', manifests2);
    
    const stack1Manifest = assembly.getStackManifests('Stack1');
    const stack2Manifest = assembly.getStackManifests('Stack2');
    const nonExistentManifest = assembly.getStackManifests('NonExistent');
    
    expect(stack1Manifest?.stackName).toBe('Stack1');
    expect(stack1Manifest?.manifests).toBe(manifests1);
    expect(stack2Manifest?.stackName).toBe('Stack2');
    expect(stack2Manifest?.manifests).toBe(manifests2);
    expect(nonExistentManifest).toBeUndefined();
  });

  test('should handle multiple stacks', () => {
    const assembly = new CloudAssembly();
    
    assembly.addStackManifests('Stack1', []);
    assembly.addStackManifests('Stack2', []);
    assembly.addStackManifests('Stack3', []);
    
    expect(assembly.stacks).toHaveLength(3);
    
    const stackNames = assembly.stacks.map(s => s.stackName);
    expect(stackNames).toContain('Stack1');
    expect(stackNames).toContain('Stack2');
    expect(stackNames).toContain('Stack3');
  });
});