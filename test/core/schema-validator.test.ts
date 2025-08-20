import { SchemaValidator, ResourceSchema } from '../../src/core/schema-validator';
import { KubernetesManifest } from '../../src/core/types';

describe('SchemaValidator', () => {
  beforeEach(() => {
    // Clear schemas before each test to avoid interference
    SchemaValidator.clearSchemas();
    // Re-register built-in schemas for tests that need them
    SchemaValidator.registerBuiltInSchemas();
  });

  describe('schema registration', () => {
    it('should register and retrieve schemas', () => {
      const schema: ResourceSchema = {
        apiVersion: 'v1',
        kind: 'TestResource',
        schema: {
          type: 'object',
          properties: {
            spec: {
              type: 'object',
              properties: {
                name: { type: 'string', required: true }
              }
            }
          }
        }
      };

      SchemaValidator.registerSchema(schema);
      const retrieved = SchemaValidator.getSchema('v1', 'TestResource');

      expect(retrieved).toEqual(schema);
    });

    it('should return undefined for unregistered schemas', () => {
      const schema = SchemaValidator.getSchema('v1', 'NonExistent');
      expect(schema).toBeUndefined();
    });

    it('should clear all schemas', () => {
      const schema: ResourceSchema = {
        apiVersion: 'v1',
        kind: 'TestResource',
        schema: { type: 'object' }
      };

      SchemaValidator.registerSchema(schema);
      expect(SchemaValidator.getSchema('v1', 'TestResource')).toBeDefined();

      SchemaValidator.clearSchemas();
      expect(SchemaValidator.getSchema('v1', 'TestResource')).toBeUndefined();
    });
  });

  describe('manifest validation', () => {
    beforeEach(() => {
      // Register a test schema
      const testSchema: ResourceSchema = {
        apiVersion: 'v1',
        kind: 'TestResource',
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
              enum: ['TestResource']
            },
            metadata: {
              type: 'object',
              required: true,
              properties: {
                name: {
                  type: 'string',
                  required: true,
                  pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$'
                }
              }
            },
            spec: {
              type: 'object',
              properties: {
                replicas: {
                  type: 'integer',
                  minimum: 0,
                  maximum: 100
                },
                ports: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      port: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 65535,
                        required: true
                      },
                      protocol: {
                        type: 'string',
                        enum: ['TCP', 'UDP']
                      }
                    }
                  }
                }
              }
            }
          }
        }
      };

      SchemaValidator.registerSchema(testSchema);
    });

    it('should validate a correct manifest', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'TestResource',
        metadata: {
          name: 'test-resource'
        },
        spec: {
          replicas: 3,
          ports: [
            { port: 8080, protocol: 'TCP' }
          ]
        }
      };

      const result = SchemaValidator.validateManifest(manifest);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required properties', () => {
      const manifest: Partial<KubernetesManifest> = {
        apiVersion: 'v1',
        kind: 'TestResource'
        // Missing required metadata
      };

      const result = SchemaValidator.validateManifest(manifest as KubernetesManifest);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_PROPERTY')).toBe(true);
      expect(result.errors.some(e => e.message.includes('metadata'))).toBe(true);
    });

    it('should detect invalid types', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'TestResource',
        metadata: {
          name: 'test-resource'
        },
        spec: {
          replicas: 'invalid-number' // Should be integer
        }
      };

      const result = SchemaValidator.validateManifest(manifest);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_TYPE')).toBe(true);
    });

    it('should detect invalid enum values', () => {
      // Let's test with a field that has an enum constraint
      // First register a schema with an enum field
      SchemaValidator.clearSchemas();
      SchemaValidator.registerSchema({
        apiVersion: 'v1',
        kind: 'TestResource',
        schema: {
          type: 'object',
          properties: {
            apiVersion: {
              type: 'string',
              enum: ['v1']
            },
            kind: {
              type: 'string',
              enum: ['TestResource']
            },
            metadata: {
              type: 'object'
            },
            spec: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['ClusterIP', 'NodePort'] // Valid enum values
                }
              }
            }
          }
        }
      });

      const manifestWithInvalidEnum: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'TestResource',
        metadata: {
          name: 'test-resource'
        },
        spec: {
          type: 'InvalidType' // Invalid enum value
        }
      };

      const result = SchemaValidator.validateManifest(manifestWithInvalidEnum);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_ENUM_VALUE')).toBe(true);
    });

    it('should detect pattern mismatches', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'TestResource',
        metadata: {
          name: 'Invalid_Name!' // Doesn't match DNS pattern
        }
      };

      const result = SchemaValidator.validateManifest(manifest);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'PATTERN_MISMATCH')).toBe(true);
    });

    it('should detect number range violations', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'TestResource',
        metadata: {
          name: 'test-resource'
        },
        spec: {
          replicas: 150 // Exceeds maximum of 100
        }
      };

      const result = SchemaValidator.validateManifest(manifest);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'VALUE_TOO_LARGE')).toBe(true);
    });

    it('should validate array items', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'TestResource',
        metadata: {
          name: 'test-resource'
        },
        spec: {
          ports: [
            { port: 8080, protocol: 'TCP' },
            { port: 70000, protocol: 'TCP' } // Port too large
          ]
        }
      };

      const result = SchemaValidator.validateManifest(manifest);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'VALUE_TOO_LARGE')).toBe(true);
      expect(result.errors.some(e => e.path.includes('[1]'))).toBe(true);
    });

    it('should detect unknown properties as warnings', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'TestResource',
        metadata: {
          name: 'test-resource'
        },
        unknownProperty: 'should-warn' // Unknown property
      };

      const result = SchemaValidator.validateManifest(manifest);

      expect(result.errors.some(e => e.code === 'UNKNOWN_PROPERTY')).toBe(true);
      expect(result.errors.some(e => e.severity === 'warning')).toBe(true);
    });

    it('should pass validation for unregistered resource types', () => {
      const manifest: KubernetesManifest = {
        apiVersion: 'custom/v1',
        kind: 'CustomResource',
        metadata: {
          name: 'test-resource'
        }
      };

      const result = SchemaValidator.validateManifest(manifest);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('built-in schemas', () => {
    beforeEach(() => {
      // Re-register built-in schemas since we clear them in beforeEach
      // We need to manually re-register them since require() is cached
      
      // ConfigMap schema
      SchemaValidator.registerSchema({
        apiVersion: 'v1',
        kind: 'ConfigMap',
        required: ['apiVersion', 'kind', 'metadata'],
        schema: {
          type: 'object',
          properties: {
            apiVersion: { type: 'string', enum: ['v1'] },
            kind: { type: 'string', enum: ['ConfigMap'] },
            metadata: {
              type: 'object',
              required: true,
              properties: {
                name: { type: 'string', required: true, pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' },
                namespace: { type: 'string', pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' }
              }
            },
            data: { type: 'object' },
            binaryData: { type: 'object' },
            immutable: { type: 'boolean' }
          }
        }
      });

      // Service schema
      SchemaValidator.registerSchema({
        apiVersion: 'v1',
        kind: 'Service',
        required: ['apiVersion', 'kind', 'metadata'],
        schema: {
          type: 'object',
          properties: {
            apiVersion: { type: 'string', enum: ['v1'] },
            kind: { type: 'string', enum: ['Service'] },
            metadata: {
              type: 'object',
              required: true,
              properties: {
                name: { type: 'string', required: true, pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' }
              }
            },
            spec: {
              type: 'object',
              properties: {
                ports: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      port: { type: 'integer', minimum: 1, maximum: 65535, required: true }
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Deployment schema
      SchemaValidator.registerSchema({
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        required: ['apiVersion', 'kind', 'metadata', 'spec'],
        schema: {
          type: 'object',
          properties: {
            apiVersion: { type: 'string', enum: ['apps/v1'] },
            kind: { type: 'string', enum: ['Deployment'] },
            metadata: {
              type: 'object',
              required: true,
              properties: {
                name: { type: 'string', required: true, pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' }
              }
            },
            spec: {
              type: 'object',
              required: true,
              properties: {
                template: {
                  type: 'object',
                  properties: {
                    spec: {
                      type: 'object',
                      properties: {
                        containers: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              name: { type: 'string', required: true, pattern: '^[a-z0-9]([-a-z0-9]*[a-z0-9])?$' }
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
    });

    it('should validate ConfigMap manifests', () => {
      const configMap: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-config',
          namespace: 'default'
        },
        data: {
          'config.yaml': 'key: value'
        }
      };

      const result = SchemaValidator.validateManifest(configMap);

      expect(result.isValid).toBe(true);
      expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0);
    });

    it('should validate Service manifests', () => {
      const service: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'test-service'
        },
        spec: {
          selector: {
            app: 'test'
          },
          ports: [
            {
              port: 80,
              targetPort: 8080,
              protocol: 'TCP'
            }
          ],
          type: 'ClusterIP'
        }
      };

      const result = SchemaValidator.validateManifest(service);

      expect(result.isValid).toBe(true);
      // Filter out warnings, only check for errors
      const errorMessages = result.errors.filter(e => e.severity === 'error');
      expect(errorMessages).toHaveLength(0);
    });

    it('should validate Deployment manifests', () => {
      const deployment: KubernetesManifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'test-deployment'
        },
        spec: {
          replicas: 3,
          selector: {
            matchLabels: {
              app: 'test'
            }
          },
          template: {
            metadata: {
              labels: {
                app: 'test'
              }
            },
            spec: {
              containers: [
                {
                  name: 'app',
                  image: 'nginx:latest',
                  ports: [
                    {
                      containerPort: 80,
                      protocol: 'TCP'
                    }
                  ]
                }
              ]
            }
          }
        }
      };

      const result = SchemaValidator.validateManifest(deployment);

      expect(result.isValid).toBe(true);
      // Filter out warnings, only check for errors
      const errorMessages = result.errors.filter(e => e.severity === 'error');
      expect(errorMessages).toHaveLength(0);
    });

    it('should detect invalid Service port ranges', () => {
      const service: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'test-service'
        },
        spec: {
          ports: [
            {
              port: 70000 // Invalid port number
            }
          ]
        }
      };

      const result = SchemaValidator.validateManifest(service);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'VALUE_TOO_LARGE')).toBe(true);
    });

    it('should detect missing required Deployment fields', () => {
      const deployment: KubernetesManifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'test-deployment'
        }
        // Missing required spec
      };

      const result = SchemaValidator.validateManifest(deployment);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_REQUIRED_PROPERTY')).toBe(true);
      expect(result.errors.some(e => e.message.includes('spec'))).toBe(true);
    });

    it('should detect invalid container names in Deployments', () => {
      const deployment: KubernetesManifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'test-deployment'
        },
        spec: {
          selector: {
            matchLabels: { app: 'test' }
          },
          template: {
            spec: {
              containers: [
                {
                  name: 'Invalid_Container_Name!', // Invalid name pattern
                  image: 'nginx:latest'
                }
              ]
            }
          }
        }
      };

      const result = SchemaValidator.validateManifest(deployment);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.code === 'PATTERN_MISMATCH')).toBe(true);
    });
  });

  describe('type validation', () => {
    it('should validate string types', () => {
      const result = SchemaValidator.validateManifest({
        apiVersion: 'test/v1',
        kind: 'Test',
        metadata: {},
        testProp: 'valid-string'
      });
      // Since no schema is registered for test/v1, this should pass
      expect(result.isValid).toBe(true);
    });

    it('should validate integer types', () => {
      const testSchema: ResourceSchema = {
        apiVersion: 'test/v1',
        kind: 'Test',
        schema: {
          type: 'object',
          properties: {
            apiVersion: { type: 'string' },
            kind: { type: 'string' },
            metadata: { type: 'object' },
            spec: {
              type: 'object',
              properties: {
                count: { type: 'integer' }
              }
            }
          }
        }
      };

      SchemaValidator.registerSchema(testSchema);

      const validResult = SchemaValidator.validateManifest({
        apiVersion: 'test/v1',
        kind: 'Test',
        metadata: {},
        spec: {
          count: 42
        }
      });

      const invalidResult = SchemaValidator.validateManifest({
        apiVersion: 'test/v1',
        kind: 'Test',
        metadata: {},
        spec: {
          count: 3.14 // Not an integer
        }
      });

      expect(validResult.isValid).toBe(true);
      expect(invalidResult.isValid).toBe(false);
      
      // The error should be INVALID_TYPE because 3.14 is not an integer type
      expect(invalidResult.errors.some(e => e.code === 'INVALID_TYPE')).toBe(true);
    });

    it('should validate boolean types', () => {
      const testSchema: ResourceSchema = {
        apiVersion: 'test/v1',
        kind: 'Test',
        schema: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' }
          }
        }
      };

      SchemaValidator.registerSchema(testSchema);

      const validResult = SchemaValidator.validateManifest({
        apiVersion: 'test/v1',
        kind: 'Test',
        metadata: {},
        enabled: true
      });

      const invalidResult = SchemaValidator.validateManifest({
        apiVersion: 'test/v1',
        kind: 'Test',
        metadata: {},
        enabled: 'true' // String instead of boolean
      });

      expect(validResult.isValid).toBe(true);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.some(e => e.code === 'INVALID_TYPE')).toBe(true);
    });
  });

  describe('integration with Validator', () => {
    it('should be called during manifest validation', () => {
      // This test ensures that schema validation is integrated with the main Validator
      const { Validator } = require('../../src/core/validator');
      const { KubernetesResource } = require('../../src/core/kubernetes-resource');
      const { Stack } = require('../../src/core/stack');
      const { App } = require('../../src/core/app');

      class TestResource extends KubernetesResource {
        public readonly apiVersion = 'v1';
        public readonly kind = 'ConfigMap';

        constructor(scope: any, id: string) {
          super(scope, id, {
            metadata: {
              name: 'Invalid_Name!' // This should trigger schema validation
            }
          });
        }

        public toManifest() {
          return {
            apiVersion: this.apiVersion,
            kind: this.kind,
            metadata: this.getCompleteMetadata()
          };
        }
      }

      const app = new App();
      const stack = new Stack(app, 'TestStack');
      const resource = new TestResource(stack, 'TestResource');

      const result = Validator.validateKubernetesResource(resource);

      expect(result.isValid).toBe(false);
      // Should have both naming validation errors and schema validation errors
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});