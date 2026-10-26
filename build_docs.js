const fs = require('fs');
const path = require('path');

const docPath = path.join(__dirname, 'DOCUMENTATION.md');
const markdownContent = fs.readFileSync(docPath, 'utf8');

// Escape </script> if present inside markdown to avoid prematurely terminating the script tag
const safeMarkdown = markdownContent.replace(/<\/script>/gi, '<\\/script>');

function generateHtml(options = {}) {
  const isDocsFolder = options.isDocsFolder || false;
  const homeLink = isDocsFolder ? '../' : '/';
  const pdfLink = isDocsFolder ? './CRM_Architecture_Documentation.pdf' : '/CRM_Architecture_Documentation.pdf';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OmniCRM — Database Architecture & Data Dictionary</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-surface: #1e293b;
      --bg-surface-elevated: #334155;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --accent: #38bdf8;
      --success: #10b981;
      --border-color: rgba(255, 255, 255, 0.08);
      --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-primary);
      color: var(--text-main);
      line-height: 1.7;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    /* Top Sticky Header */
    .top-header {
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.85rem 2rem;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .brand-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, #6366f1, #38bdf8);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
    }
    .brand-title {
      font-weight: 700;
      font-size: 1.1rem;
      letter-spacing: -0.02em;
    }
    .brand-subtitle {
      font-size: 0.8rem;
      color: var(--accent);
      background: rgba(56, 189, 248, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      margin-left: 0.5rem;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid var(--border-color);
      background: var(--bg-surface);
      color: var(--text-main);
    }
    .btn:hover {
      background: var(--bg-surface-elevated);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .btn-primary {
      background: var(--primary);
      border-color: var(--primary);
      color: white;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }

    /* Layout Container */
    .docs-layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      max-width: 1440px;
      margin: 0 auto;
      width: 100%;
      flex: 1;
    }

    /* Table of Contents Sidebar */
    .docs-sidebar {
      position: sticky;
      top: 61px;
      height: calc(100vh - 61px);
      overflow-y: auto;
      padding: 2rem 1.5rem;
      border-right: 1px solid var(--border-color);
      font-size: 0.85rem;
    }
    .toc-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      font-weight: 700;
      margin-bottom: 1rem;
    }
    .toc-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .toc-link {
      display: block;
      color: var(--text-muted);
      text-decoration: none;
      padding: 0.35rem 0.6rem;
      border-radius: 6px;
      transition: all 0.15s ease;
      line-height: 1.4;
    }
    .toc-link:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.05);
    }
    .toc-link.sub-link {
      padding-left: 1.25rem;
      font-size: 0.8rem;
    }

    /* Main Content Area */
    .docs-content {
      padding: 3rem 4rem;
      max-width: 1000px;
    }
    .docs-content h1 {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 1.25rem;
      color: #ffffff;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 1rem;
    }
    .docs-content h2 {
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-top: 2.5rem;
      margin-bottom: 1rem;
      color: #f1f5f9;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      padding-bottom: 0.5rem;
    }
    .docs-content h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 1.75rem;
      margin-bottom: 0.75rem;
      color: var(--accent);
    }
    .docs-content h4 {
      font-size: 1.05rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
      color: #e2e8f0;
    }
    .docs-content p, .docs-content ul, .docs-content ol {
      margin-bottom: 1.25rem;
      color: #cbd5e1;
    }
    .docs-content ul, .docs-content ol {
      padding-left: 1.5rem;
    }
    .docs-content li {
      margin-bottom: 0.4rem;
    }
    .docs-content a {
      color: var(--accent);
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .docs-content strong {
      color: #ffffff;
      font-weight: 600;
    }
    .docs-content code {
      font-family: var(--font-mono);
      font-size: 0.85em;
      background: rgba(0, 0, 0, 0.4);
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      color: #f472b6;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .docs-content pre {
      background: #090d16;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      padding: 1.25rem;
      overflow-x: auto;
      margin-bottom: 1.5rem;
    }
    .docs-content pre code {
      background: transparent;
      padding: 0;
      border: none;
      color: #f8fafc;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      line-height: 1.6;
    }

    /* Markdown Tables */
    .docs-content table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      margin-bottom: 2rem;
      background: var(--bg-surface);
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid var(--border-color);
      font-size: 0.85rem;
    }
    .docs-content th {
      background: #1e293b;
      text-align: left;
      padding: 0.75rem 1rem;
      font-weight: 600;
      color: #ffffff;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }
    .docs-content td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: #cbd5e1;
    }
    .docs-content tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Mermaid Container */
    .mermaid {
      background: #ffffff !important;
      padding: 1.5rem;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      margin: 1.5rem 0;
      display: flex;
      justify-content: center;
      overflow-x: auto;
    }
    .mermaid svg {
      max-width: 100% !important;
      height: auto !important;
    }

    /* HIGH-CONTRAST PRINT STYLESHEET (for PDF & Printing) */
    @media print {
      body {
        background: #ffffff !important;
        color: #0f172a !important;
        font-size: 9.5pt;
        line-height: 1.5;
      }
      .top-header, .docs-sidebar {
        display: none !important;
      }
      .docs-layout {
        display: block !important;
        max-width: 100% !important;
      }
      .docs-content {
        padding: 0 !important;
        max-width: 100% !important;
      }
      .docs-content h1 {
        font-size: 20pt !important;
        color: #000000 !important;
        border-bottom: 2px solid #000000 !important;
      }
      .docs-content h2 {
        font-size: 14pt !important;
        color: #0f172a !important;
        border-bottom: 1px solid #cbd5e1 !important;
        page-break-after: avoid;
        margin-top: 1.5rem !important;
      }
      .docs-content h3 {
        font-size: 11pt !important;
        color: #1e40af !important;
        page-break-after: avoid;
      }
      .docs-content h4 {
        font-size: 10pt !important;
        color: #0f172a !important;
      }
      .docs-content p, .docs-content li {
        color: #1e293b !important;
      }
      .docs-content strong {
        color: #000000 !important;
      }
      .docs-content a {
        color: #2563eb !important;
        text-decoration: none !important;
      }
      /* Tables */
      .docs-content table {
        border-collapse: collapse !important;
        border: 1px solid #94a3b8 !important;
        background: #ffffff !important;
        margin-bottom: 1.25rem !important;
        page-break-inside: avoid;
      }
      .docs-content th {
        background: #f1f5f9 !important;
        color: #000000 !important;
        font-weight: 700 !important;
        border: 1px solid #94a3b8 !important;
        padding: 6px 10px !important;
      }
      .docs-content td {
        color: #0f172a !important;
        border: 1px solid #cbd5e1 !important;
        padding: 5px 8px !important;
      }
      /* Code & ASCII blocks */
      .docs-content pre {
        background: #f8fafc !important;
        border: 1px solid #94a3b8 !important;
        page-break-inside: avoid;
      }
      .docs-content pre code {
        color: #000000 !important;
        font-size: 8pt !important;
        font-family: var(--font-mono) !important;
        font-weight: 500 !important;
      }
      .docs-content code {
        color: #000000 !important;
        background: #f1f5f9 !important;
        border: 1px solid #cbd5e1 !important;
      }
      .mermaid {
        background: #ffffff !important;
        border: 1px solid #94a3b8 !important;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>

  <header class="top-header">
    <div class="header-brand">
      <div class="brand-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      </div>
      <span class="brand-title">OmniCRM</span>
      <span class="brand-subtitle">Architecture Specification</span>
    </div>

    <div class="header-actions">
      <a href="${homeLink}" class="btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Live CRM App
      </a>
      <a href="https://github.com/SYEDMAHAMMEDAFZAL/multi-tenant-crm" target="_blank" class="btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
        GitHub Repository
      </a>
      <button onclick="window.print()" class="btn btn-primary">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print / Save PDF
      </button>
    </div>
  </header>

  <div class="docs-layout">
    <aside class="docs-sidebar">
      <div class="toc-title">Table of Contents</div>
      <ul class="toc-list" id="toc-container">
        <li><a href="#1-objective--scope" class="toc-link">1. Objective & Scope</a></li>
        <li><a href="#2-core-requirement-multi-tenancy" class="toc-link">2. Multi-Tenancy Architecture</a></li>
        <li><a href="#3-functional-areas-to-model" class="toc-link">3. Functional Areas</a></li>
        <li><a href="#41-entity-identification--classification" class="toc-link sub-link">4.1 Entity Identification</a></li>
        <li><a href="#42-relationships--cardinality-specification" class="toc-link sub-link">4.2 Relationships & Cardinality</a></li>
        <li><a href="#43-primary-key-strategy" class="toc-link sub-link">4.3 Primary Key Strategy</a></li>
        <li><a href="#44-foreign-keys--referential-integrity" class="toc-link sub-link">4.4 Referential Integrity</a></li>
        <li><a href="#45-tenant-isolation-strategy" class="toc-link sub-link">4.5 Tenant Isolation (RLS)</a></li>
        <li><a href="#46-indexing-strategy" class="toc-link sub-link">4.6 Indexing Strategy</a></li>
        <li><a href="#47-auditability--soft-deletion" class="toc-link sub-link">4.7 Auditability & Soft Delete</a></li>
        <li><a href="#48-extensibility-architecture" class="toc-link sub-link">4.8 Extensibility Architecture</a></li>
        <li><a href="#5-data-modeling-rules--standards" class="toc-link">5. Modeling Rules & Standards</a></li>
        <li><a href="#6-entity-relationship-diagram-erd" class="toc-link">6. Entity Relationship Diagram (ERD)</a></li>
        <li><a href="#7-complete-data-dictionary" class="toc-link">7. Complete Data Dictionary</a></li>
        <li><a href="#8-implementation-verification--proof" class="toc-link">8. Verification & Benchmarks</a></li>
      </ul>
    </aside>

    <main class="docs-content" id="markdown-target">
      <!-- Content populated automatically -->
    </main>
  </div>

  <!-- Raw Embedded Markdown Source for 100% Offline / Static / GitHub Pages Compatibility -->
  <script type="text/markdown" id="doc-source">${safeMarkdown}</script>

  <script>
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose'
    });

    async function renderDocumentation() {
      const target = document.getElementById('markdown-target');
      const rawMarkdown = document.getElementById('doc-source').textContent;

      // Custom marked renderer to convert mermaid blocks into .mermaid containers
      const renderer = {
        code(token) {
          const text = (typeof token === 'object' && token !== null) ? token.text : token;
          const lang = (typeof token === 'object' && token !== null) ? token.lang : arguments[1];

          if (lang === 'mermaid') {
            return '<pre class="mermaid">' + text + '</pre>';
          }
          return false; // let marked use default code block formatting
        }
      };

      marked.use({ renderer });
      target.innerHTML = marked.parse(rawMarkdown);

      // Render all Mermaid diagrams
      try {
        await mermaid.run({
          nodes: document.querySelectorAll('.mermaid')
        });
      } catch (err) {
        console.warn('Mermaid rendering notice:', err);
      }
    }

    // Execute immediately on DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderDocumentation);
    } else {
      renderDocumentation();
    }
  </script>
