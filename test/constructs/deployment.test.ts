import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { Deployment } from '../../src/constructs/deployment';
import { Container, LabelSelector, PodTemplateSpec } from '../../src/core/types';

describe('Deployment', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  describe('constructor', () => {
    it('should create a deployment with basic properties', () => {
      const selector: LabelSelector = {
        matchLabels: { app: 'test' },
      };

      const template: PodTemplateSpec = {
        metadata: {
          labels: { app: 'test' },
        },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
          }],
        },
      };

      const deployment = new Deployment(stack, 'MyDeployment', {
        selector,
        template,
      });

      expect(deployment.apiVersion).toBe('apps/v1');
      expect(deployment.kind).toBe('Deployment');
      expect(deployment.spec.replicas).toBe(1); // default
      expect(deployment.spec.selector).toEqual(selector);
      expect(deployment.containers).toHaveLength(1);
      expect(deployment.containers[0].name).toBe('app');
    });

    it('should create a deployment with custom replicas', () => {
      const deployment = new Deployment(stack, 'MyDeployment', {
        replicas: 3,
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [{ name: 'app', image: 'nginx:latest' }] },
        },
      });

      expect(deployment.spec.replicas).toBe(3);
    });

    it('should throw error if selector does not match template labels', () => {
      expect(() => {
        new Deployment(stack, 'MyDeployment', {
          selector: { matchLabels: { app: 'test' } },
          template: {
            metadata: { labels: { app: 'different' } },
            spec: { containers: [{ name: 'app', image: 'nginx:latest' }] },
          },
        });
      }).toThrow("Selector label 'app=test' does not match template label 'app=different'");
    });
  });

  describe('addContainer', () => {
    let deployment: Deployment;

    beforeEach(() => {
      deployment = new Deployment(stack, 'MyDeployment', {
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [] },
        },
      });
    });

    it('should add a container to the deployment', () => {
      const container: Container = {
        name: 'web',
        image: 'nginx:latest',
        ports: [{ containerPort: 80 }],
      };

      deployment.addContainer(container);

      expect(deployment.containers).toHaveLength(1);
      expect(deployment.containers[0]).toEqual(container);
      expect(deployment.spec.template.spec?.containers).toHaveLength(1);
    });

    it('should add multiple containers', () => {
      const webContainer: Container = {
        name: 'web',
        image: 'nginx:latest',
      };

      const sidecarContainer: Container = {
        name: 'sidecar',
        image: 'busybox:latest',
      };

      deployment.addContainer(webContainer);
      deployment.addContainer(sidecarContainer);

      expect(deployment.containers).toHaveLength(2);
      expect(deployment.containers[0].name).toBe('web');
      expect(deployment.containers[1].name).toBe('sidecar');
    });

    it('should throw error for duplicate container names', () => {
      const container1: Container = {
        name: 'app',
        image: 'nginx:latest',
      };

      const container2: Container = {
        name: 'app',
        image: 'apache:latest',
      };

      deployment.addContainer(container1);

      expect(() => {
        deployment.addContainer(container2);
      }).toThrow("Container with name 'app' already exists in deployment 'MyDeployment'");
    });
  });

  describe('setReplicas', () => {
    let deployment: Deployment;

    beforeEach(() => {
      deployment = new Deployment(stack, 'MyDeployment', {
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [{ name: 'app', image: 'nginx:latest' }] },
        },
      });
    });

    it('should update the number of replicas', () => {
      deployment.setReplicas(5);
      expect(deployment.spec.replicas).toBe(5);
    });

    it('should allow zero replicas', () => {
      deployment.setReplicas(0);
      expect(deployment.spec.replicas).toBe(0);
    });

    it('should throw error for negative replicas', () => {
      expect(() => {
        deployment.setReplicas(-1);
      }).toThrow('Replicas must be a non-negative number');
    });
  });

  describe('updateTemplateMetadata', () => {
    let deployment: Deployment;

    beforeEach(() => {
      deployment = new Deployment(stack, 'MyDeployment', {
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [{ name: 'app', image: 'nginx:latest' }] },
        },
      });
    });

    it('should update template metadata', () => {
      deployment.updateTemplateMetadata({
        annotations: { 'example.com/annotation': 'value' },
      });

      expect(deployment.spec.template.metadata?.annotations).toEqual({
        'example.com/annotation': 'value',
      });
    });

    it('should merge with existing metadata', () => {
      deployment.updateTemplateMetadata({
        labels: { version: 'v1.0' },
      });

      expect(deployment.spec.template.metadata?.labels).toEqual({
        app: 'test',
        version: 'v1.0',
      });
    });
  });

  describe('validate', () => {
    it('should return no errors for valid deployment', () => {
      const deployment = new Deployment(stack, 'MyDeployment', {
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [{ name: 'app', image: 'nginx:latest' }] },
        },
      });

      const errors = deployment.validate();
      expect(errors).toHaveLength(0);
    });

    it('should return error for deployment without containers', () => {
      const deployment = new Deployment(stack, 'MyDeployment', {
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [] },
        },
      });

      const errors = deployment.validate();
      expect(errors).toContain('Deployment must have at least one container');
    });

    it('should return error for container without image', () => {
      const deployment = new Deployment(stack, 'MyDeployment', {
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [{ name: 'app', image: '' }] },
        },
      });

      const errors = deployment.validate();
      expect(errors).toContain("Container 'app' must have an image");
    });

    it('should return error for selector without match criteria', () => {
      const deployment = new Deployment(stack, 'MyDeployment', {
        selector: {},
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [{ name: 'app', image: 'nginx:latest' }] },
        },
      });

      const errors = deployment.validate();
      expect(errors).toContain('Selector must have either matchLabels or matchExpressions');
    });
  });

  describe('toManifest', () => {
    it('should generate valid Kubernetes deployment manifest', () => {
      const deployment = new Deployment(stack, 'MyDeployment', {
        replicas: 3,
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: {
            containers: [{
              name: 'web',
              image: 'nginx:latest',
              ports: [{ containerPort: 80 }],
            }],
          },
        },
      });

      const manifest = deployment.toManifest();

      expect(manifest.apiVersion).toBe('apps/v1');
      expect(manifest.kind).toBe('Deployment');
      expect(manifest.metadata.name).toBeDefined();
      expect(manifest.spec?.replicas).toBe(3);
      expect(manifest.spec?.selector).toEqual({ matchLabels: { app: 'test' } });
      expect(manifest.spec?.template.spec?.containers).toHaveLength(1);
      expect(manifest.spec?.template.spec?.containers[0].name).toBe('web');
      expect(manifest.spec?.template.spec?.containers[0].image).toBe('nginx:latest');
    });

    it('should include auto-generated metadata', () => {
      const deployment = new Deployment(stack, 'MyDeployment', {
        selector: { matchLabels: { app: 'test' } },
        template: {
          metadata: { labels: { app: 'test' } },
          spec: { containers: [{ name: 'app', image: 'nginx:latest' }] },
        },
      });

      const manifest = deployment.toManifest();

      expect(manifest.metadata.labels).toBeDefined();
      expect(manifest.metadata.labels!['app.kubernetes.io/managed-by']).toBe('konverge');
      expect(manifest.metadata.labels!['app.kubernetes.io/name']).toBe('MyDeployment');
      expect(manifest.metadata.annotations).toBeDefined();
      expect(manifest.metadata.annotations!['konverge.io/construct-path']).toBeDefined();
    });
  });
});