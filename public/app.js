// FreeMoney-AI Frontend Single Page Controller

const API_BASE = '/api';

const state = {
  categories: [],
  selectedCategories: [],
  searchParams: {
    keyword: '',
    state: '',
    zip: '',
    officialOnly: false,
  },
  userProfile: null,
  currentView: 'home',
  opportunities: [],
  loading: false,
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  await loadCategories();
  await loadProfile();
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

// ----------------------------------------------------------------
// VIEW: Home (Landing + Instant Assistance Search)
// ----------------------------------------------------------------
function renderHomeView() {
  const root = document.getElementById('app-root');
  root.innerHTML = `
    <section class="hero-section">
      <h1 class="hero-title">FreeMoney-AI</h1>
      <p class="hero-subtitle">
        Find legitimate grants, financial assistance, emergency benefits, housing aid, and scholarships you may qualify for — with 100% official source verification.
      </p>
    </section>

    <div class="search-card">
      <div class="input-label" style="margin-bottom: 12px;">Step 1: Select Assistance Categories</div>
      <div class="category-chips-grid" id="category-chips">
        ${state.categories
          .map(
            (cat) => `
          <div class="category-chip ${state.selectedCategories.includes(cat.slug) ? 'selected' : ''}" data-slug="${cat.slug}">
            ${cat.name}
          </div>
        `
          )
          .join('')}
      </div>

      <div class="input-label" style="margin-bottom: 12px;">Step 2: Location & Keywords</div>
      <div class="search-input-row">
        <div class="input-group" style="flex: 2;">
          <input type="text" id="input-keyword" class="form-control" placeholder="Search by topic, agency, or program (e.g. Health, Housing, Energy)..." value="${state.searchParams.keyword}">
        </div>
        <div class="input-group" style="flex: 1; min-width: 140px;">
          <input type="text" id="input-state" class="form-control" placeholder="State (e.g. WA, CA, TX, or Nationwide)" value="${state.searchParams.state}">
        </div>
        <div class="input-group" style="flex: 0 0 auto;">
          <button id="btn-find" class="btn btn-primary" style="height: 100%;">
            Find Assistance
          </button>
        </div>
      </div>
    </div>

    <div id="results-container">
      <div style="text-align: center; color: var(--text-muted); padding: 40px 0;">
        Select one or more categories or enter keywords above to discover verified assistance.
      </div>
    </div>
  `;

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
      user_profile: state.userProfile || undefined,
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
      body: JSON.stringify({ opportunity_id: oppId }),
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
