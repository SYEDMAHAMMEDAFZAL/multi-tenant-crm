-- ============================================================================
-- CRM DATABASE DEMO SEED DATA
-- Run this after schema.sql to populate sample tenants, users, and CRM data.
-- ============================================================================

BEGIN;

-- 1. Global Subscription Plans
INSERT INTO subscription_plans (id, name, max_users, max_contacts, price_monthly_cents, currency)
VALUES
    ('starter', 'Starter Plan', 5, 1000, 2900, 'USD'),
    ('pro', 'Professional Plan', 25, 10000, 9900, 'USD'),
    ('enterprise', 'Enterprise Tier', 100, 100000, 29900, 'USD')
ON CONFLICT (id) DO NOTHING;

-- 2. Create Demo Tenant (Acme Corp)
INSERT INTO tenants (id, slug, name, status, current_plan_id)
VALUES (
    'a0000000-0000-7000-8000-000000000001',
    'acme-corp',
    'Acme Corporation',
    'active',
    'pro'
)
ON CONFLICT (id) DO NOTHING;

-- 3. SET THE TENANT CONTEXT (Required by Row-Level Security)
SET LOCAL app.current_tenant_id = 'a0000000-0000-7000-8000-000000000001';

-- 4. Users
INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, is_tenant_admin)
VALUES
    ('b0000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001', 'sarah.connor@acme.com', '$2a$12$e80y..sample_hash_not_real..', 'Sarah', 'Connor', TRUE),
    ('b0000000-0000-7000-8000-000000000002', 'a0000000-0000-7000-8000-000000000001', 'john.doe@acme.com', '$2a$12$e80y..sample_hash_not_real..', 'John', 'Doe', FALSE)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- 5. Accounts (Companies)
INSERT INTO accounts (id, tenant_id, name, domain, industry, annual_revenue, lifecycle_stage, owner_user_id)
VALUES
    ('c0000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001', 'Stark Industries', 'stark.com', 'Technology', 5000000.00, 'customer', 'b0000000-0000-7000-8000-000000000001'),
    ('c0000000-0000-7000-8000-000000000002', 'a0000000-0000-7000-8000-000000000001', 'Wayne Enterprises', 'wayne.com', 'Defense & Tech', 8500000.00, 'prospect', 'b0000000-0000-7000-8000-000000000002')
ON CONFLICT (tenant_id, id) DO NOTHING;

-- 6. Contacts
INSERT INTO contacts (id, tenant_id, account_id, first_name, last_name, email, phone, title, owner_user_id, is_primary_contact)
VALUES
    ('d0000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001', 'c0000000-0000-7000-8000-000000000001', 'Tony', 'Stark', 'tony@stark.com', '+1-555-0100', 'Chief Executive Officer', 'b0000000-0000-7000-8000-000000000001', TRUE),
    ('d0000000-0000-7000-8000-000000000002', 'a0000000-0000-7000-8000-000000000001', 'c0000000-0000-7000-8000-000000000002', 'Bruce', 'Wayne', 'bruce@wayne.com', '+1-555-0199', 'Managing Director', 'b0000000-0000-7000-8000-000000000002', TRUE)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- 7. Sales Pipeline & Stages
INSERT INTO pipelines (id, tenant_id, name, is_default)
VALUES ('e0000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001', 'Standard Sales Pipeline', TRUE)
ON CONFLICT (tenant_id, id) DO NOTHING;

INSERT INTO pipeline_stages (id, tenant_id, pipeline_id, name, display_order, win_probability_pct, is_closed_won, is_closed_lost)
VALUES
    ('f0000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001', 'e0000000-0000-7000-8000-000000000001', 'Discovery', 1, 10.00, FALSE, FALSE),
    ('f0000000-0000-7000-8000-000000000002', 'a0000000-0000-7000-8000-000000000001', 'e0000000-0000-7000-8000-000000000001', 'Proposal Sent', 2, 50.00, FALSE, FALSE),
    ('f0000000-0000-7000-8000-000000000003', 'a0000000-0000-7000-8000-000000000001', 'e0000000-0000-7000-8000-000000000001', 'Negotiation', 3, 80.00, FALSE, FALSE),
    ('f0000000-0000-7000-8000-000000000004', 'a0000000-0000-7000-8000-000000000001', 'e0000000-0000-7000-8000-000000000001', 'Closed Won', 4, 100.00, TRUE, FALSE)
ON CONFLICT (tenant_id, id) DO NOTHING;

-- 8. Deals
INSERT INTO deals (id, tenant_id, account_id, primary_contact_id, pipeline_id, stage_id, owner_user_id, title, amount, status)
VALUES
    ('90000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001', 'c0000000-0000-7000-8000-000000000001', 'd0000000-0000-7000-8000-000000000001', 'e0000000-0000-7000-8000-000000000001', 'f0000000-0000-7000-8000-000000000003', 'b0000000-0000-7000-8000-000000000001', 'Enterprise Cloud Migration', 150000.00, 'open'),
    ('90000000-0000-7000-8000-000000000002', 'a0000000-0000-7000-8000-000000000001', 'c0000000-0000-7000-8000-000000000002', 'd0000000-0000-7000-8000-000000000002', 'e0000000-0000-7000-8000-000000000001', 'f0000000-0000-7000-8000-000000000002', 'b0000000-0000-7000-8000-000000000002', 'Annual Security Retainer', 75000.00, 'open')
ON CONFLICT (tenant_id, id) DO NOTHING;

COMMIT;
