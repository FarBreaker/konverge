/**
 * Metadata propagation system for consistent labeling and namespace inheritance.
 */

import { Construct } from './construct';
import { Stack } from './stack';
import { ObjectMeta } from './types';
import { NamingStrategy } from './naming-strategy';

/**
 * Options for metadata propagation.
 */
export interface MetadataPropagationOptions {
  /**
   * Whether to inherit namespace from parent stack (default: true).
   */
  inheritNamespace?: boolean;

  /**
   * Whether to inherit labels from parent stack (default: true).
   */
  inheritLabels?: boolean;

  /**
   * Whether to add automatic annotations (default: true).
   */
  addAnnotations?: boolean;

  /**
   * Additional labels to merge with inherited ones.
   */
  additionalLabels?: { [key: string]: string };

  /**
   * Additional annotations to merge with automatic ones.
   */
  additionalAnnotations?: { [key: string]: string };
}

/**
 * Result of metadata propagation.
 */
export interface PropagatedMetadata {
  /**
   * The complete metadata object with all propagated values.
   */
  metadata: ObjectMeta;

  /**
   * The source stack if any.
   */
  sourceStack: Stack | undefined;

  /**
   * Whether namespace was inherited.
   */
  namespaceInherited: boolean;

  /**
   * Number of labels inherited from stack.
   */
  inheritedLabelsCount: number;
}

/**
 * Metadata propagation manager for consistent resource metadata.
 */
export class MetadataPropagation {
  /**
   * Propagates metadata from construct hierarchy to a resource.
   * @param construct The construct to propagate metadata for
   * @param baseMetadata Base metadata to start with
   * @param options Propagation options
   * @returns Propagated metadata result
   */
  public static propagateMetadata(
    construct: Construct,
    baseMetadata: Partial<ObjectMeta> = {},
    options: MetadataPropagationOptions = {}
  ): PropagatedMetadata {
    const {
      inheritNamespace = true,
      inheritLabels = true,
      addAnnotations = true,
      additionalLabels = {},
      additionalAnnotations = {}
    } = options;

    // Find the parent stack
    const sourceStack = this.findParentStack(construct);
    
    // Start with base metadata
    const metadata: ObjectMeta = { ...baseMetadata };
    
    let namespaceInherited = false;
    let inheritedLabelsCount = 0;

    // Handle namespace inheritance
    if (inheritNamespace && sourceStack?.namespace && !metadata.namespace) {
      metadata.namespace = sourceStack.namespace;
      namespaceInherited = true;
    }

    // Generate automatic labels using NamingStrategy
    const automaticLabels = NamingStrategy.generateLabels(construct);
    
    // Merge labels in order of precedence: automatic < stack < additional < base
    const finalLabels: { [key: string]: string } = {};
    
    // Start with automatic labels
    Object.assign(finalLabels, automaticLabels);
    
    // Add stack labels if inheritance is enabled
    if (inheritLabels && sourceStack?.labels) {
      const stackLabels = sourceStack.labels;
      Object.assign(finalLabels, stackLabels);
      inheritedLabelsCount = Object.keys(stackLabels).length;
    }
    
    // Add additional labels
    Object.assign(finalLabels, additionalLabels);
    
    // Finally, add base metadata labels (highest precedence)
    Object.assign(finalLabels, baseMetadata.labels);
    
    metadata.labels = finalLabels;

    // Handle annotations
    if (addAnnotations) {
      const automaticAnnotations = NamingStrategy.generateAnnotations(construct);
      
      metadata.annotations = {
        ...automaticAnnotations,
        ...additionalAnnotations,
        ...baseMetadata.annotations
      };
    } else {
      metadata.annotations = {
        ...additionalAnnotations,
        ...baseMetadata.annotations
      };
    }

    return {
      metadata,
      sourceStack,
      namespaceInherited,
      inheritedLabelsCount
    };
  }

