import { App } from '../../../src/core/app';
import { Stack } from '../../../src/core/stack';
import { WebService } from '../../../src/constructs/patterns/web-service';

describe('WebService Construct', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  test('should create a basic web service with default values', () => {
    const webService = new WebService(stack, 'MyWebService', {
      image: 'nginx:latest'
    });

    expect(webService.deployment).toBeDefined();
    expect(webService.service).toBeDefined();
    expect(webService.configMap).toBeUndefined();

    // Check deployment configuration
    const deploymentManifest = webService.deployment.toManifest();
    expect(deploymentManifest.spec!.replicas).toBe(1);
    expect(deploymentManifest.spec!.template.spec!.containers).toHaveLength(1);
    expect(deploymentManifest.spec!.template.spec!.containers[0].image).toBe('nginx:latest');
    expect(deploymentManifest.spec!.template.spec!.containers[0].ports![0].containerPort).toBe(80);

    // Check service configuration
    const serviceManifest = webService.service.toManifest();
    expect(serviceManifest.spec!.type).toBe('ClusterIP');
    expect(serviceManifest.spec!.ports).toHaveLength(1);
    expect(serviceManifest.spec!.ports![0].port).toBe(80);
    expect(serviceManifest.spec!.ports![0].targetPort).toBe(80);
  });

  test('should create web service with custom configuration', () => {
    const webService = new WebService(stack, 'CustomWebService', {
      image: 'myapp:v1.0.0',
      containerPort: 8080,
      servicePort: 80,
      replicas: 3,
      serviceType: 'LoadBalancer',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      },
      config: {
        'app.properties': 'debug=false',
        'database.url': 'postgres://localhost:5432/mydb'
      },
      labels: {
        'version': 'v1.0.0',
        'tier': 'frontend'
      }
    });

    // Check deployment configuration
    const deploymentManifest = webService.deployment.toManifest();
    expect(deploymentManifest.spec!.replicas).toBe(3);
    expect(deploymentManifest.spec!.template.spec!.containers[0].image).toBe('myapp:v1.0.0');
    expect(deploymentManifest.spec!.template.spec!.containers[0].ports![0].containerPort).toBe(8080);

    // Check environment variables
    const container = deploymentManifest.spec!.template.spec!.containers[0];
    const envVars = container.env || [];
    expect(envVars.find(e => e.name === 'NODE_ENV')?.value).toBe('production');
    expect(envVars.find(e => e.name === 'LOG_LEVEL')?.value).toBe('info');

    // Check ConfigMap references
    expect(envVars.find(e => e.name === 'CONFIG_APP_PROPERTIES')).toBeDefined();
    expect(envVars.find(e => e.name === 'CONFIG_DATABASE_URL')).toBeDefined();

    // Check service configuration
    const serviceManifest = webService.service.toManifest();
    expect(serviceManifest.spec!.type).toBe('LoadBalancer');
    expect(serviceManifest.spec!.ports![0].port).toBe(80);
    expect(serviceManifest.spec!.ports![0].targetPort).toBe(8080);

    // Check ConfigMap
    expect(webService.configMap).toBeDefined();
    const configMapManifest = webService.configMap!.toManifest();
    expect(configMapManifest.data!['app.properties']).toBe('debug=false');
    expect(configMapManifest.data!['database.url']).toBe('postgres://localhost:5432/mydb');

    // Check labels
    expect(deploymentManifest.metadata.labels!['version']).toBe('v1.0.0');
    expect(deploymentManifest.metadata.labels!['tier']).toBe('frontend');
    expect(deploymentManifest.metadata.labels!['app.kubernetes.io/name']).toBe('CustomWebService');
  });

  test('should create web service with health checks', () => {
    const webService = new WebService(stack, 'HealthCheckWebService', {
      image: 'myapp:latest',
      healthCheck: {
        path: '/api/health',
        port: 8080,
        initialDelaySeconds: 60,
        periodSeconds: 30
      }
    });

    const deploymentManifest = webService.deployment.toManifest();
    const container = deploymentManifest.spec!.template.spec!.containers[0];

    // Check liveness probe
    expect(container.livenessProbe).toBeDefined();
    expect(container.livenessProbe!.httpGet!.path).toBe('/api/health');
    expect(container.livenessProbe!.httpGet!.port).toBe(8080);
    expect(container.livenessProbe!.initialDelaySeconds).toBe(60);
    expect(container.livenessProbe!.periodSeconds).toBe(30);

    // Check readiness probe
    expect(container.readinessProbe).toBeDefined();
    expect(container.readinessProbe!.httpGet!.path).toBe('/api/health');
    expect(container.readinessProbe!.httpGet!.port).toBe(8080);
    expect(container.readinessProbe!.initialDelaySeconds).toBe(5);
    expect(container.readinessProbe!.periodSeconds).toBe(5);
  });

  test('should create web service with resource limits', () => {
    const webService = new WebService(stack, 'ResourceLimitedWebService', {
      image: 'myapp:latest',
      resources: {
        requests: {
          cpu: '100m',
          memory: '128Mi'
        },
        limits: {
          cpu: '500m',
          memory: '512Mi'
        }
      }
    });

    const deploymentManifest = webService.deployment.toManifest();
    const container = deploymentManifest.spec!.template.spec!.containers[0];

    expect(container.resources).toBeDefined();
    expect(container.resources!.requests!.cpu).toBe('100m');
    expect(container.resources!.requests!.memory).toBe('128Mi');
    expect(container.resources!.limits!.cpu).toBe('500m');
    expect(container.resources!.limits!.memory).toBe('512Mi');
  });

  test('should allow adding configuration after creation', () => {
    const webService = new WebService(stack, 'DynamicConfigWebService', {
      image: 'myapp:latest'
    });

    // Initially no ConfigMap
    expect(webService.configMap).toBeUndefined();

    // Add configuration
    webService.addConfig('new-key', 'new-value');

    // Now ConfigMap should exist
    expect(webService.configMap).toBeDefined();
    expect(webService.configMap!.getData('new-key')).toBe('new-value');
  });

  test('should allow adding environment variables after creation', () => {
    const webService = new WebService(stack, 'DynamicEnvWebService', {
      image: 'myapp:latest'
    });

    webService.addEnvironmentVariable('NEW_VAR', 'new-value');

    const deploymentManifest = webService.deployment.toManifest();
    const container = deploymentManifest.spec!.template.spec!.containers[0];
    const envVars = container.env || [];

    expect(envVars.find(e => e.name === 'NEW_VAR')?.value).toBe('new-value');
  });

  test('should allow scaling replicas after creation', () => {
    const webService = new WebService(stack, 'ScalableWebService', {
      image: 'myapp:latest',
      replicas: 2
    });

    // Initial replicas
    expect(webService.deployment.toManifest().spec!.replicas).toBe(2);

    // Scale up
    webService.setReplicas(5);
    expect(webService.deployment.toManifest().spec!.replicas).toBe(5);
  });

  test('should have consistent labels across all resources', () => {
    const webService = new WebService(stack, 'LabeledWebService', {
      image: 'myapp:latest',
      config: { 'key': 'value' },
      labels: { 'custom': 'label' }
    });

    const expectedLabels = {
      'app.kubernetes.io/name': 'LabeledWebService',
      'app.kubernetes.io/component': 'web-service',
      'custom': 'label'
    };

    // Check deployment labels
    const deploymentLabels = webService.deployment.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedLabels)) {
      expect(deploymentLabels[key]).toBe(value);
    }

    // Check service labels
    const serviceLabels = webService.service.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedLabels)) {
      expect(serviceLabels[key]).toBe(value);
    }

    // Check ConfigMap labels
    const configMapLabels = webService.configMap!.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedLabels)) {
      expect(configMapLabels[key]).toBe(value);
    }
  });

  test('should properly wire selector labels between deployment and service', () => {
    const webService = new WebService(stack, 'WiredWebService', {
      image: 'myapp:latest'
    });

    const deploymentManifest = webService.deployment.toManifest();
    const serviceManifest = webService.service.toManifest();

    const deploymentSelector = deploymentManifest.spec!.selector.matchLabels!;
    const templateLabels = deploymentManifest.spec!.template.metadata!.labels!;
    const serviceSelector = serviceManifest.spec!.selector!;

    // Deployment selector should match template labels
    for (const [key, value] of Object.entries(deploymentSelector)) {
      expect(templateLabels[key]).toBe(value);
    }

    // Service selector should match deployment selector
    for (const [key, value] of Object.entries(deploymentSelector)) {
      expect(serviceSelector[key]).toBe(value);
    }
  });
});