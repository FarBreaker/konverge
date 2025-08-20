import { Construct } from '../../core/construct';
import { Deployment } from '../deployment';
import { Service } from '../service';
import { ConfigMap } from '../configmap';
import { Container, ServicePort, LabelSelector } from '../../core/types';
import { DependencyTracker, DependencyType } from '../../core/dependency-tracker';

/**
 * Properties for the WebService construct.
 */
export interface WebServiceProps {
  /**
   * The container image to use for the web service.
   */
  image: string;

  /**
   * The port the container listens on. Defaults to 80.
   */
  containerPort?: number;

  /**
   * The port to expose the service on. Defaults to 80.
   */
  servicePort?: number;

  /**
   * Number of replicas for the deployment. Defaults to 1.
   */
  replicas?: number;

  /**
   * Environment variables for the container.
   */
  env?: { [key: string]: string };

  /**
   * Configuration data to mount as a ConfigMap.
   */
  config?: { [key: string]: string };

  /**
   * Service type. Defaults to 'ClusterIP'.
   */
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';

  /**
   * Additional labels to apply to all resources.
   */
  labels?: { [key: string]: string };

  /**
   * Resource requests and limits for the container.
   */
  resources?: {
    requests?: {
      cpu?: string;
      memory?: string;
    };
    limits?: {
      cpu?: string;
      memory?: string;
    };
  };

  /**
   * Health check configuration.
   */
  healthCheck?: {
    path?: string;
    port?: number;
    initialDelaySeconds?: number;
    periodSeconds?: number;
  };
}

/**
 * A WebService is a high-level construct that creates a complete web service
 * with a Deployment, Service, and optional ConfigMap.
 */
export class WebService extends Construct {
  /**
   * The deployment created by this construct.
   */
  public readonly deployment: Deployment;

  /**
   * The service created by this construct.
   */
  public readonly service: Service;

  /**
   * The config map created by this construct (if config is provided).
   */
  public readonly configMap?: ConfigMap;

  private readonly _labels: { [key: string]: string };

  /**
   * Creates a new WebService construct.
   * @param scope The parent construct
   * @param id The construct identifier
   * @param props WebService properties
   */
  constructor(scope: Construct, id: string, props: WebServiceProps) {
    super(scope, id);

    const containerPort = props.containerPort ?? 80;
    const servicePort = props.servicePort ?? 80;
    const replicas = props.replicas ?? 1;

    // Generate consistent labels for all resources
    this._labels = {
      'app.kubernetes.io/name': id,
      'app.kubernetes.io/component': 'web-service',
      ...props.labels || {}
    };

    // Create ConfigMap if config is provided
    if (props.config && Object.keys(props.config).length > 0) {
      this.configMap = new ConfigMap(this, 'config', {
        metadata: {
          labels: this._labels
        },
        data: props.config
      });
    }

    // Build container configuration
    const container: Container = {
      name: 'web',
      image: props.image,
      ports: [{
        containerPort,
        protocol: 'TCP'
      }],
      env: this.buildEnvironmentVariables(props.env),
      ...(props.resources && { resources: props.resources })
    };

    // Add health checks if configured
    if (props.healthCheck) {
      const healthCheckPort = props.healthCheck.port ?? containerPort;
      const healthCheckPath = props.healthCheck.path ?? '/health';
      
      container.livenessProbe = {
        httpGet: {
          path: healthCheckPath,
          port: healthCheckPort
        },
        initialDelaySeconds: props.healthCheck.initialDelaySeconds ?? 30,
        periodSeconds: props.healthCheck.periodSeconds ?? 10
      };

      container.readinessProbe = {
        httpGet: {
          path: healthCheckPath,
          port: healthCheckPort
        },
        initialDelaySeconds: 5,
        periodSeconds: 5
      };
    }

    // Create the deployment
    const selector: LabelSelector = {
      matchLabels: {
        'app.kubernetes.io/name': id,
        'app.kubernetes.io/component': 'web-service'
      }
    };

    this.deployment = new Deployment(this, 'deployment', {
      metadata: {
        labels: this._labels
      },
      replicas,
      selector,
      template: {
        metadata: {
          labels: {
            ...this._labels,
            ...selector.matchLabels
          }
        },
        spec: {
          containers: [container]
        }
      }
    });

    // Create the service
    const servicePorts: ServicePort[] = [{
      name: 'http',
      port: servicePort,
      targetPort: containerPort,
      protocol: 'TCP'
    }];

    this.service = new Service(this, 'service', {
      metadata: {
        labels: this._labels
      },
      selector: selector.matchLabels!,
      ports: servicePorts,
      type: props.serviceType ?? 'ClusterIP'
    });

    // Update environment variables to include ConfigMap references
    this.updateEnvironmentVariables();

    // Register dependencies
    this.registerDependencies();
  }

