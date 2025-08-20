import { App } from './app';
import { Construct } from './construct';
import { KubernetesResource } from './kubernetes-resource';
import { KubernetesManifest } from './types';
import { DependencyTracker } from './dependency-tracker';

/**
 * The Synthesizer is responsible for walking the construct tree and generating Kubernetes manifests.
 * It handles resource ordering, dependency resolution, and manifest generation.
 */
export class Synthesizer {
  /**
   * Synthesizes an App construct and returns a CloudAssembly.
   * This is the main entry point for the synthesis process.
   * @param app The App construct to synthesize
   * @returns A CloudAssembly containing all generated manifests
   */
  public static synthesize(app: App): any {
    return app.synth();
  }

  /**
   * Visits a construct and all its children to collect Kubernetes manifests.
   * This method recursively traverses the construct tree and generates manifests
   * for all KubernetesResource constructs found, respecting dependency order.
   * @param construct The construct to visit
   * @returns Array of Kubernetes manifests in dependency order
   */
  public static visitConstruct(construct: Construct): KubernetesManifest[] {
    // Collect all constructs in the tree
    const allConstructs = this.getAllConstructsInTree(construct);
    
    // Get dependency tracker and auto-detect dependencies
    const tracker = DependencyTracker.getInstance();
    tracker.autoDetectDependencies(allConstructs);
    
    // Check for circular dependencies
    const circularDeps = tracker.detectCircularDependencies(construct);
    if (circularDeps.length > 0) {
      throw new Error(`Circular dependencies detected: ${circularDeps.map(cycle => cycle.join(' -> ')).join(', ')}`);
    }
    
    // Get resources in dependency order
    const orderedResources = tracker.getOrderedResources(allConstructs);
    
    // Generate manifests for ordered resources
    const manifests: KubernetesManifest[] = [];
    for (const resource of orderedResources) {
      const manifest = this.generateManifest(resource);
      manifests.push(manifest);
    }
    
    return manifests;
  }

  /**
   * Gets all constructs in a construct tree.
   * @param rootConstruct The root construct
   * @returns Array of all constructs in the tree
   */
  private static getAllConstructsInTree(rootConstruct: Construct): Construct[] {
    const constructs: Construct[] = [rootConstruct];
    
    for (const child of rootConstruct.node.children) {
      constructs.push(...this.getAllConstructsInTree(child));
    }
    
    return constructs;
  }

