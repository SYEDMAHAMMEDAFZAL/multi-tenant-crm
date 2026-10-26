require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'crm_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
};
let pool = null;
let isConnected = false;
let connectionError = null;

function initPool(cfg) {
  if (pool) {
    pool.end().catch(() => { });
  }
  pool = new Pool(cfg);

  // Test connection
  return pool.query('SELECT 1')
    .then(() => {
      isConnected = true;
      connectionError = null;
      console.log('✅ Connected to PostgreSQL successfully at', `${cfg.host}:${cfg.port}/${cfg.database}`);
      return true;
    })
    .catch(err => {
      isConnected = false;
      connectionError = err.message;
      console.warn('⚠️ PostgreSQL connection failed:', err.message);
      return false;
    });
}

// Try initial connection
initPool(dbConfig);

// Helper for tenant-scoped operations
async function withTenant(tenantId, callback) {
  if (!pool || !isConnected) {
    throw new Error('Database not connected. Please configure your password in the dashboard.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Middleware to resolve tenant ID
function getTenantId(req) {
  return req.headers['x-tenant-id'] || req.query.tenant_id || 'a0000000-0000-7000-8000-000000000001';
}

// --- API ROUTES ---

// 1. Connection status & credentials configuration
app.get('/api/status', async (req, res) => {
  res.json({
    connected: isConnected,
    database: dbConfig.database,
    user: dbConfig.user,
    host: dbConfig.host,
    port: dbConfig.port,
    error: connectionError
  });
});

app.post('/api/connect', async (req, res) => {
  const { password, host, port, database, user } = req.body;
  if (password !== undefined) dbConfig.password = String(password);
  if (host) dbConfig.host = host;
  if (port) dbConfig.port = parseInt(port, 10);
  if (database) dbConfig.database = database;
  if (user) dbConfig.user = user;

  const ok = await initPool(dbConfig);
  if (ok) {
    // Optionally persist password to .env
    try {
      const envContent = `PORT=${PORT}\nDB_HOST=${dbConfig.host}\nDB_PORT=${dbConfig.port}\nDB_NAME=${dbConfig.database}\nDB_USER=${dbConfig.user}\nDB_PASSWORD=${dbConfig.password}\n`;
      fs.writeFileSync(path.join(__dirname, '.env'), envContent);
    } catch (e) {
      console.warn('Could not persist .env file:', e.message);
    }
    res.json({ success: true, message: 'Connected successfully!' });
  } else {
    res.status(400).json({ success: false, error: connectionError });
  }
});

// 2. Tenants list (for tenant dropdown)
app.get('/api/tenants', async (req, res) => {
  try {
    if (!pool || !isConnected) return res.status(503).json({ error: 'DB not connected' });
    const { rows } = await pool.query(
      'SELECT id, slug, name, status, current_plan_id, created_at FROM tenants WHERE deleted_at IS NULL ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Overview Statistics
app.get('/api/stats', async (req, res) => {
  const tenantId = getTenantId(req);
  try {
    const stats = await withTenant(tenantId, async (client) => {
      const dealsRes = await client.query(`
        SELECT 
          COUNT(*)::int as total_deals,
          COALESCE(SUM(amount), 0)::numeric as total_pipeline_value,
          COALESCE(SUM(CASE WHEN status = 'won' THEN amount ELSE 0 END), 0)::numeric as won_value,
          COALESCE(COUNT(CASE WHEN status = 'won' THEN 1 END), 0)::int as won_count,
          COALESCE(COUNT(CASE WHEN status = 'open' THEN 1 END), 0)::int as open_count
        FROM deals WHERE deleted_at IS NULL
      `);

      const accountsRes = await client.query(`
        SELECT COUNT(*)::int as total_accounts FROM accounts WHERE deleted_at IS NULL
      `);

      const contactsRes = await client.query(`
        SELECT COUNT(*)::int as total_contacts FROM contacts WHERE deleted_at IS NULL
      `);

      return {
        ...dealsRes.rows[0],
        total_accounts: accountsRes.rows[0].total_accounts,
        total_contacts: contactsRes.rows[0].total_contacts
      };
    });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Pipeline stages and Deals (Kanban board)
app.get('/api/pipeline', async (req, res) => {
  const tenantId = getTenantId(req);
  try {
    const data = await withTenant(tenantId, async (client) => {
      // Get stages
      const stagesRes = await client.query(`
        SELECT ps.id, ps.name, ps.display_order, ps.win_probability_pct, ps.is_closed_won, ps.is_closed_lost, ps.pipeline_id
        FROM pipeline_stages ps
        JOIN pipelines p ON p.id = ps.pipeline_id AND p.tenant_id = ps.tenant_id
        WHERE p.is_active = TRUE
        ORDER BY ps.display_order ASC
      `);

      // Get deals with account and owner names
      const dealsRes = await client.query(`
        SELECT 
          d.id, d.title, d.amount, d.currency, d.status, d.stage_id, d.expected_close_date,
          d.account_id, a.name as account_name,
          d.primary_contact_id, CONCAT(c.first_name, ' ', c.last_name) as contact_name,
          d.owner_user_id, CONCAT(u.first_name, ' ', u.last_name) as owner_name
        FROM deals d
        LEFT JOIN accounts a ON a.id = d.account_id AND a.tenant_id = d.tenant_id
        LEFT JOIN contacts c ON c.id = d.primary_contact_id AND c.tenant_id = d.tenant_id
        LEFT JOIN users u ON u.id = d.owner_user_id AND u.tenant_id = d.tenant_id
        WHERE d.deleted_at IS NULL
        ORDER BY d.created_at DESC
      `);

      return {
        stages: stagesRes.rows,
        deals: dealsRes.rows
      };
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Update Deal Stage (Kanban move)
app.put('/api/deals/:id/stage', async (req, res) => {
  const tenantId = getTenantId(req);
  const dealId = req.params.id;
  const { stage_id } = req.body;

  if (!stage_id) return res.status(400).json({ error: 'stage_id is required' });

  try {
    await withTenant(tenantId, async (client) => {
      // Determine stage properties
      const stageRes = await client.query(
        'SELECT is_closed_won, is_closed_lost FROM pipeline_stages WHERE id = $1 AND tenant_id = $2',
        [stage_id, tenantId]
      );
      if (stageRes.rows.length === 0) throw new Error('Stage not found');

      const stage = stageRes.rows[0];
      let newStatus = 'open';
      if (stage.is_closed_won) newStatus = 'won';
      if (stage.is_closed_lost) newStatus = 'lost';

      const updateRes = await client.query(`
        UPDATE deals
        SET stage_id = $1, status = $2, updated_at = clock_timestamp()
        WHERE id = $3 AND tenant_id = $4
        RETURNING id, title, stage_id, status
      `, [stage_id, newStatus, dealId, tenantId]);

      if (updateRes.rows.length === 0) throw new Error('Deal not found or access denied');
      return updateRes.rows[0];
    });

    res.json({ success: true, message: 'Deal stage updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Create Deal
app.post('/api/deals', async (req, res) => {
  const tenantId = getTenantId(req);
  const { title, amount, account_id, primary_contact_id, stage_id, expected_close_date } = req.body;

  if (!title || !account_id || !stage_id) {
    return res.status(400).json({ error: 'Title, Account, and Stage are required.' });
  }

  try {
    const newDeal = await withTenant(tenantId, async (client) => {
      // Get pipeline_id from stage
      const stageRes = await client.query(
        'SELECT pipeline_id, is_closed_won, is_closed_lost FROM pipeline_stages WHERE id = $1 AND tenant_id = $2',
        [stage_id, tenantId]
      );
      if (stageRes.rows.length === 0) throw new Error('Selected stage does not exist');
      const { pipeline_id, is_closed_won, is_closed_lost } = stageRes.rows[0];

      let status = 'open';
      if (is_closed_won) status = 'won';
      if (is_closed_lost) status = 'lost';

      // Get first active user as owner
      const userRes = await client.query('SELECT id FROM users WHERE tenant_id = $1 LIMIT 1', [tenantId]);
      if (userRes.rows.length === 0) throw new Error('No user available to own deal');
      const ownerId = userRes.rows[0].id;

      const insertRes = await client.query(`
        INSERT INTO deals (tenant_id, account_id, primary_contact_id, pipeline_id, stage_id, owner_user_id, title, amount, status, expected_close_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, title, amount, status
      `, [tenantId, account_id, primary_contact_id || null, pipeline_id, stage_id, ownerId, title, amount || 0, status, expected_close_date || null]);

      return insertRes.rows[0];
    });
    res.status(201).json(newDeal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Accounts List & Create
app.get('/api/accounts', async (req, res) => {
  const tenantId = getTenantId(req);
  try {
    const accounts = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`
        SELECT 
          a.id, a.name, a.domain, a.industry, a.annual_revenue, a.lifecycle_stage,
          COUNT(DISTINCT c.id)::int as contact_count,
          COUNT(DISTINCT d.id)::int as deal_count,
          COALESCE(SUM(d.amount), 0)::numeric as total_deal_value
        FROM accounts a
        LEFT JOIN contacts c ON c.account_id = a.id AND c.tenant_id = a.tenant_id
        LEFT JOIN deals d ON d.account_id = a.id AND d.tenant_id = a.tenant_id
        WHERE a.deleted_at IS NULL
        GROUP BY a.id, a.name, a.domain, a.industry, a.annual_revenue, a.lifecycle_stage
        ORDER BY a.name ASC
      `);
      return rows;
    });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  const tenantId = getTenantId(req);
  const { name, domain, industry, annual_revenue, lifecycle_stage } = req.body;

  if (!name) return res.status(400).json({ error: 'Account name is required' });

  try {
    const newAccount = await withTenant(tenantId, async (client) => {
      const userRes = await client.query('SELECT id FROM users WHERE tenant_id = $1 LIMIT 1', [tenantId]);
      const ownerId = userRes.rows.length > 0 ? userRes.rows[0].id : null;

      const { rows } = await client.query(`
        INSERT INTO accounts (tenant_id, name, domain, industry, annual_revenue, lifecycle_stage, owner_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [tenantId, name, domain || null, industry || 'Technology', annual_revenue || 0, lifecycle_stage || 'prospect', ownerId]);
      return rows[0];
    });
    res.status(201).json(newAccount);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Contacts List & Create
app.get('/api/contacts', async (req, res) => {
  const tenantId = getTenantId(req);
  try {
    const contacts = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`
        SELECT 
          c.id, c.first_name, c.last_name, c.email, c.phone, c.title, c.is_primary_contact,
          c.account_id, a.name as account_name
        FROM contacts c
        LEFT JOIN accounts a ON a.id = c.account_id AND a.tenant_id = c.tenant_id
        WHERE c.deleted_at IS NULL
        ORDER BY c.last_name ASC
      `);
      return rows;
    });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts', async (req, res) => {
  const tenantId = getTenantId(req);
  const { first_name, last_name, email, phone, title, account_id } = req.body;

  if (!first_name || !last_name || !email) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }

  try {
    const newContact = await withTenant(tenantId, async (client) => {
      const userRes = await client.query('SELECT id FROM users WHERE tenant_id = $1 LIMIT 1', [tenantId]);
      const ownerId = userRes.rows.length > 0 ? userRes.rows[0].id : null;

      const { rows } = await client.query(`
        INSERT INTO contacts (tenant_id, account_id, first_name, last_name, email, phone, title, owner_user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [tenantId, account_id || null, first_name, last_name, email, phone || null, title || null, ownerId]);
      return rows[0];
    });
    res.status(201).json(newContact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 CRM Web Dashboard running at http://localhost:${PORT}`);
});
