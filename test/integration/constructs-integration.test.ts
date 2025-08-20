import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { Deployment, Service, ConfigMap } from '../../src/constructs';

describe('Constructs Integration', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  it('should create a complete application with deployment, service, and configmap', () => {
    // Create a ConfigMap for application configuration
    const configMap = new ConfigMap(stack, 'AppConfig', {
      data: {
        'app.properties': 'debug=true\nport=8080',
        'database.yaml': 'host: localhost\nport: 5432\nname: myapp',
      },
    });

    // Create a Deployment that uses the ConfigMap
    const deployment = new Deployment(stack, 'WebApp', {
      replicas: 3,
      selector: {
        matchLabels: { app: 'webapp', version: 'v1' },
      },
      template: {
        metadata: {
          labels: { app: 'webapp', version: 'v1' },
        },
        spec: {
          containers: [{
            name: 'web',
            image: 'nginx:1.21',
            ports: [{ containerPort: 8080 }],
            env: [{
              name: 'CONFIG_PATH',
              value: '/etc/config',
            }],
          }],
        },
      },
    });

    // Create a Service to expose the Deployment
    const service = new Service(stack, 'WebAppService', {
      selector: { app: 'webapp' },
      type: 'LoadBalancer',
      ports: [{
        name: 'http',
        port: 80,
        targetPort: 8080,
        protocol: 'TCP',
      }],
    });

    // Verify all constructs are created correctly
    expect(configMap.data['app.properties']).toBe('debug=true\nport=8080');
    expect(deployment.spec.replicas).toBe(3);
    expect(deployment.containers).toHaveLength(1);
    expect(service.spec.type).toBe('LoadBalancer');
    expect(service.ports).toHaveLength(1);

    // Verify manifests can be generated
    const configMapManifest = configMap.toManifest();
    const deploymentManifest = deployment.toManifest();
    const serviceManifest = service.toManifest();

    expect(configMapManifest.kind).toBe('ConfigMap');
    expect(deploymentManifest.kind).toBe('Deployment');
    expect(serviceManifest.kind).toBe('Service');

    // Verify all have proper metadata
    expect(configMapManifest.metadata.name).toBeDefined();
    expect(deploymentManifest.metadata.name).toBeDefined();
    expect(serviceManifest.metadata.name).toBeDefined();

    // Verify they all belong to the same stack (should have consistent labeling)
    expect(configMapManifest.metadata.labels!['app.kubernetes.io/managed-by']).toBe('konverge');
    expect(deploymentManifest.metadata.labels!['app.kubernetes.io/managed-by']).toBe('konverge');
    expect(serviceManifest.metadata.labels!['app.kubernetes.io/managed-by']).toBe('konverge');
  });

  it('should allow dynamic configuration of constructs', () => {
    const deployment = new Deployment(stack, 'DynamicApp', {
      selector: {
        matchLabels: { app: 'dynamic' },
      },
      template: {
        metadata: {
          labels: { app: 'dynamic' },
        },
        spec: {
          containers: [],
        },
      },
    });

    const service = new Service(stack, 'DynamicService', {
      selector: { app: 'dynamic' },
    });

    const configMap = new ConfigMap(stack, 'DynamicConfig');

    // Dynamically add containers
    deployment.addContainer({
      name: 'app',
      image: 'myapp:latest',
      ports: [{ containerPort: 3000 }],
    });

    deployment.addContainer({
      name: 'sidecar',
      image: 'logging-sidecar:latest',
    });

    // Dynamically add service ports
    service.addPort({
      name: 'http',
      port: 80,
      targetPort: 3000,
    });

    service.addPort({
      name: 'metrics',
      port: 9090,
      targetPort: 9090,
    });

    // Dynamically add config data
    configMap.addData('app.json', '{"env": "production"}');
    configMap.addFile('nginx.conf', 'server { listen 80; }');

    // Verify dynamic additions
    expect(deployment.containers).toHaveLength(2);
    expect(service.ports).toHaveLength(2);
    expect(Object.keys(configMap.data)).toHaveLength(2);

    // Verify manifests reflect dynamic changes
    const deploymentManifest = deployment.toManifest();
    const serviceManifest = service.toManifest();
    const configMapManifest = configMap.toManifest();

    expect(deploymentManifest.spec?.template.spec?.containers).toHaveLength(2);
    expect(serviceManifest.spec?.ports).toHaveLength(2);
    expect(Object.keys(configMapManifest.data || {})).toHaveLength(2);
  });

  it('should validate construct relationships and dependencies', () => {
    // Create constructs with matching selectors
    const deployment = new Deployment(stack, 'MatchedApp', {
      selector: {
        matchLabels: { app: 'matched', tier: 'frontend' },
      },
      template: {
        metadata: {
          labels: { app: 'matched', tier: 'frontend' },
        },
        spec: {
          containers: [{
            name: 'web',
            image: 'nginx:latest',
            ports: [{ containerPort: 80 }],
          }],
        },
      },
    });

    const service = new Service(stack, 'MatchedService', {
      selector: { app: 'matched' }, // Matches deployment labels
      ports: [{
        port: 80,
        targetPort: 80,
      }],
    });

    // Verify the service selector matches deployment template labels
    const deploymentLabels = deployment.spec.template.metadata?.labels || {};
    const serviceSelector = service.spec.selector || {};

    for (const [key, value] of Object.entries(serviceSelector)) {
      expect(deploymentLabels[key]).toBe(value);
    }

    // Verify port compatibility
    const deploymentPorts = deployment.containers[0].ports || [];
    const servicePorts = service.ports;

    expect(deploymentPorts.some(dp => 
      servicePorts.some(sp => sp.targetPort === dp.containerPort)
    )).toBe(true);
  });
});