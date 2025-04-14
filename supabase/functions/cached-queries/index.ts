import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RequestBody {
  table: string;
  query: string;
  params?: Record<string, unknown>;
  filters?: Array<{
    column: string;
    operator: "eq" | "gt" | "lt" | "gte" | "lte" | "like" | "ilike" | "is";
    value: unknown;
  }>;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    // Get the query parameters
    const { table, query, params, filters } = (await req.json()) as RequestBody;

    console.log("Received query:", { table, query, params, filters });

    // Set cache control headers
    const cacheControl = {
      "Cache-Control": "public, max-age=2592000", // Cache for 30 days
      "Content-Type": "application/json",
    };

    // Handle count queries
    if (params?.count) {
      const { count, error } = await supabaseClient
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        console.error("Count query error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        });
      }

      return new Response(JSON.stringify({ data: count }), {
        headers: { ...corsHeaders, ...cacheControl },
      });
    }

    // Build the base query
    let supabaseQuery = supabaseClient.from(table).select(query);

    // Apply filters if they exist
    if (filters?.length) {
      filters.forEach((filter) => {
        // @ts-ignore - Supabase types don't properly handle dynamic filter methods
        supabaseQuery = supabaseQuery[filter.operator](filter.column, filter.value);
      });
    }

    // Apply additional params
    if (params?.single) {
      supabaseQuery = supabaseQuery.single();
    }

    if (params?.limit) {
      supabaseQuery = supabaseQuery.limit(params.limit as number);
    }

    // Execute the query
    const { data, error } = await supabaseQuery;

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    console.log("Query successful, returning data");
    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, ...cacheControl },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Function error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
}); 