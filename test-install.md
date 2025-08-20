# Testing Global Installation

To test the global installation of Konverge:

## 1. Pack the package locally
```bash
npm pack
```

This creates a `.tgz` file that you can install globally.

## 2. Install globally from the packed file
```bash
npm install -g konverge-0.1.0.tgz
```

## 3. Test the CLI
```bash
konverge --help
konverge init --help
```

## 4. Test creating a new project
```bash
mkdir test-project
cd test-project
konverge init --name my-test-app
```

## 5. Uninstall when done testing
```bash
npm uninstall -g konverge
```

## Publishing to NPM

When ready to publish:

1. Make sure you're logged in to NPM:
   ```bash
   npm login
   ```

2. Publish the package:
   ```bash
   npm publish
   ```

3. Users can then install it globally:
   ```bash
   npm install -g konverge
   ```