import { Construct } from './construct';
import { App } from './app';
import { KubernetesResource } from './kubernetes-resource';
import { KubernetesManifest } from './types';
import { Synthesizer } from './synthesizer';

/**
 * Properties for Stack construct.
 */
export interface StackProps {
  /**
   * The namespace for resources in this stack.
   */
  namespace?: string;

  /**
   * Labels to apply to all resources in this stack.
   */
  labels?: { [key: string]: string };
}

/**
 * A Stack is a unit of deployment in the CDK. All resources in a stack are deployed together.
 */
export class Stack extends Construct {
  /**
   * The name of this stack.
   */
  public readonly stackName: string;

  /**
   * The namespace for resources in this stack.
   */
  public readonly namespace: string | undefined;

  /**
   * Labels to apply to all resources in this stack.
   */
  public readonly labels: { [key: string]: string };

  /**
   * Resources registered with this stack.
   */
  private readonly _resources: KubernetesResource[] = [];

  /**
   * Creates a new Stack construct.
   * @param scope The parent App construct
   * @param id The stack identifier
   * @param props Stack properties
   */
  constructor(scope: App, id: string, props: StackProps = {}) {
    super(scope, id);
    
    this.stackName = id;
    this.namespace = props.namespace;
    this.labels = {
      'app.kubernetes.io/managed-by': 'konverge',
      'konverge.io/stack-name': id,
      ...props.labels || {}
    };

    // Register this stack with the app
    scope.addStack(this);
  }

  /**
   * Returns all resources in this stack.
   */
  public get resources(): readonly KubernetesResource[] {
    return [...this._resources];
  }

  /**
   * Adds a resource to this stack.
   * @param resource The resource to add
   */
  public addResource(resource: KubernetesResource): void {
    if (!this._resources.includes(resource)) {
      this._resources.push(resource);
    }
  }

  /**
   * Synthesizes this stack and returns Kubernetes manifests.
   * This method traverses all resources and generates their manifests with proper metadata.
   */
  public synthesize(): KubernetesManifest[] {
    // Use the Synthesizer to visit all constructs in this stack
    const manifests = Synthesizer.visitConstruct(this);
    
    // Apply stack-level metadata to all manifests
    for (const manifest of manifests) {
      this.applyStackMetadata(manifest);
    }
    
    return manifests;
  }

  /**
   * Applies stack-level metadata to a resource manifest.
   * @param manifest The manifest to modify
   */
  private applyStackMetadata(manifest: KubernetesManifest): void {
    // Apply namespace if specified
    if (this.namespace && !manifest.metadata.namespace) {
      manifest.metadata.namespace = this.namespace;
    }
    
    // Merge stack labels with resource labels
    manifest.metadata.labels = {
      ...this.labels,
      ...manifest.metadata.labels || {}
    };
    
    // Add stack annotations
    manifest.metadata.annotations = {
      'konverge.io/stack-name': this.stackName,
      ...manifest.metadata.annotations || {}
    };
  }
}