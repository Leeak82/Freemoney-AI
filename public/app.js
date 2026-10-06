// FreeMoney-AI Frontend Single Page Controller

const API_BASE = '/api';

const state = {
  categories: [],
  selectedCategories: [],
  intent: null,
  naturalQuery: '',
  searchParams: {
    keyword: '',
    state: '',
    county: '',
    city: '',
    zip: '',
    nationwide: false,
    officialOnly: false,
  },
  userProfile: null,
  businessProfile: null,
  businesses: [],
  currentView: 'home',
  opportunities: [],
  loading: false,
  sessionToken: localStorage.getItem('freemoney_guest_token') || '',
  currentCaseId: localStorage.getItem('freemoney_case_id') || '',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? escapeHtml(url.href) : '#';
  } catch {
    return '#';
  }
}

function privateHeaders(extra = {}) {
  return state.sessionToken ? { ...extra, Authorization: `Bearer ${state.sessionToken}` } : extra;
}

async function ensureGuestCase() {
  if (!state.sessionToken) {
    const sessionRes = await fetch(`${API_BASE}/session/guest`, { method: 'POST' });
    const session = await sessionRes.json();
    if (!sessionRes.ok || !session.token) throw new Error(session.error || 'Could not start private guest session');
    state.sessionToken = session.token;
    localStorage.setItem('freemoney_guest_token', session.token);
  }
  if (!state.currentCaseId) {
    const caseRes = await fetch(`${API_BASE}/cases`, {
      method: 'POST', headers: privateHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'My assistance search', intent: state.intent || undefined }),
    });
    const data = await caseRes.json();
    if (!caseRes.ok || !data.case?.id) throw new Error(data.error || 'Could not create private assistance case');
    state.currentCaseId = data.case.id;
    localStorage.setItem('freemoney_case_id', data.case.id);
  }
  return state.currentCaseId;
}

function formatOpportunityLocation(opp) {
  if (opp.location_scope === 'UNKNOWN') return 'Unknown — verify with program administrator';
  if (opp.location_scope === 'NATIONWIDE') return 'Nationwide';
  if (opp.location_scope === 'ONLINE') return 'Online';
  if (opp.location_scope === 'COUNTRY') return opp.country_code === 'US' ? 'United States' : (opp.country_code || 'Country not published');
  const places = [...(opp.states || []), ...(opp.counties || []), ...(opp.cities || []), ...(opp.zip_codes || [])];
  return places.length ? places.join(', ') : opp.location_scope;
}

function formatOpportunityAmount(opp) {
  if (opp.amount_min == null && opp.amount_max == null) return 'Not published';
  const currency = opp.currency || 'USD';
  const format = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(value);
  if (opp.amount_min != null && opp.amount_max != null && Number(opp.amount_min) !== Number(opp.amount_max)) {
    return `${format(opp.amount_min)} – ${format(opp.amount_max)}`;
  }
  return format(opp.amount_max ?? opp.amount_min);
}

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadCategories();
  await loadProfile();
  await loadBusinesses();
  handleRoute();
});

function setupNavigation() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      window.history.pushState({}, '', href);
      handleRoute();
    });
  });

  window.addEventListener('popstate', handleRoute);
}

function handleRoute() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === path);
  });

  if (path === '/' || path === '') {
    renderHomeView();
  } else if (path === '/opportunities') {
    renderOpportunitiesView();
  } else if (path.startsWith('/opportunities/')) {
    const oppId = path.split('/')[2];
    renderOpportunityDetailView(oppId);
  } else if (path === '/profile') {
    renderProfileView();
  } else if (path === '/business') {
    renderBusinessView();
  } else if (path === '/applications') {
    renderApplicationsView();
  } else if (path === '/admin') {
    renderAdminView();
  } else {
    renderHomeView();
  }
}

