import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react({
    jsxRuntime: 'automatic'
  })],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@docmate/shared': resolve(__dirname, '../shared/src'),
    },
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      name: 'DocMateUI',
      formats: ['iife'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        inlineDynamicImports: true,
        format: 'iife',
        name: 'DocMateUI'
      },
    },
    sourcemap: true,
    minify: false, // Keep readable for debugging in VS Code
  },
  define: {
    global: 'globalThis',
    'process.env': {},
    'process.env.NODE_ENV': '"production"',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
    },
  },
})
