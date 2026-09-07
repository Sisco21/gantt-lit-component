import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    lib: {
      entry: resolve(__dirname, 'src/gantt-chart.ts'),
      fileName: () => 'gantt-chart.js',
      formats: ['es'],
    },
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 3000,
  },
});