async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    const data = await res.json();
    state.categories = data.categories || [];
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadProfile() {
  try {
    if (!state.sessionToken) return;
    const res = await fetch(`${API_BASE}/profile`, { headers: privateHeaders() });
    const data = await res.json();
    state.userProfile = data.profile;
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

async function loadBusinesses() {
  try {
    if (!state.sessionToken) return;
    const res = await fetch(`${API_BASE}/businesses`, { headers: privateHeaders() });
    const data = await res.json();
    state.businesses = data.businesses || [];
    state.businessProfile = state.businesses[0] || null;
  } catch (err) {
    console.error('Failed to load businesses:', err);
  }
}

// ----------------------------------------------------------------
// VIEW: Home (Landing + Instant Assistance Search)
// ----------------------------------------------------------------
function renderHomeView() {
  const root = document.getElementById('app-root');
  const visibleCategories = state.intent
    ? state.categories.filter(
        (category) =>
          category.audience_type === (state.intent === 'BUSINESS_ASSISTANCE' ? 'BUSINESS' : 'PERSONAL') ||
          category.audience_type === 'BOTH'
      )
    : [];
  root.innerHTML = `
    <section class="hero-section">
      <h1 class="hero-title">FreeMoney-AI</h1>
      <p class="hero-subtitle">
        Find source-backed personal assistance or verified resources to start and grow a business.
      </p>
    </section>

    <section class="path-section">
      <div class="input-label" style="text-align:center; margin-bottom:14px;">What do you need help with?</div>
      <div class="path-grid">
        <button class="path-card ${state.intent === 'PERSONAL_ASSISTANCE' ? 'selected' : ''}" data-intent="PERSONAL_ASSISTANCE">
          <span class="path-icon">◉</span>
          <strong>Find Personal Assistance</strong>
          <span>Housing, food, utilities, education, benefits, and emergency help</span>
        </button>
        <button class="path-card ${state.intent === 'BUSINESS_ASSISTANCE' ? 'selected' : ''}" data-intent="BUSINESS_ASSISTANCE">
          <span class="path-icon">◆</span>
          <strong>Start or Grow a Business</strong>
          <span>Formation, LLC guidance, funding, licenses, permits, and growth resources</span>
        </button>
      </div>
    </section>

    <div class="search-card" style="margin-bottom:20px;">
      <div class="input-label" style="margin-bottom:8px;">Describe what's going on</div>
      <p style="color:var(--text-muted);margin:0 0 12px;">Use normal language. FreeMoney-AI will turn it into conservative search filters and show what it detected.</p>
      <textarea id="input-natural-query" class="form-control" rows="3" placeholder="Examples:
• I want to start an LLC and don’t know where to begin.
• I need help getting a job and building a resume.
• I need groceries or food. I’m starving and don’t know what to do.">${escapeHtml(state.naturalQuery)}</textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:12px;">
        <button id="btn-natural-search" class="btn btn-primary">Search</button>
      </div>
    </div>

    ${state.intent ? `
    <div class="search-card">
      <div class="input-label" style="margin-bottom: 12px;">1. Select one or more categories</div>
      <div class="category-chips-grid" id="category-chips">
        ${visibleCategories
          .map(
            (cat) => `
          <div class="category-chip ${state.selectedCategories.includes(cat.slug) ? 'selected' : ''}" data-slug="${cat.slug}">
            ${cat.name}
          </div>
        `
          )
          .join('')}
      </div>

      <div class="input-label" style="margin-bottom: 12px;">2. Where and what?</div>
      <div class="search-input-row">
        <div class="input-group" style="flex: 2;">
          <input type="text" id="input-keyword" class="form-control" placeholder="${state.intent === 'BUSINESS_ASSISTANCE' ? 'Equipment, startup, training, contracts…' : 'Housing, food, health, education…'}" value="${state.searchParams.keyword}">
        </div>
        <div class="input-group" style="flex: 1; min-width: 140px;">
          <input type="text" id="input-state" class="form-control" placeholder="State" value="${state.searchParams.state}">
        </div>
        <div class="input-group" style="flex: 1; min-width: 140px;">
          <input type="text" id="input-county" class="form-control" placeholder="County (optional)" value="${state.searchParams.county}">
        </div>
        <div class="input-group" style="flex: 1; min-width: 140px;">
          <input type="text" id="input-city" class="form-control" placeholder="City (optional)" value="${state.searchParams.city}">
        </div>
        <div class="input-group" style="flex: 1; min-width: 120px;">
          <input type="text" id="input-zip" class="form-control" placeholder="ZIP" value="${state.searchParams.zip}">
        </div>
      </div>
      <div class="search-input-row" style="margin-top:14px; align-items:center;">
        <label class="location-toggle">
          <input type="checkbox" id="input-nationwide" ${state.searchParams.nationwide ? 'checked' : ''}>
          Nationwide / online programs
        </label>
        <div class="input-group" style="flex: 0 0 auto; margin-left:auto;">
          <button id="btn-find" class="btn btn-primary" style="height: 100%;">
            Find Assistance
          </button>
        </div>
      </div>
    </div>
    ` : `
      <div class="empty-prompt">Choose a path to begin. Registration is not required.</div>
    `}

    <div id="results-container">
      <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
        Select one or more categories or enter keywords above to discover verified assistance.
      </div>
    </div>
  `;

  document.querySelectorAll('.path-card').forEach((card) => {
    card.addEventListener('click', () => {
      state.intent = card.getAttribute('data-intent');
      state.selectedCategories = [];
      renderHomeView();
    });
  });

  document.getElementById('btn-natural-search')?.addEventListener('click', () => {
    state.naturalQuery = document.getElementById('input-natural-query').value.trim();
    executeNaturalLanguageSearch();
  });

  if (!state.intent) return;

  // Attach Category Selection
  document.querySelectorAll('.category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const slug = chip.getAttribute('data-slug');
      if (state.selectedCategories.includes(slug)) {
        state.selectedCategories = state.selectedCategories.filter((s) => s !== slug);
        chip.classList.remove('selected');
      } else {
        state.selectedCategories.push(slug);
        chip.classList.add('selected');
      }
    });
  });

  // Attach Search Action
  document.getElementById('btn-find').addEventListener('click', () => {
    state.searchParams.keyword = document.getElementById('input-keyword').value;
    state.searchParams.state = document.getElementById('input-state').value;
    state.searchParams.county = document.getElementById('input-county').value;
    state.searchParams.city = document.getElementById('input-city').value;
    state.searchParams.zip = document.getElementById('input-zip').value;
    state.searchParams.nationwide = document.getElementById('input-nationwide').checked;
    executeSearch();
  });
}

// ----------------------------------------------------------------
// Execute Search & Render Cards
// ----------------------------------------------------------------
async function executeNaturalLanguageSearch() {
  const container = document.getElementById('results-container');
  if (!container || !state.naturalQuery) return;

  container.innerHTML = `<div style="text-align:center;padding:50px 0;color:var(--text-muted);">Understanding your situation and searching verified programs...</div>`;
  try {
    const caseId = await ensureGuestCase();
    const payload = {
      text: state.naturalQuery,
      case_id: caseId,
      intent: state.intent || undefined,
      user_profile: state.userProfile || undefined,
      business_profile: state.businessProfile || undefined,
    };
    const res = await fetch(`${API_BASE}/search/natural-language`, {
      method: 'POST',
      headers: privateHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.details || data.error || 'Search failed');
    state.intent = data.interpretation?.search?.intent || state.intent;
    renderOpportunityCards(data.results || [], container);
    const detected = data.interpretation?.detected || {};
    const location = detected.location || {};
    const signals = [
      ...(detected.categories || []).map((x) => `Category: ${x.replace(/-/g, ' ')}`),
      location.city ? `City: ${location.city}` : null,
      location.county ? `County: ${location.county}` : null,
      location.state ? `State: ${location.state}` : null,
      location.zip ? `ZIP: ${location.zip}` : null,
      detected.urgency === 'URGENT' ? 'Urgent need detected' : null,
    ].filter(Boolean);
    container.insertAdjacentHTML('afterbegin', `
      <div class="search-card" style="margin-bottom:18px;">
        <strong>What FreeMoney-AI understood</strong>
        <div style="color:var(--text-muted);margin-top:8px;">${signals.length ? signals.map(escapeHtml).join(' • ') : 'Broad assistance search'}</div>
        <div style="color:var(--text-dim);font-size:.84rem;margin-top:8px;">This interpretation narrows the search; it does not claim you qualify. This inquiry is saved privately to this guest session so you can continue it.</div>
      </div>`);
  } catch (err) {
    container.innerHTML = `<div style="color:var(--danger);text-align:center;padding:30px;">${escapeHtml(err.message || 'Natural-language search failed.')}</div>`;
  }
}

async function executeSearch() {
  const container = document.getElementById('results-container');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 50px 0;">
      <div style="font-size: 1.1rem; color: var(--text-muted);">Searching official assistance databases...</div>
    </div>
  `;

  try {
    const payload = {
      categories: state.selectedCategories.length > 0 ? state.selectedCategories : undefined,
      keyword: state.searchParams.keyword || undefined,
      state: state.searchParams.state || undefined,
      county: state.searchParams.county || undefined,
      city: state.searchParams.city || undefined,
      zip: state.searchParams.zip || undefined,
      location_scope: state.searchParams.nationwide ? 'NATIONWIDE' : undefined,
      intent: state.intent || 'PERSONAL_ASSISTANCE',
      user_profile: state.intent === 'PERSONAL_ASSISTANCE' ? state.userProfile || undefined : undefined,
      business_profile: state.intent === 'BUSINESS_ASSISTANCE' ? state.businessProfile || undefined : undefined,
    };

    const res = await fetch(`${API_BASE}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    renderOpportunityCards(data.results || [], container);
  } catch (err) {
    container.innerHTML = `
      <div style="color: var(--danger); text-align: center; padding: 30px;">
        Search failed. Please ensure the server and database are running.
      </div>
    `;
  }
}

