CREATE TABLE deal_applications (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_deal_id integer NOT NULL,
    creator_address  text NOT NULL,
    message          text,
    status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (contract_deal_id, creator_address)
);

CREATE INDEX idx_deal_apps_deal ON deal_applications (contract_deal_id);
CREATE INDEX idx_deal_apps_creator ON deal_applications (creator_address);

ALTER TABLE deal_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can read" ON deal_applications FOR SELECT USING (true);
CREATE POLICY "anyone can insert" ON deal_applications FOR INSERT WITH CHECK (true);
CREATE POLICY "anyone can update" ON deal_applications FOR UPDATE USING (true) WITH CHECK (true);
