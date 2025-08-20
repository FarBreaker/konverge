import { App } from '../../../src/core/app';
import { Stack } from '../../../src/core/stack';
import { Microservice } from '../../../src/constructs/patterns/microservice';

describe('Microservice Construct', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  test('should create a microservice with only web service', () => {
    const microservice = new Microservice(stack, 'SimpleService', {
      webService: {
        image: 'myapp:latest',
        containerPort: 8080,
        servicePort: 80
      }
    });

    expect(microservice.webService).toBeDefined();
    expect(microservice.database).toBeUndefined();
    expect(microservice.sharedConfig).toBeUndefined();

    // Check web service configuration
    const deploymentManifest = microservice.webService.deployment.toManifest();
    expect(deploymentManifest.spec!.template.spec!.containers[0].image).toBe('myapp:latest');
    expect(deploymentManifest.spec!.template.spec!.containers[0].ports![0].containerPort).toBe(8080);

    const serviceManifest = microservice.webService.service.toManifest();
    expect(serviceManifest.spec!.ports![0].port).toBe(80);
    expect(serviceManifest.spec!.ports![0].targetPort).toBe(8080);
  });

  test('should create a complete microservice with web service and database', () => {
    const microservice = new Microservice(stack, 'FullService', {
      webService: {
        image: 'myapp:v1.0.0',
        containerPort: 3000,
        replicas: 2,
        env: {
          NODE_ENV: 'production',
          LOG_LEVEL: 'info'
        }
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'appdb',
          username: 'appuser',
          password: 'dbpassword'
        }
      }
    });

    expect(microservice.webService).toBeDefined();
    expect(microservice.database).toBeDefined();

    // Check database configuration
    const dbDeployment = microservice.database!.deployment.toManifest();
    expect(dbDeployment.spec!.template.spec!.containers[0].image).toBe('postgres:13');

    const dbService = microservice.database!.service.toManifest();
    expect(dbService.spec!.ports![0].port).toBe(5432);

    // Check web service has database environment variables
    const webDeployment = microservice.webService.deployment.toManifest();
    const container = webDeployment.spec!.template.spec!.containers[0];
    const envVars = container.env || [];

    expect(envVars.find(e => e.name === 'NODE_ENV')?.value).toBe('production');
    expect(envVars.find(e => e.name === 'LOG_LEVEL')?.value).toBe('info');
    expect(envVars.find(e => e.name === 'DATABASE_HOST')).toBeDefined();
    expect(envVars.find(e => e.name === 'DATABASE_PORT')?.value).toBe('5432');
    expect(envVars.find(e => e.name === 'DATABASE_NAME')?.value).toBe('appdb');
    expect(envVars.find(e => e.name === 'DATABASE_USER')?.value).toBe('appuser');
    expect(envVars.find(e => e.name === 'DATABASE_PASSWORD')?.value).toBe('dbpassword');
    expect(envVars.find(e => e.name === 'DATABASE_URL')).toBeDefined();
  });

  test('should create microservice with shared configuration', () => {
    const microservice = new Microservice(stack, 'SharedConfigService', {
      webService: {
        image: 'myapp:latest'
      },
      sharedConfig: {
        'api.timeout': '30s',
        'cache.ttl': '300',
        'feature.flags': 'new-ui,advanced-search'
      }
    });

    expect(microservice.sharedConfig).toBeDefined();

    // Check shared config ConfigMap
    const configMapManifest = microservice.sharedConfig!.toManifest();
    expect(configMapManifest.data!['api.timeout']).toBe('30s');
    expect(configMapManifest.data!['cache.ttl']).toBe('300');
    expect(configMapManifest.data!['feature.flags']).toBe('new-ui,advanced-search');

    // Check web service has shared config environment variables
    const webDeployment = microservice.webService.deployment.toManifest();
    const container = webDeployment.spec!.template.spec!.containers[0];
    const envVars = container.env || [];

    expect(envVars.find(e => e.name === 'SHARED_API_TIMEOUT')).toBeDefined();
    expect(envVars.find(e => e.name === 'SHARED_CACHE_TTL')).toBeDefined();
    expect(envVars.find(e => e.name === 'SHARED_FEATURE_FLAGS')).toBeDefined();
  });

  test('should create microservice with all components and custom labels', () => {
    const microservice = new Microservice(stack, 'CompleteService', {
      webService: {
        image: 'myapp:v2.0.0',
        replicas: 3,
        labels: {
          'tier': 'frontend'
        }
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'complete_db',
          username: 'complete_user',
          password: 'complete_pass'
        },
        labels: {
          'tier': 'backend'
        }
      },
      sharedConfig: {
        'app.name': 'Complete Service',
        'app.version': '2.0.0'
      },
      labels: {
        'project': 'awesome-app',
        'environment': 'production'
      }
    });

    // Check that all components exist
    expect(microservice.webService).toBeDefined();
    expect(microservice.database).toBeDefined();
    expect(microservice.sharedConfig).toBeDefined();

    // Check labels are properly applied
    const webLabels = microservice.webService.deployment.toManifest().metadata.labels!;
    expect(webLabels['project']).toBe('awesome-app');
    expect(webLabels['environment']).toBe('production');
    expect(webLabels['tier']).toBe('frontend');
    expect(webLabels['app.kubernetes.io/name']).toBe('CompleteService');

    const dbLabels = microservice.database!.deployment.toManifest().metadata.labels!;
    expect(dbLabels['project']).toBe('awesome-app');
    expect(dbLabels['environment']).toBe('production');
    expect(dbLabels['tier']).toBe('backend');

    const configLabels = microservice.sharedConfig!.toManifest().metadata.labels!;
    expect(configLabels['project']).toBe('awesome-app');
    expect(configLabels['environment']).toBe('production');
  });

  test('should get database connection details', () => {
    const microservice = new Microservice(stack, 'DBService', {
      webService: {
        image: 'myapp:latest'
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'testdb',
          username: 'testuser',
          password: 'testpass'
        }
      }
    });

    const connection = microservice.getDatabaseConnection();
    expect(connection).toBeDefined();
    expect(connection!.port).toBe(5432);
    expect(connection!.database).toBe('testdb');
    expect(connection!.username).toBe('testuser');
    expect(connection!.host).toContain('database-service');
  });

  test('should return undefined for database connection when no database', () => {
    const microservice = new Microservice(stack, 'NoDatabaseService', {
      webService: {
        image: 'myapp:latest'
      }
    });

    const connection = microservice.getDatabaseConnection();
    expect(connection).toBeUndefined();
  });

  test('should allow scaling the web service', () => {
    const microservice = new Microservice(stack, 'ScalableService', {
      webService: {
        image: 'myapp:latest',
        replicas: 2
      }
    });

    // Initial replicas
    expect(microservice.webService.deployment.toManifest().spec!.replicas).toBe(2);

    // Scale up
    microservice.scale(5);
    expect(microservice.webService.deployment.toManifest().spec!.replicas).toBe(5);
  });

  test('should allow adding environment variables after creation', () => {
    const microservice = new Microservice(stack, 'DynamicEnvService', {
      webService: {
        image: 'myapp:latest'
      }
    });

    microservice.addEnvironmentVariable('DYNAMIC_VAR', 'dynamic-value');

    const webDeployment = microservice.webService.deployment.toManifest();
    const container = webDeployment.spec!.template.spec!.containers[0];
    const envVars = container.env || [];

    expect(envVars.find(e => e.name === 'DYNAMIC_VAR')?.value).toBe('dynamic-value');
  });

  test('should allow adding shared configuration after creation', () => {
    const microservice = new Microservice(stack, 'DynamicConfigService', {
      webService: {
        image: 'myapp:latest'
      }
    });

    // Initially no shared config
    expect(microservice.sharedConfig).toBeUndefined();

    // Add shared configuration
    microservice.addSharedConfig('new-setting', 'new-value');

    // Now shared config should exist
    expect(microservice.sharedConfig).toBeDefined();
    expect(microservice.sharedConfig!.getData('new-setting')).toBe('new-value');
  });

  test('should have consistent labels across all components', () => {
    const microservice = new Microservice(stack, 'LabeledService', {
      webService: {
        image: 'myapp:latest'
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'testdb',
          username: 'testuser',
          password: 'testpass'
        }
      },
      sharedConfig: {
        'key': 'value'
      },
      labels: {
        'team': 'platform',
        'service': 'core'
      }
    });

    const expectedBaseLabels = {
      'app.kubernetes.io/name': 'LabeledService',
      'app.kubernetes.io/component': 'microservice',
      'app.kubernetes.io/part-of': 'application',
      'team': 'platform',
      'service': 'core'
    };

    // Check web service labels
    const webLabels = microservice.webService.deployment.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedBaseLabels)) {
      expect(webLabels[key]).toBe(value);
    }

    // Check database labels
    const dbLabels = microservice.database!.deployment.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedBaseLabels)) {
      expect(dbLabels[key]).toBe(value);
    }

    // Check shared config labels
    const configLabels = microservice.sharedConfig!.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedBaseLabels)) {
      expect(configLabels[key]).toBe(value);
    }
  });

  test('should properly compose multiple resources with correct relationships', () => {
    const microservice = new Microservice(stack, 'ComposedService', {
      webService: {
        image: 'myapp:latest'
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'composed_db',
          username: 'composed_user',
          password: 'composed_pass'
        }
      }
    });

    // Verify that the microservice construct contains all expected child constructs
    const children = microservice.node.children;
    expect(children).toHaveLength(2); // web service and database

    const webServiceConstruct = children.find(c => c.node.id === 'web');
    const databaseConstruct = children.find(c => c.node.id === 'database');

    expect(webServiceConstruct).toBeDefined();
    expect(databaseConstruct).toBeDefined();

    // Verify that each component has its own child resources
    const webChildren = webServiceConstruct!.node.children;
    expect(webChildren.length).toBeGreaterThan(0); // Should have deployment, service, etc.

    const dbChildren = databaseConstruct!.node.children;
    expect(dbChildren.length).toBeGreaterThan(0); // Should have deployment, service, configmap
  });
});