function renderOpportunityCards(items, container) {
  if (items.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px 0; background: var(--card-bg); border-radius: 12px; border: 1px dashed var(--surface-border);">
        <h3 style="margin-bottom: 8px;">No verified opportunities found for this search.</h3>
        <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto 20px;">
          Try a broader location or category.
        </p>
        <a href="/opportunities" class="btn btn-secondary">Browse All Live Programs</a>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="results-header">
      <div class="results-count">Found <strong>${items.length}</strong> Verified Opportunities</div>
      <div style="font-size: 0.85rem; color: var(--text-muted);">Sorted by Match & Source Trust</div>
    </div>
    <div class="opportunities-list">
      ${items
        .map((item) => {
          const opp = item.opportunity;
          const prov = item.source_provenance;
          const isOfficial = prov.official_source;
          const deadlineText = opp.deadline
            ? new Date(opp.deadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'Not published';

          const hasScore = item.match_score !== null;
          const officialApplication = opp.application_url && opp.application_url_verified;

          return `
            <div class="opportunity-card">
              <div class="card-top">
                <div>
                  <div style="font-size: 0.85rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
                    ${escapeHtml(opp.category.replace(/-/g, ' '))} • ${escapeHtml(opp.provider_name)}
                  </div>
                  <h3 class="card-title">${escapeHtml(opp.title)}</h3>
                </div>
                <span class="badge-trust ${isOfficial ? 'badge-official-gov' : 'badge-partner'}">
                  ${isOfficial ? 'Official Government' : prov.trust_level}
                </span>
              </div>

              <div class="meta-row">
                <div class="meta-item">Amount: <strong>${escapeHtml(formatOpportunityAmount(opp))}</strong></div>
                <div class="meta-item">Location: <strong>${escapeHtml(formatOpportunityLocation(opp))}</strong></div>
                <div class="meta-item">Deadline: <strong>${deadlineText}</strong></div>
                <div class="meta-item">Last Verified: <strong>${prov.last_verified}</strong></div>
              </div>

              <!-- AI Matching Reasoning Box -->
              <div class="match-box ${hasScore ? '' : 'insufficient'}">
                <div class="match-box-title">
                  ${
                    hasScore
                      ? `<span class="match-score-pill">${item.match_score}% Potential Match</span> <strong>${escapeHtml(item.match_status.replace(/_/g, ' '))}</strong>`
                      : `<strong>Needs Verification:</strong> ${escapeHtml(item.missing_information[0] || 'Complete your optional profile to improve matching.')}`
                  }
                </div>
                <div style="font-size: 0.88rem; color: var(--text-muted); margin-top: 4px;">
                  ${escapeHtml(item.why_you_may_qualify.join(' ') || 'Published eligibility information is incomplete; review the official notice.')}
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="card-actions">
                <a href="/opportunities/${opp.id}" class="btn btn-secondary view-detail-link" data-id="${opp.id}">View Program Details</a>
                <a href="${safeExternalUrl(opp.source_url)}" target="_blank" rel="noopener" class="btn btn-outline">Official Program Page ↗</a>
                ${officialApplication ? `<a href="${safeExternalUrl(opp.application_url)}" target="_blank" rel="noopener" class="btn btn-outline">Official Application ↗</a>` : ''}
                <button class="btn btn-primary btn-track-app" data-id="${opp.id}">Prepare Application</button>
              </div>
            </div>
          `;
        })
        .join('')}
    </div>
  `;

  // Attach Detail & Track Links
  container.querySelectorAll('.view-detail-link').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const id = btn.getAttribute('data-id');
      window.history.pushState({}, '', `/opportunities/${id}`);
      renderOpportunityDetailView(id);
    });
  });

  container.querySelectorAll('.btn-track-app').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await startApplication(id);
    });
  });
}

// ----------------------------------------------------------------
// VIEW: Opportunity Detail View (/opportunities/:id)
// ----------------------------------------------------------------
async function renderOpportunityDetailView(oppId) {
  const root = document.getElementById('app-root');
  root.innerHTML = `<div style="text-align: center; padding: 50px;">Loading program details...</div>`;

  try {
    const res = await fetch(`${API_BASE}/opportunities/${oppId}`);
    if (!res.ok) throw new Error('Opportunity not found');
    const data = await res.json();
    const opp = data.opportunity;
    const prov = data.source_provenance;
    const officialApplication = (data.application_links || []).find(
      (link) => link.official && link.type === 'OFFICIAL_APPLICATION'
    );
    const additionalSources = prov.additional_sources || [];

    root.innerHTML = `
      <div style="margin-bottom: 20px;">
        <a href="/opportunities" class="btn btn-outline" id="btn-back">← Back to All Opportunities</a>
      </div>

      <div class="detail-grid">
        <div>
          <div style="font-size: 0.9rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 6px;">
            ${escapeHtml(opp.category.replace(/-/g, ' '))} • Source Program ID: ${escapeHtml(opp.source_opportunity_id)}
          </div>
          <h1 style="font-size: 2rem; margin-bottom: 16px; line-height: 1.3;">${escapeHtml(opp.title)}</h1>

          <div class="meta-row" style="margin-bottom: 24px;">
            <div class="meta-item">Agency / Provider: <strong>${escapeHtml(opp.provider_name)}</strong></div>
            <div class="meta-item">Amount: <strong>${escapeHtml(formatOpportunityAmount(opp))}</strong></div>
            <div class="meta-item">Location: <strong>${escapeHtml(formatOpportunityLocation(opp))}</strong></div>
            <div class="meta-item">Deadline: <strong>${opp.deadline ? new Date(opp.deadline).toLocaleDateString() : 'Not published'}</strong></div>
            <div class="meta-item">Status: <strong>${escapeHtml(opp.status || 'UNKNOWN')}</strong></div>
          </div>

          <div class="search-card" style="margin-bottom: 24px;">
            <h3 style="margin-bottom: 12px; font-size: 1.1rem;">Program Overview & Purpose</h3>
            <p style="color: var(--text-muted); white-space: pre-line;">${escapeHtml(opp.description || 'Description not published by the source.')}</p>
          </div>

          <div class="search-card" style="margin-bottom: 24px;">
            <h3 style="margin-bottom: 12px; font-size: 1.1rem;">Eligibility & Requirements</h3>
            <p style="color: var(--text-muted);">${escapeHtml(opp.eligibility_summary || 'Unknown — verify with the program administrator and official notice.')}</p>
            <p style="color: var(--text-dim); margin-top: 10px;">Audience: ${escapeHtml((opp.audiences || []).join(', ') || 'Not published')}</p>
          </div>

          <div class="search-card">
            <h3 style="margin-bottom: 12px; font-size: 1.1rem;">Required Documentation Checklist</h3>
            <div>
              ${(data.documents || []).length ? data.documents
                .map(
                  (doc) => `
                <div class="checklist-item">
                  <span style="color: var(--primary); font-size: 1.1rem;">📄</span>
                  <div>
                    <strong style="color: #fff;">${escapeHtml(doc)}</strong>
                    <div style="font-size: 0.82rem; color: var(--text-dim);">Published by the opportunity source</div>
                  </div>
                </div>
              `
                )
                .join('') : '<p style="color: var(--text-muted);">Required documents were not published in the source data. Verify the official notice.</p>'}
            </div>
          </div>

          <div class="search-card" style="margin-top: 24px;">
            <h3 style="margin-bottom: 12px; font-size: 1.1rem;">Application Process</h3>
            <p style="color: var(--text-muted);">
              ${officialApplication
                ? 'A verified official application link is available below.'
                : 'Application link not verified. Use the official program page to confirm how to apply.'}
            </p>
          </div>
        </div>

        <div>
          <div class="provenance-card" style="margin-bottom: 20px;">
            <h3 style="font-size: 1rem; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
              Source Provenance & Verification
            </h3>
            <div style="font-size: 0.88rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px;">
              <div>Source: <strong>${escapeHtml(prov.source_name)}</strong></div>
              <div>Source Provider: <strong>${escapeHtml(prov.source_provider || opp.provider_name)}</strong></div>
              <div>Verification Level: <strong>${escapeHtml(prov.trust_level)}</strong></div>
              <div>Official Source: <strong>${prov.official_source ? 'Yes (Government)' : 'No'}</strong></div>
              <div>Raw Source ID: <strong>${escapeHtml(prov.source_opportunity_id)}</strong></div>
              <div>Last Verified: <strong>${escapeHtml(prov.last_verified)}</strong></div>
              <div>Retrieved: <strong>${escapeHtml(prov.retrieved_at)}</strong></div>
              <div>Source Records: <strong>${additionalSources.length}</strong></div>
            </div>
            <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 8px;">
              <a href="${safeExternalUrl(opp.source_url)}" target="_blank" rel="noopener" class="btn btn-secondary" style="width: 100%;">
                Official Program Page ↗
              </a>
              ${officialApplication ? `
                <a href="${safeExternalUrl(officialApplication.url)}" target="_blank" rel="noopener" class="btn btn-secondary" style="width: 100%;">
                  Official Application ↗
                </a>
              ` : '<div style="font-size:0.85rem;color:var(--text-muted);text-align:center;">Application link not verified.</div>'}
              <button class="btn btn-primary" id="btn-prepare-detail" style="width: 100%;">
                Prepare Application
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-back').addEventListener('click', (e) => {
      e.preventDefault();
      window.history.pushState({}, '', '/opportunities');
      renderOpportunitiesView();
    });

    document.getElementById('btn-prepare-detail').addEventListener('click', async () => {
      await startApplication(opp.id);
    });
  } catch (err) {
    root.innerHTML = `<div style="color: var(--danger); text-align: center; padding: 40px;">Failed to load opportunity.</div>`;
  }
}

