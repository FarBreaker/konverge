/**
 * Comprehensive validation framework for Konverge constructs and resources.
 * Provides compile-time and runtime validation with detailed error reporting.
 */

import { Construct } from './construct';
import { KubernetesResource } from './kubernetes-resource';
import { KubernetesManifest } from './types';
import { MetadataPropagation } from './metadata-propagation';
import { NamingStrategy } from './naming-strategy';
import { SchemaValidator } from './schema-validator';

/**
 * Validation error severity levels.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Represents a validation error or warning.
 */
export interface ValidationError {
  /**
   * Human-readable error message.
   */
  message: string;

  /**
   * Path to the construct or property that caused the error.
   */
  path: string;

  /**
   * Severity level of the validation issue.
   */
  severity: ValidationSeverity;

  /**
   * Error code for programmatic handling.
   */
  code: string;

  /**
   * Additional context or suggestions for fixing the error.
   */
  context?: string;
}

/**
 * Validation rule interface for extensible validation.
 */
export interface ValidationRule {
  /**
   * Unique identifier for the rule.
   */
  id: string;

  /**
   * Human-readable description of what the rule validates.
   */
  description: string;

  /**
   * Function that performs the validation.
   */
  validate: (target: any, context: ValidationContext) => ValidationError[];
}

/**
 * Context information for validation rules.
 */
export interface ValidationContext {
  /**
   * The construct being validated.
   */
  construct: Construct;

  /**
   * Path to the construct in the tree.
   */
  path: string;

  /**
   * Additional context data.
   */
  data?: { [key: string]: any };
}

/**
 * Validation options for controlling validation behavior.
 */
export interface ValidationOptions {
  /**
   * Whether to include warnings in validation results (default: true).
   */
  includeWarnings?: boolean;

  /**
   * Whether to include info messages in validation results (default: false).
   */
  includeInfo?: boolean;

  /**
   * Maximum number of errors to collect before stopping (default: unlimited).
   */
  maxErrors?: number;

  /**
   * Whether to validate child constructs recursively (default: true).
   */
  recursive?: boolean;

  /**
   * Custom validation rules to apply.
   */
  customRules?: ValidationRule[];

  /**
   * Rule IDs to skip during validation.
   */
  skipRules?: string[];
}

/**
 * Result of validation operation.
 */
export interface ValidationResult {
  /**
   * Whether validation passed (no errors).
   */
  isValid: boolean;

  /**
   * All validation errors found.
   */
  errors: ValidationError[];

  /**
   * Number of errors by severity.
   */
  errorCount: number;
  warningCount: number;
  infoCount: number;

  /**
   * Summary message describing the validation result.
   */
  summary: string;
}

/**
 * Main validator class for Konverge constructs and resources.
 */
export class Validator {
  private static readonly builtInRules: ValidationRule[] = [];

  /**
   * Validates a construct and optionally its children.
   * @param construct The construct to validate
   * @param options Validation options
   * @returns Validation result
   */
  public static validateConstruct(
    construct: Construct,
    options: ValidationOptions = {}
  ): ValidationResult {
    const {
      includeWarnings = true,
      includeInfo = false,
      maxErrors,
      recursive = true,
      customRules = [],
      skipRules = []
    } = options;

    const allErrors: ValidationError[] = [];
    const context: ValidationContext = {
      construct,
      path: construct.node.path
    };

    // Collect all rules to apply
    const rulesToApply = [
      ...this.builtInRules,
      ...customRules
    ].filter(rule => !skipRules.includes(rule.id));

    // Validate the construct itself
    this.validateSingleConstruct(construct, rulesToApply, context, allErrors);

    // Recursively validate children if requested
    if (recursive) {
      for (const child of construct.node.children) {
        if (maxErrors && allErrors.length >= maxErrors) break;
        
        const childOptions: ValidationOptions = { ...options };
        if (maxErrors) {
          childOptions.maxErrors = maxErrors - allErrors.length;
        }
        const childResult = this.validateConstruct(child, childOptions);
        allErrors.push(...childResult.errors);
      }
    }

    // Filter errors based on severity preferences
    const filteredErrors = allErrors.filter(error => {
      if (error.severity === 'error') return true;
      if (error.severity === 'warning') return includeWarnings;
      if (error.severity === 'info') return includeInfo;
      return false;
    });

    return this.createValidationResult(filteredErrors);
  }

