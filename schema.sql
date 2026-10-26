-- ============================================================================
-- PRODUCTION READY MULTI-TENANT CRM DATABASE SCHEMA
-- Target Engine: PostgreSQL 14+ (Optimal on PostgreSQL 16+)
-- Architecture: Shared Database, Shared Schema with Composite FKs + RLS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- UUIDv7 Pure SQL Generator for Time-Ordered, B-Tree Optimized Indexing
CREATE OR REPLACE FUNCTION generate_uuid_v7() 
RETURNS UUID AS $$
DECLARE
    v_time TIMESTAMP WITH TIME ZONE := clock_timestamp();
    v_secs BIGINT := EXTRACT(EPOCH FROM v_time);
    v_msec BIGINT := (v_secs * 1000) + EXTRACT(MILLISECONDS FROM v_time)::BIGINT % 1000;
    v_bytes BYTEA := gen_random_bytes(16);
BEGIN
    v_bytes := set_byte(v_bytes, 0, ((v_msec >> 40) & 255)::INT);
    v_bytes := set_byte(v_bytes, 1, ((v_msec >> 32) & 255)::INT);
    v_bytes := set_byte(v_bytes, 2, ((v_msec >> 24) & 255)::INT);
    v_bytes := set_byte(v_bytes, 3, ((v_msec >> 16) & 255)::INT);
    v_bytes := set_byte(v_bytes, 4, ((v_msec >> 8) & 255)::INT);
    v_bytes := set_byte(v_bytes, 5, (v_msec & 255)::INT);
    v_bytes := set_byte(v_bytes, 6, (0x70 | (get_byte(v_bytes, 6) & 0x0F))::INT);
    v_bytes := set_byte(v_bytes, 8, (0x80 | (get_byte(v_bytes, 8) & 0x3F))::INT);
    RETURN encode(v_bytes, 'hex')::UUID;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Auto update timestamp trigger
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 1. GLOBAL / REFERENCE (SHARED)
-- ----------------------------------------------------------------------------

CREATE TABLE subscription_plans (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    max_users INT NOT NULL DEFAULT 5,
    max_contacts INT NOT NULL DEFAULT 1000,
    max_storage_bytes BIGINT NOT NULL DEFAULT 1073741824,
    price_monthly_cents INT NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE permissions (
    code VARCHAR(64) PRIMARY KEY,
    category VARCHAR(64) NOT NULL,
    description TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- 2. TENANT & SUBSCRIPTION
-- ----------------------------------------------------------------------------

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    slug VARCHAR(63) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'trial' 
        CHECK (status IN ('trial', 'active', 'suspended', 'cancelled')),
    current_plan_id VARCHAR(32) NOT NULL REFERENCES subscription_plans(id),
    settings JSONB NOT NULL DEFAULT '{"timezone": "UTC", "currency": "USD"}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id VARCHAR(32) NOT NULL REFERENCES subscription_plans(id),
    billing_status VARCHAR(30) NOT NULL DEFAULT 'active',
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------------------------
-- 3. IAM (USERS, ROLES, PERMISSIONS)
-- ----------------------------------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' 
        CHECK (status IN ('invited', 'active', 'suspended', 'deactivated')),
    is_tenant_admin BOOLEAN NOT NULL DEFAULT FALSE,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, email),
    UNIQUE (tenant_id, id)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, name),
    UNIQUE (tenant_id, id)
);