// ----------------------------------------------------------------
// VIEW: All Opportunities Directory (/opportunities)
// ----------------------------------------------------------------
async function renderOpportunitiesView() {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 2rem; margin-bottom: 8px;">Verified Assistance Programs</h1>
      <p style="color: var(--text-muted);">Browse all active government and foundational grant opportunities.</p>
    </div>
    <div id="results-container">
      <div style="text-align: center; padding: 40px 0;">Loading programs...</div>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/opportunities?limit=50`);
    const data = await res.json();
    renderOpportunityCards(data.results || [], document.getElementById('results-container'));
  } catch (err) {
    document.getElementById('results-container').innerHTML = `
      <div style="color: var(--danger);">Failed to load opportunities list.</div>
    `;
  }
}

// ----------------------------------------------------------------
// VIEW: Optional User Profile (/profile)
// ----------------------------------------------------------------
async function renderProfileView() {
  await loadProfile();
  const prof = state.userProfile || {};
  const root = document.getElementById('app-root');

  root.innerHTML = `
    <div style="max-width: 760px; margin: 0 auto;">
      <h1 style="font-size: 2rem; margin-bottom: 8px;">Optional Profile</h1>
      <p style="color: var(--text-muted); margin-bottom: 24px;">
        Providing optional details helps calculate exact match scores and tailored checklists. You can search anytime without this.
      </p>

      <div class="search-card">
        <form id="profile-form">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label class="input-label">State of Residence</label>
              <input type="text" id="prof-state" class="form-control" placeholder="e.g. WA, CA, NY" value="${prof.state || ''}">
            </div>
            <div>
              <label class="input-label">ZIP Code</label>
              <input type="text" id="prof-zip" class="form-control" placeholder="e.g. 98402" value="${prof.zip_code || ''}">
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div>
              <label class="input-label">Household Size</label>
              <input type="number" id="prof-household" class="form-control" placeholder="1" value="${prof.household_size || 1}">
            </div>
            <div>
              <label class="input-label">Annual Income Range</label>
              <select id="prof-income" class="form-control">
                <option value="">Prefer not to say</option>
                <option value="under-25k" ${prof.income_range === 'under-25k' ? 'selected' : ''}>Under $25,000</option>
                <option value="25k-50k" ${prof.income_range === '25k-50k' ? 'selected' : ''}>$25,000 - $50,000</option>
                <option value="50k-75k" ${prof.income_range === '50k-75k' ? 'selected' : ''}>$50,000 - $75,000</option>
                <option value="over-75k" ${prof.income_range === 'over-75k' ? 'selected' : ''}>Over $75,000</option>
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
            <div>
              <label class="input-label">Housing Status</label>
              <select id="prof-housing" class="form-control">
                <option value="">Unspecified</option>
                <option value="RENTER" ${prof.housing_status === 'RENTER' ? 'selected' : ''}>Renter</option>
                <option value="HOMEOWNER" ${prof.housing_status === 'HOMEOWNER' ? 'selected' : ''}>Homeowner</option>
                <option value="UNHOUSED" ${prof.housing_status === 'UNHOUSED' ? 'selected' : ''}>Unhoused / Emergency Shelter</option>
              </select>
            </div>
            <div>
              <label class="input-label">Employment Status</label>
              <input type="text" id="prof-employment" class="form-control" placeholder="e.g. Employed, Seeking Work, Student" value="${prof.employment_status || ''}">
            </div>
          </div>

          <div class="input-label" style="margin-bottom: 10px;">Demographic & Eligibility Factors</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="prof-veteran" ${prof.is_veteran ? 'checked' : ''}> Military Veteran
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="prof-disabled" ${prof.is_disabled ? 'checked' : ''}> Individual with Disability
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="prof-student" ${prof.is_student ? 'checked' : ''}> Current Student
            </label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="prof-business" ${prof.is_business_owner ? 'checked' : ''}> Small Business Owner
            </label>
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%;">Save Profile</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      state: document.getElementById('prof-state').value,
      zip_code: document.getElementById('prof-zip').value,
      household_size: parseInt(document.getElementById('prof-household').value, 10) || 1,
      income_range: document.getElementById('prof-income').value,
      housing_status: document.getElementById('prof-housing').value,
      employment_status: document.getElementById('prof-employment').value,
      is_veteran: document.getElementById('prof-veteran').checked,
      is_disabled: document.getElementById('prof-disabled').checked,
      is_student: document.getElementById('prof-student').checked,
      is_business_owner: document.getElementById('prof-business').checked,
    };

    try {
      const res = await fetch(`${API_BASE}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert('Profile saved successfully! Your search results will now reflect tailored match scores.');
        window.history.pushState({}, '', '/');
        renderHomeView();
      }
    } catch (err) {
      alert('Failed to save profile.');
    }
  });
}

// ----------------------------------------------------------------
// VIEW: Business Startup Wizard & LLC Assistant (/business)
// ----------------------------------------------------------------
async function renderBusinessView() {
  await loadBusinesses();
  const business = state.businessProfile || {};
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <section class="business-hero">
      <div>
        <div class="eyebrow">Start or grow a business</div>
        <h1>Business launch workspace</h1>
        <p>Answer only what you know. FreeMoney-AI uses these optional facts to find source-backed resources and never assumes ownership certifications.</p>
      </div>
      <span class="trust-note">Educational guidance — not legal or tax advice</span>
    </section>

    <div class="detail-grid">
      <section class="search-card">
        <form id="business-form">
          <input type="hidden" id="biz-id" value="${business.business_id || ''}">
          <div class="wizard-step">Step 1 · The idea and stage</div>
          <label class="input-label">What is your business idea?</label>
          <textarea id="biz-description" class="form-control" rows="3" placeholder="Describe the product, service, and customer">${business.business_description || ''}</textarea>

          <div class="form-grid">
            <div>
              <label class="input-label">Industry</label>
              <input id="biz-industry" class="form-control" value="${business.industry || ''}" placeholder="e.g. construction, retail, software">
            </div>
            <div>
              <label class="input-label">Business stage</label>
              <select id="biz-stage" class="form-control">
                ${['IDEA','PLANNING','FORMATION','PRE_REVENUE','OPERATING','GROWING','EXPANDING','DISTRESSED'].map(stage => `<option value="${stage}" ${business.business_stage === stage ? 'selected' : ''}>${stage.replace(/_/g, ' ')}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="wizard-step">Step 2 · Where will it operate?</div>
          <div class="form-grid">
            <div><label class="input-label">State</label><input id="biz-state" class="form-control" value="${business.state || ''}" placeholder="Two-letter state"></div>
            <div><label class="input-label">County</label><input id="biz-county" class="form-control" value="${business.county || ''}" placeholder="Optional"></div>
            <div><label class="input-label">City</label><input id="biz-city" class="form-control" value="${business.city || ''}" placeholder="Optional"></div>
            <div><label class="input-label">ZIP</label><input id="biz-zip" class="form-control" value="${business.postal_code || ''}" placeholder="Optional"></div>
          </div>

          <div class="wizard-step">Step 3 · Structure and funding</div>
          <div class="form-grid">
            <div>
              <label class="input-label">Preferred structure</label>
              <select id="biz-structure" class="form-control">
                ${['UNKNOWN','SOLE_PROPRIETORSHIP','LLC','PARTNERSHIP','S_CORPORATION','C_CORPORATION','NONPROFIT','OTHER'].map(structure => `<option value="${structure}" ${business.business_structure === structure ? 'selected' : ''}>${structure.replace(/_/g, ' ')}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="input-label">Funding purpose</label>
              <select id="biz-purpose" class="form-control">
                <option value="">Not selected</option>
                ${['STARTUP_COSTS','EQUIPMENT','INVENTORY','WORKING_CAPITAL','RENT','UTILITIES','PAYROLL','MARKETING','TECHNOLOGY','TRAINING','REAL_ESTATE','VEHICLE','EXPANSION','DISASTER_RECOVERY','EXPORT','OTHER'].map(purpose => `<option value="${purpose}" ${business.funding_purpose === purpose ? 'selected' : ''}>${purpose.replace(/_/g, ' ')}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="input-label">Funding needed</label>
              <input id="biz-funding" type="number" min="0" class="form-control" value="${business.funding_needed || ''}" placeholder="Optional amount">
            </div>
            <div>
              <label class="input-label">Expected employees</label>
              <input id="biz-employees" type="number" min="0" class="form-control" value="${business.employee_count ?? ''}" placeholder="Optional">
            </div>
          </div>

          <details class="optional-panel">
            <summary>Optional ownership characteristics</summary>
            <p>Choose only characteristics the business actually meets. These are never assumed.</p>
            <div class="ownership-grid">
              ${[
                ['veteran','Veteran-owned', business.veteran_owned],
                ['women','Women-owned', business.women_owned],
                ['disability','Disability-owned', business.disability_owned],
                ['minority','Minority-owned', business.minority_owned],
                ['rural','Rural business', business.rural_business],
              ].map(([id,label,checked]) => `<label><input type="checkbox" id="biz-${id}" ${checked ? 'checked' : ''}> ${label}</label>`).join('')}
            </div>
          </details>

          <button type="submit" class="btn btn-primary" style="width:100%;">Save and build my checklist</button>
        </form>
      </section>

      <aside>
        <div class="provenance-card">
          <h3>Verified guidance policy</h3>
          <p>State formation, license, permit, fee, and compliance facts appear only when backed by an official source. Unknown facts display <strong>Needs verification</strong>.</p>
          <button id="btn-business-requirements" class="btn btn-secondary" style="width:100%; margin-top:14px;">Research official requirements</button>
          <button id="btn-business-search" class="btn btn-primary" style="width:100%; margin-top:10px;" ${business.business_id ? '' : 'disabled'}>Find business assistance</button>
        </div>
        <div id="business-guidance" style="margin-top:18px;"></div>
      </aside>
    </div>

    <section id="business-checklists" style="margin-top:28px;">
      ${business.business_id ? '<div class="empty-prompt">Loading checklists…</div>' : ''}
    </section>
  `;

  if (business.business_id) {
    await renderBusinessChecklists(business.business_id);
    if (business.business_structure === 'LLC') {
      await loadFormationGuidance(business);
    }
  }

  document.getElementById('business-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const numberOrNull = (id) => {
      const value = document.getElementById(id).value;
      return value === '' ? null : Number(value);
    };
    const payload = {
      business_id: document.getElementById('biz-id').value || undefined,
      business_description: document.getElementById('biz-description').value || null,
      industry: document.getElementById('biz-industry').value || null,
      business_stage: document.getElementById('biz-stage').value,
      country: 'US',
      state: document.getElementById('biz-state').value || null,
      county: document.getElementById('biz-county').value || null,
      city: document.getElementById('biz-city').value || null,
      postal_code: document.getElementById('biz-zip').value || null,
      business_structure: document.getElementById('biz-structure').value,
      funding_purpose: document.getElementById('biz-purpose').value || null,
      funding_needed: numberOrNull('biz-funding'),
      employee_count: numberOrNull('biz-employees'),
      veteran_owned: document.getElementById('biz-veteran').checked,
      women_owned: document.getElementById('biz-women').checked,
      disability_owned: document.getElementById('biz-disability').checked,
      minority_owned: document.getElementById('biz-minority').checked,
      rural_business: document.getElementById('biz-rural').checked,
    };
    const res = await fetch(`${API_BASE}/businesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Unable to save business profile.');
      return;
    }
    state.businessProfile = data.business;
    await renderBusinessView();
  });

  document.getElementById('btn-business-requirements').addEventListener('click', async () => {
    const input = {
      countryCode: 'US',
      state: document.getElementById('biz-state').value || undefined,
      county: document.getElementById('biz-county').value || undefined,
      city: document.getElementById('biz-city').value || undefined,
      industry: document.getElementById('biz-industry').value || undefined,
    };
    const res = await fetch(`${API_BASE}/business/requirements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await res.json();
    document.getElementById('business-guidance').innerHTML = `
      <div class="provenance-card">
        <h3>Official starting points</h3>
        ${(data.requirements || []).map(item => `
          <div class="resource-item">
            <span class="verification-badge">${item.status.replace(/_/g, ' ')}</span>
            <strong>${item.title}</strong>
            <p>${item.description}</p>
            <a href="${item.officialUrl}" target="_blank" rel="noopener">Official ${item.agency} source ↗</a>
          </div>
        `).join('')}
      </div>`;
  });

  document.getElementById('btn-business-search').addEventListener('click', async () => {
    if (!state.businessProfile?.business_id) return;
    state.intent = 'BUSINESS_ASSISTANCE';
    state.selectedCategories = [];
    window.history.pushState({}, '', '/');
    renderHomeView();
  });
}

async function loadFormationGuidance(business) {
  const res = await fetch(`${API_BASE}/business/formation-guidance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      countryCode: business.country || 'US',
      state: business.state || undefined,
      structure: business.business_structure,
    }),
  });
  const data = await res.json();
  const guidance = data.guidance;
  if (!guidance) return;
  document.getElementById('business-guidance').innerHTML = `
    <div class="provenance-card">
      <h3>LLC Assistant</h3>
      <p class="verification-warning">${guidance.supported ? 'Verified provider available' : 'State-specific information not verified'}</p>
      ${(guidance.requirements || []).map(item => `
        <div class="resource-item">
          <strong>${item.title}</strong>
          <p>${item.description}</p>
          <a href="${item.officialUrl}" target="_blank" rel="noopener">${item.organization} ↗</a>
        </div>
      `).join('')}
      ${(guidance.missingInformation || []).map(item => `<div class="missing-item">Needs verification: ${item}</div>`).join('')}
      <small>${guidance.disclaimer}</small>
    </div>`;
}

