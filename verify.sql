-- ============================================================================
-- OMNICRM DATABASE VERIFICATION QUERIES
-- Run these queries in pgAdmin 4 or SQL Shell (psql)
-- ============================================================================

-- 1. Check all 30 tables created in the schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 2. View Tenants & Subscription Plans
SELECT 
    t.name AS organization_name,
    t.slug,
    t.status,
    p.name AS billing_plan,
    p.max_users AS seat_limit,
    p.currency
FROM tenants t
JOIN subscription_plans p ON t.current_plan_id = p.id;

-- 3. View Accounts (Companies)
SELECT 
    name AS company_name,
    industry,
    annual_revenue,
    lifecycle_stage
FROM accounts;

-- 4. View Contacts with Company Links
SELECT 
    c.first_name || ' ' || c.last_name AS contact_name,
    c.email,
    c.title,
    a.name AS company_name,
    c.is_primary_contact
FROM contacts c
LEFT JOIN accounts a ON c.account_id = a.id;

-- 5. View Deals and Kanban Pipeline Stages
SELECT 
    d.title AS deal_title,
    d.amount,
    d.currency,
    s.name AS current_stage,
    s.win_probability_pct,
    d.status
FROM deals d
JOIN pipeline_stages s ON d.stage_id = s.id
ORDER BY s.display_order;

-- 6. Verify Row-Level Security (RLS) Policies
SELECT 
    tablename,
    policyname,
    cmd AS operation
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename;
