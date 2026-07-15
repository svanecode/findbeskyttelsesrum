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

# Supabase CLI records migration history and is the preferred safe path.
if [ -f "supabase/.temp/project-ref" ]; then
    echo "📋 Applying all pending migrations via Supabase CLI..."
    supabase db push
    echo "✅ Pending migrations applied"
    exit 0
fi

# Direct database URL fallback, still using Supabase migration history.
if [ -n "$DATABASE_URL" ] || [ -n "$DIRECT_URL" ]; then
    DB_URL="${DATABASE_URL:-$DIRECT_URL}"
    echo "✅ Found DATABASE_URL"
    echo "📋 Applying all pending migrations via Supabase CLI..."
    supabase db push --db-url "$DB_URL"
    echo "✅ Pending migrations applied"
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
echo "Migration files are ready in supabase/migrations/."

exit 1
