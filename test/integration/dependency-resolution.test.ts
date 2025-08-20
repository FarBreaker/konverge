import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { WebService } from '../../src/constructs/patterns/web-service';
import { Database } from '../../src/constructs/patterns/database';
import { Microservice } from '../../src/constructs/patterns/microservice';
import { DependencyTracker, DependencyType } from '../../src/core/dependency-tracker';

describe('Dependency Resolution Integration Tests', () => {
  let app: App;
  let stack: Stack;
  let tracker: DependencyTracker;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
    tracker = DependencyTracker.getInstance();
    tracker.clear(); // Clear any previous dependencies
  });

  afterEach(() => {
    tracker.clear();
  });

  test('should resolve dependencies for WebService with ConfigMap', () => {
    const webService = new WebService(stack, 'TestWebService', {
      image: 'nginx:latest',
      config: {
        'app.properties': 'debug=true'
      }
    });

    // Check that dependencies were registered
    const deploymentDeps = tracker.getDependencies(webService.deployment);
    expect(deploymentDeps).toHaveLength(1);
    expect(deploymentDeps[0].dependency).toBe(webService.configMap);
    expect(deploymentDeps[0].type).toBe(DependencyType.CONFIGURATION);

    const serviceDeps = tracker.getDependencies(webService.service);
    expect(serviceDeps).toHaveLength(1);
    expect(serviceDeps[0].dependency).toBe(webService.deployment);
    expect(serviceDeps[0].type).toBe(DependencyType.RUNTIME_REFERENCE);
  });

  test('should resolve dependencies for Database construct', () => {
    const database = new Database(stack, 'TestDatabase', {
      image: 'postgres:13',
      port: 5432,
      database: {
        name: 'testdb',
        username: 'testuser',
        password: 'testpass'
      }
    });

    // Check that dependencies were registered
    const deploymentDeps = tracker.getDependencies(database.deployment);
    expect(deploymentDeps).toHaveLength(1);
    expect(deploymentDeps[0].dependency).toBe(database.configMap);
    expect(deploymentDeps[0].type).toBe(DependencyType.CONFIGURATION);

    const serviceDeps = tracker.getDependencies(database.service);
    expect(serviceDeps).toHaveLength(1);
    expect(serviceDeps[0].dependency).toBe(database.deployment);
    expect(serviceDeps[0].type).toBe(DependencyType.RUNTIME_REFERENCE);
  });

  test('should resolve complex dependencies for Microservice', () => {
    const microservice = new Microservice(stack, 'TestMicroservice', {
      webService: {
        image: 'myapp:latest',
        containerPort: 3000
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'appdb',
          username: 'appuser',
          password: 'apppass'
        }
      },
      sharedConfig: {
        'api.timeout': '30s',
        'cache.ttl': '300'
      }
    });

    // Check web service dependencies
    const webServiceDeps = tracker.getDependencies(microservice.webService);
    expect(webServiceDeps.length).toBeGreaterThan(0);

    // Should depend on database
    const databaseDep = webServiceDeps.find(dep => dep.dependency === microservice.database);
    expect(databaseDep).toBeDefined();
    expect(databaseDep!.type).toBe(DependencyType.NETWORK);

    // Should depend on shared config
    const sharedConfigDep = webServiceDeps.find(dep => dep.dependency === microservice.sharedConfig);
    expect(sharedConfigDep).toBeDefined();
    expect(sharedConfigDep!.type).toBe(DependencyType.CONFIGURATION);

    // Check deployment-level dependencies
    const deploymentDeps = tracker.getDependencies(microservice.webService.deployment);
    expect(deploymentDeps.length).toBeGreaterThan(0);

    // Should depend on database service
    const dbServiceDep = deploymentDeps.find(dep => dep.dependency === microservice.database!.service);
    expect(dbServiceDep).toBeDefined();
    expect(dbServiceDep!.type).toBe(DependencyType.NETWORK);

    // Should depend on shared config
    const sharedConfigDeploymentDep = deploymentDeps.find(dep => dep.dependency === microservice.sharedConfig);
    expect(sharedConfigDeploymentDep).toBeDefined();
    expect(sharedConfigDeploymentDep!.type).toBe(DependencyType.CONFIGURATION);
  });

  test('should order resources correctly based on dependencies', () => {
    new Microservice(stack, 'OrderedMicroservice', {
      webService: {
        image: 'myapp:latest'
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'orderdb',
          username: 'orderuser',
          password: 'orderpass'
        }
      },
      sharedConfig: {
        'setting': 'value'
      }
    });

    // Synthesize the stack to get ordered manifests
    const manifests = stack.synthesize();

    // Find the positions of different resource types
    const configMapIndex = manifests.findIndex(m => m.kind === 'ConfigMap');
    const deploymentIndex = manifests.findIndex(m => m.kind === 'Deployment');
    const serviceIndex = manifests.findIndex(m => m.kind === 'Service');

    // ConfigMaps should come before Deployments
    expect(configMapIndex).toBeLessThan(deploymentIndex);
    
    // Services can come before or after Deployments (they're independent)
    // but the dependency system should handle this correctly
    expect(configMapIndex).toBeGreaterThanOrEqual(0);
    expect(deploymentIndex).toBeGreaterThanOrEqual(0);
    expect(serviceIndex).toBeGreaterThanOrEqual(0);
  });

  test('should detect circular dependencies', () => {
    // Create constructs that would have circular dependencies
    const webService1 = new WebService(stack, 'WebService1', {
      image: 'app1:latest'
    });

    const webService2 = new WebService(stack, 'WebService2', {
      image: 'app2:latest'
    });

    // Manually add circular dependencies
    tracker.addDependency(webService1, webService2, DependencyType.NETWORK);
    tracker.addDependency(webService2, webService1, DependencyType.NETWORK);

    // Should detect circular dependency
    const circularDeps = tracker.detectCircularDependencies(stack);
    expect(circularDeps.length).toBeGreaterThan(0);
  });

  test('should handle dynamic dependency addition', () => {
    const webService = new WebService(stack, 'DynamicWebService', {
      image: 'myapp:latest'
    });

    // Initially no ConfigMap dependency
    let deploymentDeps = tracker.getDependencies(webService.deployment);
    const initialConfigDeps = deploymentDeps.filter(dep => 
      dep.dependency.constructor.name === 'ConfigMap'
    );
    expect(initialConfigDeps).toHaveLength(0);

    // Add configuration dynamically
    webService.addConfig('new-setting', 'new-value');

    // Now should have ConfigMap dependency
    deploymentDeps = tracker.getDependencies(webService.deployment);
    const configDeps = deploymentDeps.filter(dep => 
      dep.dependency.constructor.name === 'ConfigMap'
    );
    expect(configDeps).toHaveLength(1);
    expect(configDeps[0].type).toBe(DependencyType.CONFIGURATION);
  });

  test('should handle multiple microservices with cross-dependencies', () => {
    const frontendService = new Microservice(stack, 'Frontend', {
      webService: {
        image: 'frontend:latest',
        containerPort: 3000
      }
    });

    const backendService = new Microservice(stack, 'Backend', {
      webService: {
        image: 'backend:latest',
        containerPort: 8080
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'backenddb',
          username: 'backend',
          password: 'backendpass'
        }
      }
    });

    // Manually add cross-service dependency (frontend depends on backend)
    tracker.addDependency(
      frontendService.webService,
      backendService.webService,
      DependencyType.NETWORK,
      'Frontend depends on Backend API'
    );

    // Check that dependency was registered
    const frontendDeps = tracker.getDependencies(frontendService.webService);
    const backendDep = frontendDeps.find(dep => dep.dependency === backendService.webService);
    expect(backendDep).toBeDefined();
    expect(backendDep!.type).toBe(DependencyType.NETWORK);

    // Synthesize and check ordering
    const manifests = stack.synthesize();
    expect(manifests.length).toBeGreaterThan(0);

    // Should not throw circular dependency error
    expect(() => {
      const circularDeps = tracker.detectCircularDependencies(stack);
      if (circularDeps.length > 0) {
        throw new Error('Circular dependencies detected');
      }
    }).not.toThrow();
  });

  test('should provide dependency information for debugging', () => {
    const microservice = new Microservice(stack, 'DebugMicroservice', {
      webService: {
        image: 'debug:latest'
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'debugdb',
          username: 'debug',
          password: 'debugpass'
        }
      }
    });

    // Check that we can get dependency information
    const webServiceDeps = tracker.getDependencies(microservice.webService);
    expect(webServiceDeps.length).toBeGreaterThan(0);

    for (const dep of webServiceDeps) {
      expect(dep.dependent).toBe(microservice.webService);
      expect(dep.dependency).toBeDefined();
      expect(dep.type).toBeDefined();
      expect(dep.description).toBeDefined();
      expect(typeof dep.description).toBe('string');
    }

    // Check that we can get dependents
    const databaseDependents = tracker.getDependents(microservice.database!);
    expect(databaseDependents.length).toBeGreaterThan(0);
    expect(databaseDependents).toContain(microservice.webService);
  });

  test('should handle synthesis with dependency ordering', () => {
    // Create a complex scenario with multiple levels of dependencies
    new Microservice(stack, 'ComplexMicroservice', {
      webService: {
        image: 'complex:latest',
        config: {
          'app.name': 'Complex App'
        }
      },
      database: {
        image: 'postgres:13',
        port: 5432,
        database: {
          name: 'complexdb',
          username: 'complex',
          password: 'complexpass'
        }
      },
      sharedConfig: {
        'global.setting': 'production'
      }
    });

    // Synthesize the entire stack
    const manifests = stack.synthesize();
    
    // Should have multiple manifests
    expect(manifests.length).toBeGreaterThan(5);

    // Should have proper resource types
    const kinds = manifests.map(m => m.kind);
    expect(kinds).toContain('ConfigMap');
    expect(kinds).toContain('Deployment');
    expect(kinds).toContain('Service');

    // All manifests should have proper metadata
    for (const manifest of manifests) {
      expect(manifest.apiVersion).toBeDefined();
      expect(manifest.kind).toBeDefined();
      expect(manifest.metadata).toBeDefined();
      expect(manifest.metadata.name).toBeDefined();
    }
  });
});