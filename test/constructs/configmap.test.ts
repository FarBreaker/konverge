import { App } from '../../src/core/app';
import { Stack } from '../../src/core/stack';
import { ConfigMap } from '../../src/constructs/configmap';

describe('ConfigMap', () => {
  let app: App;
  let stack: Stack;

  beforeEach(() => {
    app = new App();
    stack = new Stack(app, 'TestStack');
  });

  describe('constructor', () => {
    it('should create a configmap with basic properties', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap');

      expect(configMap.apiVersion).toBe('v1');
      expect(configMap.kind).toBe('ConfigMap');
      expect(configMap.immutable).toBe(false);
      expect(Object.keys(configMap.data)).toHaveLength(0);
      expect(Object.keys(configMap.binaryData)).toHaveLength(0);
    });

    it('should create a configmap with initial data', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: {
          'config.yaml': 'key: value',
          'app.properties': 'debug=true',
        },
      });

      expect(Object.keys(configMap.data)).toHaveLength(2);
      expect(configMap.data['config.yaml']).toBe('key: value');
      expect(configMap.data['app.properties']).toBe('debug=true');
    });

    it('should create a configmap with binary data', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        binaryData: {
          'binary-file': 'YmluYXJ5IGRhdGE=', // base64 encoded "binary data"
        },
      });

      expect(Object.keys(configMap.binaryData)).toHaveLength(1);
      expect(configMap.binaryData['binary-file']).toBe('YmluYXJ5IGRhdGE=');
    });

    it('should create an immutable configmap', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        immutable: true,
        data: { key: 'value' },
      });

      expect(configMap.immutable).toBe(true);
    });
  });

  describe('addData', () => {
    let configMap: ConfigMap;

    beforeEach(() => {
      configMap = new ConfigMap(stack, 'MyConfigMap');
    });

    it('should add data to the configmap', () => {
      configMap.addData('app.config', 'debug=true');

      expect(configMap.data['app.config']).toBe('debug=true');
      expect(Object.keys(configMap.data)).toHaveLength(1);
    });

    it('should allow overwriting existing data', () => {
      configMap.addData('key', 'value1');
      configMap.addData('key', 'value2');

      expect(configMap.data['key']).toBe('value2');
    });

    it('should throw error if key exists in binaryData', () => {
      configMap.addBinaryData('key', 'YmluYXJ5');
      
      expect(() => {
        configMap.addData('key', 'value');
      }).toThrow("Key 'key' already exists in binaryData of ConfigMap 'MyConfigMap'");
    });

    it('should validate key format', () => {
      expect(() => {
        configMap.addData('invalid key!', 'value');
      }).toThrow("Invalid ConfigMap key 'invalid key!'. Keys must consist of alphanumeric characters, '-', '_' or '.'");
    });

    it('should reject empty keys', () => {
      expect(() => {
        configMap.addData('', 'value');
      }).toThrow('ConfigMap key cannot be empty');
    });

    it('should reject . and .. keys', () => {
      expect(() => {
        configMap.addData('.', 'value');
      }).toThrow("ConfigMap key cannot be '.'");

      expect(() => {
        configMap.addData('..', 'value');
      }).toThrow("ConfigMap key cannot be '..'");
    });
  });

  describe('addDataFromObject', () => {
    let configMap: ConfigMap;

    beforeEach(() => {
      configMap = new ConfigMap(stack, 'MyConfigMap');
    });

    it('should add multiple data entries from object', () => {
      configMap.addDataFromObject({
        'config.yaml': 'key: value',
        'app.properties': 'debug=true',
        'database.url': 'localhost:5432',
      });

      expect(Object.keys(configMap.data)).toHaveLength(3);
      expect(configMap.data['config.yaml']).toBe('key: value');
      expect(configMap.data['app.properties']).toBe('debug=true');
      expect(configMap.data['database.url']).toBe('localhost:5432');
    });
  });

  describe('addBinaryData', () => {
    let configMap: ConfigMap;

    beforeEach(() => {
      configMap = new ConfigMap(stack, 'MyConfigMap');
    });

    it('should add binary data to the configmap', () => {
      configMap.addBinaryData('binary-file', 'YmluYXJ5IGRhdGE=');

      expect(configMap.binaryData['binary-file']).toBe('YmluYXJ5IGRhdGE=');
      expect(Object.keys(configMap.binaryData)).toHaveLength(1);
    });

    it('should throw error if key exists in data', () => {
      configMap.addData('key', 'value');
      
      expect(() => {
        configMap.addBinaryData('key', 'YmluYXJ5');
      }).toThrow("Key 'key' already exists in data of ConfigMap 'MyConfigMap'");
    });
  });

  describe('addFile', () => {
    let configMap: ConfigMap;

    beforeEach(() => {
      configMap = new ConfigMap(stack, 'MyConfigMap');
    });

    it('should add file content as data', () => {
      const fileContent = `
server:
  port: 8080
  host: localhost
database:
  url: jdbc:postgresql://localhost:5432/mydb
`;
      configMap.addFile('application.yaml', fileContent);

      expect(configMap.data['application.yaml']).toBe(fileContent);
    });
  });

  describe('data manipulation methods', () => {
    let configMap: ConfigMap;

    beforeEach(() => {
      configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { 'existing-key': 'existing-value' },
        binaryData: { 'binary-key': 'YmluYXJ5' },
      });
    });

    it('should remove data', () => {
      expect(configMap.hasData('existing-key')).toBe(true);
      configMap.removeData('existing-key');
      expect(configMap.hasData('existing-key')).toBe(false);
    });

    it('should remove binary data', () => {
      expect(configMap.hasBinaryData('binary-key')).toBe(true);
      configMap.removeBinaryData('binary-key');
      expect(configMap.hasBinaryData('binary-key')).toBe(false);
    });

    it('should get data values', () => {
      expect(configMap.getData('existing-key')).toBe('existing-value');
      expect(configMap.getData('non-existent')).toBeUndefined();
    });

    it('should get binary data values', () => {
      expect(configMap.getBinaryData('binary-key')).toBe('YmluYXJ5');
      expect(configMap.getBinaryData('non-existent')).toBeUndefined();
    });
  });

  describe('setImmutable', () => {
    let configMap: ConfigMap;

    beforeEach(() => {
      configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { key: 'value' },
      });
    });

    it('should set immutable flag', () => {
      expect(configMap.immutable).toBe(false);
      configMap.setImmutable(true);
      expect(configMap.immutable).toBe(true);
    });
  });

  describe('validate', () => {
    it('should return no errors for valid configmap', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { 'valid-key': 'value' },
      });

      const errors = configMap.validate();
      expect(errors).toHaveLength(0);
    });

    it('should return error for empty configmap', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap');

      const errors = configMap.validate();
      expect(errors).toContain('ConfigMap must have at least one data or binaryData entry');
    });

    it('should return error for invalid key in data', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { 'invalid key!': 'value' },
      });

      const errors = configMap.validate();
      expect(errors).toContain("Invalid ConfigMap key 'invalid key!'. Keys must consist of alphanumeric characters, '-', '_' or '.'");
    });

    it('should return error for key conflicts', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { 'conflicting-key': 'value' },
        binaryData: { 'conflicting-key': 'YmluYXJ5' },
      });

      const errors = configMap.validate();
      expect(errors).toContain("Key 'conflicting-key' exists in both data and binaryData");
    });

    it('should return error for oversized configmap', () => {
      // Create a large string that exceeds 1MiB
      const largeValue = 'x'.repeat(1048577); // 1MiB + 1 byte
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { 'large-key': largeValue },
      });

      const errors = configMap.validate();
      expect(errors).toContain('ConfigMap total size exceeds 1MiB limit');
    });
  });

  describe('toManifest', () => {
    it('should generate valid Kubernetes configmap manifest', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: {
          'config.yaml': 'key: value',
          'app.properties': 'debug=true',
        },
      });

      const manifest = configMap.toManifest();

      expect(manifest.apiVersion).toBe('v1');
      expect(manifest.kind).toBe('ConfigMap');
      expect(manifest.metadata.name).toBeDefined();
      expect(manifest.data).toEqual({
        'config.yaml': 'key: value',
        'app.properties': 'debug=true',
      });
      expect(manifest.binaryData).toBeUndefined();
      expect(manifest.immutable).toBeUndefined();
    });

    it('should generate manifest with binary data', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        binaryData: {
          'binary-file': 'YmluYXJ5IGRhdGE=',
        },
      });

      const manifest = configMap.toManifest();

      expect(manifest.binaryData).toEqual({
        'binary-file': 'YmluYXJ5IGRhdGE=',
      });
      expect(manifest.data).toBeUndefined();
    });

    it('should generate manifest with both data and binary data', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { 'text-file': 'content' },
        binaryData: { 'binary-file': 'YmluYXJ5' },
      });

      const manifest = configMap.toManifest();

      expect(manifest.data).toEqual({ 'text-file': 'content' });
      expect(manifest.binaryData).toEqual({ 'binary-file': 'YmluYXJ5' });
    });

    it('should generate immutable configmap manifest', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { key: 'value' },
        immutable: true,
      });

      const manifest = configMap.toManifest();

      expect(manifest.immutable).toBe(true);
    });

    it('should not include immutable field when false', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { key: 'value' },
        immutable: false,
      });

      const manifest = configMap.toManifest();

      expect(manifest.immutable).toBeUndefined();
    });

    it('should include auto-generated metadata', () => {
      const configMap = new ConfigMap(stack, 'MyConfigMap', {
        data: { key: 'value' },
      });

      const manifest = configMap.toManifest();

      expect(manifest.metadata.labels).toBeDefined();
      expect(manifest.metadata.labels!['app.kubernetes.io/managed-by']).toBe('konverge');
      expect(manifest.metadata.labels!['app.kubernetes.io/name']).toBe('MyConfigMap');
      expect(manifest.metadata.annotations).toBeDefined();
      expect(manifest.metadata.annotations!['konverge.io/construct-path']).toBeDefined();
    });
  });
});