import { Construct } from './construct';
import { ObjectMeta, KubernetesManifest } from './types';
import { NamingStrategy } from './naming-strategy';
import { MetadataPropagation } from './metadata-propagation';

/**
 * Properties for Kubernetes resources.
 */
export interface KubernetesResourceProps {
  /**
   * Metadata for the resource.
   */
  metadata?: Partial<ObjectMeta>;
}

/**
 * Base class for all Kubernetes resources.
 */
export abstract class KubernetesResource extends Construct {
  /**
   * The API version of this resource.
   */
  public abstract readonly apiVersion: string;

  /**
   * The kind of this resource.
   */
  public abstract readonly kind: string;

  /**
   * The metadata for this resource.
   */
  public readonly metadata: ObjectMeta;

  private readonly _props: KubernetesResourceProps;

  /**
   * Creates a new Kubernetes resource.
   * @param scope The parent construct
   * @param id The resource identifier
   * @param props Resource properties
   */
  constructor(scope: Construct, id: string, props: KubernetesResourceProps = {}) {
    super(scope, id);
    
    this._props = props;
    
    // Initialize metadata with automatic name generation and propagation
    const baseMetadata: Partial<ObjectMeta> = {
      name: NamingStrategy.generateResourceName(this),
      ...props.metadata,
    };
    
    // Use MetadataPropagation for consistent labeling and namespace inheritance
    const propagationResult = MetadataPropagation.propagateMetadata(this, baseMetadata);
    this.metadata = propagationResult.metadata;
  }





  /**
   * Validates the resource configuration.
   */
  public validate(): string[] {
    const errors: string[] = [];
    
    // Validate metadata using MetadataPropagation
    const metadataErrors = MetadataPropagation.validateMetadata(this.getCompleteMetadata());
    errors.push(...metadataErrors);
    
    // Validate that name is required
    if (!this.metadata.name) {
      errors.push('Resource name is required');
    }
    
    return errors;
  }

  /**
   * Gets the complete metadata including auto-generated labels and annotations.
   */
  public getCompleteMetadata(): ObjectMeta {
    // Re-propagate metadata to ensure it's up-to-date
    const propagationResult = MetadataPropagation.propagateMetadata(
      this,
      this.metadata,
      {
        additionalLabels: this._props.metadata?.labels || {},
        additionalAnnotations: this._props.metadata?.annotations || {}
      }
    );
    
    return propagationResult.metadata;
  }

  /**
   * Converts this resource to a Kubernetes manifest.
   */
  public abstract toManifest(): KubernetesManifest;

  /**
   * Creates a base manifest with common properties.
   */
  protected createBaseManifest(): KubernetesManifest {
    return {
      apiVersion: this.apiVersion,
      kind: this.kind,
      metadata: { ...this.getCompleteMetadata() },
    };
  }
}