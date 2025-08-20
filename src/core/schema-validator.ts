/**
 * Schema validation for Kubernetes resources against OpenAPI specifications.
 * Provides property type checking and required field validation.
 */

import { KubernetesManifest } from './types';
import { ValidationError } from './validator';

/**
 * Schema validation result.
 */
export interface SchemaValidationResult {
  /**
   * Whether the manifest passes schema validation.
   */
  isValid: boolean;

  /**
   * List of schema validation errors.
   */
  errors: ValidationError[];
}

/**
 * Property schema definition.
 */
export interface PropertySchema {
  /**
   * Property type (string, number, boolean, object, array).
   */
  type: string;

  /**
   * Whether the property is required.
   */
  required?: boolean;

  /**
   * For object types, the properties schema.
   */
  properties?: { [key: string]: PropertySchema };

  /**
   * For array types, the items schema.
   */
  items?: PropertySchema;

  /**
   * Allowed values for enum types.
   */
  enum?: any[];

  /**
   * Pattern for string validation.
   */
  pattern?: string;

  /**
   * Minimum value for numbers.
   */
  minimum?: number;

  /**
   * Maximum value for numbers.
   */
  maximum?: number;

  /**
   * Description of the property.
   */
  description?: string;
}

/**
 * Resource schema definition.
 */
export interface ResourceSchema {
  /**
   * API version of the resource.
   */
  apiVersion: string;

  /**
   * Kind of the resource.
   */
  kind: string;

  /**
   * Schema for the resource properties.
   */
  schema: PropertySchema;

  /**
   * List of required top-level properties.
   */
  required?: string[];
}/**

 * Schema validator for Kubernetes resources.
 */
export class SchemaValidator {
  private static readonly schemas = new Map<string, ResourceSchema>();

  /**
   * Registers a resource schema for validation.
   * @param schema The resource schema to register
   */
  public static registerSchema(schema: ResourceSchema): void {
    const key = `${schema.apiVersion}/${schema.kind}`;
    this.schemas.set(key, schema);
  }

  /**
   * Gets a registered schema for a resource.
   * @param apiVersion The API version
   * @param kind The resource kind
   * @returns The schema if found, undefined otherwise
   */
  public static getSchema(apiVersion: string, kind: string): ResourceSchema | undefined {
    const key = `${apiVersion}/${kind}`;
    return this.schemas.get(key);
  }

