/**
 * OmniCRM Dashboard Logic
 * Multi-Tenant PostgreSQL 17 CRM Client
 */

let currentTenantId = 'a0000000-0000-7000-8000-000000000001';
let cachedStages = [];
let cachedAccounts = [];
let cachedContacts = [];
let isConnected = false;
let isDemoMode = false;

// Pre-seeded multi-tenant demo dataset (used seamlessly on static hosts like GitHub Pages)
const demoDB = {
  tenants: [
    { id: 'a0000000-0000-7000-8000-000000000001', name: 'Acme Corporation', current_plan_id: 'enterprise' },
    { id: 'a0000000-0000-7000-8000-000000000002', name: 'Globex Systems', current_plan_id: 'pro' }
  ],
  stages: [
    { id: 's0000000-0000-7000-8000-000000000001', name: 'Discovery', display_order: 1 },
    { id: 's0000000-0000-7000-8000-000000000002', name: 'Proposal Sent', display_order: 2 },
    { id: 's0000000-0000-7000-8000-000000000003', name: 'Negotiation', display_order: 3 },
    { id: 's0000000-0000-7000-8000-000000000004', name: 'Closed Won', display_order: 4, is_closed_won: true }
  ],
  accounts: [
    { id: 'acc-1', tenant_id: 'a0000000-0000-7000-8000-000000000001', name: 'Stark Industries', domain: 'starkindustries.com', industry: 'Defense & Technology', annual_revenue: '5000000.00', lifecycle_stage: 'customer' },
    { id: 'acc-2', tenant_id: 'a0000000-0000-7000-8000-000000000001', name: 'Wayne Enterprises', domain: 'waynecorp.com', industry: 'Aerospace & Defense', annual_revenue: '8500000.00', lifecycle_stage: 'customer' },
    { id: 'acc-3', tenant_id: 'a0000000-0000-7000-8000-000000000001', name: 'Cyberdyne Systems', domain: 'cyberdyne.com', industry: 'Robotics & AI', annual_revenue: '2400000.00', lifecycle_stage: 'prospect' },
    { id: 'acc-4', tenant_id: 'a0000000-0000-7000-8000-000000000002', name: 'Initech Global', domain: 'initech.com', industry: 'Enterprise Software', annual_revenue: '1200000.00', lifecycle_stage: 'customer' }
  ],
  contacts: [
    { id: 'con-1', tenant_id: 'a0000000-0000-7000-8000-000000000001', account_id: 'acc-1', account_name: 'Stark Industries', first_name: 'Tony', last_name: 'Stark', email: 'tony@stark.com', phone: '+1-212-555-0199', title: 'CEO & Principal Engineer', is_primary_contact: true },
    { id: 'con-2', tenant_id: 'a0000000-0000-7000-8000-000000000001', account_id: 'acc-2', account_name: 'Wayne Enterprises', first_name: 'Bruce', last_name: 'Wayne', email: 'bruce@wayne.com', phone: '+1-212-555-0188', title: 'Managing Director & Chairman', is_primary_contact: true },
    { id: 'con-3', tenant_id: 'a0000000-0000-7000-8000-000000000001', account_id: 'acc-1', account_name: 'Stark Industries', first_name: 'Pepper', last_name: 'Potts', email: 'pepper@stark.com', phone: '+1-212-555-0198', title: 'Chief Operating Officer', is_primary_contact: false }
  ],
  deals: [
    { id: 'deal-1', tenant_id: 'a0000000-0000-7000-8000-000000000001', account_id: 'acc-1', account_name: 'Stark Industries', title: 'Arc Reactor Cloud Infrastructure', amount: '150000.00', stage_id: 's0000000-0000-7000-8000-000000000003', contact_name: 'Tony Stark' },
    { id: 'deal-2', tenant_id: 'a0000000-0000-7000-8000-000000000001', account_id: 'acc-2', account_name: 'Wayne Enterprises', title: 'Batmobile AI Defense Fleet Retainer', amount: '75000.00', stage_id: 's0000000-0000-7000-8000-000000000002', contact_name: 'Bruce Wayne' },
    { id: 'deal-3', tenant_id: 'a0000000-0000-7000-8000-000000000001', account_id: 'acc-3', account_name: 'Cyberdyne Systems', title: 'Neural Net Enterprise Licensing', amount: '320000.00', stage_id: 's0000000-0000-7000-8000-000000000001', contact_name: 'Dr. Miles Dyson' },
    { id: 'deal-4', tenant_id: 'a0000000-0000-7000-8000-000000000001', account_id: 'acc-1', account_name: 'Stark Industries', title: 'Quantum Sensors Maintenance', amount: '45000.00', stage_id: 's0000000-0000-7000-8000-000000000004', contact_name: 'Pepper Potts' }
  ]
};

