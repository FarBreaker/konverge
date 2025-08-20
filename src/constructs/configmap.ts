import { Construct } from '../core/construct';
import { KubernetesResource, KubernetesResourceProps } from '../core/kubernetes-resource';
import { V1ConfigMap } from '../core/types';

/**
 * Properties for the ConfigMap construct.
 */
export interface ConfigMapProps extends KubernetesResourceProps {
  /**
   * Data contains the configuration data.
   * Each key must consist of alphanumeric characters, '-', '_' or '.'.
   */
  data?: { [key: string]: string };

  /**
   * BinaryData contains the binary data.
   * Each key must consist of alphanumeric characters, '-', '_' or '.'.
   */
  binaryData?: { [key: string]: string };

  /**
   * Immutable, if set to true, ensures that data stored in the ConfigMap cannot be updated.
   * Defaults to false.
   */
  immutable?: boolean;
}

/**
 * ConfigMap holds configuration data for pods to consume.
 */
export class ConfigMap extends KubernetesResource {
  public readonly apiVersion = 'v1';
  public readonly kind = 'ConfigMap';

  private readonly _data: { [key: string]: string } = {};
  private readonly _binaryData: { [key: string]: string } = {};
  private _immutable: boolean;

  /**
   * Creates a new ConfigMap construct.
   * @param scope The parent construct
   * @param id The configmap identifier
   * @param props ConfigMap properties
   */
  constructor(scope: Construct, id: string, props: ConfigMapProps = {}) {
    super(scope, id, props);

    // Initialize data from props if provided
    if (props.data) {
      Object.assign(this._data, props.data);
    }

    if (props.binaryData) {
      Object.assign(this._binaryData, props.binaryData);
    }

    this._immutable = props.immutable ?? false;
  }

  /**
   * Adds a data key-value pair to the ConfigMap.
   * @param key The data key
   * @param value The data value
   */
  public addData(key: string, value: string): void {
    this.validateKey(key);

    if (this._binaryData[key]) {
      throw new Error(`Key '${key}' already exists in binaryData of ConfigMap '${this.node.id}'`);
    }

    this._data[key] = value;
  }

  /**
   * Adds multiple data key-value pairs to the ConfigMap.
   * @param data The data object to add
   */
  public addDataFromObject(data: { [key: string]: string }): void {
    for (const [key, value] of Object.entries(data)) {
      this.addData(key, value);
    }
  }

  /**
   * Adds a binary data key-value pair to the ConfigMap.
   * @param key The binary data key
   * @param value The base64-encoded binary data value
   */
  public addBinaryData(key: string, value: string): void {
    this.validateKey(key);

    if (this._data[key]) {
      throw new Error(`Key '${key}' already exists in data of ConfigMap '${this.node.id}'`);
    }

    this._binaryData[key] = value;
  }

  /**
   * Adds data from a file-like structure (simulated).
   * In a real implementation, this might read from actual files.
   * @param key The key to store the file content under
   * @param content The file content
   */
  public addFile(key: string, content: string): void {
    this.addData(key, content);
  }

  /**
   * Gets all data in the ConfigMap.
   */
  public get data(): { [key: string]: string } {
    return { ...this._data };
  }

  /**
   * Gets all binary data in the ConfigMap.
   */
  public get binaryData(): { [key: string]: string } {
    return { ...this._binaryData };
  }

  /**
   * Gets the immutable flag.
   */
  public get immutable(): boolean {
    return this._immutable;
  }

  /**
   * Sets the immutable flag.
   * @param immutable Whether the ConfigMap should be immutable
   */
  public setImmutable(immutable: boolean): void {
    this._immutable = immutable;
  }

  /**
   * Removes a data key from the ConfigMap.
   * @param key The key to remove
   */
  public removeData(key: string): void {
    delete this._data[key];
  }

  /**
   * Removes a binary data key from the ConfigMap.
   * @param key The key to remove
   */
  public removeBinaryData(key: string): void {
    delete this._binaryData[key];
  }

  /**
   * Checks if a data key exists.
   * @param key The key to check
   */
  public hasData(key: string): boolean {
    return key in this._data;
  }

  /**
   * Checks if a binary data key exists.
   * @param key The key to check
   */
  public hasBinaryData(key: string): boolean {
    return key in this._binaryData;
  }

  /**
   * Gets the value for a data key.
   * @param key The key to get
   */
  public getData(key: string): string | undefined {
    return this._data[key];
  }

  /**
   * Gets the value for a binary data key.
   * @param key The key to get
   */
  public getBinaryData(key: string): string | undefined {
    return this._binaryData[key];
  }

  /**
   * Validates a ConfigMap key according to Kubernetes rules.
   * @param key The key to validate
   */
  private validateKey(key: string): void {
    if (!key) {
      throw new Error('ConfigMap key cannot be empty');
    }

    // Kubernetes ConfigMap keys must consist of alphanumeric characters, '-', '_' or '.'
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      throw new Error(`Invalid ConfigMap key '${key}'. Keys must consist of alphanumeric characters, '-', '_' or '.'`);
    }

    // Keys cannot be '.' or '..'
    if (key === '.' || key === '..') {
      throw new Error(`ConfigMap key cannot be '${key}'`);
    }
  }

  /**
   * Validates the ConfigMap configuration.
   */
  public validate(): string[] {
    const errors = super.validate();

    // Validate that we have at least some data
    if (Object.keys(this._data).length === 0 && Object.keys(this._binaryData).length === 0) {
      errors.push('ConfigMap must have at least one data or binaryData entry');
    }

    // Validate data keys
    for (const key of Object.keys(this._data)) {
      try {
        this.validateKey(key);
      } catch (error) {
        errors.push((error as Error).message);
      }
    }

    // Validate binary data keys
    for (const key of Object.keys(this._binaryData)) {
      try {
        this.validateKey(key);
      } catch (error) {
        errors.push((error as Error).message);
      }
    }

    // Check for key conflicts between data and binaryData
    for (const key of Object.keys(this._data)) {
      if (this._binaryData[key]) {
        errors.push(`Key '${key}' exists in both data and binaryData`);
      }
    }

    // Validate data size (Kubernetes limit is 1MiB per ConfigMap)
    const totalSize = Object.values(this._data).reduce((sum, value) => sum + value.length, 0) +
      Object.values(this._binaryData).reduce((sum, value) => sum + value.length, 0);

    if (totalSize > 1048576) { // 1MiB in bytes
      errors.push('ConfigMap total size exceeds 1MiB limit');
    }

    return errors;
  }

  /**
   * Converts the ConfigMap to a Kubernetes manifest.
   */
  public toManifest(): V1ConfigMap {
    const baseManifest = this.createBaseManifest();

    const manifest: V1ConfigMap = {
      ...baseManifest,
      apiVersion: this.apiVersion,
      kind: this.kind,
    };

    // Only include data if it has entries
    if (Object.keys(this._data).length > 0) {
      manifest.data = { ...this._data };
    }

    // Only include binaryData if it has entries
    if (Object.keys(this._binaryData).length > 0) {
      manifest.binaryData = { ...this._binaryData };
    }

    // Only include immutable if it's true
    if (this._immutable) {
      manifest.immutable = this._immutable;
    }

    return manifest;
  }
}