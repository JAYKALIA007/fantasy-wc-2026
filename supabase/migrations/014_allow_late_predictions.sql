ALTER TABLE matches ADD COLUMN allow_late_predictions boolean NOT NULL DEFAULT false;

-- Allow league creators to update match settings
CREATE POLICY "League creators can update matches" ON matches
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM leagues WHERE creator_id = auth.uid())
  );
