import { Construct } from '../../core/construct';
import { WebService, WebServiceProps } from './web-service';
import { Database, DatabaseProps } from './database';
import { ConfigMap } from '../configmap';
import { DependencyTracker, DependencyType } from '../../core/dependency-tracker';

/**
 * Properties for the Microservice construct.
 */
export interface MicroserviceProps {
  /**
   * Configuration for the web service component.
   */
  webService: Omit<WebServiceProps, 'env'> & {
    /**
     * Additional environment variables (database connection will be added automatically).
     */
    env?: { [key: string]: string };
  };

  /**
   * Optional database configuration. If provided, a database will be created
   * and connection details will be automatically injected into the web service.
   */
  database?: DatabaseProps;

  /**
   * Shared configuration that will be available to all components.
   */
  sharedConfig?: { [key: string]: string };

  /**
   * Additional labels to apply to all resources.
   */
  labels?: { [key: string]: string };
}

/**
 * A Microservice construct that creates a complete microservice with
 * a web service and optional database, with automatic wiring between components.
 */
export class Microservice extends Construct {
  /**
   * The web service component.
   */
  public readonly webService: WebService;

  /**
   * The database component (if configured).
   */
  public readonly database?: Database;

  /**
   * Shared configuration ConfigMap.
   */
  public readonly sharedConfig?: ConfigMap;

  private readonly _labels: { [key: string]: string };

  /**
   * Creates a new Microservice construct.
   * @param scope The parent construct
   * @param id The construct identifier
   * @param props Microservice properties
   */
  constructor(scope: Construct, id: string, props: MicroserviceProps) {
    super(scope, id);

    // Generate consistent labels for all resources
    this._labels = {
      'app.kubernetes.io/name': id,
      'app.kubernetes.io/component': 'microservice',
      'app.kubernetes.io/part-of': 'application',
      ...props.labels || {}
    };

    // Create shared configuration if provided
    if (props.sharedConfig && Object.keys(props.sharedConfig).length > 0) {
      this.sharedConfig = new ConfigMap(this, 'shared-config', {
        metadata: {
          labels: this._labels
        },
        data: props.sharedConfig
      });
    }

    // Create database if configured
    if (props.database) {
      this.database = new Database(this, 'database', {
        ...props.database,
        labels: {
          ...this._labels,
          ...props.database.labels || {}
        }
      });
    }

    // Build environment variables for web service
    const webServiceEnv = this.buildWebServiceEnvironment(props);

    // Create web service with enhanced configuration
    this.webService = new WebService(this, 'web', {
      ...props.webService,
      env: webServiceEnv,
      labels: {
        ...this._labels,
        ...props.webService.labels || {}
      }
    });

    // Add shared configuration environment variables
    this.addSharedConfigEnvironmentVariables();

    // Register dependencies between components
    this.registerDependencies();
  }

  /**
   * Registers dependencies between microservice components.
   */
  private registerDependencies(): void {
    const tracker = DependencyTracker.getInstance();

    // Web service depends on database if it exists
    if (this.database) {
      tracker.addDependency(
        this.webService,
        this.database,
        DependencyType.NETWORK,
        'WebService depends on Database for data access'
      );

      // More specifically, web service depends on database service being available
      tracker.addDependency(
        this.webService.deployment,
        this.database.service,
        DependencyType.NETWORK,
        'WebService deployment depends on Database service for connectivity'
      );
    }

    // Web service depends on shared config if it exists
    if (this.sharedConfig) {
      tracker.addDependency(
        this.webService,
        this.sharedConfig,
        DependencyType.CONFIGURATION,
        'WebService depends on shared configuration'
      );

      // More specifically, web service deployment depends on shared config
      tracker.addDependency(
        this.webService.deployment,
        this.sharedConfig,
        DependencyType.CONFIGURATION,
        'WebService deployment depends on shared ConfigMap'
      );
    }
  }

  /**
   * Adds shared configuration as environment variables to the web service.
   */
  private addSharedConfigEnvironmentVariables(): void {
    if (!this.sharedConfig) {
      return;
    }

    const container = this.webService.deployment.containers[0];
    const configMapName = this.sharedConfig.metadata.name!;
    
    // Add all shared config keys as environment variables with SHARED_ prefix
    for (const key of Object.keys(this.sharedConfig.data)) {
      const envVarName = `SHARED_${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
      
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

  /**
   * Gets the labels applied to all resources in this construct.
   */
  public get labels(): { [key: string]: string } {
    return { ...this._labels };
  }

  /**
   * Adds shared configuration that will be available to all components.
   * @param key The configuration key
   * @param value The configuration value
   */
  public addSharedConfig(key: string, value: string): void {
    if (!this.sharedConfig) {
      // Create shared config if it doesn't exist
      (this as any).sharedConfig = new ConfigMap(this, 'shared-config', {
        metadata: {
          labels: this._labels
        }
      });
    }
    
    this.sharedConfig!.addData(key, value);
    
    // Update environment variables to include the new shared config reference
    this.addSharedConfigEnvironmentVariables();

    // Register the new dependency if this is the first shared config item
    if (Object.keys(this.sharedConfig!.data).length === 1) {
      const tracker = DependencyTracker.getInstance();
      tracker.addDependency(
        this.webService.deployment,
        this.sharedConfig!,
        DependencyType.CONFIGURATION,
        'WebService deployment depends on shared ConfigMap'
      );
    }
  }

  /**
   * Gets the database connection details if a database is configured.
   */
  public getDatabaseConnection(): { host: string; port: number; database: string; username: string } | undefined {
    if (!this.database) {
      return undefined;
    }

    return {
      host: this.database.service.metadata.name!,
      port: this.database.service.ports[0].port,
      database: this.database.databaseConfig.name,
      username: this.database.databaseConfig.username
    };
  }

  /**
   * Scales the web service to the specified number of replicas.
   * @param replicas The number of replicas
   */
  public scale(replicas: number): void {
    this.webService.setReplicas(replicas);
  }

  /**
   * Adds an environment variable to the web service.
   * @param name The environment variable name
   * @param value The environment variable value
   */
  public addEnvironmentVariable(name: string, value: string): void {
    this.webService.addEnvironmentVariable(name, value);
  }

  /**
   * Builds environment variables for the web service, including database connection details.
   * @param props Microservice properties
   */
  private buildWebServiceEnvironment(props: MicroserviceProps): { [key: string]: string } {
    const env: { [key: string]: string } = {
      // Add environment variables from props
      ...props.webService.env || {}
    };

    // Add database connection details if database is configured
    if (this.database) {
      const dbConnection = this.getDatabaseConnection()!;
      env.DATABASE_HOST = dbConnection.host;
      env.DATABASE_PORT = dbConnection.port.toString();
      env.DATABASE_NAME = dbConnection.database;
      env.DATABASE_USER = dbConnection.username;
      // Note: In a real implementation, password should come from a Secret, not ConfigMap
      env.DATABASE_PASSWORD = this.database.databaseConfig.password;
      env.DATABASE_URL = this.database.getConnectionString();
    }

    // Note: Shared configuration references will be added as environment variables
    // in the web service after it's created

    return env;
  }
}