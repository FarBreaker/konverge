/**
 * Tests for Kubernetes type definitions.
 */

import {
  ObjectMeta,
  Container,
  ContainerPort,
  EnvVar,
  ResourceRequirements,
  ServicePort,
  PodTemplateSpec,
  PodSpec,
  DeploymentSpec,
  ServiceSpec,
  V1Deployment,
  V1Service,
  V1ConfigMap,
  LabelSelector,
  Volume,
  VolumeMount,
} from '../../src/core/types';

describe('Kubernetes Type Definitions', () => {
  describe('ObjectMeta', () => {
    it('should allow valid ObjectMeta with all optional fields', () => {
      const metadata: ObjectMeta = {
        name: 'test-resource',
        namespace: 'default',
        labels: { app: 'test', version: '1.0' },
        annotations: { 'example.com/annotation': 'value' },
        resourceVersion: '12345',
        generation: 1,
        creationTimestamp: '2023-01-01T00:00:00Z',
        uid: 'abc-123-def',
      };

      expect(metadata.name).toBe('test-resource');
      expect(metadata.namespace).toBe('default');
      expect(metadata.labels?.app).toBe('test');
      expect(metadata.annotations?.['example.com/annotation']).toBe('value');
    });

    it('should allow empty ObjectMeta', () => {
      const metadata: ObjectMeta = {};
      expect(metadata).toBeDefined();
    });

    it('should allow ObjectMeta with only name', () => {
      const metadata: ObjectMeta = {
        name: 'minimal-resource',
      };
      expect(metadata.name).toBe('minimal-resource');
    });
  });

  describe('Container', () => {
    it('should create valid container with required fields', () => {
      const container: Container = {
        name: 'app-container',
        image: 'nginx:1.20',
      };

      expect(container.name).toBe('app-container');
      expect(container.image).toBe('nginx:1.20');
    });

    it('should create container with all optional fields', () => {
      const ports: ContainerPort[] = [
        { containerPort: 80, protocol: 'TCP', name: 'http' },
        { containerPort: 443, protocol: 'TCP', name: 'https' },
      ];

      const env: EnvVar[] = [
        { name: 'NODE_ENV', value: 'production' },
        { name: 'PORT', value: '3000' },
      ];

      const resources: ResourceRequirements = {
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      };

      const volumeMounts: VolumeMount[] = [
        { name: 'config-volume', mountPath: '/etc/config' },
      ];

      const container: Container = {
        name: 'full-container',
        image: 'myapp:latest',
        command: ['/bin/sh'],
        args: ['-c', 'echo hello'],
        workingDir: '/app',
        ports,
        env,
        resources,
        volumeMounts,
        imagePullPolicy: 'Always',
      };

      expect(container.name).toBe('full-container');
      expect(container.ports).toHaveLength(2);
      expect(container.env).toHaveLength(2);
      expect(container.resources?.requests?.cpu).toBe('100m');
      expect(container.volumeMounts).toHaveLength(1);
    });
  });

  describe('PodSpec', () => {
    it('should create valid PodSpec with required containers', () => {
      const containers: Container[] = [
        { name: 'app', image: 'nginx:latest' },
      ];

      const podSpec: PodSpec = {
        containers,
      };

      expect(podSpec.containers).toHaveLength(1);
      expect(podSpec.containers[0].name).toBe('app');
    });

    it('should create PodSpec with optional fields', () => {
      const containers: Container[] = [
        { name: 'app', image: 'nginx:latest' },
      ];

      const volumes: Volume[] = [
        {
          name: 'config-volume',
          configMap: { name: 'app-config' },
        },
      ];

      const podSpec: PodSpec = {
        containers,
        restartPolicy: 'Always',
        terminationGracePeriodSeconds: 30,
        dnsPolicy: 'ClusterFirst',
        nodeSelector: { 'kubernetes.io/os': 'linux' },
        serviceAccountName: 'app-service-account',
        volumes,
      };

      expect(podSpec.restartPolicy).toBe('Always');
      expect(podSpec.volumes).toHaveLength(1);
      expect(podSpec.nodeSelector?.['kubernetes.io/os']).toBe('linux');
    });
  });

  describe('DeploymentSpec', () => {
    it('should create valid DeploymentSpec', () => {
      const selector: LabelSelector = {
        matchLabels: { app: 'test-app' },
      };

      const template: PodTemplateSpec = {
        metadata: { labels: { app: 'test-app' } },
        spec: {
          containers: [{ name: 'app', image: 'nginx:latest' }],
        },
      };

      const deploymentSpec: DeploymentSpec = {
        replicas: 3,
        selector,
        template,
      };

      expect(deploymentSpec.replicas).toBe(3);
      expect(deploymentSpec.selector.matchLabels?.app).toBe('test-app');
      expect(deploymentSpec.template.spec?.containers).toHaveLength(1);
    });

    it('should create DeploymentSpec with strategy', () => {
      const selector: LabelSelector = {
        matchLabels: { app: 'test-app' },
      };

      const template: PodTemplateSpec = {
        metadata: { labels: { app: 'test-app' } },
        spec: {
          containers: [{ name: 'app', image: 'nginx:latest' }],
        },
      };

      const deploymentSpec: DeploymentSpec = {
        replicas: 5,
        selector,
        template,
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxUnavailable: 1,
            maxSurge: 1,
          },
        },
        minReadySeconds: 10,
        revisionHistoryLimit: 5,
      };

      expect(deploymentSpec.strategy?.type).toBe('RollingUpdate');
      expect(deploymentSpec.strategy?.rollingUpdate?.maxUnavailable).toBe(1);
      expect(deploymentSpec.minReadySeconds).toBe(10);
    });
  });

  describe('ServiceSpec', () => {
    it('should create valid ServiceSpec', () => {
      const ports: ServicePort[] = [
        { port: 80, targetPort: 8080, protocol: 'TCP', name: 'http' },
      ];

      const serviceSpec: ServiceSpec = {
        ports,
        selector: { app: 'test-app' },
        type: 'ClusterIP',
      };

      expect(serviceSpec.ports).toHaveLength(1);
      expect(serviceSpec.ports?.[0].port).toBe(80);
      expect(serviceSpec.selector?.app).toBe('test-app');
      expect(serviceSpec.type).toBe('ClusterIP');
    });

    it('should create ServiceSpec with LoadBalancer type', () => {
      const ports: ServicePort[] = [
        { port: 443, targetPort: 8443, protocol: 'TCP' },
      ];

      const serviceSpec: ServiceSpec = {
        ports,
        selector: { app: 'web-app' },
        type: 'LoadBalancer',
        loadBalancerIP: '192.168.1.100',
        externalTrafficPolicy: 'Local',
        sessionAffinity: 'ClientIP',
        sessionAffinityConfig: {
          clientIP: { timeoutSeconds: 10800 },
        },
      };

      expect(serviceSpec.type).toBe('LoadBalancer');
      expect(serviceSpec.loadBalancerIP).toBe('192.168.1.100');
      expect(serviceSpec.externalTrafficPolicy).toBe('Local');
      expect(serviceSpec.sessionAffinityConfig?.clientIP?.timeoutSeconds).toBe(10800);
    });
  });

  describe('Complete Manifest Types', () => {
    it('should create valid V1Deployment', () => {
      const deployment: V1Deployment = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          name: 'test-deployment',
          namespace: 'default',
        },
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'test' } },
          template: {
            metadata: { labels: { app: 'test' } },
            spec: {
              containers: [{ name: 'app', image: 'nginx:latest' }],
            },
          },
        },
      };

      expect(deployment.apiVersion).toBe('apps/v1');
      expect(deployment.kind).toBe('Deployment');
      expect(deployment.metadata.name).toBe('test-deployment');
      expect(deployment.spec?.replicas).toBe(2);
    });

    it('should create valid V1Service', () => {
      const service: V1Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'test-service',
        },
        spec: {
          ports: [{ port: 80, targetPort: 8080 }],
          selector: { app: 'test' },
          type: 'ClusterIP',
        },
      };

      expect(service.apiVersion).toBe('v1');
      expect(service.kind).toBe('Service');
      expect(service.spec?.ports?.[0].port).toBe(80);
    });

    it('should create valid V1ConfigMap', () => {
      const configMap: V1ConfigMap = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'test-config',
        },
        data: {
          'config.yaml': 'key: value',
          'app.properties': 'debug=true',
        },
        immutable: false,
      };

      expect(configMap.apiVersion).toBe('v1');
      expect(configMap.kind).toBe('ConfigMap');
      expect(configMap.data?.['config.yaml']).toBe('key: value');
      expect(configMap.immutable).toBe(false);
    });

    it('should create ConfigMap with binary data', () => {
      const configMap: V1ConfigMap = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name: 'binary-config',
        },
        binaryData: {
          'binary-file': 'SGVsbG8gV29ybGQ=', // base64 encoded "Hello World"
        },
        immutable: true,
      };

      expect(configMap.binaryData?.['binary-file']).toBe('SGVsbG8gV29ybGQ=');
      expect(configMap.immutable).toBe(true);
    });
  });

  describe('Type Validation Edge Cases', () => {
    it('should handle empty arrays and undefined values', () => {
      const container: Container = {
        name: 'test',
        image: 'test:latest',
        ports: [],
      };

      expect(container.ports).toEqual([]);
      expect(container.env).toBeUndefined();
    });

    it('should validate protocol enums', () => {
      const port: ContainerPort = {
        containerPort: 8080,
        protocol: 'TCP',
      };

      expect(port.protocol).toBe('TCP');

      // TypeScript should enforce valid protocol values
      const validProtocols: Array<'TCP' | 'UDP' | 'SCTP'> = ['TCP', 'UDP', 'SCTP'];
      expect(validProtocols).toContain(port.protocol);
    });

    it('should validate service types', () => {
      const validServiceTypes: Array<'ExternalName' | 'ClusterIP' | 'NodePort' | 'LoadBalancer'> = [
        'ExternalName',
        'ClusterIP', 
        'NodePort',
        'LoadBalancer',
      ];

      validServiceTypes.forEach(type => {
        const serviceSpec: ServiceSpec = {
          type,
          selector: { app: 'test' },
        };
        expect(serviceSpec.type).toBe(type);
      });
    });

    it('should validate restart policies', () => {
      const validPolicies: Array<'Always' | 'OnFailure' | 'Never'> = [
        'Always',
        'OnFailure',
        'Never',
      ];

      validPolicies.forEach(policy => {
        const podSpec: PodSpec = {
          containers: [{ name: 'test', image: 'test:latest' }],
          restartPolicy: policy,
        };
        expect(podSpec.restartPolicy).toBe(policy);
      });
    });
  });
});