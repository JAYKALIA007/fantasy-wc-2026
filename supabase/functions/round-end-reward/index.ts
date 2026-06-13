import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_CAP = 150.0;
const CAP_REWARD = 5.0;

serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase env vars" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Expect a round_id in the request body
    const body = await req.json() as { round_id?: string };
    const { round_id } = body;

    if (!round_id) {
      return new Response(
        JSON.stringify({ error: "round_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get all squads for this round
    const { data: squads, error: squadsError } = await supabase
      .from("fantasy_squads")
      .select("id, user_id, league_id, squad_value_cap")
      .eq("round_id", round_id);

    if (squadsError) {
      return new Response(
        JSON.stringify({ error: squadsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!squads || squads.length === 0) {
      return new Response(
        JSON.stringify({ message: "No squads found for this round", rewarded: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let rewarded = 0;
    const results: Array<{ squad_id: string; transfers: number; rewarded: boolean }> = [];

    for (const squad of squads) {
      // Count transfers for this user in this round
      const { count, error: countError } = await supabase
        .from("fantasy_transfers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", squad.user_id)
        .eq("league_id", squad.league_id)
        .eq("round_id", round_id);

      if (countError) {
        results.push({ squad_id: squad.id, transfers: -1, rewarded: false });
        continue;
      }

      const transferCount = count ?? 0;

      if (transferCount === 0) {
        // Award +5 cap, capped at 150
        const currentCap = Number(squad.squad_value_cap);
        const newCap = Math.min(currentCap + CAP_REWARD, MAX_CAP);

        const { error: updateError } = await supabase
          .from("fantasy_squads")
          .update({ squad_value_cap: newCap })
          .eq("id", squad.id);

        if (!updateError) {
          rewarded++;
          results.push({ squad_id: squad.id, transfers: 0, rewarded: true });
        } else {
          results.push({ squad_id: squad.id, transfers: 0, rewarded: false });
        }
      } else {
        results.push({ squad_id: squad.id, transfers: transferCount, rewarded: false });
      }
    }

    return new Response(
      JSON.stringify({ message: "Round-end rewards processed", rewarded, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
