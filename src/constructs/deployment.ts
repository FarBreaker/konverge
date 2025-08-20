import { Construct } from '../core/construct';
import { KubernetesResource, KubernetesResourceProps } from '../core/kubernetes-resource';
import {
  V1Deployment,
  DeploymentSpec,
  PodTemplateSpec,
  LabelSelector,
  Container,
  ObjectMeta,
} from '../core/types';

/**
 * Properties for the Deployment construct.
 */
export interface DeploymentProps extends KubernetesResourceProps {
  /**
   * Number of desired pods. Defaults to 1.
   */
  replicas?: number;

  /**
   * Label selector for pods. Must match template labels.
   */
  selector: LabelSelector;

  /**
   * Template describes the pods that will be created.
   */
  template: PodTemplateSpec;

  /**
   * Minimum number of seconds for which a newly created pod should be ready.
   */
  minReadySeconds?: number;

  /**
   * The number of old ReplicaSets to retain to allow rollback.
   */
  revisionHistoryLimit?: number;

  /**
   * The maximum time in seconds for a deployment to make progress.
   */
  progressDeadlineSeconds?: number;
}

/**
 * A Deployment provides declarative updates for Pods and ReplicaSets.
 */
export class Deployment extends KubernetesResource {
  public readonly apiVersion = 'apps/v1';
  public readonly kind = 'Deployment';

  private readonly _spec: DeploymentSpec;
  private readonly _containers: Container[] = [];

  /**
   * Creates a new Deployment construct.
   * @param scope The parent construct
   * @param id The deployment identifier
   * @param props Deployment properties
   */
  constructor(scope: Construct, id: string, props: DeploymentProps) {
    super(scope, id, props);

    // Initialize containers from template if provided
    if (props.template.spec?.containers) {
      this._containers.push(...props.template.spec.containers);
    }

    this._spec = {
      replicas: props.replicas ?? 1,
      selector: props.selector,
      template: {
        ...props.template,
        spec: {
          ...props.template.spec,
          containers: this._containers,
        },
      },
      ...(props.minReadySeconds !== undefined && { minReadySeconds: props.minReadySeconds }),
      ...(props.revisionHistoryLimit !== undefined && { revisionHistoryLimit: props.revisionHistoryLimit }),
      ...(props.progressDeadlineSeconds !== undefined && { progressDeadlineSeconds: props.progressDeadlineSeconds }),
    };

    // Validate selector matches template labels
    this.validateSelectorMatchesTemplate();
  }

  /**
   * Adds a container to the deployment template.
   * @param container The container to add
   */
  public addContainer(container: Container): void {
    // Check for duplicate container names
    const existing = this._containers.find(c => c.name === container.name);
    if (existing) {
      throw new Error(`Container with name '${container.name}' already exists in deployment '${this.node.id}'`);
    }

    this._containers.push(container);
    
    // Update the template spec
    if (this._spec.template.spec) {
      this._spec.template.spec.containers = [...this._containers];
    }
  }

  /**
   * Gets all containers in the deployment.
   */
  public get containers(): readonly Container[] {
    return [...this._containers];
  }

  /**
   * Gets the deployment specification.
   */
  public get spec(): DeploymentSpec {
    return { ...this._spec };
  }

  /**
   * Sets the number of replicas for the deployment.
   * @param replicas The number of replicas
   */
  public setReplicas(replicas: number): void {
    if (replicas < 0) {
      throw new Error('Replicas must be a non-negative number');
    }
    this._spec.replicas = replicas;
  }

  /**
   * Updates the pod template metadata.
   * @param metadata The metadata to merge
   */
  public updateTemplateMetadata(metadata: Partial<ObjectMeta>): void {
    this._spec.template.metadata = {
      ...this._spec.template.metadata,
      ...metadata,
      labels: {
        ...this._spec.template.metadata?.labels,
        ...metadata.labels,
      },
      annotations: {
        ...this._spec.template.metadata?.annotations,
        ...metadata.annotations,
      },
    };
  }

  /**
   * Validates that the selector matches the template labels.
   */
  private validateSelectorMatchesTemplate(): void {
    const selectorLabels = this._spec.selector.matchLabels || {};
    const templateLabels = this._spec.template.metadata?.labels || {};

    for (const [key, value] of Object.entries(selectorLabels)) {
      if (templateLabels[key] !== value) {
        throw new Error(
          `Selector label '${key}=${value}' does not match template label '${key}=${templateLabels[key]}' in deployment '${this.node.id}'`
        );
      }
    }
  }

  /**
   * Validates the deployment configuration.
   */
  public validate(): string[] {
    const errors = super.validate();

    // Validate replicas
    if (this._spec.replicas !== undefined && this._spec.replicas < 0) {
      errors.push('Replicas must be a non-negative number');
    }

    // Validate containers exist
    if (!this._containers.length) {
      errors.push('Deployment must have at least one container');
    }

    // Validate container names are unique
    const containerNames = new Set<string>();
    for (const container of this._containers) {
      if (containerNames.has(container.name)) {
        errors.push(`Duplicate container name '${container.name}'`);
      }
      containerNames.add(container.name);

      // Validate container has required fields
      if (!container.image) {
        errors.push(`Container '${container.name}' must have an image`);
      }
    }

    // Validate selector
    if (!this._spec.selector.matchLabels && !this._spec.selector.matchExpressions) {
      errors.push('Selector must have either matchLabels or matchExpressions');
    }

    // Validate template has metadata with labels
    if (!this._spec.template.metadata?.labels) {
      errors.push('Template metadata must include labels');
    }

    return errors;
  }

  /**
   * Converts the deployment to a Kubernetes manifest.
   */
  public toManifest(): V1Deployment {
    const baseManifest = this.createBaseManifest();
    
    return {
      ...baseManifest,
      apiVersion: this.apiVersion,
      kind: this.kind,
      spec: { ...this._spec },
    } as V1Deployment;
  }
}