#!/usr/bin/env node
/**
 * Migration runner for Supabase database
 * 
 * This script runs SQL migrations in order.
 * 
 * Usage:
 *   node scripts/run-migrations.js
 * 
 * Requires:
 *   - DATABASE_URL or DIRECT_URL environment variable (for direct PostgreSQL connection)
 *   - OR use Supabase CLI: supabase db push
 * 
 * Install pg if needed:
 *   npm install pg
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to use pg (PostgreSQL client) if available
let pg = null;
try {
  pg = await import('pg');
} catch (e) {
  console.error('⚠️  pg package not found.');
  console.error('   Install it: npm install pg');
  console.error('   Or use Supabase CLI: supabase db push');
  console.error('   Or run SQL files manually in Supabase Dashboard SQL Editor');
  process.exit(1);
}

const { Client } = pg.default || pg;

// Get database URL from environment
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DIRECT_URL;

if (!dbUrl) {
  console.error('❌ Missing DATABASE_URL, SUPABASE_DB_URL, or DIRECT_URL environment variable');
  console.error('');
  console.error('Options:');
  console.error('  1. Set DATABASE_URL in .env file:');
  console.error('     DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"');
  console.error('');
  console.error('  2. Or use Supabase CLI:');
  console.error('     supabase db push');
  console.error('');
  console.error('  3. Or run SQL files manually in Supabase Dashboard SQL Editor');
  process.exit(1);
}

async function runMigrations() {
  const client = new Client({
    connectionString: dbUrl,
    ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Read migration files in order
    const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
    let files = [];
    try {
      files = readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort(); // Sort to ensure order (001, 002, 003, 004)
    } catch (e) {
      console.error('❌ Could not read migrations directory:', migrationsDir);
      console.error('   Make sure the supabase/migrations directory exists');
      process.exit(1);
    }

    if (files.length === 0) {
      console.log('⚠️  No migration files found in supabase/migrations/');
      return;
    }

    console.log(`📋 Found ${files.length} migration(s) to run:\n`);

    for (const file of files) {
      const filePath = join(migrationsDir, file);
      const sql = readFileSync(filePath, 'utf8');

      console.log(`⏳ Running: ${file}...`);

      try {
        await client.query(sql);
        console.log(`✅ Completed: ${file}\n`);
      } catch (error) {
        // If it's a "already exists" error, that's okay for migrations with IF NOT EXISTS
        if (error.message.includes('already exists') || error.code === '42P07' || error.code === '42710') {
          console.log(`⚠️  Skipped (already exists): ${file}\n`);
        } else {
          console.error(`❌ Error in ${file}:`);
          console.error(`   ${error.message}\n`);
          throw error;
        }
      }
    }

    console.log('🎉 All migrations completed successfully!');
    
    // Verify the function was created
    console.log('\n🔍 Verifying installation...');
    const result = await client.query(`
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN ('get_nearby_shelters_v3', 'add_excluded_shelter', 'remove_excluded_shelter', 'list_excluded_shelters')
      ORDER BY routine_name;
    `);

    if (result.rows.length > 0) {
      console.log('✅ Functions created:');
      result.rows.forEach(row => {
        console.log(`   - ${row.routine_name}`);
      });
    } else {
      console.log('⚠️  No functions found (this might be okay if there were errors)');
    }

    // Check if excluded_shelters table exists
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'excluded_shelters';
    `);

    if (tableCheck.rows.length > 0) {
      console.log('✅ Table created: excluded_shelters');
    } else {
      console.log('⚠️  Table excluded_shelters not found');
    }

    // Check if spatial index exists
    const indexCheck = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'sheltersv2'
      AND indexname = 'idx_sheltersv2_location_gist';
    `);

    if (indexCheck.rows.length > 0) {
      console.log('✅ Spatial index created: idx_sheltersv2_location_gist');
    } else {
      console.log('⚠️  Spatial index not found (may need to run migration 002)');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run migrations
runMigrations().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
