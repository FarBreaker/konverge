/**
 * Core types and interfaces for the Konverge framework.
 */

/**
 * Kubernetes ObjectMeta interface.
 */
export interface ObjectMeta {
  /**
   * Name must be unique within a namespace.
   */
  name?: string;

  /**
   * Namespace defines the space within which each name must be unique.
   */
  namespace?: string;

  /**
   * Map of string keys and values that can be used to organize and categorize objects.
   */
  labels?: { [key: string]: string };

  /**
   * Annotations is an unstructured key value map stored with a resource.
   */
  annotations?: { [key: string]: string };

  /**
   * An opaque value that represents the internal version of this object.
   */
  resourceVersion?: string;

  /**
   * A sequence number representing a specific generation of the desired state.
   */
  generation?: number;

  /**
   * CreationTimestamp is a timestamp representing the server time when this object was created.
   */
  creationTimestamp?: string;

  /**
   * DeletionTimestamp is RFC 3339 date and time at which this resource will be deleted.
   */
  deletionTimestamp?: string;

  /**
   * Number of seconds allowed for this object to gracefully terminate before being removed.
   */
  deletionGracePeriodSeconds?: number;

  /**
   * Must be empty before the object is deleted from the registry.
   */
  finalizers?: string[];

  /**
   * The name of the cluster which the object belongs to.
   */
  clusterName?: string;

  /**
   * ManagedFields maps workflow-id and version to the set of fields that are managed by that workflow.
   */
  managedFields?: any[];

  /**
   * UID is the unique in time and space value for this object.
   */
  uid?: string;

  /**
   * SelfLink is a URL representing this object.
   */
  selfLink?: string;
}

/**
 * Base interface for all Kubernetes resources.
 */
export interface KubernetesManifest {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   */
  apiVersion: string;

  /**
   * Kind is a string value representing the REST resource this object represents.
   */
  kind: string;

  /**
   * Standard object metadata.
   */
  metadata: ObjectMeta;

  /**
   * Specification of the desired behavior of the resource.
   */
  spec?: any;

  /**
   * Most recently observed status of the resource.
   */
  status?: any;

  /**
   * Allow additional properties for different resource types.
   */
  [key: string]: any;
}

/**
 * Label selector requirements.
 */
export interface LabelSelector {
  /**
   * matchLabels is a map of {key,value} pairs.
   */
  matchLabels?: { [key: string]: string };

  /**
   * matchExpressions is a list of label selector requirements.
   */
  matchExpressions?: LabelSelectorRequirement[];
}

/**
 * A label selector requirement.
 */
export interface LabelSelectorRequirement {
  /**
   * key is the label key that the selector applies to.
   */
  key: string;

  /**
   * operator represents a key's relationship to a set of values.
   */
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist';

  /**
   * values is an array of string values.
   */
  values?: string[];
}

/**
 * Container port definition.
 */
export interface ContainerPort {
  /**
   * If specified, this must be an IANA_SVC_NAME and unique within the pod.
   */
  name?: string;

  /**
   * Number of port to expose on the pod's IP address.
   */
  containerPort: number;

  /**
   * Protocol for port. Must be UDP, TCP, or SCTP.
   */
  protocol?: 'TCP' | 'UDP' | 'SCTP';

  /**
   * Number of port to expose on the host.
   */
  hostPort?: number;

  /**
   * What host IP to bind the external port to.
   */
  hostIP?: string;
}

/**
 * Environment variable definition.
 */
export interface EnvVar {
  /**
   * Name of the environment variable.
   */
  name: string;

  /**
   * Variable references $(VAR_NAME) are expanded using the previous defined environment variables.
   */
  value?: string;

  /**
   * Source for the environment variable's value.
   */
  valueFrom?: EnvVarSource;
}

/**
 * EnvVarSource represents a source for the value of an EnvVar.
 */
export interface EnvVarSource {
  /**
   * Selects a field of the pod.
   */
  fieldRef?: ObjectFieldSelector;

  /**
   * Selects a resource of the container.
   */
  resourceFieldRef?: ResourceFieldSelector;

