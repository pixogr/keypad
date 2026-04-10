// skills — Supabase Edge Function
// Returns employee skills/abilities stored in the app_data table.
//
// GET /functions/v1/skills
//   → { skills, total, employees }
//
// GET /functions/v1/skills?skill=makeCoffee
//   → same shape, employees filtered to those who have the given skill
//
// Valid skill keys: makeCoffee · serve · delivery · openShop · closeShop

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ABILITIES = [
  { key: "makeCoffee", label: "Barista" },
  { key: "serve",      label: "Σερβίρισμα" },
  { key: "delivery",   label: "Delivery" },
  { key: "openShop",   label: "Άνοιγμα" },
  { key: "closeShop",  label: "Κλείσιμο" },
] as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Optional ?skill= filter
  const { searchParams } = new URL(req.url);
  const skillFilter = searchParams.get("skill");

  if (skillFilter !== null && !ABILITIES.some((a) => a.key === skillFilter)) {
    return json(
      {
        error: `Unknown skill: "${skillFilter}". Valid values: ${ABILITIES.map((a) => a.key).join(", ")}`,
      },
      400,
    );
  }

  // Read employees from app_data (store='employees', key='list')
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const { data, error } = await supabase
    .from("app_data")
    .select("value")
    .eq("store", "employees")
    .eq("key", "list")
    .maybeSingle();

  if (error) {
    return json({ error: error.message }, 500);
  }

  // deno-lint-ignore no-explicit-any
  const all: any[] = Array.isArray(data?.value) ? data.value : [];

  const employees = (
    skillFilter ? all.filter((e) => e.abilities?.[skillFilter] === true) : all
  ).map((e) => ({
    id: e.id,
    name: e.name,
    surname: e.surname,
    role: e.role,
    experience: e.experience,
    abilities: e.abilities ?? {},
  }));

  return json({
    ...(skillFilter ? { filter: skillFilter } : {}),
    skills: ABILITIES,
    total: employees.length,
    employees,
  });
});