  /**
   * Validates a Kubernetes resource construct.
   * @param resource The Kubernetes resource to validate
   * @param options Validation options
   * @returns Validation result
   */
  public static validateKubernetesResource(
    resource: KubernetesResource,
    options: ValidationOptions = {}
  ): ValidationResult {
    const allErrors: ValidationError[] = [];
    const context: ValidationContext = {
      construct: resource,
      path: resource.node.path
    };

    // Validate as a regular construct first
    const constructResult = this.validateConstruct(resource, { ...options, recursive: false });
    allErrors.push(...constructResult.errors);

    // Additional Kubernetes-specific validation
    this.validateKubernetesSpecificRules(resource, context, allErrors);

    // Validate the generated manifest
    try {
      const manifest = resource.toManifest();
      this.validateManifest(manifest, context, allErrors);
    } catch (error) {
      allErrors.push({
        message: `Failed to generate manifest: ${(error as Error).message}`,
        path: context.path,
        severity: 'error',
        code: 'MANIFEST_GENERATION_FAILED',
        context: 'Ensure all required properties are set correctly'
      });
    }

    return this.createValidationResult(allErrors);
  }

  /**
   * Validates a Kubernetes manifest for structural correctness.
   * @param manifest The manifest to validate
   * @param context Validation context
   * @param errors Array to collect errors
   */
  public static validateManifest(
    manifest: KubernetesManifest,
    context: ValidationContext,
    errors: ValidationError[]
  ): void {
    // Validate required fields
    if (!manifest.apiVersion) {
      errors.push({
        message: 'Manifest must have an apiVersion',
        path: `${context.path}.apiVersion`,
        severity: 'error',
        code: 'MISSING_API_VERSION'
      });
    }

    if (!manifest.kind) {
      errors.push({
        message: 'Manifest must have a kind',
        path: `${context.path}.kind`,
        severity: 'error',
        code: 'MISSING_KIND'
      });
    }

    if (!manifest.metadata) {
      errors.push({
        message: 'Manifest must have metadata',
        path: `${context.path}.metadata`,
        severity: 'error',
        code: 'MISSING_METADATA'
      });
      return;
    }

    // Validate metadata using existing validation
    const metadataErrors = MetadataPropagation.validateMetadata(manifest.metadata);
    for (const error of metadataErrors) {
      errors.push({
        message: error,
        path: `${context.path}.metadata`,
        severity: 'error',
        code: 'INVALID_METADATA'
      });
    }

    // Validate API version format
    if (manifest.apiVersion && !this.isValidApiVersion(manifest.apiVersion)) {
      errors.push({
        message: `Invalid API version format: ${manifest.apiVersion}`,
        path: `${context.path}.apiVersion`,
        severity: 'error',
        code: 'INVALID_API_VERSION_FORMAT',
        context: 'API version should be in format "group/version" or just "version" for core resources'
      });
    }

    // Validate kind format
    if (manifest.kind && !this.isValidKind(manifest.kind)) {
      errors.push({
        message: `Invalid kind format: ${manifest.kind}`,
        path: `${context.path}.kind`,
        severity: 'error',
        code: 'INVALID_KIND_FORMAT',
        context: 'Kind should be a valid Kubernetes resource type'
      });
    }

    // Perform schema validation
    const schemaResult = SchemaValidator.validateManifest(manifest, context.path);
    errors.push(...schemaResult.errors);
  }

  /**
   * Registers a custom validation rule.
   * @param rule The validation rule to register
   */
  public static registerRule(rule: ValidationRule): void {
    // Check if rule already exists
    const existingIndex = this.builtInRules.findIndex(r => r.id === rule.id);
    if (existingIndex >= 0) {
      this.builtInRules[existingIndex] = rule;
    } else {
      this.builtInRules.push(rule);
    }
  }

  /**
   * Unregisters a validation rule.
   * @param ruleId The ID of the rule to unregister
   */
  public static unregisterRule(ruleId: string): void {
    const index = this.builtInRules.findIndex(r => r.id === ruleId);
    if (index >= 0) {
      this.builtInRules.splice(index, 1);
    }
  }

  /**
   * Gets all registered validation rules.
   * @returns Array of all registered rules
   */
  public static getRegisteredRules(): ValidationRule[] {
    return [...this.builtInRules];
  }