  /**
   * Selects a key of a ConfigMap.
   */
  configMapKeyRef?: ConfigMapKeySelector;

  /**
   * Selects a key of a secret in the pod's namespace.
   */
  secretKeyRef?: SecretKeySelector;
}

/**
 * ObjectFieldSelector selects an APIVersioned field of an object.
 */
export interface ObjectFieldSelector {
  /**
   * Version of the schema the FieldPath is written in terms of.
   */
  apiVersion?: string;

  /**
   * Path of the field to select in the specified API version.
   */
  fieldPath: string;
}

/**
 * ResourceFieldSelector represents container resources.
 */
export interface ResourceFieldSelector {
  /**
   * Container name: required for volumes, optional for env vars.
   */
  containerName?: string;

  /**
   * Required: resource to select.
   */
  resource: string;

  /**
   * Specifies the output format of the exposed resources.
   */
  divisor?: string;
}

/**
 * ConfigMapKeySelector selects a key from a ConfigMap.
 */
export interface ConfigMapKeySelector {
  /**
   * Name of the referent.
   */
  name?: string;

  /**
   * The key to select.
   */
  key: string;

  /**
   * Specify whether the ConfigMap or its key must be defined.
   */
  optional?: boolean;
}

/**
 * SecretKeySelector selects a key from a Secret.
 */
export interface SecretKeySelector {
  /**
   * Name of the referent.
   */
  name?: string;

  /**
   * The key of the secret to select from.
   */
  key: string;

  /**
   * Specify whether the Secret or its key must be defined.
   */
  optional?: boolean;
}

/**
 * ResourceRequirements describes the compute resource requirements.
 */
export interface ResourceRequirements {
  /**
   * Limits describes the maximum amount of compute resources allowed.
   */
  limits?: { [key: string]: string };

  /**
   * Requests describes the minimum amount of compute resources required.
   */
  requests?: { [key: string]: string };
}

/**
 * Container definition.
 */
export interface Container {
  /**
   * Name of the container specified as a DNS_LABEL.
   */
  name: string;

  /**
   * Docker image name.
   */
  image: string;

  /**
   * Entrypoint array.
   */
  command?: string[];

  /**
   * Arguments to the entrypoint.
   */
  args?: string[];

  /**
   * Container's working directory.
   */
  workingDir?: string;

  /**
   * List of ports to expose from the container.
   */
  ports?: ContainerPort[];

  /**
   * List of environment variables to set in the container.
   */
  env?: EnvVar[];

  /**
   * Compute Resources required by this container.
   */
  resources?: ResourceRequirements;

  /**
   * Pod volumes to mount into the container's filesystem.
   */
  volumeMounts?: VolumeMount[];

  /**
   * Image pull policy.
   */
  imagePullPolicy?: 'Always' | 'Never' | 'IfNotPresent';

  /**
   * Periodic probe of container liveness.
   */
  livenessProbe?: Probe;

  /**
   * Periodic probe of container service readiness.
   */
  readinessProbe?: Probe;

  /**
   * StartupProbe indicates that the Pod has successfully initialized.
   */
  startupProbe?: Probe;
}

/**
 * VolumeMount describes a mounting of a Volume within a container.
 */
export interface VolumeMount {
  /**
   * This must match the Name of a Volume.
   */
  name: string;

  /**
   * Path within the container at which the volume should be mounted.
   */
  mountPath: string;

  /**
   * Path within the volume from which the container's volume should be mounted.
   */
  subPath?: string;

  /**
   * Mounted read-only if true, read-write otherwise.
   */
  readOnly?: boolean;
}

/**
 * Service port definition.
 */
export interface ServicePort {
  /**
   * The name of this port within the service.
   */
  name?: string;

  /**
   * The IP protocol for this port.
   */
  protocol?: 'TCP' | 'UDP' | 'SCTP';

  /**
   * The port that will be exposed by this service.
   */
  port: number;

  /**
   * Number or name of the port to access on the pods targeted by the service.
   */
  targetPort?: number | string;

