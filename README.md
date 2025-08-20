# Konverge

A TypeScript-based tool for defining Kubernetes infrastructure as code, inspired by AWS CDK.

## Features

- Define Kubernetes resources using TypeScript
- Type-safe configuration with IntelliSense support
- Hierarchical construct model (App → Stack → Resources)
- Custom construct composition
- YAML synthesis for deployment
- CLI tool for project scaffolding

## Installation

Install globally to use the CLI tool:

```bash
npm install -g konverge
```

Or install locally in your project:

```bash
npm install konverge
```

## Quick Start

### Create a new project

```bash
# Create a new directory and initialize a Konverge project
mkdir my-k8s-app
cd my-k8s-app
konverge init

# Install dependencies
npm install

# Build and synthesize
npm run build
konverge synth
```

### Using the library

```typescript
import { App, Stack, Deployment, Service } from 'konverge';

class MyStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id, { namespace: 'default' });

    // Create a Deployment
    new Deployment(this, 'app-deployment', {
      metadata: { name: 'my-app' },
      replicas: 3,
      selector: { matchLabels: { app: 'my-app' } },
      template: {
        metadata: { labels: { app: 'my-app' } },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            ports: [{ containerPort: 80 }]
          }]
        }
      }
    });

    // Create a Service
    new Service(this, 'app-service', {
      metadata: { name: 'my-app-service' },
      selector: { app: 'my-app' },
      ports: [{ port: 80, targetPort: 80 }],
      type: 'ClusterIP'
    });
  }
}

const app = new App();
new MyStack(app, 'MyStack');
```

## CLI Commands

- `konverge init [--name <name>] [--force]` - Initialize a new project
- `konverge synth` - Synthesize Kubernetes YAML from your TypeScript code

## Project Status

This project is currently in development. The core framework has been implemented, with Kubernetes constructs and CLI tools coming in subsequent phases.

## License

MIT