// Seamless API Interceptor: routes to real Node backend if available, or in-memory simulated RLS on GitHub Pages
const nativeFetch = window.fetch.bind(window);
window.fetch = async function(url, options = {}) {
  if (!isDemoMode && typeof url === 'string' && url.startsWith('/api/')) {
    try {
      const res = await nativeFetch(url, options);
      if (res.ok || res.status === 400 || res.status === 500) return res;
    } catch (e) {
      // Backend not running (e.g. GitHub Pages) -> Fall through to demo mode
    }
  }

  if (typeof url === 'string' && url.startsWith('/api/')) {
    isDemoMode = true;
    const method = (options.method || 'GET').toUpperCase();
    const headers = options.headers || {};
    const tenantId = headers['x-tenant-id'] || currentTenantId;

    const mockResponse = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });

    if (url === '/api/status') {
      return mockResponse({ connected: true, database: 'crm_db (Cloud Demo)', user: 'postgres', host: 'github-pages', port: 5432 });
    }
    if (url === '/api/tenants') {
      return mockResponse(demoDB.tenants);
    }
    if (url === '/api/stats') {
      const tDeals = demoDB.deals.filter(d => d.tenant_id === tenantId);
      const wonDeals = tDeals.filter(d => d.stage_id === 's0000000-0000-7000-8000-000000000004');
      const openDeals = tDeals.filter(d => d.stage_id !== 's0000000-0000-7000-8000-000000000004');
      return mockResponse({
        open_count: openDeals.length,
        total_pipeline_value: openDeals.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0),
        won_count: wonDeals.length,
        won_value: wonDeals.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0),
        total_accounts: demoDB.accounts.filter(a => a.tenant_id === tenantId).length,
        total_contacts: demoDB.contacts.filter(c => c.tenant_id === tenantId).length
      });
    }
    if (url === '/api/pipeline') {
      return mockResponse({
        stages: demoDB.stages,
        deals: demoDB.deals.filter(d => d.tenant_id === tenantId)
      });
    }
    if (url.startsWith('/api/accounts')) {
      if (method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        const newAcc = { id: 'acc-' + Date.now(), tenant_id: tenantId, ...body };
        demoDB.accounts.unshift(newAcc);
        return mockResponse(newAcc, 201);
      }
      return mockResponse(demoDB.accounts.filter(a => a.tenant_id === tenantId));
    }
    if (url.startsWith('/api/contacts')) {
      if (method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        const acc = demoDB.accounts.find(a => a.id === body.account_id);
        const newCon = { id: 'con-' + Date.now(), tenant_id: tenantId, account_name: acc ? acc.name : '', ...body };
        demoDB.contacts.unshift(newCon);
        return mockResponse(newCon, 201);
      }
      return mockResponse(demoDB.contacts.filter(c => c.tenant_id === tenantId));
    }
    if (url.startsWith('/api/deals')) {
      if (method === 'PUT' && url.includes('/stage')) {
        const parts = url.split('/');
        const dealId = parts[3];
        const body = JSON.parse(options.body || '{}');
        const deal = demoDB.deals.find(d => d.id === dealId);
        if (deal) deal.stage_id = body.stage_id;
        return mockResponse({ success: true, deal });
      }
      if (method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        const acc = demoDB.accounts.find(a => a.id === body.account_id);
        const con = demoDB.contacts.find(c => c.id === body.primary_contact_id);
        const newDeal = {
          id: 'deal-' + Date.now(),
          tenant_id: tenantId,
          account_name: acc ? acc.name : 'Unknown Account',
          contact_name: con ? `${con.first_name} ${con.last_name}` : '',
          ...body
        };
        demoDB.deals.unshift(newDeal);
        return mockResponse(newDeal, 201);
      }
      return mockResponse(demoDB.deals.filter(d => d.tenant_id === tenantId));
    }
  }

  return nativeFetch(url, options);
};