  /**
   * The port on each node on which this service is exposed when type=NodePort or LoadBalancer.
   */
  nodePort?: number;
}

/**
 * PodTemplateSpec describes the data a pod should have when created from a template.
 */
export interface PodTemplateSpec {
  /**
   * Standard object's metadata.
   */
  metadata?: ObjectMeta;

  /**
   * Specification of the desired behavior of the pod.
   */
  spec?: PodSpec;
}

/**
 * PodSpec is a description of a pod.
 */
export interface PodSpec {
  /**
   * List of containers belonging to the pod.
   */
  containers: Container[];

  /**
   * List of initialization containers belonging to the pod.
   */
  initContainers?: Container[];

  /**
   * Restart policy for all containers within the pod.
   */
  restartPolicy?: 'Always' | 'OnFailure' | 'Never';

  /**
   * Optional duration in seconds the pod needs to terminate gracefully.
   */
  terminationGracePeriodSeconds?: number;

  /**
   * Optional duration in seconds the pod may be active on the node.
   */
  activeDeadlineSeconds?: number;

  /**
   * Set DNS policy for the pod.
   */
  dnsPolicy?: 'ClusterFirst' | 'ClusterFirstWithHostNet' | 'Default' | 'None';

  /**
   * NodeSelector is a selector which must be true for the pod to fit on a node.
   */
  nodeSelector?: { [key: string]: string };

  /**
   * ServiceAccount is the name of the ServiceAccount to use to run this pod.
   */
  serviceAccountName?: string;

  /**
   * List of volumes that can be mounted by containers belonging to the pod.
   */
  volumes?: Volume[];

  /**
   * ImagePullSecrets is an optional list of references to secrets in the same namespace.
   */
  imagePullSecrets?: LocalObjectReference[];
}

/**
 * Volume represents a named volume in a pod.
 */
export interface Volume {
  /**
   * Volume's name.
   */
  name: string;

  /**
   * ConfigMap represents a configMap that should populate this volume.
   */
  configMap?: ConfigMapVolumeSource;

  /**
   * Secret represents a secret that should populate this volume.
   */
  secret?: SecretVolumeSource;

  /**
   * EmptyDir represents a temporary directory that shares a pod's lifetime.
   */
  emptyDir?: EmptyDirVolumeSource;

  /**
   * HostPath represents a pre-existing file or directory on the host machine.
   */
  hostPath?: HostPathVolumeSource;

  /**
   * PersistentVolumeClaim represents a reference to a PersistentVolumeClaim in the same namespace.
   */
  persistentVolumeClaim?: PersistentVolumeClaimVolumeSource;
}

/**
 * Probe describes a health check to be performed against a container.
 */
export interface Probe {
  /**
   * The action taken to determine the health of a container.
   */
  exec?: ExecAction;

  /**
   * HTTPGet specifies the http request to perform.
   */
  httpGet?: HTTPGetAction;

  /**
   * TCPSocket specifies an action involving a TCP port.
   */
  tcpSocket?: TCPSocketAction;

  /**
   * Number of seconds after the container has started before liveness probes are initiated.
   */
  initialDelaySeconds?: number;

  /**
   * Number of seconds after which the probe times out.
   */
  timeoutSeconds?: number;

  /**
   * How often (in seconds) to perform the probe.
   */
  periodSeconds?: number;

  /**
   * Minimum consecutive successes for the probe to be considered successful after having failed.
   */
  successThreshold?: number;

  /**
   * Minimum consecutive failures for the probe to be considered failed after having succeeded.
   */
  failureThreshold?: number;
}

/**
 * ExecAction describes a "run in container" action.
 */
export interface ExecAction {
  /**
   * Command is the command line to execute inside the container.
   */
  command?: string[];
}

/**
 * HTTPGetAction describes an action based on HTTP Get requests.
 */
export interface HTTPGetAction {
  /**
   * Path to access on the HTTP server.
   */
  path?: string;

  /**
   * Name or number of the port to access on the container.
   */
  port: number | string;

