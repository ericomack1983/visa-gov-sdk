import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['mcp/b2b/server.ts'],
  format: ['esm'],
  outDir: 'mcp/b2b/dist',
  splitting: false,
  bundle: true,
  target: 'node20',
  external: ['@modelcontextprotocol/sdk'],
  outExtension: () => ({ js: '.js' }),
});
