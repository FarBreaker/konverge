import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { Service } from '../../src/constructs/service';
import { ServicePort } from '../../src/core/types';

describe('Service', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  describe('constructor', () => {
    it('should create a service with basic properties', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        ports: [{
          port: 80,
          targetPort: 8080,
        }],
      });

      expect(service.apiVersion).toBe('v1');
      expect(service.kind).toBe('Service');
      expect(service.spec.selector).toEqual({ app: 'test' });
      expect(service.spec.type).toBe('ClusterIP'); // default
      expect(service.ports).toHaveLength(1);
      expect(service.ports[0].port).toBe(80);
    });

    it('should create a service with custom type', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        type: 'LoadBalancer',
        ports: [{ port: 80 }],
      });

      expect(service.spec.type).toBe('LoadBalancer');
    });

    it('should create a service without ports initially', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
      });

      expect(service.ports).toHaveLength(0);
    });
  });

  describe('addPort', () => {
    let service: Service;

    beforeEach(() => {
      service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
      });
    });

    it('should add a port to the service', () => {
      const port: ServicePort = {
        name: 'http',
        port: 80,
        targetPort: 8080,
        protocol: 'TCP',
      };

      service.addPort(port);

      expect(service.ports).toHaveLength(1);
      expect(service.ports[0]).toEqual(port);
      expect(service.spec.ports).toHaveLength(1);
    });

    it('should add multiple ports', () => {
      const httpPort: ServicePort = {
        name: 'http',
        port: 80,
        targetPort: 8080,
      };

      const httpsPort: ServicePort = {
        name: 'https',
        port: 443,
        targetPort: 8443,
      };

      service.addPort(httpPort);
      service.addPort(httpsPort);

      expect(service.ports).toHaveLength(2);
      expect(service.ports[0].name).toBe('http');
      expect(service.ports[1].name).toBe('https');
    });

    it('should throw error for duplicate port names', () => {
      const port1: ServicePort = {
        name: 'http',
        port: 80,
      };

      const port2: ServicePort = {
        name: 'http',
        port: 8080,
      };

      service.addPort(port1);

      expect(() => {
        service.addPort(port2);
      }).toThrow("Port with name 'http' already exists in service 'MyService'");
    });

    it('should throw error for duplicate port numbers', () => {
      const port1: ServicePort = {
        port: 80,
      };

      const port2: ServicePort = {
        port: 80,
      };

      service.addPort(port1);

      expect(() => {
        service.addPort(port2);
      }).toThrow("Port 80 already exists in service 'MyService'");
    });

    it('should allow ports without names', () => {
      const port1: ServicePort = {
        port: 80,
      };

      const port2: ServicePort = {
        port: 443,
      };

      service.addPort(port1);
      service.addPort(port2);

      expect(service.ports).toHaveLength(2);
    });
  });

  describe('setType', () => {
    let service: Service;

    beforeEach(() => {
      service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        ports: [{ port: 80 }],
      });
    });

    it('should update the service type', () => {
      service.setType('NodePort');
      expect(service.spec.type).toBe('NodePort');
    });

    it('should update to LoadBalancer type', () => {
      service.setType('LoadBalancer');
      expect(service.spec.type).toBe('LoadBalancer');
    });
  });

  describe('setSelector', () => {
    let service: Service;

    beforeEach(() => {
      service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        ports: [{ port: 80 }],
      });
    });

    it('should update the selector', () => {
      service.setSelector({ app: 'new-app', version: 'v1' });
      expect(service.spec.selector).toEqual({ app: 'new-app', version: 'v1' });
    });
  });

  describe('setClusterIP', () => {
    let service: Service;

    beforeEach(() => {
      service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        ports: [{ port: 80 }],
      });
    });

    it('should set the cluster IP', () => {
      service.setClusterIP('10.0.0.1');
      expect(service.spec.clusterIP).toBe('10.0.0.1');
    });
  });

  describe('setExternalName', () => {
    let service: Service;

    beforeEach(() => {
      service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        type: 'ExternalName',
      });
    });

    it('should set the external name', () => {
      service.setExternalName('example.com');
      expect(service.spec.externalName).toBe('example.com');
    });
  });

  describe('validate', () => {
    it('should return no errors for valid ClusterIP service', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        ports: [{ port: 80, targetPort: 8080 }],
      });

      const errors = service.validate();
      expect(errors).toHaveLength(0);
    });

    it('should return error for service without selector (non-ExternalName)', () => {
      const service = new Service(stack, 'MyService', {
        selector: {},
        ports: [{ port: 80 }],
      });

      const errors = service.validate();
      expect(errors).toContain('Service must have a selector (except for ExternalName type)');
    });

    it('should return error for service without ports (non-ExternalName)', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
      });

      const errors = service.validate();
      expect(errors).toContain('Service must have at least one port (except for ExternalName type)');
    });

    it('should return error for ExternalName service without externalName', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        type: 'ExternalName',
      });

      const errors = service.validate();
      expect(errors).toContain('ExternalName service must have externalName specified');
    });

    it('should allow ExternalName service without selector and ports', () => {
      const service = new Service(stack, 'MyService', {
        selector: {},
        type: 'ExternalName',
        externalName: 'example.com',
      });

      const errors = service.validate();
      expect(errors).toHaveLength(0);
    });

    it('should return error for invalid port number', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        ports: [{ port: 0 }],
      });

      const errors = service.validate();
      expect(errors).toContain('Invalid port number: 0. Must be between 1 and 65535');
    });

    it('should return error for invalid nodePort', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        type: 'NodePort',
        ports: [{ port: 80, nodePort: 29999 }],
      });

      const errors = service.validate();
      expect(errors).toContain('Invalid nodePort: 29999. Must be between 30000 and 32767');
    });

    it('should return error for invalid protocol', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        ports: [{ port: 80, protocol: 'HTTP' as any }],
      });

      const errors = service.validate();
      expect(errors).toContain('Invalid protocol: HTTP. Must be TCP, UDP, or SCTP');
    });

    it('should return error for invalid loadBalancerIP format', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        type: 'LoadBalancer',
        ports: [{ port: 80 }],
        loadBalancerIP: 'invalid-ip',
      });

      const errors = service.validate();
      expect(errors).toContain('Invalid loadBalancerIP format: invalid-ip');
    });
  });

  describe('toManifest', () => {
    it('should generate valid Kubernetes service manifest', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        type: 'ClusterIP',
        ports: [{
          name: 'http',
          port: 80,
          targetPort: 8080,
          protocol: 'TCP',
        }],
      });

      const manifest = service.toManifest();

      expect(manifest.apiVersion).toBe('v1');
      expect(manifest.kind).toBe('Service');
      expect(manifest.metadata.name).toBeDefined();
      expect(manifest.spec?.selector).toEqual({ app: 'test' });
      expect(manifest.spec?.type).toBe('ClusterIP');
      expect(manifest.spec?.ports).toHaveLength(1);
      expect(manifest.spec?.ports![0].name).toBe('http');
      expect(manifest.spec?.ports![0].port).toBe(80);
    });

    it('should generate NodePort service manifest', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        type: 'NodePort',
        ports: [{
          port: 80,
          targetPort: 8080,
          nodePort: 30080,
        }],
      });

      const manifest = service.toManifest();

      expect(manifest.spec?.type).toBe('NodePort');
      expect(manifest.spec?.ports![0].nodePort).toBe(30080);
    });

    it('should generate LoadBalancer service manifest', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        type: 'LoadBalancer',
        ports: [{ port: 80 }],
        loadBalancerIP: '10.0.0.1',
      });

      const manifest = service.toManifest();

      expect(manifest.spec?.type).toBe('LoadBalancer');
      expect(manifest.spec?.loadBalancerIP).toBe('10.0.0.1');
    });

    it('should generate ExternalName service manifest', () => {
      const service = new Service(stack, 'MyService', {
        selector: {},
        type: 'ExternalName',
        externalName: 'example.com',
      });

      const manifest = service.toManifest();

      expect(manifest.spec?.type).toBe('ExternalName');
      expect(manifest.spec?.externalName).toBe('example.com');
    });

    it('should include auto-generated metadata', () => {
      const service = new Service(stack, 'MyService', {
        selector: { app: 'test' },
        ports: [{ port: 80 }],
      });

      const manifest = service.toManifest();

      expect(manifest.metadata.labels).toBeDefined();
      expect(manifest.metadata.labels!['app.kubernetes.io/managed-by']).toBe('konverge');
      expect(manifest.metadata.labels!['app.kubernetes.io/name']).toBe('MyService');
      expect(manifest.metadata.annotations).toBeDefined();
      expect(manifest.metadata.annotations!['konverge.io/construct-path']).toBeDefined();
    });
  });
});