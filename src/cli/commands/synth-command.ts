/**
 * Synth command for YAML generation.
 */

import { Argv, ArgumentsCamelCase } from 'yargs';
import { BaseCommand } from './base-command';
import * as fs from 'fs';
import * as path from 'path';
import { App } from '../../core/app';

interface SynthArgs {
  app?: string;
  output?: string;
  quiet?: boolean;
}

/**
 * Command to synthesize Kubernetes YAML from TypeScript code.
 */
export class SynthCommand extends BaseCommand {
  public readonly name = 'synth';
  public readonly description = 'Synthesize Kubernetes YAML from TypeScript code';

  public configure(yargs: Argv): Argv {
    return yargs
      .option('app', {
        alias: 'a',
        type: 'string',
        default: './src/app.ts',
        description: 'Path to the app file',
      })
      .option('output', {
        alias: 'o',
        type: 'string',
        default: 'dist',
        description: 'Output directory for generated YAML files',
      })
      .option('quiet', {
        alias: 'q',
        type: 'boolean',
        default: false,
        description: 'Suppress output messages',
      })
      .example('$0 synth', 'Synthesize using default app.ts')
      .example('$0 synth --app my-app.ts', 'Synthesize using custom app file')
      .example('$0 synth --output ./k8s', 'Output to custom directory');
  }

  public async execute(args: ArgumentsCamelCase<SynthArgs>): Promise<void> {
    const appFile = args.app || 'app.ts';
    const outputDir = args.output || 'dist';
    
    if (!args.quiet) {
      this.logInfo('Synthesizing Kubernetes YAML...');
    }
    
    try {
      // Load and execute the user's app
      const app = await this.loadApp(appFile);
      
      // Synthesize the app to generate manifests
      const assembly = app.synth(outputDir);
      
      // Write the assembly to the output directory
      await assembly.writeToDirectory();
      
      if (!args.quiet) {
        this.logSuccess(`Synthesis completed successfully!`);
        this.logInfo(`Generated ${assembly.resourceCount} resources across ${assembly.stacks.length} stack(s)`);
        this.logInfo(`Output written to: ${assembly.directory}`);
        
        // List generated files
        for (const stack of assembly.stacks) {
          this.logInfo(`  - ${stack.stackName}.yaml (${stack.manifests.length} resources)`);
        }
      }
      
    } catch (error) {
      this.logError(`Synthesis failed: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  /**
   * Loads and executes the user's app file.
   * @param appFile Path to the app file
   * @returns The loaded App instance
   */
  private async loadApp(appFile: string): Promise<App> {
    // Resolve the app file path
    const appPath = path.resolve(appFile);
    
    // Check if the app file exists
    if (!fs.existsSync(appPath)) {
      throw new Error(`App file not found: ${appPath}`);
    }
    
    // Check if we need to look for compiled JavaScript instead
    let moduleToLoad = appPath;
    const isTypeScript = appPath.endsWith('.ts');
    
    if (isTypeScript) {
      // For TypeScript files, look for the compiled JavaScript version
      // Transform src/app.ts -> lib/app.js
      const relativePath = path.relative(process.cwd(), appPath);
      const jsPath = relativePath.replace(/\.ts$/, '.js').replace(/^src\//, 'lib/');
      const absoluteJsPath = path.resolve(jsPath);
      
      if (fs.existsSync(absoluteJsPath)) {
        moduleToLoad = absoluteJsPath;
      } else {
        throw new Error(
          `TypeScript app file found but compiled JavaScript not found at ${absoluteJsPath}. ` +
          'Please run "npm run build" first to compile your TypeScript code.'
        );
      }
    }
    
    try {
      // Clear the require cache to ensure fresh load
      delete require.cache[require.resolve(moduleToLoad)];
      
      // Load the module
      const appModule = require(moduleToLoad);
      
      // Find the App instance in the module
      const app = this.findAppInstance(appModule);
      
      if (!app) {
        throw new Error(
          `No App instance found in ${appFile}. ` +
          'Make sure your app file creates and exports an App instance or makes it available globally.'
        );
      }
      
      return app;
      
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot find module')) {
        throw new Error(
          `Failed to load app file: ${moduleToLoad}. ` +
          'Make sure the file exists and all dependencies are installed.'
        );
      }
      throw error;
    }
  }

  /**
   * Finds an App instance in the loaded module.
   * @param appModule The loaded module
   * @returns The App instance if found
   */
  private findAppInstance(appModule: any): App | undefined {
    // Check if the module exports an App directly
    if (appModule instanceof App) {
      return appModule;
    }
    
    // Check if the module has an 'app' export
    if (appModule.app instanceof App) {
      return appModule.app;
    }
    
    // Check if the module has a default export that's an App
    if (appModule.default instanceof App) {
      return appModule.default;
    }
    
    // Look for any exported App instance
    for (const key of Object.keys(appModule)) {
      if (appModule[key] instanceof App) {
        return appModule[key];
      }
    }
    
    // Check global scope for App instances (for side-effect modules)
    // This handles cases where the app file just creates an App but doesn't export it
    if (typeof global !== 'undefined' && (global as any).__k8sCdkApp instanceof App) {
      return (global as any).__k8sCdkApp;
    }
    
    return undefined;
  }
}