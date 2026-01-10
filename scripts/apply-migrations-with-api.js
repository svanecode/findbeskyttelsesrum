#!/usr/bin/env node
/**
 * Apply migrations using Supabase Management API
 * 
 * This script reads SQL migration files and executes them via Supabase Dashboard API
 * or you can manually run the SQL in Supabase Dashboard SQL Editor
 * 
 * Since Supabase doesn't allow arbitrary SQL execution via the JS client for security,
 * this script provides the SQL to be executed manually or via Supabase CLI
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('   Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('📋 Migration SQL files to execute:\n');

// Read migration files
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');
const files = readdirSync(migrationsDir)
  .filter(file => file.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.error('❌ No migration files found in supabase/migrations/');
  process.exit(1);
}

for (const file of files) {
  const filePath = join(migrationsDir, file);
  const sql = readFileSync(filePath, 'utf8');
  
  console.log(`📄 ${file}:`);
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));
  console.log('');
}

console.log('⚠️  IMPORTANT: The Supabase JS client cannot execute DDL statements (CREATE TABLE, CREATE FUNCTION, etc.)');
console.log('   for security reasons. You need to execute these SQL files using one of these methods:\n');
console.log('   Option 1: Supabase CLI (recommended)');
console.log('   ─────────────────────────────────────');
console.log('   1. Link your project: supabase link --project-ref irafzkpgqxdhsahoddxr');
console.log('   2. Run: supabase db push');
console.log('   3. Or execute SQL files: supabase db execute --file supabase/migrations/XXX.sql\n');
console.log('   Option 2: Supabase Dashboard');
console.log('   ─────────────────────────────');
console.log('   1. Go to: https://supabase.com/dashboard/project/irafzkpgqxdhsahoddxr/sql');
console.log('   2. Copy and paste each SQL file content');
console.log('   3. Run them in order (001, 002, 003, 004)\n');
console.log('   Option 3: Direct Database Connection');
console.log('   ────────────────────────────────────');
console.log('   If you have DATABASE_URL (direct connection):');
console.log('   Run: node scripts/run-migrations.js');
console.log('   (requires: npm install pg)\n');

// Test if we can query to verify connection
console.log('🔍 Testing Supabase connection...');
const supabase = createClient(supabaseUrl, supabaseAnonKey);

try {
  // Try a simple query to verify connection
  const { data, error } = await supabase
    .from('sheltersv2')
    .select('id')
    .limit(1);
  
  if (error) {
    console.log(`   ⚠️  Connection test failed: ${error.message}`);
    console.log('   But this is okay - migrations still need to be run via CLI or Dashboard\n');
  } else {
    console.log('   ✅ Connection successful!');
    console.log('   Database is accessible, but DDL requires CLI or Dashboard\n');
  }
} catch (error) {
  console.log(`   ⚠️  Connection test error: ${error.message}\n`);
}

console.log('📝 All SQL migration files are ready in: supabase/migrations/');
console.log('   Execute them using one of the methods above.\n');
