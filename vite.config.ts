import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'es2020'
  },
  test: {
    environment: 'node'
  }
} as any);
