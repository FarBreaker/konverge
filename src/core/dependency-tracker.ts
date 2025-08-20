import { Construct } from './construct';
import { KubernetesResource } from './kubernetes-resource';

/**
 * Represents a dependency relationship between constructs.
 */
export interface ConstructDependency {
  /**
   * The construct that depends on another.
   */
  dependent: Construct;

  /**
   * The construct that is depended upon.
   */
  dependency: Construct;

  /**
   * The type of dependency relationship.
   */
  type: DependencyType;

  /**
   * Optional description of the dependency.
   */
  description?: string;
}

/**
 * Types of dependency relationships.
 */
export enum DependencyType {
  /**
   * The dependent construct requires the dependency to be created first.
   */
  CREATION_ORDER = 'creation-order',

  /**
   * The dependent construct references the dependency at runtime.
   */
  RUNTIME_REFERENCE = 'runtime-reference',

  /**
   * The dependent construct uses configuration from the dependency.
   */
  CONFIGURATION = 'configuration',

  /**
   * The dependent construct needs the dependency's network connectivity.
   */
  NETWORK = 'network',

  /**
   * Custom dependency type for specific use cases.
   */
  CUSTOM = 'custom'
}

/**
 * Tracks dependencies between constructs to ensure proper resource ordering.
 */
export class DependencyTracker {
  private static instance: DependencyTracker;
  private dependencies: Map<string, ConstructDependency[]> = new Map();

  /**
   * Gets the singleton instance of the DependencyTracker.
   */
  public static getInstance(): DependencyTracker {
    if (!DependencyTracker.instance) {
      DependencyTracker.instance = new DependencyTracker();
    }
    return DependencyTracker.instance;
  }

  /**
   * Resets the singleton instance (useful for testing).
   */
  public static reset(): void {
    DependencyTracker.instance = new DependencyTracker();
  }

  /**
   * Adds a dependency relationship between two constructs.
   * @param dependent The construct that depends on another
   * @param dependency The construct that is depended upon
   * @param type The type of dependency
   * @param description Optional description of the dependency
   */
  public addDependency(
    dependent: Construct,
    dependency: Construct,
    type: DependencyType = DependencyType.CREATION_ORDER,
    description?: string
  ): void {
    const dependentId = dependent.node.path;
    
    if (!this.dependencies.has(dependentId)) {
      this.dependencies.set(dependentId, []);
    }

    const existingDependency = this.dependencies.get(dependentId)!.find(
      dep => dep.dependency.node.path === dependency.node.path && dep.type === type
    );

    if (!existingDependency) {
      const dep: ConstructDependency = {
        dependent,
        dependency,
        type
      };
      
      if (description !== undefined) {
        dep.description = description;
      }
      
      this.dependencies.get(dependentId)!.push(dep);
    }
  }

  /**
   * Gets all dependencies for a specific construct.
   * @param construct The construct to get dependencies for
   * @returns Array of dependency relationships
   */
  public getDependencies(construct: Construct): ConstructDependency[] {
    return this.dependencies.get(construct.node.path) || [];
  }

  /**
   * Gets all constructs that depend on the specified construct.
   * @param construct The construct to find dependents for
   * @returns Array of constructs that depend on the specified construct
   */
  public getDependents(construct: Construct): Construct[] {
    const dependents: Construct[] = [];
    const targetPath = construct.node.path;

    for (const deps of this.dependencies.values()) {
      for (const dep of deps) {
        if (dep.dependency.node.path === targetPath) {
          dependents.push(dep.dependent);
        }
      }
    }

    return dependents;
  }

  /**
   * Checks if there are any circular dependencies in the construct tree.
   * @param rootConstruct The root construct to start checking from
   * @returns Array of circular dependency paths, empty if none found
   */
  public detectCircularDependencies(rootConstruct: Construct): string[][] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const circularPaths: string[][] = [];

    const visit = (construct: Construct, path: string[]): void => {
      const constructPath = construct.node.path;
      
      if (visiting.has(constructPath)) {
        // Found a circular dependency
        const cycleStart = path.indexOf(constructPath);
        if (cycleStart >= 0) {
          circularPaths.push([...path.slice(cycleStart), constructPath]);
        }
        return;
      }

      if (visited.has(constructPath)) {
        return;
      }

      visiting.add(constructPath);
      const newPath = [...path, constructPath];

      // Visit all dependencies
      const dependencies = this.getDependencies(construct);
      for (const dep of dependencies) {
        visit(dep.dependency, newPath);
      }

      visiting.delete(constructPath);
      visited.add(constructPath);
    };

    // Start from root and visit all constructs
    const allConstructs = this.getAllConstructsInTree(rootConstruct);
    for (const construct of allConstructs) {
      if (!visited.has(construct.node.path)) {
        visit(construct, []);
      }
    }

