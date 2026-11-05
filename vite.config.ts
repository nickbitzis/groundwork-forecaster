/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// One self-contained HTML file: opens from a link or by double-clicking, no server needed.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  test: { environment: 'node', globals: true },
});