  /**
   * Generates a Kubernetes manifest from a KubernetesResource construct.
   * This method calls the resource's toManifest method and applies additional
   * processing such as validation and metadata enhancement.
   * @param resource The KubernetesResource to generate a manifest for
   * @returns The generated Kubernetes manifest
   */
  public static generateManifest(resource: KubernetesResource): KubernetesManifest {
    // Validate the resource before generating manifest
    const validationErrors = resource.validate();
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed for resource ${resource.node.path}: ${validationErrors.join(', ')}`);
    }
    
    // Generate the manifest
    const manifest = resource.toManifest();
    
    // Apply additional processing
    this.processManifest(manifest, resource);
    
    return manifest;
  }

  /**
   * Processes a generated manifest to apply additional metadata and validation.
   * @param manifest The manifest to process
   * @param resource The source resource
   */
  private static processManifest(manifest: KubernetesManifest, resource: KubernetesResource): void {
    // Ensure metadata exists
    if (!manifest.metadata) {
      manifest.metadata = {};
    }
    
    // Add synthesis metadata
    manifest.metadata.annotations = {
      ...manifest.metadata.annotations,
      'konverge.io/synthesized-at': new Date().toISOString(),
      'konverge.io/construct-path': resource.node.path,
    };
    
    // Validate the final manifest structure
    this.validateManifest(manifest);
  }

  /**
   * Validates a Kubernetes manifest for basic structural correctness.
   * @param manifest The manifest to validate
   */
  private static validateManifest(manifest: KubernetesManifest): void {
    if (!manifest.apiVersion) {
      throw new Error('Manifest must have an apiVersion');
    }
    
    if (!manifest.kind) {
      throw new Error('Manifest must have a kind');
    }
    
    if (!manifest.metadata) {
      throw new Error('Manifest must have metadata');
    }
    
    if (!manifest.metadata.name) {
      throw new Error('Manifest metadata must have a name');
    }
  }

  /**
   * Orders resources based on their dependencies and Kubernetes best practices.
   * This method implements a topological sort to ensure resources are created
   * in the correct order (e.g., ConfigMaps before Deployments that use them).
   * @param manifests The manifests to order
   * @returns The ordered manifests
   */
  public static orderResources(manifests: KubernetesManifest[]): KubernetesManifest[] {
    // Define resource priority order (lower numbers = higher priority)
    const resourcePriority: { [kind: string]: number } = {
      'Namespace': 0,
      'ServiceAccount': 1,
      'Secret': 2,
      'ConfigMap': 3,
      'PersistentVolume': 4,
      'PersistentVolumeClaim': 5,
      'Role': 6,
      'ClusterRole': 7,
      'RoleBinding': 8,
      'ClusterRoleBinding': 9,
      'Service': 10,
      'Deployment': 11,
      'StatefulSet': 12,
      'DaemonSet': 13,
      'Job': 14,
      'CronJob': 15,
      'Ingress': 16,
    };

    // Sort manifests by priority, then by name for consistency
    return manifests.sort((a, b) => {
      const priorityA = resourcePriority[a.kind] ?? 999;
      const priorityB = resourcePriority[b.kind] ?? 999;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // If same priority, sort by name
      const nameA = a.metadata.name || '';
      const nameB = b.metadata.name || '';
      return nameA.localeCompare(nameB);
    });
  }

  /**
   * Resolves dependencies between resources by analyzing their references.
   * This method identifies resources that depend on others (e.g., Deployments
   * that reference ConfigMaps) and ensures proper ordering.
   * @param manifests The manifests to analyze
   * @returns A dependency graph representation
   */
  public static resolveDependencies(manifests: KubernetesManifest[]): DependencyGraph {
    const graph = new DependencyGraph();
    
    // Add all resources to the graph
    for (const manifest of manifests) {
      const resourceId = this.getResourceId(manifest);
      graph.addNode(resourceId, manifest);
    }
    
    // Analyze dependencies
    for (const manifest of manifests) {
      const resourceId = this.getResourceId(manifest);
      const dependencies = this.findResourceDependencies(manifest, manifests);
      
      for (const dependency of dependencies) {
        graph.addEdge(dependency, resourceId);
      }
    }
    
    return graph;
  }

  /**
   * Gets a unique identifier for a resource.
   * @param manifest The manifest to get an ID for
   * @returns A unique resource identifier
   */
  private static getResourceId(manifest: KubernetesManifest): string {
    const namespace = manifest.metadata.namespace || 'default';
    return `${namespace}/${manifest.kind}/${manifest.metadata.name}`;
  }

  /**
   * Finds dependencies for a given resource by analyzing its specification.
   * @param manifest The manifest to analyze
   * @param allManifests All available manifests to check against
   * @returns Array of resource IDs that this resource depends on
   */
  private static findResourceDependencies(manifest: KubernetesManifest, allManifests: KubernetesManifest[]): string[] {
    const dependencies: string[] = [];
    
    // Analyze different types of dependencies based on resource kind
    switch (manifest.kind) {
      case 'Deployment':
        dependencies.push(...this.findDeploymentDependencies(manifest, allManifests));
        break;
      case 'Service':
        dependencies.push(...this.findServiceDependencies(manifest, allManifests));
        break;
      // Add more resource types as needed
    }
    
    return dependencies;
  }

  /**
   * Finds dependencies for Deployment resources.
   * @param manifest The Deployment manifest
   * @param allManifests All available manifests
   * @returns Array of dependency resource IDs
   */
  private static findDeploymentDependencies(manifest: KubernetesManifest, allManifests: KubernetesManifest[]): string[] {
    const dependencies: string[] = [];
    const spec = manifest.spec;
    
    if (!spec || !spec.template || !spec.template.spec) {
      return dependencies;
    }
    
    const podSpec = spec.template.spec;
    
    // Check for ConfigMap references
    if (podSpec.containers) {
      for (const container of podSpec.containers) {
        if (container.env) {
          for (const envVar of container.env) {
            if (envVar.valueFrom?.configMapKeyRef?.name) {
              const configMapId = this.findResourceByName('ConfigMap', envVar.valueFrom.configMapKeyRef.name, manifest.metadata.namespace, allManifests);
              if (configMapId) {
                dependencies.push(configMapId);
              }
            }
          }
        }
      }
    }
    
    // Check for volume references to ConfigMaps and Secrets
    if (podSpec.volumes) {
      for (const volume of podSpec.volumes) {
        if (volume.configMap?.name) {
          const configMapId = this.findResourceByName('ConfigMap', volume.configMap.name, manifest.metadata.namespace, allManifests);
          if (configMapId) {
            dependencies.push(configMapId);
          }
        }
        if (volume.secret?.secretName) {
          const secretId = this.findResourceByName('Secret', volume.secret.secretName, manifest.metadata.namespace, allManifests);
          if (secretId) {
            dependencies.push(secretId);
          }
        }
      }
    }
    
    return dependencies;
  }

  /**
   * Finds dependencies for Service resources.
   * @param _manifest The Service manifest
   * @param _allManifests All available manifests
   * @returns Array of dependency resource IDs
   */
  private static findServiceDependencies(_manifest: KubernetesManifest, _allManifests: KubernetesManifest[]): string[] {
    // Services typically don't have explicit dependencies in their spec,
    // but they implicitly depend on the pods they select
    // For now, return empty array - this could be enhanced to find matching Deployments
    return [];
  }

  /**
   * Finds a resource by name and kind in the manifest list.
   * @param kind The resource kind to find
   * @param name The resource name to find
   * @param namespace The namespace to search in
   * @param allManifests All available manifests
   * @returns The resource ID if found, undefined otherwise
   */
  private static findResourceByName(kind: string, name: string, namespace: string | undefined, allManifests: KubernetesManifest[]): string | undefined {
    const targetNamespace = namespace || 'default';
    
    const found = allManifests.find(manifest => 
      manifest.kind === kind && 
      manifest.metadata.name === name &&
      (manifest.metadata.namespace || 'default') === targetNamespace
    );
    
    return found ? this.getResourceId(found) : undefined;
  }
}

/**
 * Represents a dependency graph for Kubernetes resources.
 */
export class DependencyGraph {
  private nodes: Map<string, KubernetesManifest> = new Map();
  private edges: Map<string, Set<string>> = new Map();

  /**
   * Adds a node to the graph.
   * @param id The node identifier
   * @param manifest The manifest associated with this node
   */
  public addNode(id: string, manifest: KubernetesManifest): void {
    this.nodes.set(id, manifest);
    if (!this.edges.has(id)) {
      this.edges.set(id, new Set());
    }
  }

  /**
   * Adds an edge to the graph (dependency relationship).
   * @param from The resource that is depended upon
   * @param to The resource that has the dependency
   */
  public addEdge(from: string, to: string): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, new Set());
    }
    if (!this.edges.has(to)) {
      this.edges.set(to, new Set());
    }
    this.edges.get(from)!.add(to);
  }

  /**
   * Performs a topological sort of the graph to determine deployment order.
   * @returns Array of manifests in dependency order
   */
  public topologicalSort(): KubernetesManifest[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: KubernetesManifest[] = [];

    const visit = (nodeId: string): void => {
      if (visiting.has(nodeId)) {
        throw new Error(`Circular dependency detected involving resource: ${nodeId}`);
      }
      if (visited.has(nodeId)) {
        return;
      }

      visiting.add(nodeId);
      
      const dependencies = this.edges.get(nodeId) || new Set();
      for (const dependency of dependencies) {
        visit(dependency);
      }
      
      visiting.delete(nodeId);
      visited.add(nodeId);
      
      const manifest = this.nodes.get(nodeId);
      if (manifest) {
        result.unshift(manifest); // Add to beginning for correct order
      }
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }

    return result;
  }

  /**
   * Gets all nodes in the graph.
   * @returns Array of all manifests
   */
  public getAllNodes(): KubernetesManifest[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Gets dependencies for a specific resource.
   * @param resourceId The resource to get dependencies for
   * @returns Array of resource IDs that this resource depends on
   */
  public getDependencies(resourceId: string): string[] {
    const result: string[] = [];
    
    // Find all nodes that this resource depends on (incoming edges)
    for (const [nodeId, edges] of this.edges.entries()) {
      if (edges.has(resourceId)) {
        result.push(nodeId);
      }
    }
    
    return result;
  }
}