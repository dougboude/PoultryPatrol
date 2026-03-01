import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public', // Will copy everything from public/ to dist/
  base: './',
  build: {
    target: 'es2015',
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'game.js',
        chunkFileNames: 'game.js',
        assetFileNames: '[name].[ext]'
      }
    },
    modulePreload: false,
  }
});