</body>
</html>`;
}

// Write to public/docs.html (for local Node server)
fs.writeFileSync(path.join(__dirname, 'public', 'docs.html'), generateHtml({ isDocsFolder: false }), 'utf8');
console.log('✅ Generated public/docs.html successfully');

// Ensure docs/ folder exists for GitHub Pages
const docsDir = path.join(__dirname, 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Write to docs/index.html (for GitHub Pages deployment)
fs.writeFileSync(path.join(docsDir, 'index.html'), generateHtml({ isDocsFolder: true }), 'utf8');
console.log('✅ Generated docs/index.html for GitHub Pages successfully');

// Copy PDF and schema assets into docs/
fs.copyFileSync(path.join(__dirname, 'DOCUMENTATION.md'), path.join(docsDir, 'DOCUMENTATION.md'));
fs.copyFileSync(path.join(__dirname, 'schema.sql'), path.join(docsDir, 'schema.sql'));
fs.copyFileSync(path.join(__dirname, 'seed.sql'), path.join(docsDir, 'seed.sql'));
if (fs.existsSync(path.join(__dirname, 'CRM_Architecture_Documentation.pdf'))) {
  fs.copyFileSync(path.join(__dirname, 'CRM_Architecture_Documentation.pdf'), path.join(docsDir, 'CRM_Architecture_Documentation.pdf'));
}
console.log('✅ Synced documentation assets to docs/ folder for GitHub Pages');
