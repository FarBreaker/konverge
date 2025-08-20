/**
 * Naming strategy for Kubernetes resources in the Konverge framework.
 * Provides automatic name generation, collision detection, and validation.
 */

import { Construct } from './construct';
import { Stack } from './stack';

/**
 * Options for name generation.
 */
export interface NamingOptions {
  /**
   * Maximum length for generated names (default: 63 for Kubernetes DNS names).
   */
  maxLength?: number;

  /**
   * Whether to include a hash suffix for uniqueness (default: true).
   */
  includeHash?: boolean;

  /**
   * Custom separator for path components (default: '-').
   */
  separator?: string;

  /**
   * Whether to preserve the original casing (default: false, converts to lowercase).
   */
  preserveCase?: boolean;
}

/**
 * Result of name validation.
 */
export interface NameValidationResult {
  /**
   * Whether the name is valid.
   */
  isValid: boolean;

  /**
   * List of validation errors.
   */
  errors: string[];

  /**
   * Suggested corrected name if invalid.
   */
  suggestedName?: string;
}

/**
 * Naming strategy class for resource identification and collision detection.
 */
export class NamingStrategy {
  private static readonly DEFAULT_MAX_LENGTH = 63;
  private static readonly DEFAULT_SEPARATOR = '-';
  private static readonly DNS_NAME_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  private static readonly LABEL_KEY_REGEX = /^([a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*\/)?[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
  private static readonly LABEL_VALUE_REGEX = /^[a-z0-9A-Z]([-a-z0-9A-Z_.]*[a-z0-9A-Z])?$/;

  /**
   * Generates a unique resource name based on construct hierarchy.
   * @param construct The construct to generate a name for
   * @param options Naming options
   * @returns Generated resource name
   */
  public static generateResourceName(construct: Construct, options: NamingOptions = {}): string {
    const {
      maxLength = this.DEFAULT_MAX_LENGTH,
      includeHash = true,
      separator = this.DEFAULT_SEPARATOR,
      preserveCase = false
    } = options;

    // Build the base name from the construct path
    let baseName = this.buildBaseName(construct, separator, preserveCase);
    
    // Ensure the name is valid for Kubernetes
    baseName = this.sanitizeName(baseName, separator);
    
    // Handle length constraints
    if (baseName.length > maxLength) {
      if (includeHash) {
        const hash = this.generateHash(construct.node.path);
        const maxBaseLength = maxLength - hash.length - 1; // -1 for separator
        baseName = baseName.substring(0, maxBaseLength) + separator + hash;
      } else {
        baseName = baseName.substring(0, maxLength);
      }
    }
    
    // Final validation and cleanup
    baseName = this.ensureValidDnsName(baseName);
    
    return baseName;
  }

  /**
   * Generates automatic labels for a resource based on its construct hierarchy.
   * @param construct The construct to generate labels for
   * @returns Generated labels
   */
  public static generateLabels(construct: Construct): { [key: string]: string } {
    const labels: { [key: string]: string } = {};
    
    // Add standard Kubernetes labels
    labels['app.kubernetes.io/name'] = construct.node.id;
    labels['app.kubernetes.io/managed-by'] = 'konverge';
    
    // Add construct path for debugging (sanitized and truncated if too long)
    const constructPath = construct.node.path;
    const sanitizedPath = this.sanitizeLabelValue(constructPath);
    if (sanitizedPath.length <= 63) {
      labels['konverge.io/construct-id'] = sanitizedPath;
    } else {
      labels['konverge.io/construct-id'] = sanitizedPath.substring(0, 60) + '...';
    }
    
    // Add stack-specific labels if the construct is within a stack
    const stack = this.findParentStack(construct);
    if (stack) {
      labels['konverge.io/stack-name'] = stack.stackName;
      
      // Merge stack labels
      Object.assign(labels, stack.labels);
    }
    
    return labels;
  }

  /**
   * Generates automatic annotations for a resource.
   * @param construct The construct to generate annotations for
   * @returns Generated annotations
   */
  public static generateAnnotations(construct: Construct): { [key: string]: string } {
    const annotations: { [key: string]: string } = {};
    
    // Add construct path for debugging
    annotations['konverge.io/construct-path'] = construct.node.path;
    
    // Add stack information if available
    const stack = this.findParentStack(construct);
    if (stack) {
      annotations['konverge.io/stack-name'] = stack.stackName;
      if (stack.namespace) {
        annotations['konverge.io/stack-namespace'] = stack.namespace;
      }
    }
    
    return annotations;
  }

  /**
   * Detects name collisions within a scope.
   * @param construct The construct to check
   * @param proposedName The proposed name
   * @returns True if there's a collision, false otherwise
   */
  public static detectNameCollision(construct: Construct, proposedName: string): boolean {
    const parent = construct.node.scope;
    if (!parent) {
      return false; // Root construct, no collision possible
    }
    
    // Check siblings for name conflicts
    const siblings = parent.node.children;
    for (const sibling of siblings) {
      if (sibling !== construct) {
        // Check if sibling would generate the same resource name
        const siblingName = this.generateResourceName(sibling);
        if (siblingName === proposedName) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Resolves name collisions by generating alternative names.
   * @param construct The construct with a collision
   * @param baseName The base name that has a collision
   * @returns A unique name that doesn't collide
   */
  public static resolveNameCollision(construct: Construct, baseName: string): string {
    let counter = 1;
    let candidateName = `${baseName}-${counter}`;
    
    // Keep incrementing until we find a unique name
    while (this.detectNameCollision(construct, candidateName)) {
      counter++;
      candidateName = `${baseName}-${counter}`;
      
      // Prevent infinite loops
      if (counter > 1000) {
        throw new Error(`Unable to resolve name collision for construct ${construct.node.path} after 1000 attempts`);
      }
    }
    
    return candidateName;
  }

  /**
   * Validates a resource name according to Kubernetes DNS naming rules.
   * @param name The name to validate
   * @returns Validation result
   */
  public static validateResourceName(name: string): NameValidationResult {
    const errors: string[] = [];
    
    if (!name) {
      errors.push('Name cannot be empty');
      return { isValid: false, errors };
    }
    
    if (name.length > 63) {
      errors.push('Name cannot exceed 63 characters');
    }
    
    if (!this.DNS_NAME_REGEX.test(name)) {
      errors.push('Name must be a valid DNS subdomain (lowercase alphanumeric characters, hyphens, and periods only)');
    }
    
    if (name.startsWith('-') || name.endsWith('-')) {
      errors.push('Name cannot start or end with a hyphen');
    }
    
    if (name.includes('..')) {
      errors.push('Name cannot contain consecutive periods');
    }
    
    const isValid = errors.length === 0;
    const result: NameValidationResult = { isValid, errors };
    
    if (!isValid) {
      result.suggestedName = this.sanitizeName(name);
    }
    
    return result;
  }

  /**
   * Validates a label key according to Kubernetes rules.
   * @param key The label key to validate
   * @returns Validation result
   */
  public static validateLabelKey(key: string): NameValidationResult {
    const errors: string[] = [];
    
    if (!key) {
      errors.push('Label key cannot be empty');
      return { isValid: false, errors };
    }
    
    if (key.length > 63) {
      // Check if it has a prefix
      const parts = key.split('/');
      if (parts.length === 2) {
        const [prefix, name] = parts;
        if (prefix.length > 253) {
          errors.push('Label key prefix cannot exceed 253 characters');
        }
        if (name.length > 63) {
          errors.push('Label key name cannot exceed 63 characters');
        }
      } else {
        errors.push('Label key cannot exceed 63 characters');
      }
    }
    
    if (!this.LABEL_KEY_REGEX.test(key)) {
      errors.push('Label key must be a valid DNS subdomain with optional prefix');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validates a label value according to Kubernetes rules.
   * @param value The label value to validate
   * @returns Validation result
   */
  public static validateLabelValue(value: string): NameValidationResult {
    const errors: string[] = [];
    
    if (value.length > 63) {
      errors.push('Label value cannot exceed 63 characters');
    }
    
    if (value && !this.LABEL_VALUE_REGEX.test(value)) {
      errors.push('Label value must contain only alphanumeric characters, hyphens, underscores, and periods');
    }
    
    return { isValid: errors.length === 0, errors };
  }

  /**
   * Builds the base name from construct hierarchy.
   * @param construct The construct
   * @param separator The separator to use
   * @param preserveCase Whether to preserve casing
   * @returns Base name
   */
  private static buildBaseName(construct: Construct, separator: string, preserveCase: boolean): string {
    const pathParts = construct.node.path.split('/');
    let name = pathParts.join(separator);
    
    if (!preserveCase) {
      name = name.toLowerCase();
    }
    
    return name;
  }

  /**
   * Sanitizes a name to make it valid for Kubernetes.
   * @param name The name to sanitize
   * @param separator The separator to use for replacement
   * @returns Sanitized name
   */
  private static sanitizeName(name: string, separator: string = this.DEFAULT_SEPARATOR): string {
    // Convert to lowercase
    let sanitized = name.toLowerCase();
    
    // Replace invalid characters with separator
    sanitized = sanitized.replace(/[^a-z0-9-]/g, separator);
    
    // Remove consecutive separators
    sanitized = sanitized.replace(new RegExp(`${separator}+`, 'g'), separator);
    
    // Remove leading/trailing separators
    sanitized = sanitized.replace(new RegExp(`^${separator}+|${separator}+$`, 'g'), '');
    
    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'resource';
    }
    
    return sanitized;
  }

  /**
   * Sanitizes a value to make it valid for Kubernetes label values.
   * @param value The value to sanitize
   * @returns Sanitized label value
   */
  private static sanitizeLabelValue(value: string): string {
    // Replace forward slashes and other invalid characters with hyphens
    let sanitized = value.replace(/[^a-zA-Z0-9\-_.]/g, '-');
    
    // Remove consecutive hyphens
    sanitized = sanitized.replace(/-+/g, '-');
    
    // Remove leading/trailing hyphens
    sanitized = sanitized.replace(/^-+|-+$/g, '');
    
    // Ensure it's not empty
    if (!sanitized) {
      sanitized = 'value';
    }
    
    return sanitized;
  }

  /**
   * Ensures the name is a valid DNS name.
   * @param name The name to validate
   * @returns Valid DNS name
   */
  private static ensureValidDnsName(name: string): string {
    // If already valid, return as-is
    if (this.DNS_NAME_REGEX.test(name)) {
      return name;
    }
    
    // Sanitize and try again
    let sanitized = this.sanitizeName(name);
    
    // If still not valid, add a prefix
    if (!this.DNS_NAME_REGEX.test(sanitized)) {
      sanitized = `resource-${sanitized}`;
    }
    
    return sanitized;
  }

  /**
   * Generates a short hash for uniqueness.
   * @param input The input string to hash
   * @returns Short hash string
   */
  private static generateHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 5);
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