CREATE TABLE role_permissions (
    tenant_id UUID NOT NULL,
    role_id UUID NOT NULL,
    permission_code VARCHAR(64) NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (tenant_id, role_id, permission_code),
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE user_roles (
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, user_id, role_id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 4. ACCOUNTS & CONTACTS
-- ----------------------------------------------------------------------------

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    industry VARCHAR(100),
    annual_revenue NUMERIC(15, 2),
    employee_count INT,
    lifecycle_stage VARCHAR(30) NOT NULL DEFAULT 'prospect'
        CHECK (lifecycle_stage IN ('lead', 'prospect', 'customer', 'churned', 'partner')),
    parent_account_id UUID,
    owner_user_id UUID,
    custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, parent_account_id) REFERENCES accounts(tenant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    title VARCHAR(100),
    department VARCHAR(100),
    owner_user_id UUID,
    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
    custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, email),
    FOREIGN KEY (tenant_id, account_id) REFERENCES accounts(tenant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE contact_addresses (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL,
    address_type VARCHAR(20) NOT NULL DEFAULT 'work' CHECK (address_type IN ('work', 'home', 'billing', 'shipping')),
    street_line1 VARCHAR(255) NOT NULL,
    street_line2 VARCHAR(255),
    city VARCHAR(100) NOT NULL,
    state_province VARCHAR(100),
    postal_code VARCHAR(20),
    country_code VARCHAR(2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 5. LEADS
-- ----------------------------------------------------------------------------

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    source VARCHAR(50) NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'referral', 'ad', 'outbound', 'event', 'partner')),
    status VARCHAR(30) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'unqualified', 'converted')),
    score INT NOT NULL DEFAULT 0,
    owner_user_id UUID,
    is_converted BOOLEAN NOT NULL DEFAULT FALSE,
    converted_at TIMESTAMPTZ,
    converted_account_id UUID,
    converted_contact_id UUID,
    converted_deal_id UUID,
    custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id, converted_account_id) REFERENCES accounts(tenant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id, converted_contact_id) REFERENCES contacts(tenant_id, id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 6. PIPELINES & DEALS
-- ----------------------------------------------------------------------------

CREATE TABLE pipelines (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, name)
);

CREATE TABLE pipeline_stages (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pipeline_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    display_order INT NOT NULL,
    win_probability_pct NUMERIC(5, 2) NOT NULL CHECK (win_probability_pct BETWEEN 0 AND 100),
    is_closed_won BOOLEAN NOT NULL DEFAULT FALSE,
    is_closed_lost BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, pipeline_id, display_order),
    FOREIGN KEY (tenant_id, pipeline_id) REFERENCES pipelines(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE deals (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID NOT NULL,
    primary_contact_id UUID,
    pipeline_id UUID NOT NULL,
    stage_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    expected_close_date DATE,
    actual_close_date DATE,
    loss_reason VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
    custom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, account_id) REFERENCES accounts(tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, primary_contact_id) REFERENCES contacts(tenant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id, pipeline_id) REFERENCES pipelines(tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, stage_id) REFERENCES pipeline_stages(tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, owner_user_id) REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE deal_stage_history (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    deal_id UUID NOT NULL,
    from_stage_id UUID,
    to_stage_id UUID NOT NULL,
    changed_by_user_id UUID NOT NULL,
    duration_seconds INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, deal_id) REFERENCES deals(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, to_stage_id) REFERENCES pipeline_stages(tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, changed_by_user_id) REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 7. PRODUCTS, PRICE BOOKS, QUOTES
-- ----------------------------------------------------------------------------

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sku VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    unit_type VARCHAR(32) NOT NULL DEFAULT 'unit',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, sku)
);

CREATE TABLE price_books (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_standard BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id)
);

CREATE TABLE price_book_entries (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    price_book_id UUID NOT NULL,
    product_id UUID NOT NULL,
    unit_price NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, price_book_id, product_id, currency),
    FOREIGN KEY (tenant_id, price_book_id) REFERENCES price_books(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    deal_id UUID NOT NULL,
    quote_number VARCHAR(64) NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired')),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    expires_at DATE,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, quote_number, revision),
    FOREIGN KEY (tenant_id, deal_id) REFERENCES deals(tenant_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE quote_line_items (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL,
    product_id UUID NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(15, 2) NOT NULL,
    discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_pct BETWEEN 0 AND 100),
    line_total NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, quote_id) REFERENCES quotes(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE RESTRICT
);

-- ----------------------------------------------------------------------------
-- 8. ACTIVITIES & COMMUNICATIONS
-- ----------------------------------------------------------------------------

CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    activity_type VARCHAR(30) NOT NULL CHECK (activity_type IN ('task', 'call', 'meeting', 'note')),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_user_id UUID,
    account_id UUID,
    contact_id UUID,
    deal_id UUID,
    lead_id UUID,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, assigned_user_id) REFERENCES users(tenant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id, account_id) REFERENCES accounts(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, deal_id) REFERENCES deals(tenant_id, id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, lead_id) REFERENCES leads(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE communications (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'phone')),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    external_provider_id VARCHAR(255),
    sender VARCHAR(255) NOT NULL,
    recipients JSONB NOT NULL,
    subject VARCHAR(255),
    snippet VARCHAR(500),
    status VARCHAR(30) NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'failed')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    contact_id UUID,
    deal_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, contact_id) REFERENCES contacts(tenant_id, id) ON DELETE SET NULL,
    FOREIGN KEY (tenant_id, deal_id) REFERENCES deals(tenant_id, id) ON DELETE SET NULL
);

