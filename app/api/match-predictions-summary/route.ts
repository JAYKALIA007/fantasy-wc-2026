import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const matchIdParam = searchParams.get("match_id");

  if (!matchIdParam) {
    return Response.json({ error: "match_id is required" }, { status: 400 });
  }

  const matchId = parseInt(matchIdParam, 10);
  if (isNaN(matchId)) {
    return Response.json({ error: "match_id must be a number" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("predictions")
    .select("points")
    .eq("match_id", matchId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const total = rows.length;
  const correct = rows.filter((r) => (r.points ?? 0) > 0).length;
  const exact = rows.filter((r) => (r.points ?? 0) >= 3).length;

  return Response.json({ total, correct, exact });
}
