import { App } from '../../../src/core/app';
import { Stack } from '../../../src/core/stack';
import { Database } from '../../../src/constructs/patterns/database';

describe('Database Construct', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  test('should create a PostgreSQL database with basic configuration', () => {
    const database = new Database(stack, 'PostgresDB', {
      image: 'postgres:13',
      port: 5432,
      database: {
        name: 'myapp',
        username: 'appuser',
        password: 'secretpassword'
      }
    });

    expect(database.deployment).toBeDefined();
    expect(database.service).toBeDefined();
    expect(database.configMap).toBeDefined();

    // Check deployment configuration
    const deploymentManifest = database.deployment.toManifest();
    expect(deploymentManifest.spec!.replicas).toBe(1);
    expect(deploymentManifest.spec!.template.spec!.containers).toHaveLength(1);
    
    const container = deploymentManifest.spec!.template.spec!.containers[0];
    expect(container.image).toBe('postgres:13');
    expect(container.ports![0].containerPort).toBe(5432);

    // Check environment variables
    const envVars = container.env || [];
    expect(envVars.find(e => e.name === 'POSTGRES_DB')?.value).toBe('myapp');
    expect(envVars.find(e => e.name === 'POSTGRES_USER')?.value).toBe('appuser');
    expect(envVars.find(e => e.name === 'POSTGRES_PASSWORD')?.value).toBe('secretpassword');

    // Check ConfigMap references
    expect(envVars.find(e => e.name === 'DB_NAME')).toBeDefined();
    expect(envVars.find(e => e.name === 'DB_USER')).toBeDefined();

    // Check service configuration
    const serviceManifest = database.service.toManifest();
    expect(serviceManifest.spec!.type).toBe('ClusterIP');
    expect(serviceManifest.spec!.ports![0].port).toBe(5432);
    expect(serviceManifest.spec!.ports![0].targetPort).toBe(5432);

    // Check ConfigMap
    const configMapManifest = database.configMap.toManifest();
    expect(configMapManifest.data!['database-name']).toBe('myapp');
    expect(configMapManifest.data!['database-user']).toBe('appuser');
  });

  test('should create a MySQL database with custom configuration', () => {
    const database = new Database(stack, 'MySQLDB', {
      image: 'mysql:8.0',
      port: 3306,
      database: {
        name: 'ecommerce',
        username: 'ecomuser',
        password: 'mysqlpass123'
      },
      config: {
        'max_connections': '200',
        'innodb_buffer_pool_size': '1G'
      },
      env: {
        'MYSQL_CHARSET': 'utf8mb4',
        'MYSQL_COLLATION': 'utf8mb4_unicode_ci'
      },
      resources: {
        requests: {
          cpu: '500m',
          memory: '1Gi'
        },
        limits: {
          cpu: '2',
          memory: '4Gi'
        }
      },
      labels: {
        'database-engine': 'mysql',
        'version': '8.0'
      }
    });

    // Check deployment configuration
    const deploymentManifest = database.deployment.toManifest();
    const container = deploymentManifest.spec!.template.spec!.containers[0];
    
    expect(container.image).toBe('mysql:8.0');
    expect(container.ports![0].containerPort).toBe(3306);

    // Check resource limits
    expect(container.resources!.requests!.cpu).toBe('500m');
    expect(container.resources!.requests!.memory).toBe('1Gi');
    expect(container.resources!.limits!.cpu).toBe('2');
    expect(container.resources!.limits!.memory).toBe('4Gi');

    // Check environment variables
    const envVars = container.env || [];
    expect(envVars.find(e => e.name === 'MYSQL_DATABASE')?.value).toBe('ecommerce');
    expect(envVars.find(e => e.name === 'MYSQL_USER')?.value).toBe('ecomuser');
    expect(envVars.find(e => e.name === 'MYSQL_PASSWORD')?.value).toBe('mysqlpass123');
    expect(envVars.find(e => e.name === 'MYSQL_CHARSET')?.value).toBe('utf8mb4');
    expect(envVars.find(e => e.name === 'MYSQL_COLLATION')?.value).toBe('utf8mb4_unicode_ci');

    // Check ConfigMap
    const configMapManifest = database.configMap.toManifest();
    expect(configMapManifest.data!['max_connections']).toBe('200');
    expect(configMapManifest.data!['innodb_buffer_pool_size']).toBe('1G');

    // Check labels
    expect(deploymentManifest.metadata.labels!['database-engine']).toBe('mysql');
    expect(deploymentManifest.metadata.labels!['version']).toBe('8.0');
    expect(deploymentManifest.metadata.labels!['app.kubernetes.io/component']).toBe('database');
  });

  test('should create database with storage configuration', () => {
    const database = new Database(stack, 'StorageDB', {
      image: 'postgres:13',
      port: 5432,
      database: {
        name: 'myapp',
        username: 'appuser',
        password: 'secretpassword'
      },
      storage: {
        size: '20Gi',
        storageClass: 'fast-ssd'
      }
    });

    const deploymentManifest = database.deployment.toManifest();
    const container = deploymentManifest.spec!.template.spec!.containers[0];

    // Check volume mounts
    expect(container.volumeMounts).toBeDefined();
    expect(container.volumeMounts![0].name).toBe('data');
    expect(container.volumeMounts![0].mountPath).toBe('/var/lib/postgresql/data');

    // Check volumes
    const volumes = deploymentManifest.spec!.template.spec!.volumes;
    expect(volumes).toBeDefined();
    expect(volumes![0].name).toBe('data');
    expect(volumes![0].persistentVolumeClaim!.claimName).toBe('StorageDB-data');
  });

  test('should generate correct connection string', () => {
    const database = new Database(stack, 'ConnectionDB', {
      image: 'postgres:13',
      port: 5432,
      database: {
        name: 'testdb',
        username: 'testuser',
        password: 'testpass'
      }
    });

    const connectionString = database.getConnectionString();
    expect(connectionString).toContain('postgresql://testuser:testpass@');
    expect(connectionString).toContain(':5432/testdb');

    // Test with custom service name
    const customConnectionString = database.getConnectionString('custom-service');
    expect(customConnectionString).toBe('postgresql://testuser:testpass@custom-service:5432/testdb');
  });

  test('should allow adding configuration after creation', () => {
    const database = new Database(stack, 'DynamicConfigDB', {
      image: 'postgres:13',
      port: 5432,
      database: {
        name: 'myapp',
        username: 'appuser',
        password: 'secretpassword'
      }
    });

    database.addConfig('shared_preload_libraries', 'pg_stat_statements');

    const configMapManifest = database.configMap.toManifest();
    expect(configMapManifest.data!['shared_preload_libraries']).toBe('pg_stat_statements');
  });

  test('should have consistent labels across all resources', () => {
    const database = new Database(stack, 'LabeledDB', {
      image: 'postgres:13',
      port: 5432,
      database: {
        name: 'myapp',
        username: 'appuser',
        password: 'secretpassword'
      },
      labels: {
        'environment': 'production',
        'team': 'backend'
      }
    });

    const expectedLabels = {
      'app.kubernetes.io/name': 'LabeledDB',
      'app.kubernetes.io/component': 'database',
      'app.kubernetes.io/part-of': 'data-tier',
      'environment': 'production',
      'team': 'backend'
    };

    // Check deployment labels
    const deploymentLabels = database.deployment.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedLabels)) {
      expect(deploymentLabels[key]).toBe(value);
    }

    // Check service labels
    const serviceLabels = database.service.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedLabels)) {
      expect(serviceLabels[key]).toBe(value);
    }

    // Check ConfigMap labels
    const configMapLabels = database.configMap.toManifest().metadata.labels!;
    for (const [key, value] of Object.entries(expectedLabels)) {
      expect(configMapLabels[key]).toBe(value);
    }
  });

  test('should properly wire selector labels between deployment and service', () => {
    const database = new Database(stack, 'WiredDB', {
      image: 'postgres:13',
      port: 5432,
      database: {
        name: 'myapp',
        username: 'appuser',
        password: 'secretpassword'
      }
    });

    const deploymentManifest = database.deployment.toManifest();
    const serviceManifest = database.service.toManifest();

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

  test('should get correct data path for different database engines', () => {
    const testCases = [
      { image: 'postgres:13', expectedPath: '/var/lib/postgresql/data' },
      { image: 'mysql:8.0', expectedPath: '/var/lib/mysql' },
      { image: 'mongo:4.4', expectedPath: '/data/db' },
      { image: 'redis:6', expectedPath: '/data' },
      { image: 'custom-db:latest', expectedPath: '/var/lib/data' }
    ];

    testCases.forEach(({ image, expectedPath }) => {
      const database = new Database(stack, `DB-${image.replace(/[^a-zA-Z0-9]/g, '')}`, {
        image,
        port: 5432,
        database: {
          name: 'test',
          username: 'test',
          password: 'test'
        },
        storage: { size: '1Gi' }
      });

      const deploymentManifest = database.deployment.toManifest();
      const container = deploymentManifest.spec!.template.spec!.containers[0];
      expect(container.volumeMounts![0].mountPath).toBe(expectedPath);
    });
  });

  test('should expose database configuration', () => {
    const database = new Database(stack, 'ConfigDB', {
      image: 'postgres:13',
      port: 5432,
      database: {
        name: 'myapp',
        username: 'appuser',
        password: 'secretpassword'
      }
    });

    const config = database.databaseConfig;
    expect(config.name).toBe('myapp');
    expect(config.username).toBe('appuser');
    expect(config.password).toBe('secretpassword');
  });
});