  /**
   * Registers dependencies for this WebService construct.
   */
  private registerDependencies(): void {
    const tracker = DependencyTracker.getInstance();

    // If we have a ConfigMap, the deployment depends on it
    if (this.configMap) {
      tracker.addDependency(
        this.deployment,
        this.configMap,
        DependencyType.CONFIGURATION,
        'Deployment depends on ConfigMap for environment variables'
      );
    }

    // Service depends on deployment (implicit dependency for selector matching)
    tracker.addDependency(
      this.service,
      this.deployment,
      DependencyType.RUNTIME_REFERENCE,
      'Service depends on Deployment for pod selection'
    );
  }

  /**
   * Gets the labels applied to all resources in this construct.
   */
  public get labels(): { [key: string]: string } {
    return { ...this._labels };
  }

  /**
   * Updates the number of replicas for the deployment.
   * @param replicas The new number of replicas
   */
  public setReplicas(replicas: number): void {
    this.deployment.setReplicas(replicas);
  }

  /**
   * Adds an environment variable to the container.
   * @param name The environment variable name
   * @param value The environment variable value
   */
  public addEnvironmentVariable(name: string, value: string): void {
    const container = this.deployment.containers[0];
    if (container.env) {
      container.env.push({ name, value });
    } else {
      container.env = [{ name, value }];
    }
  }

  /**
   * Adds configuration data to the ConfigMap.
   * Creates a ConfigMap if one doesn't exist.
   * @param key The configuration key
   * @param value The configuration value
   */
  public addConfig(key: string, value: string): void {
    if (!this.configMap) {
      // Create ConfigMap if it doesn't exist
      (this as any).configMap = new ConfigMap(this, 'config', {
        metadata: {
          labels: this._labels
        }
      });
    }
    
    this.configMap!.addData(key, value);
    
    // Update environment variables to include the new ConfigMap reference
    this.updateEnvironmentVariables();

    // Register the new dependency if this is the first config item
    if (Object.keys(this.configMap!.data).length === 1) {
      const tracker = DependencyTracker.getInstance();
      tracker.addDependency(
        this.deployment,
        this.configMap!,
        DependencyType.CONFIGURATION,
        'Deployment depends on ConfigMap for environment variables'
      );
    }
  }

  /**
   * Builds environment variables array from props and ConfigMap references.
   * @param envVars Environment variables from props
   */
  private buildEnvironmentVariables(envVars?: { [key: string]: string }): Array<{ name: string; value?: string; valueFrom?: any }> {
    const env: Array<{ name: string; value?: string; valueFrom?: any }> = [];

    // Add environment variables from props
    if (envVars) {
      for (const [name, value] of Object.entries(envVars)) {
        env.push({ name, value });
      }
    }

    return env;
  }

  /**
   * Updates environment variables to include ConfigMap references.
   * This is called after the ConfigMap is created.
   */
  private updateEnvironmentVariables(): void {
    if (!this.configMap) {
      return;
    }

    const container = this.deployment.containers[0];
    const configMapName = this.configMap.metadata.name!;
    
    // Add all ConfigMap keys as environment variables with CONFIG_ prefix
    for (const key of Object.keys(this.configMap.data)) {
      const envVarName = `CONFIG_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      
      if (container.env) {
        container.env.push({
          name: envVarName,
          valueFrom: {
            configMapKeyRef: {
              name: configMapName,
              key
            }
          }
        });
      }
    }
  }
}