  /**
   * Creates a validation error with standard formatting.
   * @param message Error message
   * @param path Path to the problematic construct/property
   * @param severity Error severity
   * @param code Error code
   * @param context Additional context
   * @returns Formatted validation error
   */
  public static createError(
    message: string,
    path: string,
    severity: ValidationSeverity = 'error',
    code: string = 'VALIDATION_ERROR',
    context?: string
  ): ValidationError {
    const error: ValidationError = {
      message,
      path,
      severity,
      code
    };
    
    if (context !== undefined) {
      error.context = context;
    }
    
    return error;
  }

  /**
   * Validates a single construct without recursion.
   */
  private static validateSingleConstruct(
    construct: Construct,
    rules: ValidationRule[],
    context: ValidationContext,
    errors: ValidationError[]
  ): void {
    // Apply all validation rules
    for (const rule of rules) {
      try {
        const ruleErrors = rule.validate(construct, context);
        errors.push(...ruleErrors);
      } catch (error) {
        errors.push({
          message: `Validation rule '${rule.id}' failed: ${(error as Error).message}`,
          path: context.path,
          severity: 'error',
          code: 'RULE_EXECUTION_FAILED',
          context: `Rule: ${rule.description}`
        });
      }
    }

    // Built-in construct validation
    this.validateConstructStructure(construct, context, errors);
    
    // Additional Kubernetes-specific validation for KubernetesResource instances
    if (construct instanceof KubernetesResource) {
      this.validateKubernetesSpecificRules(construct, context, errors);
    }
  }

  /**
   * Validates basic construct structure and properties.
   */
  private static validateConstructStructure(
    construct: Construct,
    context: ValidationContext,
    errors: ValidationError[]
  ): void {
    // Validate construct ID
    if (!construct.node.id) {
      errors.push({
        message: 'Construct must have a valid ID',
        path: context.path,
        severity: 'error',
        code: 'MISSING_CONSTRUCT_ID'
      });
    }

    // Validate ID format (more lenient than Kubernetes resource names)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(construct.node.id)) {
      errors.push({
        message: `Invalid construct ID: must start with alphanumeric character and contain only alphanumeric characters, underscores, and hyphens`,
        path: context.path,
        severity: 'error',
        code: 'INVALID_CONSTRUCT_ID',
        context: 'Construct IDs should be valid identifiers'
      });
    }

    // Check for circular dependencies (basic check)
    this.validateNoCircularDependencies(construct, context, errors);
  }

  /**
   * Validates Kubernetes-specific rules for resources.
   */
  private static validateKubernetesSpecificRules(
    resource: KubernetesResource,
    context: ValidationContext,
    errors: ValidationError[]
  ): void {
    // Validate API version and kind consistency
    if (!resource.apiVersion || !resource.kind) {
      errors.push({
        message: 'Kubernetes resource must have both apiVersion and kind',
        path: context.path,
        severity: 'error',
        code: 'MISSING_RESOURCE_TYPE'
      });
    }

    // Validate metadata exists and is properly formed
    if (!resource.metadata) {
      errors.push({
        message: 'Kubernetes resource must have metadata',
        path: context.path,
        severity: 'error',
        code: 'MISSING_RESOURCE_METADATA'
      });
    } else {
      // Use existing metadata validation
      const metadataErrors = MetadataPropagation.validateMetadata(resource.metadata);
      for (const error of metadataErrors) {
        errors.push({
          message: `Resource metadata validation failed: ${error}`,
          path: `${context.path}.metadata`,
          severity: 'error',
          code: 'INVALID_RESOURCE_METADATA'
        });
      }
    }

    // Validate resource name uniqueness within scope
    this.validateResourceNameUniqueness(resource, context, errors);
  }

  /**
   * Validates that resource names are unique within their scope.
   */
  private static validateResourceNameUniqueness(
    resource: KubernetesResource,
    context: ValidationContext,
    errors: ValidationError[]
  ): void {
    if (!resource.node.scope || !resource.metadata) return;

    const siblings = resource.node.scope.node.children;
    const resourceName = resource.metadata.name;
    const resourceKind = resource.kind;

    if (!resourceName) return;

    for (const sibling of siblings) {
      if (sibling === resource) continue;
      
      if (sibling instanceof KubernetesResource) {
        if (sibling.metadata.name === resourceName && sibling.kind === resourceKind) {
          errors.push({
            message: `Duplicate resource name '${resourceName}' for kind '${resourceKind}' in scope '${resource.node.scope.node.path}'`,
            path: context.path,
            severity: 'error',
            code: 'DUPLICATE_RESOURCE_NAME',
            context: `Conflicting resource at: ${sibling.node.path}`
          });
        }
      }
    }
  }

  /**
   * Validates that there are no circular dependencies in the construct tree.
   */
  private static validateNoCircularDependencies(
    construct: Construct,
    context: ValidationContext,
    errors: ValidationError[]
  ): void {
    const visited = new Set<Construct>();
    const recursionStack = new Set<Construct>();

    const hasCircularDependency = (current: Construct): boolean => {
      if (recursionStack.has(current)) {
        return true;
      }
      if (visited.has(current)) {
        return false;
      }

      visited.add(current);
      recursionStack.add(current);

      for (const child of current.node.children) {
        if (hasCircularDependency(child)) {
          return true;
        }
      }

      recursionStack.delete(current);
      return false;
    };

    if (hasCircularDependency(construct)) {
      errors.push({
        message: 'Circular dependency detected in construct tree',
        path: context.path,
        severity: 'error',
        code: 'CIRCULAR_DEPENDENCY',
        context: 'Check for constructs that reference each other in a cycle'
      });
    }
  }  