  /**
   * Host name to connect to, defaults to the pod IP.
   */
  host?: string;

  /**
   * Scheme to use for connecting to the host.
   */
  scheme?: 'HTTP' | 'HTTPS';

  /**
   * Custom headers to set in the request.
   */
  httpHeaders?: HTTPHeader[];
}

/**
 * HTTPHeader describes a custom header to be used in HTTP probes.
 */
export interface HTTPHeader {
  /**
   * The header field name.
   */
  name: string;

  /**
   * The header field value.
   */
  value: string;
}

/**
 * TCPSocketAction describes an action based on opening a socket.
 */
export interface TCPSocketAction {
  /**
   * Number or name of the port to access on the container.
   */
  port: number | string;

  /**
   * Optional: Host name to connect to, defaults to the pod IP.
   */
  host?: string;
}

/**
 * PersistentVolumeClaimVolumeSource represents a reference to a PersistentVolumeClaim in the same namespace.
 */
export interface PersistentVolumeClaimVolumeSource {
  /**
   * ClaimName is the name of a PersistentVolumeClaim in the same namespace as the pod using this volume.
   */
  claimName: string;

  /**
   * Will force the ReadOnly setting in VolumeMounts.
   */
  readOnly?: boolean;
}

/**
 * ConfigMapVolumeSource represents a configMap that should populate this volume.
 */
export interface ConfigMapVolumeSource {
  /**
   * Name of the referent.
   */
  name?: string;

  /**
   * Optional: mode bits to use on created files by default.
   */
  defaultMode?: number;

  /**
   * If unspecified, each key-value pair in the Data field of the referenced ConfigMap will be projected.
   */
  items?: KeyToPath[];

  /**
   * Specify whether the ConfigMap or its keys must be defined.
   */
  optional?: boolean;
}

/**
 * SecretVolumeSource represents a Secret that should populate this volume.
 */
export interface SecretVolumeSource {
  /**
   * Name of the secret in the pod's namespace to use.
   */
  secretName?: string;

  /**
   * Optional: mode bits to use on created files by default.
   */
  defaultMode?: number;

  /**
   * If unspecified, each key-value pair in the Data field of the referenced Secret will be projected.
   */
  items?: KeyToPath[];

  /**
   * Specify whether the Secret or its keys must be defined.
   */
  optional?: boolean;
}

/**
 * EmptyDirVolumeSource represents a temporary directory that shares a pod's lifetime.
 */
export interface EmptyDirVolumeSource {
  /**
   * What type of storage medium should back this directory.
   */
  medium?: 'Memory' | '';

  /**
   * Total amount of local storage required for this EmptyDir volume.
   */
  sizeLimit?: string;
}

/**
 * HostPathVolumeSource represents a pre-existing file or directory on the host machine.
 */
export interface HostPathVolumeSource {
  /**
   * Path of the directory on the host.
   */
  path: string;

  /**
   * Type for HostPath Volume.
   */
  type?: 'DirectoryOrCreate' | 'Directory' | 'FileOrCreate' | 'File' | 'Socket' | 'CharDevice' | 'BlockDevice';
}

/**
 * KeyToPath maps a string key to a path within a volume.
 */
export interface KeyToPath {
  /**
   * The key to project.
   */
  key: string;

  /**
   * The relative path of the file to map the key to.
   */
  path: string;

  /**
   * Optional: mode bits to use on this file.
   */
  mode?: number;
}

/**
 * LocalObjectReference contains enough information to let you locate the referenced object inside the same namespace.
 */
export interface LocalObjectReference {
  /**
   * Name of the referent.
   */
  name?: string;
}

/**
 * DeploymentSpec is the specification of the desired behavior of the Deployment.
 */
export interface DeploymentSpec {
  /**
   * Number of desired pods.
   */
  replicas?: number;

  /**
   * Label selector for pods.
   */
  selector: LabelSelector;

  /**
   * Template describes the pods that will be created.
   */
  template: PodTemplateSpec;

  /**
   * The deployment strategy to use to replace existing pods with new ones.
   */
  strategy?: DeploymentStrategy;

