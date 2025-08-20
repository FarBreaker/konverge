/**
 * Base class for all constructs in the Konverge framework.
 * Constructs represent a "cloud component" and encapsulate everything
 * needed to create one or more Kubernetes resources.
 */
export abstract class Construct {
  /**
   * The construct node associated with this construct.
   */
  public readonly node: ConstructNode;

  /**
   * Creates a new construct.
   * @param scope The parent construct
   * @param id The construct identifier
   */
  constructor(scope: Construct | undefined, id: string) {
    this.node = new ConstructNode(this, scope, id);
    
    if (scope) {
      scope.node.addChild(this);
    }
  }

  /**
   * Returns a string representation of this construct.
   */
  public toString(): string {
    return this.node.path || this.node.id;
  }
}

/**
 * Represents the construct node in the construct tree.
 */
export class ConstructNode {
  /**
   * The construct this node represents.
   */
  public readonly construct: Construct;

  /**
   * The parent construct (undefined for root constructs).
   */
  public readonly scope: Construct | undefined;

  /**
   * The identifier of this construct within its scope.
   */
  public readonly id: string;

  /**
   * All direct children of this construct.
   */
  private readonly _children: Construct[] = [];

  /**
   * Metadata associated with this construct.
   */
  private readonly _metadata: { [key: string]: any } = {};

  constructor(construct: Construct, scope: Construct | undefined, id: string) {
    this.construct = construct;
    this.scope = scope;
    this.id = id;
  }

  /**
   * Returns the full path of this construct in the tree.
   */
  public get path(): string {
    if (!this.scope) {
      return this.id;
    }
    return `${this.scope.node.path}/${this.id}`;
  }

  /**
   * Returns all direct children of this construct.
   */
  public get children(): readonly Construct[] {
    return [...this._children];
  }

  /**
   * Returns the root construct of the tree.
   */
  public get root(): Construct {
    let curr: Construct = this.construct;
    while (curr.node.scope) {
      curr = curr.node.scope;
    }
    return curr;
  }

  /**
   * Adds a child construct to this node.
   * @param child The child construct to add
   */
  public addChild(child: Construct): void {
    // Check for duplicate IDs
    const existing = this._children.find(c => c.node.id === child.node.id);
    if (existing) {
      throw new Error(`There is already a Construct with name '${child.node.id}' in ${this.construct.toString()}`);
    }

    this._children.push(child);
  }

  /**
   * Sets metadata for this construct.
   * @param key The metadata key
   * @param value The metadata value
   */
  public setMetadata(key: string, value: any): void {
    this._metadata[key] = value;
  }

  /**
   * Gets metadata for this construct.
   * @param key The metadata key
   */
  public getMetadata(key: string): any {
    return this._metadata[key];
  }

  /**
   * Returns all metadata for this construct.
   */
  public get metadata(): { [key: string]: any } {
    return { ...this._metadata };
  }

  /**
   * Finds a child construct by ID.
   * @param id The construct ID to find
   */
  public findChild(id: string): Construct | undefined {
    return this._children.find(child => child.node.id === id);
  }

  /**
   * Finds all constructs in the subtree that match the given predicate.
   * @param predicate The predicate function
   */
  public findAll(predicate?: (construct: Construct) => boolean): Construct[] {
    const result: Construct[] = [];
    
    if (!predicate || predicate(this.construct)) {
      result.push(this.construct);
    }

    for (const child of this._children) {
      result.push(...child.node.findAll(predicate));
    }

    return result;
  }
}