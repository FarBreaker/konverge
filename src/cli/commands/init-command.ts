/**
 * Init command for project scaffolding.
 */

import { Argv, ArgumentsCamelCase } from 'yargs';
import { BaseCommand } from './base-command';
import * as fs from 'fs';
import * as path from 'path';

interface InitArgs {
  name?: string;
  force?: boolean;
}

/**
 * Command to initialize a new Konverge project.
 */
export class InitCommand extends BaseCommand {
  public readonly name = 'init';
  public readonly description = 'Initialize a new Konverge project';

  public configure(yargs: Argv): Argv {
    return yargs
      .option('name', {
        alias: 'n',
        type: 'string',
        description: 'Project name (defaults to current directory name)',
      })
      .option('force', {
        alias: 'f',
        type: 'boolean',
        default: false,
        description: 'Force initialization even if directory is not empty',
      })
      .example('$0 init', 'Initialize project in current directory')
      .example('$0 init --name my-app', 'Initialize project with specific name')
      .example('$0 init --force', 'Force initialization in non-empty directory');
  }

  public async execute(args: ArgumentsCamelCase<InitArgs>): Promise<void> {
    const projectName = args.name || path.basename(process.cwd());
    const currentDir = process.cwd();
    
    this.logInfo('Initializing Konverge project...');
    this.logInfo(`Project name: ${projectName}`);
    
    // Check if directory is empty (unless force is used)
    if (!args.force && this.isDirectoryNotEmpty(currentDir)) {
      throw new Error(
        'Directory is not empty. Use --force to initialize anyway, or run in an empty directory.'
      );
    }
    
    try {
      // Create project structure
      await this.createProjectStructure(currentDir);
      
      // Generate package.json
      await this.generatePackageJson(currentDir, projectName);
      
      // Generate tsconfig.json
      await this.generateTsConfig(currentDir);
      
      // Generate sample application code
      await this.generateSampleApp(currentDir);
      
      // Generate .gitignore
      await this.generateGitIgnore(currentDir);
      
      this.logSuccess('Project initialized successfully!');
      this.logInfo('');
      this.logInfo('Next steps:');
      this.logInfo('  1. Install dependencies: npm install');
      this.logInfo('  2. Build the project: npm run build');
      this.logInfo('  3. Synthesize YAML: konverge synth');
      
    } catch (error) {
      this.logError(`Failed to initialize project: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  /**
   * Check if directory contains files (excluding hidden files).
   */
  private isDirectoryNotEmpty(dirPath: string): boolean {
    try {
      const files = fs.readdirSync(dirPath);
      // Filter out hidden files and common empty directory indicators
      const visibleFiles = files.filter(file => !file.startsWith('.'));
      return visibleFiles.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Create the basic project directory structure.
   */
  private async createProjectStructure(projectDir: string): Promise<void> {
    const directories = [
      'src',
      'lib',
      'dist'
    ];

    for (const dir of directories) {
      const dirPath = path.join(projectDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        this.logInfo(`Created directory: ${dir}`);
      }
    }
  }

  /**
   * Generate package.json with required dependencies.
   */
  private async generatePackageJson(projectDir: string, projectName: string): Promise<void> {
    const packageJson = {
      name: projectName,
      version: '0.1.4',
      description: 'A Konverge application',
      main: 'lib/app.js',
      scripts: {
        build: 'tsc',
        watch: 'tsc -w',
        synth: 'konverge synth',
        clean: 'rimraf lib dist'
      },
      devDependencies: {
        '@types/node': '^18.15.0',
        'rimraf': '^5.0.0',
        'typescript': '^5.0.0'
      },
      dependencies: {
        'konverge': '^0.1.3'
      }
    };

    const packageJsonPath = path.join(projectDir, 'package.json');
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    this.logInfo('Generated package.json');
  }

  /**
   * Generate TypeScript configuration.
   */
  private async generateTsConfig(projectDir: string): Promise<void> {
    const tsConfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './lib',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        inlineSourceMap: false,
        experimentalDecorators: true,
        emitDecoratorMetadata: true
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'lib', 'dist']
    };

    const tsConfigPath = path.join(projectDir, 'tsconfig.json');
    fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
    this.logInfo('Generated tsconfig.json');
  }

  /**
   * Generate sample application code.
   */
  private async generateSampleApp(projectDir: string): Promise<void> {
    const appContent = `import { App, Stack, Deployment, Service, ConfigMap } from 'konverge';

/**
 * Sample Konverge application demonstrating basic usage.
 */
class MyStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id, {
      namespace: 'default'
    });

    // Create a ConfigMap for application configuration
    const config = new ConfigMap(this, 'app-config', {
      metadata: {
        name: 'my-app-config'
      }
    });
    config.addData('database.host', 'localhost');
    config.addData('database.port', '5432');

    // Create a Deployment for the application
    const deployment = new Deployment(this, 'app-deployment', {
      metadata: {
        name: 'my-app'
      },
      replicas: 3,
      selector: {
        matchLabels: {
          app: 'my-app'
        }
      },
      template: {
        metadata: {
          labels: {
            app: 'my-app'
          }
        },
        spec: {
          containers: [{
            name: 'app',
            image: 'nginx:latest',
            ports: [{
              containerPort: 80
            }]
          }]
        }
      }
    });

    // Create a Service to expose the application
    const service = new Service(this, 'app-service', {
      metadata: {
        name: 'my-app-service'
      },
      selector: {
        app: 'my-app'
      },
      ports: [{
        port: 80,
        targetPort: 80,
        protocol: 'TCP'
      }],
      type: 'ClusterIP'
    });
  }
}

// Create the app and stack
const app = new App();
new MyStack(app, 'MyStack');

// Synthesize the app (this happens automatically when running konverge synth)
`;

    const appPath = path.join(projectDir, 'src', 'app.ts');
    fs.writeFileSync(appPath, appContent);
    this.logInfo('Generated src/app.ts');
  }

  /**
   * Generate .gitignore file.
   */
  private async generateGitIgnore(projectDir: string): Promise<void> {
    const gitIgnoreContent = `# Dependencies
node_modules/

# Build outputs
lib/
dist/

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# Temporary folders
tmp/
temp/
`;

    const gitIgnorePath = path.join(projectDir, '', '.gitignore');



    fs.writeFileSync(gitIgnorePath, gitIgnoreContent);
    this.logInfo('Generated .gitignore');
  }

}