// DOM Elements
const tenantSelect = document.getElementById('tenant-select');
const dbStatusIndicator = document.getElementById('db-status-indicator');
const dbStatusDot = dbStatusIndicator.querySelector('.status-dot');
const dbStatusText = document.getElementById('db-status-text');
const btnCreateAction = document.getElementById('btn-create-action');
const btnCreateActionText = document.getElementById('btn-create-action-text');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  setupDialogs();
  setupNavigation();
  setupForms();
  
  await checkDbStatus();
  if (isConnected) {
    await loadInitialData();
  }
});

// -------------------------------------------------------------
// 1. Modern Dialog Setup (with Modern Web Guidance Fallback)
// -------------------------------------------------------------
function setupDialogs() {
  const dialogs = document.querySelectorAll('dialog');
  
  dialogs.forEach(dialog => {
    // Light-dismiss click outside fallback
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isInContent = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        if (!isInContent) dialog.close();
      });
    }
  });

  document.getElementById('open-config-btn').addEventListener('click', () => {
    document.getElementById('modal-db-config').showModal();
  });

  document.getElementById('btn-new-account').addEventListener('click', () => {
    document.getElementById('modal-account').showModal();
  });

  document.getElementById('btn-new-contact').addEventListener('click', () => {
    populateAccountSelects();
    document.getElementById('modal-contact').showModal();
  });

  btnCreateAction.addEventListener('click', () => {
    const activeTab = document.querySelector('.nav-item.active').dataset.tab;
    if (activeTab === 'accounts') {
      document.getElementById('modal-account').showModal();
    } else if (activeTab === 'contacts') {
      populateAccountSelects();
      document.getElementById('modal-contact').showModal();
    } else {
      populateDealModal();
      document.getElementById('modal-deal').showModal();
    }
  });
}

// -------------------------------------------------------------
// 2. Navigation & Tabs
// -------------------------------------------------------------
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const panes = document.querySelectorAll('.tab-pane');
  const pageHeading = document.getElementById('page-heading');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      navItems.forEach(n => n.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetPane = document.getElementById(`tab-${tab}`);
      if (targetPane) targetPane.classList.add('active');

      // Update Topbar
      if (tab === 'deals') {
        pageHeading.textContent = 'Pipeline & Deals';
        btnCreateActionText.textContent = 'New Deal';
      } else if (tab === 'accounts') {
        pageHeading.textContent = 'Company Accounts';
        btnCreateActionText.textContent = 'New Account';
      } else if (tab === 'contacts') {
        pageHeading.textContent = 'Contacts Directory';
        btnCreateActionText.textContent = 'New Contact';
      } else {
        pageHeading.textContent = 'Platform Analytics';
        btnCreateActionText.textContent = 'New Deal';
      }
    });
  });

  // Tenant change event
  tenantSelect.addEventListener('change', async (e) => {
    currentTenantId = e.target.value;
    showToast(`Switched active tenant scope to ${tenantSelect.selectedOptions[0].text}`, 'info');
    await loadTenantData();
  });
}

