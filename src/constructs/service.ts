import { Construct } from '../core/construct';
import { KubernetesResource, KubernetesResourceProps } from '../core/kubernetes-resource';
import {
  V1Service,
  ServiceSpec,
  ServicePort,
} from '../core/types';

/**
 * Properties for the Service construct.
 */
export interface ServiceProps extends KubernetesResourceProps {
  /**
   * Route service traffic to pods with label keys and values matching this selector.
   */
  selector: { [key: string]: string };

  /**
   * The list of ports that are exposed by this service.
   */
  ports?: ServicePort[];

  /**
   * Type determines how the Service is exposed.
   * Defaults to 'ClusterIP'.
   */
  type?: 'ExternalName' | 'ClusterIP' | 'NodePort' | 'LoadBalancer';

  /**
   * clusterIP is the IP address of the service.
   */
  clusterIP?: string;

  /**
   * externalIPs is a list of IP addresses for which nodes in the cluster will also accept traffic.
   */
  externalIPs?: string[];

  /**
   * Supports "ClientIP" and "None". Defaults to "None".
   */
  sessionAffinity?: 'ClientIP' | 'None';

  /**
   * loadBalancerIP when service.type is LoadBalancer.
   */
  loadBalancerIP?: string;

  /**
   * If specified and supported by the platform, this will restrict traffic through the cloud-provider load-balancer.
   */
  loadBalancerSourceRanges?: string[];

  /**
   * externalName is the external reference that kubedns or equivalent will return as a CNAME record for this service.
   */
  externalName?: string;

  /**
   * externalTrafficPolicy denotes if this Service desires to route external traffic to node-local or cluster-wide endpoints.
   */
  externalTrafficPolicy?: 'Cluster' | 'Local';

  /**
   * publishNotReadyAddresses indicates that any agent which deals with endpoints for this Service should disregard any indications of ready/not-ready.
   */
  publishNotReadyAddresses?: boolean;
}

/**
 * A Service is an abstract way to expose an application running on a set of Pods as a network service.
 */
export class Service extends KubernetesResource {
  public readonly apiVersion = 'v1';
  public readonly kind = 'Service';

  private readonly _spec: ServiceSpec;
  private readonly _ports: ServicePort[] = [];

  /**
   * Creates a new Service construct.
   * @param scope The parent construct
   * @param id The service identifier
   * @param props Service properties
   */
  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id, props);

    // Initialize ports from props if provided
    if (props.ports) {
      this._ports.push(...props.ports);
    }

    this._spec = {
      selector: props.selector,
      ports: this._ports,
      type: props.type ?? 'ClusterIP',
      ...(props.clusterIP !== undefined && { clusterIP: props.clusterIP }),
      ...(props.externalIPs !== undefined && { externalIPs: props.externalIPs }),
      ...(props.sessionAffinity !== undefined && { sessionAffinity: props.sessionAffinity }),
      ...(props.loadBalancerIP !== undefined && { loadBalancerIP: props.loadBalancerIP }),
      ...(props.loadBalancerSourceRanges !== undefined && { loadBalancerSourceRanges: props.loadBalancerSourceRanges }),
      ...(props.externalName !== undefined && { externalName: props.externalName }),
      ...(props.externalTrafficPolicy !== undefined && { externalTrafficPolicy: props.externalTrafficPolicy }),
      ...(props.publishNotReadyAddresses !== undefined && { publishNotReadyAddresses: props.publishNotReadyAddresses }),
    };
  }

  /**
   * Adds a port to the service.
   * @param port The port configuration to add
   */
  public addPort(port: ServicePort): void {
    // Check for duplicate port names if name is provided
    if (port.name) {
      const existing = this._ports.find(p => p.name === port.name);
      if (existing) {
        throw new Error(`Port with name '${port.name}' already exists in service '${this.node.id}'`);
      }
    }

    // Check for duplicate port numbers
    const existingPort = this._ports.find(p => p.port === port.port);
    if (existingPort) {
      throw new Error(`Port ${port.port} already exists in service '${this.node.id}'`);
    }

    this._ports.push(port);
    this._spec.ports = [...this._ports];
  }

  /**
   * Gets all ports in the service.
   */
  public get ports(): readonly ServicePort[] {
    return [...this._ports];
  }

  /**
   * Gets the service specification.
   */
  public get spec(): ServiceSpec {
    return { ...this._spec };
  }

  /**
   * Sets the service type.
   * @param type The service type
   */
  public setType(type: 'ExternalName' | 'ClusterIP' | 'NodePort' | 'LoadBalancer'): void {
    this._spec.type = type;
  }

  /**
   * Updates the selector for the service.
   * @param selector The new selector
   */
  public setSelector(selector: { [key: string]: string }): void {
    this._spec.selector = { ...selector };
  }

  /**
   * Sets the cluster IP for the service.
   * @param clusterIP The cluster IP address
   */
  public setClusterIP(clusterIP: string): void {
    this._spec.clusterIP = clusterIP;
  }

  /**
   * Sets the external name for ExternalName type services.
   * @param externalName The external name
   */
  public setExternalName(externalName: string): void {
    this._spec.externalName = externalName;
  }

  /**
   * Validates the service configuration.
   */
  public validate(): string[] {
    const errors = super.validate();

    // Validate selector exists for non-ExternalName services
    if (this._spec.type !== 'ExternalName' && (!this._spec.selector || Object.keys(this._spec.selector).length === 0)) {
      errors.push('Service must have a selector (except for ExternalName type)');
    }

    // Validate ExternalName services have externalName
    if (this._spec.type === 'ExternalName' && !this._spec.externalName) {
      errors.push('ExternalName service must have externalName specified');
    }

    // Validate ports exist for non-ExternalName services
    if (this._spec.type !== 'ExternalName' && (!this._ports || this._ports.length === 0)) {
      errors.push('Service must have at least one port (except for ExternalName type)');
    }

    // Validate port configurations
    for (const port of this._ports) {
      if (!port.port || port.port < 1 || port.port > 65535) {
        errors.push(`Invalid port number: ${port.port}. Must be between 1 and 65535`);
      }

      if (port.nodePort && (port.nodePort < 30000 || port.nodePort > 32767)) {
        errors.push(`Invalid nodePort: ${port.nodePort}. Must be between 30000 and 32767`);
      }

      if (port.protocol && !['TCP', 'UDP', 'SCTP'].includes(port.protocol)) {
        errors.push(`Invalid protocol: ${port.protocol}. Must be TCP, UDP, or SCTP`);
      }
    }

    // Validate NodePort and LoadBalancer specific configurations
    if (this._spec.type === 'NodePort' || this._spec.type === 'LoadBalancer') {
      const hasNodePorts = this._ports.some(p => p.nodePort);
      if (!hasNodePorts && this._spec.type === 'NodePort') {
        // NodePort services can auto-assign ports, so this is just a warning in validation
      }
    }

    // Validate LoadBalancer specific configurations
    if (this._spec.type === 'LoadBalancer') {
      if (this._spec.loadBalancerIP && !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(this._spec.loadBalancerIP)) {
        errors.push(`Invalid loadBalancerIP format: ${this._spec.loadBalancerIP}`);
      }
    }

    return errors;
  }

  /**
   * Converts the service to a Kubernetes manifest.
   */
  public toManifest(): V1Service {
    const baseManifest = this.createBaseManifest();
    
    return {
      ...baseManifest,
      apiVersion: this.apiVersion,
      kind: this.kind,
      spec: { ...this._spec },
    } as V1Service;
  }
}