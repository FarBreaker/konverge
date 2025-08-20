import { Construct } from './construct';
import { Stack } from './stack';
import { Synthesizer } from './synthesizer';
import { KubernetesManifest } from './types';
import * as yaml from 'js-yaml';

/**
 * Represents a CDK app. This is the root construct of a CDK application.
 */
export class App extends Construct {
  private readonly _stacks: Stack[] = [];

  /**
   * Creates a new App construct.
   */
  constructor() {
    super(undefined, 'App');
    
    // Register this app globally for synthesis discovery
    if (typeof global !== 'undefined') {
      (global as any).__k8sCdkApp = this;
    }
  }

  /**
   * Returns all stacks in this app.
   */
  public get stacks(): readonly Stack[] {
    return [...this._stacks];
  }

  /**
   * Registers a stack with this app.
   * @param stack The stack to register
   */
  public addStack(stack: Stack): void {
    if (this._stacks.includes(stack)) {
      return; // Stack already registered
    }
    
    this._stacks.push(stack);
  }

  /**
   * Synthesizes the app and returns a cloud assembly.
   * This method traverses all stacks and generates their manifests.
   * @param outdir The output directory for the assembly (defaults to './cdk.out')
   */
  public synth(outdir?: string): CloudAssembly {
    const assembly = new CloudAssembly(outdir);
    
    for (const stack of this._stacks) {
      const manifests = stack.synthesize();
      assembly.addStackManifests(stack.stackName, manifests);
    }
    
    return assembly;
  }
}

/**
 * Represents the output of synthesis - a collection of stack manifests with directory management.
 */
export class CloudAssembly {
  private readonly _stackManifests: Map<string, StackManifest> = new Map();
  private readonly _directory: string;

  /**
   * Creates a new CloudAssembly.
   * @param directory The output directory for the assembly
   */
  constructor(directory: string = './cdk.out') {
    this._directory = directory;
  }

  /**
   * Gets the output directory for this assembly.
   */
  public get directory(): string {
    return this._directory;
  }

  /**
   * Adds manifests for a stack to this assembly.
   * @param stackName The name of the stack
   * @param manifests The Kubernetes manifests for the stack
   */
  public addStackManifests(stackName: string, manifests: KubernetesManifest[]): void {
    // Order resources according to Kubernetes best practices
    const orderedManifests = Synthesizer.orderResources(manifests);
    
    this._stackManifests.set(stackName, {
      stackName,
      manifests: orderedManifests
    });
  }

  /**
   * Returns all stack manifests in this assembly.
   */
  public get stacks(): StackManifest[] {
    return Array.from(this._stackManifests.values());
  }

  /**
   * Gets the manifests for a specific stack.
   * @param stackName The name of the stack
   */
  public getStackManifests(stackName: string): StackManifest | undefined {
    return this._stackManifests.get(stackName);
  }

  /**
   * Returns the total number of resources across all stacks.
   */
  public get resourceCount(): number {
    return Array.from(this._stackManifests.values())
      .reduce((total, stack) => total + stack.manifests.length, 0);
  }

  /**
   * Returns all manifests from all stacks in a flat array.
   */
  public getAllManifests(): KubernetesManifest[] {
    const allManifests: KubernetesManifest[] = [];
    for (const stack of this._stackManifests.values()) {
      allManifests.push(...stack.manifests);
    }
    return allManifests;
  }