/**
   * Validates API version format.
   */
  private static isValidApiVersion(apiVersion: string): boolean {
    // Core resources (v1, v1beta1, etc.)
    if (/^v\d+(alpha\d+|beta\d+)?$/.test(apiVersion)) {
      return true;
    }
    
    // Group/version format (apps/v1, networking.k8s.io/v1, etc.)
    if (/^[a-z0-9.-]+\/v\d+(alpha\d+|beta\d+)?$/.test(apiVersion)) {
      return true;
    }
    
    return false;
  }

  /**
   * Validates Kubernetes kind format.
   */
  private static isValidKind(kind: string): boolean {
    // Kind should be PascalCase and start with uppercase letter
    return /^[A-Z][a-zA-Z0-9]*$/.test(kind);
  }

  /**
   * Creates a validation result from collected errors.
   */
  private static createValidationResult(errors: ValidationError[]): ValidationResult {
    const errorCount = errors.filter(e => e.severity === 'error').length;
    const warningCount = errors.filter(e => e.severity === 'warning').length;
    const infoCount = errors.filter(e => e.severity === 'info').length;

    const isValid = errorCount === 0;
    
    let summary: string;
    if (isValid) {
      if (warningCount > 0 || infoCount > 0) {
        summary = `Validation passed with ${warningCount} warning(s) and ${infoCount} info message(s)`;
      } else {
        summary = 'Validation passed successfully';
      }
    } else {
      summary = `Validation failed with ${errorCount} error(s), ${warningCount} warning(s), and ${infoCount} info message(s)`;
    }

    return {
      isValid,
      errors,
      errorCount,
      warningCount,
      infoCount,
      summary
    };
  }
}

// Register built-in validation rules
Validator.registerRule({
  id: 'required-metadata-name',
  description: 'Ensures all Kubernetes resources have a name in metadata',
  validate: (target: any, context: ValidationContext): ValidationError[] => {
    if (target instanceof KubernetesResource && target.metadata) {
      if (!target.metadata.name) {
        return [Validator.createError(
          'Kubernetes resource must have a name in metadata',
          `${context.path}.metadata.name`,
          'error',
          'MISSING_RESOURCE_NAME'
        )];
      }
    }
    return [];
  }
});

Validator.registerRule({
  id: 'valid-label-format',
  description: 'Validates that all labels follow Kubernetes conventions',
  validate: (target: any, context: ValidationContext): ValidationError[] => {
    const errors: ValidationError[] = [];
    
    if (target instanceof KubernetesResource && target.metadata && target.metadata.labels) {
      for (const [key, value] of Object.entries(target.metadata.labels)) {
        const keyValidation = NamingStrategy.validateLabelKey(key);
        if (!keyValidation.isValid) {
          errors.push(Validator.createError(
            `Invalid label key '${key}': ${keyValidation.errors.join(', ')}`,
            `${context.path}.metadata.labels.${key}`,
            'error',
            'INVALID_LABEL_KEY'
          ));
        }

        const valueValidation = NamingStrategy.validateLabelValue(value);
        if (!valueValidation.isValid) {
          errors.push(Validator.createError(
            `Invalid label value for '${key}': ${valueValidation.errors.join(', ')}`,
            `${context.path}.metadata.labels.${key}`,
            'error',
            'INVALID_LABEL_VALUE'
          ));
        }
      }
    }
    
    return errors;
  }
});