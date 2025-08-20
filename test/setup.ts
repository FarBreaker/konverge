import { DependencyTracker } from '../src/core/dependency-tracker';

// Reset the DependencyTracker singleton before each test
beforeEach(() => {
  DependencyTracker.reset();
});