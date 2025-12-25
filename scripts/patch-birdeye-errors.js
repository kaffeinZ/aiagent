#!/usr/bin/env node

/**
 * Patch script to fix Birdeye API 401 error handling in @elizaos/plugin-solana
 * 
 * This script patches the birdeyeFetchWithRetry function to handle 401 errors gracefully
 * instead of throwing errors and retrying multiple times.
 * 
 * Run this script after installing/updating dependencies:
 *   bun run scripts/patch-birdeye-errors.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const pluginPath = join(projectRoot, 'node_modules/@elizaos/plugin-solana/dist/index.js');

try {
  console.log('Reading plugin file...');
  let content = readFileSync(pluginPath, 'utf8');

  // Check if already patched (check for either old or new patch pattern)
  if (content.includes('Check if Birdeye API key is available') || content.includes('Birdeye API key is missing or invalid')) {
    console.log('✓ Plugin is already patched. No changes needed.');
    process.exit(0);
  }

  // Original function pattern
  const originalPattern = /async birdeyeFetchWithRetry\(url, options = \{\}\) \{[\s\S]*?if \(lastError\)\s+throw lastError;\s+\}/;

  // Patched function - skips API calls entirely if no API key is present
  const patchedFunction = `async birdeyeFetchWithRetry(url, options = {}) {
    // Check if Birdeye API key is available - if not, skip API calls entirely
    const apiKey = this.runtime.getSetting("BIRDEYE_API_KEY");
    if (!apiKey || apiKey.trim() === "") {
      // Silently return null - no API calls will be made
      return null;
    }

    let lastError;
    for (let i = 0;i < PROVIDER_CONFIG.MAX_RETRIES; i++) {
      try {
        const response = await globalThis.fetch(url, {
          ...options,
          headers: {
            Accept: "application/json",
            "x-chain": "solana",
            "X-API-KEY": apiKey,
            ...options.headers
          }
        });
        if (!response.ok) {
          const errorText = await response.text();
          // Handle 401 (Unauthorized) errors gracefully - don't retry or throw
          if (response.status === 401) {
            // Only log warning once on first attempt
            if (i === 0) {
              logger5.warn("Birdeye API key is invalid. Price feed features will be unavailable. This is safe to ignore.");
            }
            return null;
          }
          throw new Error(\`HTTP error! status: \${response.status}, message: \${errorText}\`);
        }
        return await response.json();
      } catch (error) {
        // Check if error is a 401 before logging/retrying
        const is401 = error instanceof Error && (error.message.includes("status: 401") || error.message.includes("401"));
        if (is401) {
          // Only log warning once on first attempt
          if (i === 0) {
            logger5.warn("Birdeye API key is invalid. Price feed features will be unavailable. This is safe to ignore.");
          }
          return null;
        }
        logger5.error(\`Attempt \${i + 1} failed: \${error}\`);
        logger5.error({ error }, \`Attempt \${i + 1} failed\`);
        lastError = error;
        if (i < PROVIDER_CONFIG.MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, PROVIDER_CONFIG.RETRY_DELAY * 2 ** i));
        }
      }
    }
    if (lastError)
      throw lastError;
  }`;

  // Apply patch
  if (originalPattern.test(content)) {
    content = content.replace(originalPattern, patchedFunction);
    writeFileSync(pluginPath, content, 'utf8');
    console.log('✓ Successfully patched @elizaos/plugin-solana to skip Birdeye API calls when no API key is present.');
    console.log('  The plugin will now skip API calls entirely if BIRDEYE_API_KEY is not set, preventing 401 errors.');
  } else {
    console.error('✗ Could not find birdeyeFetchWithRetry function. The plugin structure may have changed.');
    console.error('  Please check the plugin version and update this patch script if needed.');
    process.exit(1);
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('✗ Plugin file not found. Make sure @elizaos/plugin-solana is installed:');
    console.error('  bun install');
    process.exit(1);
  }
  console.error('✗ Error applying patch:', error.message);
  process.exit(1);
}
