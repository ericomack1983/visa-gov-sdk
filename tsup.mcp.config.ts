import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['mcp/index.ts', 'mcp/test-tools.ts', 'mcp/test-guardrails.ts'],
  format: ['esm'],
  outDir: 'mcp/dist',
  splitting: false,
  bundle: true,
  target: 'node20',
  external: ['@modelcontextprotocol/sdk'],
  outExtension: () => ({ js: '.js' }),
});