// -------------------------------------------------------------
// 3. Database Connection & Status
// -------------------------------------------------------------
async function checkDbStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      isConnected = true;
      dbStatusDot.className = 'status-dot connected';
      dbStatusText.textContent = `PostgreSQL: ${data.database}`;
      return true;
    } else {
      isConnected = false;
      dbStatusDot.className = 'status-dot disconnected';
      dbStatusText.textContent = 'DB Password Required';
      document.getElementById('modal-db-config').showModal();
      return false;
    }
  } catch (err) {
    dbStatusDot.className = 'status-dot disconnected';
    dbStatusText.textContent = 'Server Offline';
    return false;
  }
}

// -------------------------------------------------------------
// 4. Data Loading
// -------------------------------------------------------------
async function loadInitialData() {
  await loadTenants();
  await loadTenantData();
}

async function loadTenants() {
  try {
    const res = await fetch('/api/tenants');
    if (!res.ok) return;
    const tenants = await res.json();
    if (tenants.length > 0) {
      tenantSelect.innerHTML = tenants.map(t => `
        <option value="${t.id}" ${t.id === currentTenantId ? 'selected' : ''}>
          ${escapeHtml(t.name)} (${t.current_plan_id.toUpperCase()})
        </option>
      `).join('');
      currentTenantId = tenantSelect.value;
    }
  } catch (err) {
    console.error('Error fetching tenants:', err);
  }
}

async function loadTenantData() {
  await Promise.all([
    loadStats(),
    loadPipeline(),
    loadAccounts(),
    loadContacts()
  ]);
}

// Stats
async function loadStats() {
  try {
    const res = await fetch('/api/stats', {
      headers: { 'x-tenant-id': currentTenantId }
    });
    if (!res.ok) return;
    const s = await res.json();

    document.getElementById('kpi-pipeline-val').textContent = formatCurrency(s.total_pipeline_value);
    document.getElementById('kpi-pipeline-sub').textContent = `${s.open_count} Open Deals`;
    document.getElementById('kpi-won-val').textContent = formatCurrency(s.won_value);
    document.getElementById('kpi-won-sub').textContent = `${s.won_count} Deals Closed Won`;
    document.getElementById('kpi-accounts-val').textContent = s.total_accounts;
    document.getElementById('kpi-contacts-val').textContent = s.total_contacts;
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// Pipeline & Kanban
async function loadPipeline() {
  const board = document.getElementById('kanban-board');
  try {
    const res = await fetch('/api/pipeline', {
      headers: { 'x-tenant-id': currentTenantId }
    });
    if (!res.ok) throw new Error('Failed to load pipeline');
    const { stages, deals } = await res.json();
    cachedStages = stages;

    if (!stages || stages.length === 0) {
      board.innerHTML = `<div class="kanban-loading">No pipeline stages found for this tenant.</div>`;
      return;
    }

    board.innerHTML = stages.map(stage => {
      const stageDeals = deals.filter(d => d.stage_id === stage.id);
      const stageTotal = stageDeals.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);

      return `
        <div class="kanban-col" data-stage-id="${stage.id}">
          <div class="kanban-col-header">
            <div class="kanban-col-title">
              <span>${escapeHtml(stage.name)}</span>
              <span class="col-badge">${stageDeals.length}</span>
            </div>
            <div class="col-total">${formatCurrency(stageTotal)}</div>
          </div>
          <div class="kanban-col-cards" data-stage-id="${stage.id}">
            ${stageDeals.map(d => renderDealCard(d)).join('')}
          </div>
        </div>
      `;
    }).join('');

    setupDragAndDrop();
  } catch (err) {
    board.innerHTML = `<div class="kanban-loading">Error loading deals: ${err.message}</div>`;
  }
}

function renderDealCard(deal) {
  return `
    <div class="deal-card" draggable="true" data-deal-id="${deal.id}">
      <div class="deal-account">${escapeHtml(deal.account_name || 'No Account')}</div>
      <div class="deal-title">${escapeHtml(deal.title)}</div>
      <div class="deal-footer">
        <span class="deal-amount">${formatCurrency(deal.amount)}</span>
        <span class="deal-contact">${escapeHtml(deal.contact_name || '')}</span>
      </div>
    </div>
  `;
}

// Drag & Drop
function setupDragAndDrop() {
  const cards = document.querySelectorAll('.deal-card');
  const dropZones = document.querySelectorAll('.kanban-col-cards');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.dealId);
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });

  dropZones.forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const dealId = e.dataTransfer.getData('text/plain');
      const newStageId = zone.dataset.stageId;

      if (!dealId || !newStageId) return;

      const card = document.querySelector(`.deal-card[data-deal-id="${dealId}"]`);
      if (card && card.parentElement !== zone) {
        zone.appendChild(card);
        await updateDealStage(dealId, newStageId);
      }
    });
  });
}

