import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Testes e2e: sobem a API inteira contra o banco *_test (veja test/test-env.ts).
export default defineConfig({
  // SWC compila os decorators do Nest com metadata (o esbuild padrão do Vite não faz isso).
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-env.ts'],
    // Um arquivo por vez: todos usam o mesmo banco de testes.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
