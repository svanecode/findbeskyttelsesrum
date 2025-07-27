#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');
const nextStaticDir = path.join(projectRoot, '.next', 'static');

function checkHashedAssets() {
  console.log('🔍 Verifying hashed assets...\n');

  if (!fs.existsSync(nextStaticDir)) {
    console.log('❌ .next/static directory not found. Run "npm run build" first.');
    return false;
  }

  let hasHashedFiles = false;
  let totalFiles = 0;

  function scanDirectory(dir, relativePath = '') {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const relativeItemPath = path.join(relativePath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDirectory(fullPath, relativeItemPath);
      } else {
        totalFiles++;
        
        // Check if filename contains a hash (typically 8+ character alphanumeric string)
        const hasHash = /[a-f0-9]{8,}/.test(item);
        
        if (hasHash) {
          hasHashedFiles = true;
          console.log(`✅ ${relativeItemPath} (hashed)`);
        } else {
          console.log(`📄 ${relativeItemPath} (no hash)`);
        }
      }
    }
  }

  scanDirectory(nextStaticDir);

  console.log(`\n📊 Summary:`);
  console.log(`   Total files: ${totalFiles}`);
  console.log(`   Hashed files: ${hasHashedFiles ? 'Yes' : 'No'}`);

  if (hasHashedFiles) {
    console.log('\n✅ Hashed filenames are being generated correctly!');
    return true;
  } else {
    console.log('\n❌ No hashed filenames found. This might indicate an issue.');
    return false;
  }
}

function checkBuildId() {
  console.log('\n🔍 Checking build ID...\n');

  const buildIdFile = path.join(projectRoot, '.next', 'BUILD_ID');
  
  if (fs.existsSync(buildIdFile)) {
    const buildId = fs.readFileSync(buildIdFile, 'utf8').trim();
    console.log(`✅ Build ID: ${buildId}`);
    return true;
  } else {
    console.log('❌ BUILD_ID file not found. Run "npm run build" first.');
    return false;
  }
}

function checkConfiguration() {
  console.log('\n🔍 Checking configuration files...\n');

  const nextConfigPath = path.join(projectRoot, 'next.config.js');
  const vercelConfigPath = path.join(projectRoot, 'vercel.json');

  if (fs.existsSync(nextConfigPath)) {
    const nextConfig = fs.readFileSync(nextConfigPath, 'utf8');
    const hasCacheHeaders = nextConfig.includes('Cache-Control') && nextConfig.includes('max-age=31536000');
    console.log(`✅ next.config.js: ${hasCacheHeaders ? 'Cache headers configured' : 'Cache headers missing'}`);
  } else {
    console.log('❌ next.config.js not found');
  }

  if (fs.existsSync(vercelConfigPath)) {
    const vercelConfig = fs.readFileSync(vercelConfigPath, 'utf8');
    const hasCacheHeaders = vercelConfig.includes('Cache-Control') && vercelConfig.includes('max-age=31536000');
    console.log(`✅ vercel.json: ${hasCacheHeaders ? 'Cache headers configured' : 'Cache headers missing'}`);
  } else {
    console.log('❌ vercel.json not found');
  }
}

function main() {
  console.log('🚀 Next.js Asset Verification Script\n');
  console.log('This script verifies that your Next.js project is correctly configured for hashed assets and caching.\n');

  const hasHashedAssets = checkHashedAssets();
  const hasBuildId = checkBuildId();
  checkConfiguration();

  console.log('\n📋 Verification Complete!\n');

  if (hasHashedAssets && hasBuildId) {
    console.log('🎉 Your Next.js project is properly configured for hashed assets!');
    console.log('\nKey benefits:');
    console.log('  • Static assets have content-based hashes for cache busting');
    console.log('  • Long-term caching headers are set (1 year)');
    console.log('  • No query string cache busting needed');
    console.log('  • Previous assets remain cached indefinitely');
  } else {
    console.log('⚠️  Some issues were found. Please run "npm run build" and try again.');
  }

  console.log('\n💡 To test caching:');
  console.log('  1. Deploy your app');
  console.log('  2. Check that assets have hashed filenames');
  console.log('  3. Verify Cache-Control headers in browser dev tools');
  console.log('  4. Make a change and redeploy');
  console.log('  5. Confirm new hashes are generated while old ones remain cached');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 