  /**
   * Validates a Kubernetes manifest against its schema.
   * @param manifest The manifest to validate
   * @param path The path for error reporting
   * @returns Schema validation result
   */
  public static validateManifest(
    manifest: KubernetesManifest,
    path: string = 'manifest'
  ): SchemaValidationResult {
    const errors: ValidationError[] = [];

    // Get the schema for this resource type
    const schema = this.getSchema(manifest.apiVersion, manifest.kind);
    if (!schema) {
      // If no schema is registered, we can't validate but it's not an error
      return { isValid: true, errors: [] };
    }

    // Validate required top-level properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in manifest)) {
          errors.push({
            message: `Missing required property '${requiredProp}'`,
            path: `${path}.${requiredProp}`,
            severity: 'error',
            code: 'MISSING_REQUIRED_PROPERTY'
          });
        }
      }
    }

    // Validate the manifest against the schema
    this.validateObject(manifest, schema.schema, path, errors);

    return {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      errors
    };
  }

  /**
   * Validates an object against a property schema.
   * @param obj The object to validate
   * @param schema The schema to validate against
   * @param path The current path for error reporting
   * @param errors Array to collect errors
   */
  private static validateObject(
    obj: any,
    schema: PropertySchema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (obj === null || obj === undefined) {
      return;
    }

    // Validate type
    if (!this.validateType(obj, schema.type)) {
      errors.push({
        message: `Expected type '${schema.type}' but got '${typeof obj}'`,
        path,
        severity: 'error',
        code: 'INVALID_TYPE'
      });
      return;
    }

    // Type-specific validation
    switch (schema.type) {
      case 'object':
        this.validateObjectProperties(obj, schema, path, errors);
        break;
      case 'array':
        this.validateArrayItems(obj, schema, path, errors);
        break;
      case 'string':
        this.validateString(obj, schema, path, errors);
        break;
      case 'number':
      case 'integer':
        this.validateNumber(obj, schema, path, errors);
        break;
    }

    // Validate enum values
    if (schema.enum && !schema.enum.includes(obj)) {
      errors.push({
        message: `Value '${obj}' is not one of the allowed values: ${schema.enum.join(', ')}`,
        path,
        severity: 'error',
        code: 'INVALID_ENUM_VALUE'
      });
    }
  }

  /**
   * Validates object properties against schema.
   */
  private static validateObjectProperties(
    obj: any,
    schema: PropertySchema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (!schema.properties) {
      return;
    }

    // Validate each property in the schema
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const propPath = `${path}.${propName}`;
      const propValue = obj[propName];

      // Check required properties
      if (propSchema.required && (propValue === undefined || propValue === null)) {
        errors.push({
          message: `Missing required property '${propName}'`,
          path: propPath,
          severity: 'error',
          code: 'MISSING_REQUIRED_PROPERTY'
        });
        continue;
      }

      // Validate property if it exists
      if (propValue !== undefined && propValue !== null) {
        this.validateObject(propValue, propSchema, propPath, errors);
      }
    }

    // Check for unknown properties (optional - could be made configurable)
    for (const propName of Object.keys(obj)) {
      if (!schema.properties[propName]) {
        errors.push({
          message: `Unknown property '${propName}'`,
          path: `${path}.${propName}`,
          severity: 'warning',
          code: 'UNKNOWN_PROPERTY'
        });
      }
    }
  }

  /**
   * Validates array items against schema.
   */
  private static validateArrayItems(
    arr: any[],
    schema: PropertySchema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (!schema.items) {
      return;
    }

    for (let i = 0; i < arr.length; i++) {
      const itemPath = `${path}[${i}]`;
      this.validateObject(arr[i], schema.items, itemPath, errors);
    }
  }

  /**
   * Validates string values against schema constraints.
   */
  private static validateString(
    str: string,
    schema: PropertySchema,
    path: string,
    errors: ValidationError[]
  ): void {
    // Pattern validation
    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(str)) {
        errors.push({
          message: `String '${str}' does not match pattern '${schema.pattern}'`,
          path,
          severity: 'error',
          code: 'PATTERN_MISMATCH'
        });
      }
    }
  }

  /**
   * Validates number values against schema constraints.
   */
  private static validateNumber(
    num: number,
    schema: PropertySchema,
    path: string,
    errors: ValidationError[]
  ): void {
    // Minimum value validation
    if (schema.minimum !== undefined && num < schema.minimum) {
      errors.push({
        message: `Value ${num} is less than minimum ${schema.minimum}`,
        path,
        severity: 'error',
        code: 'VALUE_TOO_SMALL'
      });
    }

    // Maximum value validation
    if (schema.maximum !== undefined && num > schema.maximum) {
      errors.push({
        message: `Value ${num} is greater than maximum ${schema.maximum}`,
        path,
        severity: 'error',
        code: 'VALUE_TOO_LARGE'
      });
    }

    // Integer validation
    if (schema.type === 'integer' && !Number.isInteger(num)) {
      errors.push({
        message: `Value ${num} is not an integer`,
        path,
        severity: 'error',
        code: 'NOT_INTEGER'
      });
    }
  }

  /**
   * Validates the type of a value.
   */
  private static validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return true; // Unknown types are considered valid
    }
  }

  /**
   * Gets all registered schemas.
   * @returns Map of all registered schemas
   */
  public static getAllSchemas(): Map<string, ResourceSchema> {
    return new Map(this.schemas);
  }

  /**
   * Clears all registered schemas.
   */
  public static clearSchemas(): void {
    this.schemas.clear();
  }

  /**
   * Registers built-in schemas for common Kubernetes resources.
   */
  public static registerBuiltInSchemas(): void {
    // Re-register built-in schemas
    this.registerConfigMapSchema();
    this.registerServiceSchema();
    this.registerDeploymentSchema();
  }

  private static registerConfigMapSchema(): void {
    this.registerSchema({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      required: ['apiVersion', 'kind', 'metadata'],
      schema: {
        type: 'object',
        properties: {
          apiVersion: {
            type: 'string',
            enum: ['v1']
          },
          kind: {
            type: 'string',
            enum: ['ConfigMap']
          },
          metadata: {
            type: 'object',
            required: true,
            properties: {
              name: {
                type: 'string',
                required: true,
                pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
              },
              namespace: {
                type: 'string',
                pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
              }
            }
          },
          data: {
            type: 'object'
          }
        }
      }
    });
  }

  private static registerServiceSchema(): void {
    this.registerSchema({
      apiVersion: 'v1',
      kind: 'Service',
      required: ['apiVersion', 'kind', 'metadata'],
      schema: {
        type: 'object',
        properties: {
          apiVersion: {
            type: 'string',
            enum: ['v1']
          },
          kind: {
            type: 'string',
            enum: ['Service']
          },
          metadata: {
            type: 'object',
            required: true,
            properties: {
              name: {
                type: 'string',
                required: true,
                pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
              },
              namespace: {
                type: 'string',
                pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
              }
            }
          },
          spec: {
            type: 'object',
            properties: {
              selector: {
                type: 'object'
              },
              ports: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string'
                    },
                    port: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 65535,
                      required: true
                    },
                    targetPort: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 65535
                    },
                    protocol: {
                      type: 'string',
                      enum: ['TCP', 'UDP', 'SCTP']
                    }
                  }
                }
              },
              type: {
                type: 'string',
                enum: ['ClusterIP', 'NodePort', 'LoadBalancer', 'ExternalName']
              }
            }
          }
        }
      }
    });
  }

  private static registerDeploymentSchema(): void {
    this.registerSchema({
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      required: ['apiVersion', 'kind', 'metadata', 'spec'],
      schema: {
        type: 'object',
        properties: {
          apiVersion: {
            type: 'string',
            enum: ['apps/v1']
          },
          kind: {
            type: 'string',
            enum: ['Deployment']
          },
          metadata: {
            type: 'object',
            required: true,
            properties: {
              name: {
                type: 'string',
                required: true,
                pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
              },
              namespace: {
                type: 'string',
                pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
              }
            }
          },
          spec: {
            type: 'object',
            required: true,
            properties: {
              replicas: {
                type: 'integer',
                minimum: 0
              },
              selector: {
                type: 'object',
                required: true,
                properties: {
                  matchLabels: {
                    type: 'object'
                  }
                }
              },
              template: {
                type: 'object',
                required: true,
                properties: {
                  metadata: {
                    type: 'object',
                    properties: {
                      labels: {
                        type: 'object'
                      }
                    }
                  },
                  spec: {
                    type: 'object',
                    properties: {
                      containers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            name: {
                              type: 'string',
                              required: true
                            },
                            image: {
                              type: 'string',
                              required: true
                            },
                            ports: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  containerPort: {
                                    type: 'integer',
                                    minimum: 1,
                                    maximum: 65535
                                  },
                                  protocol: {
                                    type: 'string',
                                    enum: ['TCP', 'UDP', 'SCTP']
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
  }
}

// Register built-in schemas for common Kubernetes resources
SchemaValidator.registerBuiltInSchemas();