import { Construct, ConstructNode } from '../../src/core/construct';

class TestConstruct extends Construct {
  constructor(scope: Construct | undefined, id: string) {
    super(scope, id);
  }
}

describe('Construct', () => {
  test('should create a construct with proper node', () => {
    const construct = new TestConstruct(undefined, 'test');
    
    expect(construct.node).toBeInstanceOf(ConstructNode);
    expect(construct.node.id).toBe('test');
    expect(construct.node.scope).toBeUndefined();
    expect(construct.node.path).toBe('test');
  });

  test('should create child constructs with proper hierarchy', () => {
    const parent = new TestConstruct(undefined, 'parent');
    const child = new TestConstruct(parent, 'child');
    
    expect(child.node.scope).toBe(parent);
    expect(child.node.path).toBe('parent/child');
    expect(parent.node.children).toContain(child);
  });

  test('should prevent duplicate child IDs', () => {
    const parent = new TestConstruct(undefined, 'parent');
    new TestConstruct(parent, 'child');
    
    expect(() => {
      new TestConstruct(parent, 'child');
    }).toThrow("There is already a Construct with name 'child' in parent");
  });

  test('should find root construct', () => {
    const root = new TestConstruct(undefined, 'root');
    const child = new TestConstruct(root, 'child');
    const grandchild = new TestConstruct(child, 'grandchild');
    
    expect(grandchild.node.root).toBe(root);
    expect(child.node.root).toBe(root);
    expect(root.node.root).toBe(root);
  });

  test('should manage metadata', () => {
    const construct = new TestConstruct(undefined, 'test');
    
    construct.node.setMetadata('key1', 'value1');
    construct.node.setMetadata('key2', { nested: 'object' });
    
    expect(construct.node.getMetadata('key1')).toBe('value1');
    expect(construct.node.getMetadata('key2')).toEqual({ nested: 'object' });
    expect(construct.node.metadata).toEqual({
      key1: 'value1',
      key2: { nested: 'object' }
    });
  });

  test('should find children by ID', () => {
    const parent = new TestConstruct(undefined, 'parent');
    const child1 = new TestConstruct(parent, 'child1');
    const child2 = new TestConstruct(parent, 'child2');
    
    expect(parent.node.findChild('child1')).toBe(child1);
    expect(parent.node.findChild('child2')).toBe(child2);
    expect(parent.node.findChild('nonexistent')).toBeUndefined();
  });

  test('should find all constructs in subtree', () => {
    const root = new TestConstruct(undefined, 'root');
    const child1 = new TestConstruct(root, 'child1');
    const child2 = new TestConstruct(root, 'child2');
    const grandchild = new TestConstruct(child1, 'grandchild');
    
    const all = root.node.findAll();
    expect(all).toHaveLength(4);
    expect(all).toContain(root);
    expect(all).toContain(child1);
    expect(all).toContain(child2);
    expect(all).toContain(grandchild);
  });

  test('should find constructs matching predicate', () => {
    const root = new TestConstruct(undefined, 'root');
    const child1 = new TestConstruct(root, 'child1');
    const child2 = new TestConstruct(root, 'child2');
    
    const childrenOnly = root.node.findAll(c => c.node.id.startsWith('child'));
    expect(childrenOnly).toHaveLength(2);
    expect(childrenOnly).toContain(child1);
    expect(childrenOnly).toContain(child2);
    expect(childrenOnly).not.toContain(root);
  });

  test('should convert to string representation', () => {
    const root = new TestConstruct(undefined, 'root');
    const child = new TestConstruct(root, 'child');
    
    expect(root.toString()).toBe('root');
    expect(child.toString()).toBe('root/child');
  });
});