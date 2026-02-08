-- ============================================================
-- TrustTube — Decentralized YouTube Sponsorship Marketplace
-- Initial Schema Migration
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address  text        UNIQUE NOT NULL,
    google_id       text        UNIQUE,
    google_email    text,
    google_access_token  text,
    google_refresh_token text,
    role            text        NOT NULL DEFAULT 'both'
                                CHECK (role IN ('client', 'creator', 'both')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. CREATOR PROFILES
-- ============================================================
CREATE TABLE creator_profiles (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid        UNIQUE NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    youtube_channel_id text,
    channel_name     text,
    subscriber_count integer     NOT NULL DEFAULT 0,
    bio              text,
    avatar_url       text,
    rating           numeric(3,2) NOT NULL DEFAULT 0,
    created_at       timestamptz  NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. ORDERS
-- ============================================================
CREATE TABLE orders (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title               text        NOT NULL,
    description         text,
    documentation       text,
    payment_mode        text        NOT NULL
                                    CHECK (payment_mode IN ('milestone', 'linear')),
    linear_rate         numeric,
    linear_cap          numeric,
    stablecoin_address  text        NOT NULL,
    video_deadline_days integer     NOT NULL DEFAULT 7,
    status              text        NOT NULL DEFAULT 'open'
                                    CHECK (status IN (
                                        'open',
                                        'in_progress',
                                        'in_review',
                                        'active',
                                        'completed',
                                        'terminated'
                                    )),
    contract_deal_id    integer,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. MILESTONES
-- ============================================================
CREATE TABLE milestones (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        uuid        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    milestone_index integer     NOT NULL,
    view_target     integer     NOT NULL,
    payout_amount   numeric     NOT NULL,
    deadline_days   integer     NOT NULL,
    is_paid         boolean     NOT NULL DEFAULT false,
    paid_at         timestamptz,

    UNIQUE (order_id, milestone_index)
);

-- ============================================================
-- 5. APPLICATIONS
-- ============================================================
CREATE TABLE applications (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        uuid        NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    creator_user_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    message         text,
    status          text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. CASES (active deal once creator is accepted)
-- ============================================================
CREATE TABLE cases (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         uuid        UNIQUE NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    creator_user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    youtube_video_id text,
    etag             text,
    video_status     text        NOT NULL DEFAULT 'pending'
                                 CHECK (video_status IN (
                                     'pending',
                                     'uploaded',
                                     'approved',
                                     'public'
                                 )),
    contract_deal_id integer,
    current_views    integer     NOT NULL DEFAULT 0,
    started_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 7. REVIEWS
-- ============================================================
CREATE TABLE reviews (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id          uuid        UNIQUE NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    reviewer_user_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    rating           integer     NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment          text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_orders_status           ON orders (status);
CREATE INDEX idx_orders_user_id          ON orders (user_id);
CREATE INDEX idx_applications_order_id   ON applications (order_id);
CREATE INDEX idx_applications_creator    ON applications (creator_user_id);
CREATE INDEX idx_cases_order_id          ON cases (order_id);
CREATE INDEX idx_cases_creator           ON cases (creator_user_id);
CREATE INDEX idx_milestones_order_id     ON milestones (order_id);
CREATE INDEX idx_reviews_case_id         ON reviews (case_id);

-- ============================================================
-- ROW LEVEL SECURITY — Enable on all tables
-- ============================================================
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- ---- users -------------------------------------------------
CREATE POLICY "users: anyone can read"
    ON users FOR SELECT
    USING (true);

CREATE POLICY "users: owner can insert"
    ON users FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "users: owner can update"
    ON users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ---- creator_profiles --------------------------------------
CREATE POLICY "creator_profiles: anyone can read"
    ON creator_profiles FOR SELECT
    USING (true);

CREATE POLICY "creator_profiles: owner can insert"
    ON creator_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "creator_profiles: owner can update"
    ON creator_profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---- orders ------------------------------------------------
CREATE POLICY "orders: anyone can read"
    ON orders FOR SELECT
    USING (true);

CREATE POLICY "orders: client can insert"
    ON orders FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orders: client can update"
    ON orders FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ---- milestones --------------------------------------------
CREATE POLICY "milestones: anyone can read"
    ON milestones FOR SELECT
    USING (true);

CREATE POLICY "milestones: order owner can insert"
    ON milestones FOR INSERT
    WITH CHECK (
        auth.uid() = (SELECT user_id FROM orders WHERE orders.id = order_id)
    );

CREATE POLICY "milestones: order owner can update"
    ON milestones FOR UPDATE
    USING (
        auth.uid() = (SELECT user_id FROM orders WHERE orders.id = order_id)
    )
    WITH CHECK (
        auth.uid() = (SELECT user_id FROM orders WHERE orders.id = order_id)
    );

-- ---- applications ------------------------------------------
CREATE POLICY "applications: anyone can read"
    ON applications FOR SELECT
    USING (true);

CREATE POLICY "applications: creator can insert"
    ON applications FOR INSERT
    WITH CHECK (auth.uid() = creator_user_id);

CREATE POLICY "applications: creator can update own"
    ON applications FOR UPDATE
    USING (auth.uid() = creator_user_id)
    WITH CHECK (auth.uid() = creator_user_id);

CREATE POLICY "applications: order owner can update"
    ON applications FOR UPDATE
    USING (
        auth.uid() = (SELECT user_id FROM orders WHERE orders.id = order_id)
    )
    WITH CHECK (
        auth.uid() = (SELECT user_id FROM orders WHERE orders.id = order_id)
    );

-- ---- cases -------------------------------------------------
CREATE POLICY "cases: anyone can read"
    ON cases FOR SELECT
    USING (true);

CREATE POLICY "cases: order owner can insert"
    ON cases FOR INSERT
    WITH CHECK (
        auth.uid() = (SELECT user_id FROM orders WHERE orders.id = order_id)
    );

CREATE POLICY "cases: participants can update"
    ON cases FOR UPDATE
    USING (
        auth.uid() = creator_user_id
        OR auth.uid() = (SELECT user_id FROM orders WHERE orders.id = order_id)
    )
    WITH CHECK (
        auth.uid() = creator_user_id
        OR auth.uid() = (SELECT user_id FROM orders WHERE orders.id = order_id)
    );

-- ---- reviews -----------------------------------------------
CREATE POLICY "reviews: anyone can read"
    ON reviews FOR SELECT
    USING (true);

CREATE POLICY "reviews: reviewer can insert"
    ON reviews FOR INSERT
    WITH CHECK (auth.uid() = reviewer_user_id);

CREATE POLICY "reviews: reviewer can update"
    ON reviews FOR UPDATE
    USING (auth.uid() = reviewer_user_id)
    WITH CHECK (auth.uid() = reviewer_user_id);

-- ============================================================
-- REALTIME — Enable on the cases table
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE cases;
