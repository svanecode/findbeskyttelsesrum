#!/bin/bash
# Script to apply migrations using Supabase CLI or psql
# Usage: ./scripts/apply-migrations.sh

set -e

echo "🚀 Applying Supabase migrations..."
echo ""

# Check if Supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found"
    echo "   Install: https://supabase.com/docs/guides/cli"
    exit 1
fi

# Migration files in order
MIGRATIONS=(
    "supabase/migrations/001_create_excluded_shelters.sql"
    "supabase/migrations/002_create_spatial_index.sql"
    "supabase/migrations/003_create_get_nearby_shelters_v3.sql"
    "supabase/migrations/004_helper_functions.sql"
)

# Try using Supabase CLI first (if linked to project)
if supabase status &> /dev/null; then
    echo "✅ Supabase project linked"
    echo "📋 Applying migrations via Supabase CLI..."
    
    for migration in "${MIGRATIONS[@]}"; do
        if [ -f "$migration" ]; then
            echo "   ⏳ Running: $(basename $migration)..."
            supabase db execute --file "$migration" || {
                echo "   ⚠️  Error or already exists: $(basename $migration)"
            }
        else
            echo "   ❌ File not found: $migration"
        fi
    done
    
    echo ""
    echo "✅ Migrations completed via Supabase CLI"
    exit 0
fi

# Fallback: Use DATABASE_URL with psql
if [ -n "$DATABASE_URL" ] || [ -n "$DIRECT_URL" ]; then
    DB_URL="${DATABASE_URL:-$DIRECT_URL}"
    echo "✅ Found DATABASE_URL"
    echo "📋 Applying migrations via psql..."
    
    for migration in "${MIGRATIONS[@]}"; do
        if [ -f "$migration" ]; then
            echo "   ⏳ Running: $(basename $migration)..."
            psql "$DB_URL" -f "$migration" 2>&1 | grep -v "already exists" || true
        else
            echo "   ❌ File not found: $migration"
        fi
    done
    
    echo ""
    echo "✅ Migrations completed via psql"
    exit 0
fi

# No connection method found
echo "❌ No connection method found"
echo ""
echo "Options:"
echo "  1. Link Supabase project: supabase link --project-ref <your-project-ref>"
echo "  2. Set DATABASE_URL environment variable"
echo "  3. Run SQL files manually in Supabase Dashboard SQL Editor"
echo ""
echo "Migration files are ready at:"
for migration in "${MIGRATIONS[@]}"; do
    echo "   - $migration"
done

exit 1