  /**
   * Writes the assembly to the output directory.
   * Creates YAML files for each stack and a manifest file listing all resources.
   */
  public async writeToDirectory(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');
    
    // Ensure output directory exists
    if (!fs.existsSync(this._directory)) {
      fs.mkdirSync(this._directory, { recursive: true });
    }

    // Write each stack to its own YAML file
    for (const stack of this._stackManifests.values()) {
      const stackFileName = `${stack.stackName}.yaml`;
      const stackFilePath = path.join(this._directory, stackFileName);
      
      const yamlContent = this.generateYamlContent(stack.manifests);
      fs.writeFileSync(stackFilePath, yamlContent, 'utf8');
    }

    // Write assembly manifest
    const assemblyManifest = {
      version: '1.0.0',
      stacks: Array.from(this._stackManifests.keys()).map(stackName => ({
        name: stackName,
        file: `${stackName}.yaml`,
        resourceCount: this._stackManifests.get(stackName)!.manifests.length
      })),
      totalResources: this.resourceCount,
      generatedAt: new Date().toISOString()
    };

    const manifestPath = path.join(this._directory, 'assembly-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(assemblyManifest, null, 2), 'utf8');
  }

  /**
   * Generates YAML content from manifests with proper Kubernetes formatting.
   * @param manifests The manifests to convert to YAML
   */
  private generateYamlContent(manifests: KubernetesManifest[]): string {
    if (manifests.length === 0) {
      return '';
    }

    // Validate all manifests before generating YAML
    this.validateManifests(manifests);

    // Convert each manifest to YAML with proper formatting
    const yamlParts = manifests.map(manifest => {
      // Clean up the manifest by removing undefined/null values
      const cleanManifest = this.cleanManifest(manifest);
      
      // Convert to YAML with Kubernetes-friendly options
      return yaml.dump(cleanManifest, {
        indent: 2,
        lineWidth: -1, // No line wrapping
        noRefs: true,  // Don't use YAML references
        sortKeys: false, // Preserve key order
        quotingType: '"', // Use double quotes for strings when needed
        forceQuotes: false, // Only quote when necessary
      });
    });

    // Join with document separators (standard Kubernetes multi-document format)
    return yamlParts.join('---\n').trim();
  }

  /**
   * Validates manifests for structural correctness and Kubernetes compliance.
   * @param manifests The manifests to validate
   */
  private validateManifests(manifests: KubernetesManifest[]): void {
    for (const manifest of manifests) {
      this.validateSingleManifest(manifest);
    }
  }

  /**
   * Validates a single manifest for Kubernetes compliance.
   * @param manifest The manifest to validate
   */
  private validateSingleManifest(manifest: KubernetesManifest): void {
    // Basic structural validation
    if (!manifest.apiVersion) {
      throw new Error(`Manifest is missing required field 'apiVersion': ${JSON.stringify(manifest)}`);
    }

    if (!manifest.kind) {
      throw new Error(`Manifest is missing required field 'kind': ${JSON.stringify(manifest)}`);
    }

    if (!manifest.metadata) {
      throw new Error(`Manifest is missing required field 'metadata': ${JSON.stringify(manifest)}`);
    }

    if (!manifest.metadata.name) {
      throw new Error(`Manifest metadata is missing required field 'name': ${JSON.stringify(manifest)}`);
    }

    // Validate name format (DNS-1123 subdomain)
    const nameRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;
    if (!nameRegex.test(manifest.metadata.name)) {
      throw new Error(`Invalid resource name '${manifest.metadata.name}'. Names must be valid DNS-1123 subdomains.`);
    }

    // Validate namespace format if present
    if (manifest.metadata.namespace) {
      if (!nameRegex.test(manifest.metadata.namespace)) {
        throw new Error(`Invalid namespace '${manifest.metadata.namespace}'. Namespaces must be valid DNS-1123 subdomains.`);
      }
    }

    // Validate labels format
    if (manifest.metadata.labels) {
      this.validateLabels(manifest.metadata.labels, 'labels');
    }

    // Validate annotations format
    if (manifest.metadata.annotations) {
      this.validateLabels(manifest.metadata.annotations, 'annotations');
    }

    // Validate API version format
    this.validateApiVersion(manifest.apiVersion, manifest.kind);
  }

  /**
   * Validates label/annotation keys and values.
   * @param labels The labels or annotations to validate
   * @param fieldName The field name for error messages
   */
  private validateLabels(labels: { [key: string]: string }, fieldName: string): void {
    for (const [key, value] of Object.entries(labels)) {
      // Validate key format
      const keyRegex = /^([a-z0-9A-Z]([a-z0-9A-Z\-_.]*[a-z0-9A-Z])?\/)?[a-z0-9A-Z]([a-z0-9A-Z\-_.]*[a-z0-9A-Z])?$/;
      if (!keyRegex.test(key)) {
        throw new Error(`Invalid ${fieldName} key '${key}'. Keys must be valid label keys.`);
      }

      // Validate key length
      if (key.length > 253) {
        throw new Error(`${fieldName} key '${key}' is too long. Maximum length is 253 characters.`);
      }

      // Validate value length
      if (value.length > 63) {
        throw new Error(`${fieldName} value for key '${key}' is too long. Maximum length is 63 characters.`);
      }
    }
  }

  /**
   * Validates API version format for known resource kinds.
   * @param apiVersion The API version to validate
   * @param kind The resource kind
   */
  private validateApiVersion(apiVersion: string, kind: string): void {
    const knownApiVersions: { [kind: string]: string[] } = {
      'Pod': ['v1'],
      'Service': ['v1'],
      'ConfigMap': ['v1'],
      'Secret': ['v1'],
      'Namespace': ['v1'],
      'ServiceAccount': ['v1'],
      'PersistentVolume': ['v1'],
      'PersistentVolumeClaim': ['v1'],
      'Deployment': ['apps/v1'],
      'StatefulSet': ['apps/v1'],
      'DaemonSet': ['apps/v1'],
      'ReplicaSet': ['apps/v1'],
      'Job': ['batch/v1'],
      'CronJob': ['batch/v1'],
      'Ingress': ['networking.k8s.io/v1'],
      'Role': ['rbac.authorization.k8s.io/v1'],
      'ClusterRole': ['rbac.authorization.k8s.io/v1'],
      'RoleBinding': ['rbac.authorization.k8s.io/v1'],
      'ClusterRoleBinding': ['rbac.authorization.k8s.io/v1'],
    };

    const validVersions = knownApiVersions[kind];
    if (validVersions && !validVersions.includes(apiVersion)) {
      throw new Error(`Invalid apiVersion '${apiVersion}' for kind '${kind}'. Valid versions: ${validVersions.join(', ')}`);
    }
  }

  /**
   * Cleans a manifest by removing undefined, null, and empty values.
   * @param manifest The manifest to clean
   */
  private cleanManifest(manifest: KubernetesManifest): KubernetesManifest {
    return JSON.parse(JSON.stringify(manifest, (_key, value) => {
      // Remove undefined and null values
      if (value === undefined || value === null) {
        return undefined;
      }
      
      // Remove empty objects
      if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
        return undefined;
      }
      
      // Remove empty arrays
      if (Array.isArray(value) && value.length === 0) {
        return undefined;
      }
      
      return value;
    }));
  }
}

/**
 * Represents the manifests for a single stack.
 */
export interface StackManifest {
  /**
   * The name of the stack.
   */
  stackName: string;

  /**
   * The Kubernetes manifests for this stack.
   */
  manifests: KubernetesManifest[];
}