async function updateDealStage(dealId, stageId) {
  try {
    const res = await fetch(`/api/deals/${dealId}/stage`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': currentTenantId
      },
      body: JSON.stringify({ stage_id: stageId })
    });
    if (!res.ok) throw new Error('Update failed');
    showToast('Deal stage updated in PostgreSQL', 'success');
    await loadStats();
    await loadPipeline();
  } catch (err) {
    showToast(`Failed to update stage: ${err.message}`, 'error');
    await loadPipeline();
  }
}

// Accounts
async function loadAccounts() {
  const tbody = document.getElementById('accounts-tbody');
  try {
    const res = await fetch('/api/accounts', {
      headers: { 'x-tenant-id': currentTenantId }
    });
    if (!res.ok) throw new Error('Failed to load accounts');
    const accounts = await res.json();
    cachedAccounts = accounts;

    if (accounts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center">No accounts found. Create one above!</td></tr>`;
      return;
    }

    renderAccountsTable(accounts);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error: ${err.message}</td></tr>`;
  }
}

function renderAccountsTable(accounts) {
  const tbody = document.getElementById('accounts-tbody');
  tbody.innerHTML = accounts.map(a => `
    <tr>
      <td><strong>${escapeHtml(a.name)}</strong></td>
      <td><span class="text-dim">${escapeHtml(a.domain || '—')}</span></td>
      <td>${escapeHtml(a.industry || '—')}</td>
      <td><span class="badge ${getBadgeClass(a.lifecycle_stage)}">${escapeHtml(a.lifecycle_stage)}</span></td>
      <td style="font-family: var(--font-mono);">${formatCurrency(a.annual_revenue)}</td>
      <td>${a.contact_count} contacts</td>
      <td style="font-family: var(--font-mono);">${formatCurrency(a.total_deal_value)} (${a.deal_count})</td>
    </tr>
  `).join('');
}

// Contacts
async function loadContacts() {
  const tbody = document.getElementById('contacts-tbody');
  try {
    const res = await fetch('/api/contacts', {
      headers: { 'x-tenant-id': currentTenantId }
    });
    if (!res.ok) throw new Error('Failed to load contacts');
    const contacts = await res.json();
    cachedContacts = contacts;

    if (contacts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center">No contacts found. Create one above!</td></tr>`;
      return;
    }

    renderContactsTable(contacts);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error: ${err.message}</td></tr>`;
  }
}

function renderContactsTable(contacts) {
  const tbody = document.getElementById('contacts-tbody');
  tbody.innerHTML = contacts.map(c => `
    <tr>
      <td><strong>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</strong></td>
      <td>${escapeHtml(c.title || '—')}</td>
      <td><span class="badge blue">${escapeHtml(c.account_name || 'Independent')}</span></td>
      <td><a href="mailto:${escapeHtml(c.email)}" style="color: #818cf8; text-decoration: none;">${escapeHtml(c.email)}</a></td>
      <td>${escapeHtml(c.phone || '—')}</td>
      <td>${c.is_primary_contact ? '<span class="badge emerald">Primary</span>' : '—'}</td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// 5. Forms & Modals Handling
// -------------------------------------------------------------
function setupForms() {
  // DB Config
  document.getElementById('form-db-config').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-db');
    btn.textContent = 'Connecting...';
    btn.disabled = true;

    const payload = {
      host: document.getElementById('cfg-host').value,
      port: document.getElementById('cfg-port').value,
      database: document.getElementById('cfg-db').value,
      user: document.getElementById('cfg-user').value,
      password: document.getElementById('cfg-password').value
    };

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Connected to PostgreSQL successfully!', 'success');
        document.getElementById('modal-db-config').close();
        await checkDbStatus();
        await loadInitialData();
      } else {
        showToast(`Connection failed: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      btn.textContent = 'Connect & Save';
      btn.disabled = false;
    }
  });

  // New Deal
  document.getElementById('form-new-deal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('deal-title').value,
      amount: document.getElementById('deal-amount').value,
      stage_id: document.getElementById('deal-stage').value,
      account_id: document.getElementById('deal-account').value,
      primary_contact_id: document.getElementById('deal-contact').value || null,
      expected_close_date: document.getElementById('deal-close-date').value || null
    };

    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create deal');
      showToast('Deal created successfully!', 'success');
      document.getElementById('modal-deal').close();
      e.target.reset();
      await loadStats();
      await loadPipeline();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  });

  // New Account
  document.getElementById('form-new-account').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('acc-name').value,
      domain: document.getElementById('acc-domain').value,
      industry: document.getElementById('acc-industry').value,
      annual_revenue: document.getElementById('acc-revenue').value,
      lifecycle_stage: document.getElementById('acc-stage').value
    };

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create account');
      showToast('Account added to PostgreSQL!', 'success');
      document.getElementById('modal-account').close();
      e.target.reset();
      await loadStats();
      await loadAccounts();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  });

  // New Contact
  document.getElementById('form-new-contact').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      first_name: document.getElementById('cnt-first').value,
      last_name: document.getElementById('cnt-last').value,
      email: document.getElementById('cnt-email').value,
      phone: document.getElementById('cnt-phone').value,
      title: document.getElementById('cnt-title').value,
      account_id: document.getElementById('cnt-account').value || null
    };

    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create contact');
      showToast('Contact created successfully!', 'success');
      document.getElementById('modal-contact').close();
      e.target.reset();
      await loadStats();
      await loadContacts();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  });

  // Search Filters
  document.getElementById('accounts-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = cachedAccounts.filter(a => 
      a.name.toLowerCase().includes(term) || (a.domain && a.domain.toLowerCase().includes(term))
    );
    renderAccountsTable(filtered);
  });

  document.getElementById('contacts-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = cachedContacts.filter(c => 
      c.first_name.toLowerCase().includes(term) ||
      c.last_name.toLowerCase().includes(term) ||
      c.email.toLowerCase().includes(term) ||
      (c.account_name && c.account_name.toLowerCase().includes(term))
    );
    renderContactsTable(filtered);
  });
}

function populateDealModal() {
  const stageSelect = document.getElementById('deal-stage');
  const accountSelect = document.getElementById('deal-account');
  const contactSelect = document.getElementById('deal-contact');

  stageSelect.innerHTML = '<option value="">Select Stage...</option>' + 
    cachedStages.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  accountSelect.innerHTML = '<option value="">Select Account...</option>' + 
    cachedAccounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');

  contactSelect.innerHTML = '<option value="">Select Contact (Optional)...</option>' + 
    cachedContacts.map(c => `<option value="${c.id}">${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</option>`).join('');
}

function populateAccountSelects() {
  const cntAccount = document.getElementById('cnt-account');
  cntAccount.innerHTML = '<option value="">Select Account...</option>' + 
    cachedAccounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
function formatCurrency(val) {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(num);
}

function getBadgeClass(stage) {
  if (stage === 'customer') return 'emerald';
  if (stage === 'prospect') return 'indigo';
  if (stage === 'partner') return 'purple';
  return 'amber';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