async function renderBusinessChecklists(businessId) {
  const res = await fetch(`${API_BASE}/businesses/${businessId}/checklists`);
  const data = await res.json();
  const container = document.getElementById('business-checklists');
  container.innerHTML = (data.checklists || []).map(checklist => `
    <div class="search-card">
      <div class="card-top"><h2>${checklist.title}</h2><span class="badge-trust badge-partner">${checklist.checklist_type.replace(/_/g, ' ')}</span></div>
      <div class="checklist-grid">
        ${checklist.items.map(item => `
          <button class="business-check-item ${item.status === 'COMPLETED' ? 'completed' : ''}" data-item-id="${item.id}" data-status="${item.status}">
            <span>${item.status === 'COMPLETED' ? '✓' : '○'}</span>
            <span><strong>${item.title}</strong><small>${item.description}</small></span>
          </button>
        `).join('')}
      </div>
    </div>
  `).join('');
  container.querySelectorAll('.business-check-item').forEach(item => {
    item.addEventListener('click', async () => {
      const nextStatus = item.getAttribute('data-status') === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED';
      await fetch(`${API_BASE}/businesses/${businessId}/checklists/items/${item.getAttribute('data-item-id')}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      await renderBusinessChecklists(businessId);
    });
  });
}

// ----------------------------------------------------------------
// VIEW: Applications Tracker (/applications)
// ----------------------------------------------------------------
async function renderApplicationsView() {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 2rem; margin-bottom: 8px;">Application Tracker & Checklist</h1>
      <p style="color: var(--text-muted);">
        Prepare and track your assistance applications safely. All submissions require your explicit review and confirmation.
      </p>
    </div>
    <div id="applications-list"><div style="text-align:center; padding: 40px;">Loading your applications...</div></div>
  `;

  try {
    const res = await fetch(`${API_BASE}/applications`);
    const data = await res.json();
    const apps = data.applications || [];
    const listContainer = document.getElementById('applications-list');

    if (apps.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 0; background: var(--card-bg); border-radius: 14px; border: 1px dashed var(--surface-border);">
          <h3>No applications in preparation</h3>
          <p style="color: var(--text-muted); margin: 8px 0 20px;">
            Find opportunities and click "Prepare Application" to build your document checklist.
          </p>
          <a href="/opportunities" class="btn btn-primary">Find Assistance Programs</a>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = apps
      .map((app) => {
        const checklist = Array.isArray(app.checklist) ? app.checklist : [];
        return `
          <div class="opportunity-card">
            <div class="card-top">
              <div>
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--primary); text-transform: uppercase;">
                  ${app.category} • ${app.provider_name}
                </div>
                <h3 class="card-title">${app.opportunity_title}</h3>
              </div>
              <span class="badge-trust badge-official-gov">Status: ${app.status}</span>
            </div>

            <div style="margin-top: 10px;">
              <strong>Document Checklist:</strong>
              <div style="margin-top: 8px;">
                ${checklist
                  .map(
                    (item) => `
                  <div class="checklist-item">
                    <span>${item.collected ? '✅' : '⬜'}</span>
                    <span>${item.document_name}</span>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>

            <div class="card-actions" style="margin-top: 14px;">
              <a href="${app.application_url || app.source_url}" target="_blank" rel="noopener" class="btn btn-primary">
                Open Official Portal ↗
              </a>
              <button class="btn btn-secondary btn-status-update" data-id="${app.id}" data-status="READY_FOR_REVIEW">
                Mark Ready for Review
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    listContainer.querySelectorAll('.btn-status-update').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const status = btn.getAttribute('data-status');
        await fetch(`${API_BASE}/applications/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        renderApplicationsView();
      });
    });
  } catch (err) {
    root.innerHTML = `<div style="color: var(--danger);">Failed to load application tracker.</div>`;
  }
}

async function startApplication(oppId) {
  try {
    const res = await fetch(`${API_BASE}/applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opportunity_id: oppId,
        business_id:
          state.intent === 'BUSINESS_ASSISTANCE'
            ? state.businessProfile?.business_id
            : undefined,
        application_type:
          state.intent === 'BUSINESS_ASSISTANCE'
            ? 'BUSINESS_ASSISTANCE'
            : 'PERSONAL_ASSISTANCE',
      }),
    });
    if (res.ok) {
      alert('Application preparation started! Document checklist generated.');
      window.history.pushState({}, '', '/applications');
      renderApplicationsView();
    }
  } catch (err) {
    alert('Failed to start application tracking.');
  }
}

// ----------------------------------------------------------------
// VIEW: Admin & Source Sync Controller (/admin)
// ----------------------------------------------------------------
async function renderAdminView() {
  const root = document.getElementById('app-root');
  let adminKey = sessionStorage.getItem('freemoney-admin-key') || '';

  root.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 2rem; margin-bottom: 8px;">Source Registry & Admin Operations</h1>
      <p style="color: var(--text-muted);">Manage official feeds, review sync runs, trigger ingestion, and catalog candidate APIs.</p>
    </div>

    <div class="search-card" style="margin-bottom: 24px;">
      <h3 style="margin-bottom: 14px;">Admin Authentication</h3>
      <div style="display:flex; gap:12px;">
        <input id="admin-key" type="password" class="form-control" placeholder="Admin API key" value="">
        <button id="btn-save-admin-key" class="btn btn-secondary">Use Key</button>
      </div>
      <p style="font-size:0.8rem;color:var(--text-dim);margin-top:8px;">The key is held only in this browser tab.</p>
    </div>

    <div class="search-card" style="margin-bottom: 24px;">
      <h3 style="margin-bottom: 14px;">Source Operations</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button id="btn-sync-grants" class="btn btn-primary">Sync Grants.gov</button>
        <button id="btn-discover-apis" class="btn btn-secondary">Import Public API Candidates</button>
      </div>
      <div id="sync-status" style="margin-top: 14px; font-size: 0.9rem; color: var(--text-muted);"></div>
    </div>

    <div id="admin-sources-list">Loading registered sources...</div>
    <div id="admin-sync-history" style="margin-top:24px;"></div>
  `;

  document.getElementById('btn-save-admin-key').addEventListener('click', () => {
    adminKey = document.getElementById('admin-key').value.trim();
    if (adminKey) sessionStorage.setItem('freemoney-admin-key', adminKey);
    document.getElementById('admin-key').value = '';
    document.getElementById('sync-status').textContent = adminKey ? 'Admin key loaded for this tab.' : 'Enter an admin key.';
  });

  try {
    const res = await fetch(`${API_BASE}/sources`);
    const data = await res.json();
    const sources = data.sources || [];

    document.getElementById('admin-sources-list').innerHTML = `
      <div class="search-card">
        <h3 style="margin-bottom: 16px;">Registered Sources (${sources.length})</h3>
        ${sources
          .map(
            (s) => `
          <div style="display: flex; justify-content: space-between; gap:16px; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--surface-border);">
            <div>
              <strong>${escapeHtml(s.name)}</strong> <span style="font-size: 0.8rem; color: var(--primary);">[${escapeHtml(s.trust_level)}]</span>
              <div style="font-size: 0.82rem; color: var(--text-muted);">${escapeHtml(s.organization)} • ${escapeHtml(s.source_role || 'RESOURCE')} • ${escapeHtml(s.discovery_status)}</div>
              <div style="font-size: 0.78rem; color: var(--text-dim);">
                Opportunities: ${Number(s.opportunity_count || 0)} (${Number(s.active_opportunity_count || 0)} active)
                • Last sync: ${s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : 'Never'}
                • Last success: ${s.last_success_at ? new Date(s.last_success_at).toLocaleString() : 'Never'}
              </div>
              ${s.last_error_message ? `<div style="font-size:0.78rem;color:var(--danger);">${escapeHtml(s.last_error_message)}</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
              <span class="badge-trust ${s.enabled ? 'badge-official-gov' : 'badge-partner'}">
                ${s.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <button class="btn btn-outline btn-inspect-source" data-source="${escapeHtml(s.id)}">Inspect</button>
              ${s.source_role === 'OPPORTUNITY_FEED' && s.enabled ? `
                <button class="btn btn-outline btn-sync-source" data-source="${escapeHtml(s.id)}">Sync</button>
              ` : ''}
              <button class="btn btn-outline btn-toggle-source" data-source="${escapeHtml(s.id)}" data-enabled="${s.enabled}" data-status="${escapeHtml(s.discovery_status)}">
                ${s.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    const requireKey = () => {
      if (adminKey) return true;
      document.getElementById('sync-status').textContent = 'Enter the admin API key first.';
      return false;
    };

    document.getElementById('btn-sync-grants').addEventListener('click', async () => {
      const statusDiv = document.getElementById('sync-status');
      if (!requireKey()) return;
      statusDiv.innerHTML = 'Executing real Grants.gov API sync...';
      try {
        const syncRes = await fetch(`${API_BASE}/sync/grants-gov`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': adminKey,
          },
          body: JSON.stringify({ rows: 10, max_pages: 1, include_details: true }),
        });
        const syncData = await syncRes.json();
        if (!syncRes.ok) throw new Error(syncData.details || syncData.error);
        statusDiv.innerHTML = `<span style="color: var(--primary);">Grants.gov: ${escapeHtml(syncData.result.status)} — found ${syncData.result.found}, fetched ${syncData.result.fetched}, created ${syncData.result.created}, updated ${syncData.result.updated}, rejected ${syncData.result.rejected}, errors ${syncData.result.errors}.</span>`;
      } catch (err) {
        statusDiv.innerHTML = `<span style="color: var(--danger);">Sync failed: ${err.message}</span>`;
      }
    });

    document.getElementById('btn-discover-apis').addEventListener('click', async () => {
      const statusDiv = document.getElementById('sync-status');
      if (!requireKey()) return;
      statusDiv.innerHTML = 'Parsing public-apis catalog candidates...';
      try {
        const discRes = await fetch(`${API_BASE}/admin/discover-apis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': adminKey,
          },
          body: JSON.stringify({ catalog_source_id: 'public-api-lists' }),
        });
        const discData = await discRes.json();
        if (!discRes.ok) throw new Error(discData.details || discData.error);
        statusDiv.innerHTML = `<span style="color: var(--primary);">Discovery complete: ${discData.discovered} catalog entries parsed and ${discData.persisted} candidates persisted. All remain in review lifecycle.</span>`;
      } catch (err) {
        statusDiv.innerHTML = `<span style="color: var(--danger);">Discovery failed: ${err.message}</span>`;
      }
    });

    document.querySelectorAll('.btn-toggle-source').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!requireKey()) return;
        const sourceId = button.dataset.source;
        const enabled = button.dataset.enabled !== 'true';
        const currentStatus = button.dataset.status;
        const response = await fetch(`${API_BASE}/admin/sources/${encodeURIComponent(sourceId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
          body: JSON.stringify({
            enabled,
            discovery_status: enabled && currentStatus === 'DISABLED'
              ? 'ACTIVE'
              : (enabled ? currentStatus : 'DISABLED'),
          }),
        });
        const result = await response.json();
        if (!response.ok) {
          document.getElementById('sync-status').textContent = result.error || 'Source update failed.';
          return;
        }
        renderAdminView();
      });
    });

    document.querySelectorAll('.btn-sync-source').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!requireKey()) return;
        const sourceId = button.dataset.source;
        const statusDiv = document.getElementById('sync-status');
        statusDiv.textContent = `Synchronizing ${sourceId}...`;
        const response = await fetch(`${API_BASE}/sync/${encodeURIComponent(sourceId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
          body: JSON.stringify({
            rows: sourceId === 'grants-gov' ? 10 : 100,
            max_pages: 1,
            include_details: sourceId === 'grants-gov',
          }),
        });
        const result = await response.json();
        statusDiv.textContent = response.ok
          ? `${sourceId}: ${result.result.status}; fetched ${result.result.fetched}, created ${result.result.created}, updated ${result.result.updated}.`
          : (result.details || result.error || 'Synchronization failed.');
      });
    });

    document.querySelectorAll('.btn-inspect-source').forEach((button) => {
      button.addEventListener('click', async () => {
        const sourceId = button.dataset.source;
        const response = await fetch(`${API_BASE}/sources/${encodeURIComponent(sourceId)}`);
        const result = await response.json();
        document.getElementById('sync-status').textContent = response.ok
          ? `${result.source.name}: ${result.source.opportunity_count || 0} records, lifecycle ${result.source.discovery_status}, role ${result.source.source_role}.`
          : (result.error || 'Inspection failed.');
      });
    });

    if (adminKey) {
      const historyResponse = await fetch(`${API_BASE}/admin/sync-runs`, {
        headers: { 'X-Admin-Key': adminKey },
      });
      if (historyResponse.ok) {
        const history = await historyResponse.json();
        document.getElementById('admin-sync-history').innerHTML = `
          <div class="search-card">
            <h3 style="margin-bottom:14px;">Recent Synchronization History</h3>
            ${(history.sync_runs || []).slice(0, 10).map((run) => `
              <div style="padding:8px 0;border-bottom:1px solid var(--surface-border);font-size:0.84rem;">
                <strong>${escapeHtml(run.source_id)}</strong> — ${escapeHtml(run.status)}
                • found ${Number(run.records_found || 0)}
                • created ${Number(run.records_created || 0)}
                • updated ${Number(run.records_updated || 0)}
                • rejected ${Number(run.records_rejected || 0)}
                • errors ${Number(run.errors_count || 0)}
              </div>
            `).join('') || '<p>No synchronization runs recorded.</p>'}
          </div>
        `;
      }
    }
  } catch (err) {
    document.getElementById('admin-sources-list').innerHTML = `Failed to load admin metrics.`;
  }
}
