import { Construct } from '../../core/construct';
import { Deployment } from '../deployment';
import { Service } from '../service';
import { ConfigMap } from '../configmap';
import { Container, ServicePort, LabelSelector, EnvVar } from '../../core/types';
import { DependencyTracker, DependencyType } from '../../core/dependency-tracker';

/**
 * Properties for the Database construct.
 */
export interface DatabaseProps {
  /**
   * The database engine to use (e.g., 'postgres:13', 'mysql:8.0').
   */
  image: string;

  /**
   * The port the database listens on.
   */
  port: number;

  /**
   * Database configuration.
   */
  database: {
    /**
     * The name of the database to create.
     */
    name: string;

    /**
     * The username for database access.
     */
    username: string;

    /**
     * The password for database access.
     */
    password: string;
  };

  /**
   * Storage configuration.
   */
  storage?: {
    /**
     * Storage size (e.g., '10Gi').
     */
    size?: string;

    /**
     * Storage class name.
     */
    storageClass?: string;
  };

  /**
   * Resource requests and limits.
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
   * Additional environment variables.
   */
  env?: { [key: string]: string };

  /**
   * Additional labels to apply to all resources.
   */
  labels?: { [key: string]: string };

  /**
   * Database-specific configuration parameters.
   */
  config?: { [key: string]: string };
}

/**
 * A Database construct that creates a complete database deployment
 * with proper configuration, service, and optional persistent storage.
 */
export class Database extends Construct {
  /**
   * The deployment created by this construct.
   */
  public readonly deployment: Deployment;

  /**
   * The service created by this construct.
   */
  public readonly service: Service;

  /**
   * The config map for database configuration.
   */
  public readonly configMap: ConfigMap;

  private readonly _labels: { [key: string]: string };
  private readonly _databaseConfig: DatabaseProps['database'];

  /**
   * Creates a new Database construct.
   * @param scope The parent construct
   * @param id The construct identifier
   * @param props Database properties
   */
  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id);

    this._databaseConfig = props.database;

    // Generate consistent labels for all resources
    this._labels = {
      'app.kubernetes.io/name': id,
      'app.kubernetes.io/component': 'database',
      'app.kubernetes.io/part-of': 'data-tier',
      ...props.labels || {}
    };

    // Create ConfigMap for database configuration
    this.configMap = new ConfigMap(this, 'config', {
      metadata: {
        labels: this._labels
      },
      data: {
        'database-name': props.database.name,
        'database-user': props.database.username,
        ...props.config || {}
      }
    });

    // Build environment variables
    const env = this.buildEnvironmentVariables(props);

    // Build container configuration
    const container: Container = {
      name: 'database',
      image: props.image,
      ports: [{
        containerPort: props.port,
        protocol: 'TCP'
      }],
      env,
      ...(props.resources && { resources: props.resources })
    };

    // Add volume mounts for persistent storage if configured
    if (props.storage) {
      container.volumeMounts = [{
        name: 'data',
        mountPath: this.getDataPath(props.image)
      }];
    }

    // Create the deployment
    const selector: LabelSelector = {
      matchLabels: {
        'app.kubernetes.io/name': id,
        'app.kubernetes.io/component': 'database'
      }
    };

    const deploymentProps: any = {
      metadata: {
        labels: this._labels
      },
      replicas: 1, // Databases typically run as single instances
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
    };

    // Add persistent volume if storage is configured
    if (props.storage) {
      deploymentProps.template.spec.volumes = [{
        name: 'data',
        persistentVolumeClaim: {
          claimName: `${id}-data`
        }
      }];
    }

    this.deployment = new Deployment(this, 'deployment', deploymentProps);

    // Create the service
    const servicePorts: ServicePort[] = [{
      name: 'database',
      port: props.port,
      targetPort: props.port,
      protocol: 'TCP'
    }];

    this.service = new Service(this, 'service', {
      metadata: {
        labels: this._labels
      },
      selector: selector.matchLabels!,
      ports: servicePorts,
      type: 'ClusterIP' // Databases are typically internal services
    });

    // Register dependencies
    this.registerDependencies();
  }

  /**
   * Registers dependencies for this Database construct.
   */
  private registerDependencies(): void {
    const tracker = DependencyTracker.getInstance();

    // Deployment depends on ConfigMap for configuration
    tracker.addDependency(
      this.deployment,
      this.configMap,
      DependencyType.CONFIGURATION,
      'Database deployment depends on ConfigMap for configuration'
    );

    // Service depends on deployment for pod selection
    tracker.addDependency(
      this.service,
      this.deployment,
      DependencyType.RUNTIME_REFERENCE,
      'Database service depends on deployment for pod selection'
    );
  }

  /**
   * Gets the labels applied to all resources in this construct.
   */
  public get labels(): { [key: string]: string } {
    return { ...this._labels };
  }

  /**
   * Gets the database configuration.
   */
  public get databaseConfig(): DatabaseProps['database'] {
    return { ...this._databaseConfig };
  }

  /**
   * Gets the connection string for the database.
   * @param serviceName Optional service name override
   */
  public getConnectionString(serviceName?: string): string {
    const host = serviceName || this.service.metadata.name!;
    const port = this.service.ports[0].port;
    const { name, username } = this._databaseConfig;

    // Return a generic connection string format
    return `postgresql://${username}:${this._databaseConfig.password}@${host}:${port}/${name}`;
  }

  /**
   * Adds a configuration parameter to the database ConfigMap.
   * @param key The configuration key
   * @param value The configuration value
   */
  public addConfig(key: string, value: string): void {
    this.configMap.addData(key, value);
  }

  /**
   * Builds environment variables for the database container.
   * @param props Database properties
   */
  private buildEnvironmentVariables(props: DatabaseProps): EnvVar[] {
    const env: EnvVar[] = [];

    // Add database-specific environment variables
    const { name, username, password } = props.database;
    
    // Common database environment variables (works for PostgreSQL, MySQL, etc.)
    env.push(
      { name: 'POSTGRES_DB', value: name },
      { name: 'POSTGRES_USER', value: username },
      { name: 'POSTGRES_PASSWORD', value: password },
      { name: 'MYSQL_DATABASE', value: name },
      { name: 'MYSQL_USER', value: username },
      { name: 'MYSQL_PASSWORD', value: password },
      { name: 'MYSQL_ROOT_PASSWORD', value: password }
    );

    // Add ConfigMap references
    const configMapName = this.configMap.metadata.name!;
    env.push({
      name: 'DB_NAME',
      valueFrom: {
        configMapKeyRef: {
          name: configMapName,
          key: 'database-name'
        }
      }
    });

    env.push({
      name: 'DB_USER',
      valueFrom: {
        configMapKeyRef: {
          name: configMapName,
          key: 'database-user'
        }
      }
    });

    // Add additional environment variables from props
    if (props.env) {
      for (const [name, value] of Object.entries(props.env)) {
        env.push({ name, value });
      }
    }

    return env;
  }

  /**
   * Gets the data path for different database engines.
   * @param image The database image
   */
  private getDataPath(image: string): string {
    if (image.includes('postgres')) {
      return '/var/lib/postgresql/data';
    } else if (image.includes('mysql')) {
      return '/var/lib/mysql';
    } else if (image.includes('mongo')) {
      return '/data/db';
    } else if (image.includes('redis')) {
      return '/data';
    }
    
    // Default path
    return '/var/lib/data';
  }
}