    return circularPaths;
  }

  /**
   * Orders constructs based on their dependencies using topological sort.
   * @param constructs The constructs to order
   * @returns Array of constructs in dependency order
   */
  public orderConstructs(constructs: Construct[]): Construct[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: Construct[] = [];
    const constructMap = new Map<string, Construct>();

    // Create a map for quick lookup
    for (const construct of constructs) {
      constructMap.set(construct.node.path, construct);
    }

    const visit = (construct: Construct): void => {
      const constructPath = construct.node.path;
      
      if (visiting.has(constructPath)) {
        throw new Error(`Circular dependency detected involving construct: ${constructPath}`);
      }
      
      if (visited.has(constructPath)) {
        return;
      }

      visiting.add(constructPath);

      // Visit all dependencies first
      const dependencies = this.getDependencies(construct);
      for (const dep of dependencies) {
        if (constructMap.has(dep.dependency.node.path)) {
          visit(dep.dependency);
        }
      }

      visiting.delete(constructPath);
      visited.add(constructPath);
      result.push(construct);
    };

    // Visit all constructs
    for (const construct of constructs) {
      if (!visited.has(construct.node.path)) {
        visit(construct);
      }
    }

    return result;
  }

  /**
   * Gets all Kubernetes resources from constructs in dependency order.
   * @param constructs The constructs to extract resources from
   * @returns Array of Kubernetes resources in proper order
   */
  public getOrderedResources(constructs: Construct[]): KubernetesResource[] {
    // Filter to only KubernetesResource instances to avoid duplicates
    const resources = constructs.filter(construct => construct instanceof KubernetesResource) as KubernetesResource[];
    
    // Order the resources based on dependencies
    const orderedConstructs = this.orderConstructs(resources);
    
    return orderedConstructs.filter(construct => construct instanceof KubernetesResource) as KubernetesResource[];
  }

  /**
   * Automatically detects dependencies between constructs based on their configuration.
   * @param constructs The constructs to analyze
   */
  public autoDetectDependencies(constructs: Construct[]): void {
    // Clear existing dependencies to avoid accumulation
    this.clear();

    for (const construct of constructs) {
      this.analyzeConstructDependencies(construct, constructs);
    }
  }

  /**
   * Clears all dependencies tracked by this instance.
   */
  public clear(): void {
    this.dependencies.clear();
  }

  /**
   * Gets all constructs in a construct tree.
   * @param rootConstruct The root construct
   * @returns Array of all constructs in the tree
   */
  private getAllConstructsInTree(rootConstruct: Construct): Construct[] {
    const constructs: Construct[] = [rootConstruct];
    
    for (const child of rootConstruct.node.children) {
      constructs.push(...this.getAllConstructsInTree(child));
    }
    
    return constructs;
  }



  /**
   * Analyzes a construct to detect its dependencies automatically.
   * @param construct The construct to analyze
   * @param allConstructs All available constructs for reference
   */
  private analyzeConstructDependencies(construct: Construct, allConstructs: Construct[]): void {
    // This is a simplified implementation - in a real system, this would
    // analyze the construct's configuration to detect references to other constructs
    
    // For now, we'll implement basic patterns for common construct types
    const constructType = construct.constructor.name;
    
    switch (constructType) {
      case 'WebService':
        this.analyzeWebServiceDependencies(construct, allConstructs);
        break;
      case 'Microservice':
        this.analyzeMicroserviceDependencies(construct, allConstructs);
        break;
      // Add more construct types as needed
    }
  }

  /**
   * Analyzes WebService construct dependencies.
   * @param webService The WebService construct
   * @param _allConstructs All available constructs
   */
  private analyzeWebServiceDependencies(webService: Construct, _allConstructs: Construct[]): void {
    // WebService depends on its ConfigMap if it has one
    const configMapChild = webService.node.children.find(child => 
      child.constructor.name === 'ConfigMap'
    );
    
    if (configMapChild) {
      this.addDependency(
        webService,
        configMapChild,
        DependencyType.CONFIGURATION,
        'WebService depends on its ConfigMap for configuration'
      );
    }
  }

  /**
   * Analyzes Microservice construct dependencies.
   * @param microservice The Microservice construct
   * @param _allConstructs All available constructs
   */
  private analyzeMicroserviceDependencies(microservice: Construct, _allConstructs: Construct[]): void {
    // Microservice web service depends on database if it exists
    const webServiceChild = microservice.node.children.find(child => 
      child.constructor.name === 'WebService'
    );
    const databaseChild = microservice.node.children.find(child => 
      child.constructor.name === 'Database'
    );
    
    if (webServiceChild && databaseChild) {
      this.addDependency(
        webServiceChild,
        databaseChild,
        DependencyType.NETWORK,
        'WebService depends on Database for data access'
      );
    }

    // Shared config dependencies
    const sharedConfigChild = microservice.node.children.find(child => 
      child.constructor.name === 'ConfigMap' && child.node.id === 'shared-config'
    );
    
    if (webServiceChild && sharedConfigChild) {
      this.addDependency(
        webServiceChild,
        sharedConfigChild,
        DependencyType.CONFIGURATION,
        'WebService depends on shared configuration'
      );
    }
  }


}