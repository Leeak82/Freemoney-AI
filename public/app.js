// FreeMoney-AI Frontend Single Page Controller

const API_BASE = '/api';

const state = {
  categories: [],
  selectedCategories: [],
  intent: null,
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
};

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
    const res = await fetch(`${API_BASE}/profile`);
    const data = await res.json();
    state.userProfile = data.profile;
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

async function loadBusinesses() {
  try {
    const res = await fetch(`${API_BASE}/businesses`);
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
        <h3 style="margin-bottom: 8px;">No matching programs found</h3>
        <p style="color: var(--text-muted); max-width: 500px; margin: 0 auto 20px;">
          Try adjusting your search criteria, selecting fewer filters, or synchronizing official sources in the Admin panel.
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
            : 'Rolling / Open Deadline';

          const hasScore = item.match_score !== null;

          return `
            <div class="opportunity-card">
              <div class="card-top">
                <div>
                  <div style="font-size: 0.85rem; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
                    ${opp.category.replace(/-/g, ' ')} • ${opp.provider_name}
                  </div>
                  <h3 class="card-title">${opp.title}</h3>
                </div>
                <span class="badge-trust ${isOfficial ? 'badge-official-gov' : 'badge-partner'}">
                  ${isOfficial ? 'Official Government' : prov.trust_level}
                </span>
              </div>

              <div class="meta-row">
                <div class="meta-item">Location: <strong>${opp.location_scope === 'NATIONWIDE' ? 'Nationwide (All States)' : (opp.states.join(', ') || 'United States')}</strong></div>
                <div class="meta-item">Deadline: <strong>${deadlineText}</strong></div>
                <div class="meta-item">Last Verified: <strong>${prov.last_verified}</strong></div>
              </div>

              <!-- AI Matching Reasoning Box -->
              <div class="match-box ${hasScore ? '' : 'insufficient'}">
                <div class="match-box-title">
                  ${
                    hasScore
                      ? `<span class="match-score-pill">${item.match_score}% Match</span> <strong>${item.match_status.replace(/_/g, ' ')}</strong>`
                      : `<strong>Needs Verification:</strong> ${item.missing_information[0] || 'Complete profile for matching'}`
                  }
                </div>
                <div style="font-size: 0.88rem; color: var(--text-muted); margin-top: 4px;">
                  ${item.why_you_may_qualify.join(' ')}
                </div>
              </div>

              <!-- Action Buttons -->
              <div class="card-actions">
                <a href="/opportunities/${opp.id}" class="btn btn-secondary view-detail-link" data-id="${opp.id}">View Program Details</a>
                <a href="${opp.source_url}" target="_blank" rel="noopener" class="btn btn-outline">Official Source ↗</a>
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

    root.innerHTML = `
      <div style="margin-bottom: 20px;">
        <a href="/opportunities" class="btn btn-outline" id="btn-back">← Back to All Opportunities</a>
      </div>

      <div class="detail-grid">
        <div>
          <div style="font-size: 0.9rem; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 6px;">
            ${opp.category.replace(/-/g, ' ')} • Official Program ID: ${opp.source_opportunity_id}
          </div>
          <h1 style="font-size: 2rem; margin-bottom: 16px; line-height: 1.3;">${opp.title}</h1>

          <div class="meta-row" style="margin-bottom: 24px;">
            <div class="meta-item">Agency / Provider: <strong>${opp.provider_name}</strong></div>
            <div class="meta-item">Location: <strong>${opp.location_scope}</strong></div>
            <div class="meta-item">Deadline: <strong>${opp.deadline ? new Date(opp.deadline).toLocaleDateString() : 'Rolling'}</strong></div>
          </div>

          <div class="search-card" style="margin-bottom: 24px;">
            <h3 style="margin-bottom: 12px; font-size: 1.1rem;">Program Overview & Purpose</h3>
            <p style="color: var(--text-muted); white-space: pre-line;">${opp.description}</p>
          </div>

          <div class="search-card" style="margin-bottom: 24px;">
            <h3 style="margin-bottom: 12px; font-size: 1.1rem;">Eligibility & Requirements</h3>
            <p style="color: var(--text-muted);">${opp.eligibility_summary || 'Please consult the official funding notice for granular eligibility criteria.'}</p>
          </div>

          <div class="search-card">
            <h3 style="margin-bottom: 12px; font-size: 1.1rem;">Required Documentation Checklist</h3>
            <div>
              ${data.documents
                .map(
                  (doc) => `
                <div class="checklist-item">
                  <span style="color: var(--primary); font-size: 1.1rem;">📄</span>
                  <div>
                    <strong style="color: #fff;">${doc}</strong>
                    <div style="font-size: 0.82rem; color: var(--text-dim);">Official required verification document</div>
                  </div>
                </div>
              `
                )
                .join('')}
            </div>
          </div>
        </div>

        <div>
          <div class="provenance-card" style="margin-bottom: 20px;">
            <h3 style="font-size: 1rem; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);">
              Source Provenance & Verification
            </h3>
            <div style="font-size: 0.88rem; color: var(--text-muted); display: flex; flex-direction: column; gap: 10px;">
              <div>Origin: <strong>${prov.source_name}</strong></div>
              <div>Verification Level: <strong>${prov.trust_level}</strong></div>
              <div>Official Source: <strong>${prov.official_source ? 'Yes (Government)' : 'Verified Partner'}</strong></div>
              <div>Raw Source ID: <strong>${prov.source_opportunity_id}</strong></div>
              <div>Last Verified: <strong>${prov.last_verified}</strong></div>
            </div>
            <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 8px;">
              <a href="${opp.source_url}" target="_blank" rel="noopener" class="btn btn-secondary" style="width: 100%;">
                View Official Listing ↗
              </a>
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
  const adminKey = 'test-admin-secret-key'; // Default dev/test key

  root.innerHTML = `
    <div style="margin-bottom: 24px;">
      <h1 style="font-size: 2rem; margin-bottom: 8px;">Source Registry & Admin Operations</h1>
      <p style="color: var(--text-muted);">Manage official feeds, review sync runs, trigger ingestion, and catalog candidate APIs.</p>
    </div>

    <div class="search-card" style="margin-bottom: 24px;">
      <h3 style="margin-bottom: 14px;">Manual Source Ingestion Triggers</h3>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <button id="btn-sync-grants" class="btn btn-primary">Sync Grants.gov (Real API)</button>
        <button id="btn-discover-apis" class="btn btn-secondary">Run Public-APIs Catalog Discovery</button>
      </div>
      <div id="sync-status" style="margin-top: 14px; font-size: 0.9rem; color: var(--text-muted);"></div>
    </div>

    <div id="admin-sources-list">Loading registered sources...</div>
  `;

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
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--surface-border);">
            <div>
              <strong>${s.name}</strong> <span style="font-size: 0.8rem; color: var(--primary);">[${s.trust_level}]</span>
              <div style="font-size: 0.82rem; color: var(--text-muted);">${s.organization} • Base: ${s.base_url}</div>
              <div style="font-size: 0.78rem; color: var(--text-dim);">Last Synced: ${s.last_sync_at ? new Date(s.last_sync_at).toLocaleString() : 'Never'}</div>
            </div>
            <div>
              <span class="badge-trust ${s.enabled ? 'badge-official-gov' : 'badge-partner'}">
                ${s.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    document.getElementById('btn-sync-grants').addEventListener('click', async () => {
      const statusDiv = document.getElementById('sync-status');
      statusDiv.innerHTML = 'Executing real Grants.gov API sync...';
      try {
        const syncRes = await fetch(`${API_BASE}/sync/grants-gov`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': adminKey,
          },
          body: JSON.stringify({ rows: 30 }),
        });
        const syncData = await syncRes.json();
        statusDiv.innerHTML = `<span style="color: var(--primary);">Grants.gov Sync Result: Fetched ${syncData.result.fetched}, Inserted ${syncData.result.inserted}, Updated ${syncData.result.updated}</span>`;
      } catch (err) {
        statusDiv.innerHTML = `<span style="color: var(--danger);">Sync failed: ${err.message}</span>`;
      }
    });

    document.getElementById('btn-discover-apis').addEventListener('click', async () => {
      const statusDiv = document.getElementById('sync-status');
      statusDiv.innerHTML = 'Parsing public-apis catalog candidates...';
      try {
        const discRes = await fetch(`${API_BASE}/admin/discover-apis`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': adminKey,
          },
        });
        const discData = await discRes.json();
        statusDiv.innerHTML = `<span style="color: var(--primary);">Discovery Complete: Scanned ${discData.total_found} total APIs, identified ${discData.assistance_relevant} assistance candidates.</span>`;
      } catch (err) {
        statusDiv.innerHTML = `<span style="color: var(--danger);">Discovery failed: ${err.message}</span>`;
      }
    });
  } catch (err) {
    document.getElementById('admin-sources-list').innerHTML = `Failed to load admin metrics.`;
  }
}