-- ----------------------------------------------------------------------------
-- 9. EXTENSIBILITY (TAGS & CUSTOM FIELDS)
-- ----------------------------------------------------------------------------

CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color_hex VARCHAR(7) NOT NULL DEFAULT '#6366f1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, name)
);

CREATE TABLE entity_tags (
    tenant_id UUID NOT NULL,
    tag_id UUID NOT NULL,
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('account', 'contact', 'deal', 'lead')),
    entity_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, tag_id, entity_type, entity_id),
    FOREIGN KEY (tenant_id, tag_id) REFERENCES tags(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('account', 'contact', 'deal', 'lead')),
    field_key VARCHAR(50) NOT NULL,
    label VARCHAR(100) NOT NULL,
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'date', 'boolean')),
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    options JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, entity_type, field_key)
);

-- ----------------------------------------------------------------------------
-- 10. FILE ATTACHMENTS (METADATA)
-- ----------------------------------------------------------------------------

CREATE TABLE file_attachments (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    storage_provider VARCHAR(30) NOT NULL DEFAULT 's3',
    bucket_name VARCHAR(100) NOT NULL,
    object_key VARCHAR(512) NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,
    uploaded_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, uploaded_by_user_id) REFERENCES users(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE entity_attachments (
    tenant_id UUID NOT NULL,
    file_id UUID NOT NULL,
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('account', 'contact', 'deal', 'quote', 'activity')),
    entity_id UUID NOT NULL,
    attached_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, file_id, entity_type, entity_id),
    FOREIGN KEY (tenant_id, file_id) REFERENCES file_attachments(tenant_id, id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 11. AUDIT LOGS & NOTIFICATIONS
-- ----------------------------------------------------------------------------

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID,
    action VARCHAR(32) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    ip_address INET,
    user_agent TEXT,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT generate_uuid_v7(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, user_id) REFERENCES users(tenant_id, id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 12. ROW-LEVEL SECURITY ENFORCEMENT
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    tbl text;
    tenant_tables text[] := ARRAY[
        'users', 'roles', 'role_permissions', 'user_roles', 'accounts',
        'contacts', 'contact_addresses', 'leads', 'pipelines', 'pipeline_stages',
        'deals', 'deal_stage_history', 'products', 'price_books', 'price_book_entries',
        'quotes', 'quote_line_items', 'activities', 'communications', 'tags',
        'entity_tags', 'custom_field_definitions', 'file_attachments', 'entity_attachments',
        'audit_logs', 'notifications'
    ];
BEGIN
    FOREACH tbl IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_policy ON %I;', tbl);
        EXECUTE format('CREATE POLICY tenant_isolation_policy ON %I
            FOR ALL
            USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid)
            WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid);', tbl);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 13. STRATEGIC INDEXES
-- ----------------------------------------------------------------------------

CREATE INDEX idx_accounts_tenant_owner ON accounts (tenant_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_tenant_account ON contacts (tenant_id, account_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_tenant_status ON leads (tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_tenant_pipeline_stage ON deals (tenant_id, pipeline_id, stage_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_tenant_owner ON deals (tenant_id, owner_user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_custom_gin ON deals USING GIN (custom_attributes jsonb_path_ops);
CREATE INDEX idx_activities_rep_due ON activities (tenant_id, assigned_user_id, status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_notifications_user_unread ON notifications (tenant_id, user_id, is_read, created_at DESC);
CREATE INDEX idx_audit_logs_timeline ON audit_logs (tenant_id, created_at DESC);