  /**
   * Minimum number of seconds for which a newly created pod should be ready.
   */
  minReadySeconds?: number;

  /**
   * The number of old ReplicaSets to retain to allow rollback.
   */
  revisionHistoryLimit?: number;

  /**
   * Indicates that the deployment is paused.
   */
  paused?: boolean;

  /**
   * The maximum time in seconds for a deployment to make progress.
   */
  progressDeadlineSeconds?: number;
}

/**
 * DeploymentStrategy describes how to replace existing pods with new ones.
 */
export interface DeploymentStrategy {
  /**
   * Type of deployment.
   */
  type?: 'Recreate' | 'RollingUpdate';

  /**
   * Rolling update config params.
   */
  rollingUpdate?: RollingUpdateDeployment;
}

/**
 * RollingUpdateDeployment is the spec to control the desired behavior of rolling update.
 */
export interface RollingUpdateDeployment {
  /**
   * The maximum number of pods that can be unavailable during the update.
   */
  maxUnavailable?: number | string;

  /**
   * The maximum number of pods that can be created above the desired number of pods.
   */
  maxSurge?: number | string;
}

/**
 * ServiceSpec describes the attributes that a user creates on a service.
 */
export interface ServiceSpec {
  /**
   * The list of ports that are exposed by this service.
   */
  ports?: ServicePort[];

  /**
   * Route service traffic to pods with label keys and values matching this selector.
   */
  selector?: { [key: string]: string };

  /**
   * clusterIP is the IP address of the service.
   */
  clusterIP?: string;

  /**
   * type determines how the Service is exposed.
   */
  type?: 'ExternalName' | 'ClusterIP' | 'NodePort' | 'LoadBalancer';

  /**
   * externalIPs is a list of IP addresses for which nodes in the cluster will also accept traffic.
   */
  externalIPs?: string[];

  /**
   * Supports "ClientIP" and "None".
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
   * healthCheckNodePort specifies the healthcheck nodePort for the service.
   */
  healthCheckNodePort?: number;

  /**
   * publishNotReadyAddresses indicates that any agent which deals with endpoints for this Service should disregard any indications of ready/not-ready.
   */
  publishNotReadyAddresses?: boolean;

  /**
   * sessionAffinityConfig contains the configurations of session affinity.
   */
  sessionAffinityConfig?: SessionAffinityConfig;
}

/**
 * SessionAffinityConfig represents the configurations of session affinity.
 */
export interface SessionAffinityConfig {
  /**
   * clientIP contains the configurations of Client IP based session affinity.
   */
  clientIP?: ClientIPConfig;
}

/**
 * ClientIPConfig represents the configurations of Client IP based session affinity.
 */
export interface ClientIPConfig {
  /**
   * timeoutSeconds specifies the seconds of ClientIP type session sticky time.
   */
  timeoutSeconds?: number;
}

/**
 * ConfigMapSpec defines the desired state of ConfigMap.
 */
export interface ConfigMapSpec {
  /**
   * Data contains the configuration data.
   */
  data?: { [key: string]: string };

  /**
   * BinaryData contains the binary data.
   */
  binaryData?: { [key: string]: string };

  /**
   * Immutable, if set to true, ensures that data stored in the ConfigMap cannot be updated.
   */
  immutable?: boolean;
}

/**
 * Complete Deployment manifest interface.
 */
export interface V1Deployment extends KubernetesManifest {
  apiVersion: 'apps/v1';
  kind: 'Deployment';
  spec?: DeploymentSpec;
}

/**
 * Complete Service manifest interface.
 */
export interface V1Service extends KubernetesManifest {
  apiVersion: 'v1';
  kind: 'Service';
  spec?: ServiceSpec;
}

/**
 * Complete ConfigMap manifest interface.
 */
export interface V1ConfigMap extends KubernetesManifest {
  apiVersion: 'v1';
  kind: 'ConfigMap';
  data?: { [key: string]: string };
  binaryData?: { [key: string]: string };
  immutable?: boolean;
}