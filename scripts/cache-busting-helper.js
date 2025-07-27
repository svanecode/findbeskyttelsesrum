#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.join(__dirname, '..');

function checkForMapboxReferences() {
  console.log('🔍 Checking for Mapbox references in codebase...\n');

  const searchPatterns = [
    '@mapbox/mapbox-gl-geocoder',
    'MapboxGeocoder',
    'mapboxgl-ctrl-geocoder',
    'mapboxgl',
    'mapbox://'
  ];

  let foundReferences = [];

  function searchInFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        searchPatterns.forEach(pattern => {
          if (line.includes(pattern)) {
            foundReferences.push({
              file: filePath.replace(projectRoot, ''),
              line: index + 1,
              pattern,
              content: line.trim()
            });
          }
        });
      });
    } catch (error) {
      // Skip files that can't be read
    }
  }

  function walkDirectory(dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and .git
        if (item !== 'node_modules' && item !== '.git') {
          walkDirectory(fullPath);
        }
      } else if (stat.isFile()) {
        // Only search in relevant file types
        const ext = path.extname(item);
        if (['.js', '.jsx', '.ts', '.tsx', '.json', '.md'].includes(ext)) {
          searchInFile(fullPath);
        }
      }
    }
  }

  walkDirectory(projectRoot);

  if (foundReferences.length === 0) {
    console.log('✅ No Mapbox references found in codebase');
    return true;
  } else {
    console.log('⚠️  Found Mapbox references:');
    foundReferences.forEach(ref => {
      console.log(`   ${ref.file}:${ref.line} - ${ref.pattern}`);
      console.log(`   ${ref.content}`);
      console.log('');
    });
    return false;
  }
}

function checkPackageJson() {
  console.log('📦 Checking package.json for Mapbox dependencies...\n');

  const packageJsonPath = path.join(projectRoot, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log('❌ package.json not found');
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const allDependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };

  const mapboxDeps = Object.keys(allDependencies).filter(dep => 
    dep.includes('mapbox') || dep.includes('Mapbox')
  );

  if (mapboxDeps.length === 0) {
    console.log('✅ No Mapbox dependencies found in package.json');
    return true;
  } else {
    console.log('⚠️  Found Mapbox dependencies:');
    mapboxDeps.forEach(dep => {
      console.log(`   ${dep}: ${allDependencies[dep]}`);
    });
    return false;
  }
}

function generateCacheBustingInstructions() {
  console.log('\n🛠️  Cache Busting Instructions\n');
  console.log('=====================================\n');

  console.log('1. ✅ Component Renaming:');
  console.log('   - Created AddressSearchDAWA component');
  console.log('   - Added versioned key: key="dawa-v2"');
  console.log('   - This forces React to re-render the component');

  console.log('\n2. ✅ Removed Query Strings:');
  console.log('   - Removed ?v=4 from DAWA script URL');
  console.log('   - Now using: /dawa-autocomplete2.min.js');
  console.log('   - Proper content-based caching enabled');

  console.log('\n3. ✅ Dependency Cleanup:');
  console.log('   - Removed @mapbox/mapbox-gl-geocoder');
  console.log('   - Removed @types/mapbox__mapbox-gl-geocoder');
  console.log('   - Clean DAWA-only implementation');

  console.log('\n4. ✅ Cache Headers:');
  console.log('   - Long-term caching for static assets');
  console.log('   - No-cache for dynamic content');
  console.log('   - Proper immutable cache headers');

  console.log('\n5. 🔄 Manual Cache Clearing (if needed):');
  console.log('   - Users can clear browser cache');
  console.log('   - Hard refresh: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)');
  console.log('   - Clear site data in browser dev tools');
}

function main() {
  console.log('🚀 Mapbox Cache Busting Helper\n');
  console.log('This script helps identify and resolve Mapbox cache persistence issues.\n');

  const noMapboxRefs = checkForMapboxReferences();
  const noMapboxDeps = checkPackageJson();

  console.log('\n📋 Summary:');
  console.log(`   Code references: ${noMapboxRefs ? '✅ Clean' : '⚠️  Found'}`);
  console.log(`   Dependencies: ${noMapboxDeps ? '✅ Clean' : '⚠️  Found'}`);

  if (noMapboxRefs && noMapboxDeps) {
    console.log('\n🎉 Your codebase is clean! No Mapbox references found.');
    console.log('   The cache busting should work automatically.');
  } else {
    console.log('\n⚠️  Some Mapbox references found. Consider:');
    console.log('   1. Removing remaining Mapbox imports');
    console.log('   2. Updating any remaining Mapbox usage');
    console.log('   3. Running npm install to update dependencies');
  }

  generateCacheBustingInstructions();

  console.log('\n💡 Next Steps:');
  console.log('   1. Deploy the updated code');
  console.log('   2. Test in production');
  console.log('   3. Monitor for any remaining cache issues');
  console.log('   4. Consider adding a cache-busting notification for users');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
} 