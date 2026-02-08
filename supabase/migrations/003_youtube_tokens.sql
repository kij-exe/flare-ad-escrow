CREATE TABLE youtube_tokens (
    contract_deal_id integer PRIMARY KEY,
    access_token     text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE youtube_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read" ON youtube_tokens FOR SELECT USING (true);
CREATE POLICY "anyone can insert" ON youtube_tokens FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone can update" ON youtube_tokens FOR UPDATE USING (true) WITH CHECK (true);