  /**
   * Validates that metadata follows Kubernetes conventions.
   * @param metadata The metadata to validate
   * @returns Validation errors if any
   */
  public static validateMetadata(metadata: ObjectMeta): string[] {
    const errors: string[] = [];

    // Validate resource name
    if (metadata.name) {
      const nameValidation = NamingStrategy.validateResourceName(metadata.name);
      if (!nameValidation.isValid) {
        errors.push(...nameValidation.errors.map(e => `Name: ${e}`));
      }
    }

    // Validate namespace
    if (metadata.namespace) {
      const namespaceValidation = NamingStrategy.validateResourceName(metadata.namespace);
      if (!namespaceValidation.isValid) {
        errors.push(...namespaceValidation.errors.map(e => `Namespace: ${e}`));
      }
    }

    // Validate labels
    if (metadata.labels) {
      for (const [key, value] of Object.entries(metadata.labels)) {
        const keyValidation = NamingStrategy.validateLabelKey(key);
        if (!keyValidation.isValid) {
          errors.push(...keyValidation.errors.map(e => `Label key "${key}": ${e}`));
        }

        const valueValidation = NamingStrategy.validateLabelValue(value);
        if (!valueValidation.isValid) {
          errors.push(...valueValidation.errors.map(e => `Label value for "${key}": ${e}`));
        }
      }
    }

    return errors;
  }

  /**
   * Ensures consistent labeling across all resources in a stack.
   * @param stack The stack to ensure consistency for
   * @returns Map of construct paths to their expected labels
   */
  public static ensureConsistentLabeling(stack: Stack): Map<string, { [key: string]: string }> {
    const labelMap = new Map<string, { [key: string]: string }>();
    
    // Get all constructs in the stack
    const allConstructs = stack.node.findAll();
    
    for (const construct of allConstructs) {
      // Generate consistent labels for each construct
      const labels = NamingStrategy.generateLabels(construct);
      
      // Merge with stack labels
      const finalLabels = {
        ...labels,
        ...stack.labels
      };
      
      labelMap.set(construct.node.path, finalLabels);
    }
    
    return labelMap;
  }

  /**
   * Detects label inconsistencies within a stack.
   * @param stack The stack to check
   * @returns List of inconsistency warnings
   */
  public static detectLabelInconsistencies(stack: Stack): string[] {
    const warnings: string[] = [];
    const expectedLabels = this.ensureConsistentLabeling(stack);
    
    // Check each construct for label consistency
    for (const construct of stack.node.findAll()) {
      const expectedForConstruct = expectedLabels.get(construct.node.path);
      if (!expectedForConstruct) continue;
      
      // Check if construct has any metadata that might be inconsistent
      const constructMetadata = construct.node.metadata;
      if (constructMetadata.labels) {
        for (const [key, expectedValue] of Object.entries(expectedForConstruct)) {
          const actualValue = constructMetadata.labels[key];
          if (actualValue && actualValue !== expectedValue) {
            warnings.push(
              `Construct ${construct.node.path} has inconsistent label "${key}": ` +
              `expected "${expectedValue}", got "${actualValue}"`
            );
          }
        }
      }
    }
    
    return warnings;
  }

  /**
   * Applies namespace propagation to all resources in a stack.
   * @param stack The stack to apply namespace propagation to
   * @param targetNamespace The namespace to propagate (defaults to stack namespace)
   */
  public static applyNamespacePropagation(stack: Stack, targetNamespace?: string): void {
    const namespace = targetNamespace || stack.namespace;
    if (!namespace) return;
    
    // Apply namespace to all constructs in the stack
    const allConstructs = stack.node.findAll();
    
    for (const construct of allConstructs) {
      // Set namespace metadata if the construct supports it
      if ('metadata' in construct) {
        const metadata = (construct as any).metadata as ObjectMeta;
        if (!metadata.namespace) {
          metadata.namespace = namespace;
        }
      }
    }
  }

  /**
   * Finds the parent Stack construct in the hierarchy.
   * @param construct The construct to search from
   * @returns The parent Stack or undefined
   */
  private static findParentStack(construct: Construct): Stack | undefined {
    let current: Construct | undefined = construct.node.scope;
    
    while (current) {
      if (current instanceof Stack) {
        return current;
      }
      current = current.node.scope;
    }
    
    return undefined;
  }
}