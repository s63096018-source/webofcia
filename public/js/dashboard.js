if (!requireAuth()) throw new Error('Unauthorized');

let currentUser = getStoredUser();
let allReports = [];
let selectedFiles = [];
let removeEvidenceIds = [];
let logPage = 1;

function syncCustomSelect(select) {
  const wrapper = select.closest('.custom-select');
  if (!wrapper) return;

  const selectedIndex = Math.max(0, select.selectedIndex);
  const selectedOption = select.options[selectedIndex];
  wrapper.querySelector('.custom-select-value').textContent = selectedOption?.textContent || '';
  wrapper.querySelectorAll('[role="option"]').forEach((option, index) => {
    const selected = index === selectedIndex;
    option.setAttribute('aria-selected', String(selected));
    option.classList.toggle('selected', selected);
  });
}

function setCustomSelectActiveOption(wrapper, index) {
  const options = [...wrapper.querySelectorAll('[role="option"]')];
  if (!options.length) return;
  const activeIndex = Math.min(options.length - 1, Math.max(0, index));
  wrapper.dataset.activeIndex = String(activeIndex);
  options.forEach((option, optionIndex) => option.classList.toggle('active', optionIndex === activeIndex));
  const activeOption = options[activeIndex];
  wrapper.querySelector('.custom-select-trigger').setAttribute('aria-activedescendant', activeOption.id);
  activeOption.scrollIntoView({ block: 'nearest' });
}

function closeCustomSelect(wrapper, restoreFocus = false) {
  if (!wrapper) return;
  wrapper.classList.remove('open');
  wrapper.querySelector('.custom-select-menu').hidden = true;
  wrapper.querySelector('.custom-select-trigger').setAttribute('aria-expanded', 'false');
  if (restoreFocus) wrapper.querySelector('.custom-select-trigger').focus();
}

function chooseCustomSelectOption(wrapper, index) {
  const select = wrapper.querySelector('select');
  select.selectedIndex = index;
  syncCustomSelect(select);
  select.dispatchEvent(new Event('change', { bubbles: true }));
  closeCustomSelect(wrapper, true);
}

function enhanceFormSelects() {
  document.querySelectorAll('#reportForm .form-select').forEach(select => {
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.classList.add('custom-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.id = `${select.id}-custom`;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', `${select.id}-options`);

    const label = document.querySelector(`label[for="${select.id}"]`);
    if (label) {
      if (!label.id) label.id = `${select.id}-label`;
      label.htmlFor = trigger.id;
      trigger.setAttribute('aria-labelledby', label.id);
    }

    const value = document.createElement('span');
    value.className = 'custom-select-value';
    const chevron = document.createElement('span');
    chevron.className = 'custom-select-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(value, chevron);

    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';
    menu.id = `${select.id}-options`;
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    [...select.options].forEach((nativeOption, index) => {
      const option = document.createElement('div');
      option.className = 'custom-select-option';
      option.id = `${select.id}-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = nativeOption.textContent;
      option.addEventListener('click', () => chooseCustomSelectOption(wrapper, index));
      menu.appendChild(option);
    });

    wrapper.append(trigger, menu);
    syncCustomSelect(select);

    trigger.addEventListener('click', () => {
      const isOpen = wrapper.classList.contains('open');
      document.querySelectorAll('.custom-select.open').forEach(openWrapper => closeCustomSelect(openWrapper));
      if (isOpen) return;
      wrapper.classList.add('open');
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      setCustomSelectActiveOption(wrapper, select.selectedIndex);
    });

    trigger.addEventListener('keydown', event => {
      const isOpen = wrapper.classList.contains('open');
      const activeIndex = Number(wrapper.dataset.activeIndex ?? select.selectedIndex);
      if (!isOpen && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        trigger.click();
        return;
      }
      if (!isOpen) return;

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        setCustomSelectActiveOption(wrapper, activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setCustomSelectActiveOption(wrapper, event.key === 'Home' ? 0 : select.options.length - 1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        chooseCustomSelectOption(wrapper, activeIndex);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeCustomSelect(wrapper, true);
      }
    });

    select.addEventListener('change', () => syncCustomSelect(select));
  });

  document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.custom-select.open').forEach(wrapper => {
      if (!wrapper.contains(event.target)) closeCustomSelect(wrapper);
    });
  });
}

function syncCustomFormSelects() {
  document.querySelectorAll('#reportForm .form-select').forEach(syncCustomSelect);
}

const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userRole = document.getElementById('userRole');
const newReportBtn = document.getElementById('newReportBtn');
const addRosterEntryBtn = document.getElementById('addRosterEntryBtn');
const reportsContainer = document.getElementById('reportsContainer');
const searchInput = document.getElementById('searchInput');
const filterStatus = document.getElementById('filterStatus');
const filterClassification = document.getElementById('filterClassification');
const filterPriority = document.getElementById('filterPriority');

function initUser() {
  const initials = (currentUser.displayName || currentUser.username || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  userAvatar.textContent = initials;
  userName.textContent = currentUser.displayName || currentUser.username;

  const roleEl = document.getElementById('userRole');
  roleEl.textContent = roleLabel(currentUser.role);
  roleEl.className = `role role-pill role-${currentUser.role || 'viewer'}`;

  if (canWrite()) {
    newReportBtn.style.display = 'inline-flex';
  }

  if (isAdmin()) {
    document.getElementById('logsNavItem').hidden = false;
    addRosterEntryBtn.hidden = false;
  }
}

function tickClock() {
  const el = document.getElementById('topbarClock');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleString('en-US', {
    month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

function switchView(view) {
  if (!['reports', 'logs', 'roster'].includes(view) || (view === 'logs' && !isAdmin())) return;

  document.getElementById('reportsView').hidden = view !== 'reports';
  document.getElementById('logsView').hidden = view !== 'logs';
  document.getElementById('rosterView').hidden = view !== 'roster';

  if (view === 'logs') {
    document.getElementById('pageKicker').textContent = 'Directorate';
    document.getElementById('pageTitle').textContent = 'Activity Logs';
    loadLogs();
  } else if (view === 'roster') {
    document.getElementById('pageKicker').textContent = 'Human Resources';
    document.getElementById('pageTitle').textContent = 'Agent Roster';
    loadRoster();
  } else {
    document.getElementById('pageKicker').textContent = 'Operations Desk';
    document.getElementById('pageTitle').textContent = 'Field Reports';
  }

  newReportBtn.style.display = view === 'reports' && canWrite() ? 'inline-flex' : 'none';

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function openRosterForm(entry = null) {
  if (!isAdmin()) return;
  document.getElementById('rosterForm').reset();
  document.getElementById('rosterEntryId').value = entry?.id || '';
  document.getElementById('rosterRank').value = entry?.rank || '';
  document.getElementById('rosterName').value = entry?.name || '';
  document.getElementById('rosterDiscordId').value = entry?.discordId || '';
  document.getElementById('rosterCitizenId').value = entry?.citizenId || '';
  document.getElementById('rosterResponsibility').value = entry?.responsibility || '';
  document.getElementById('rosterFormTitle').textContent = entry ? 'Edit Personnel' : 'Add Personnel';
  document.getElementById('saveRosterEntryBtn').textContent = entry ? 'Save Changes' : 'Save Entry';
  openModal('rosterFormModal');
}

async function loadRoster() {
  const container = document.getElementById('rosterContainer');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  try {
    const entries = await API.getRoster();
    if (!Array.isArray(entries)) throw new Error('The roster response has an unexpected format.');
    renderRoster(entries);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Failed to load roster</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function renderRoster(entries) {
  const container = document.getElementById('rosterContainer');
  document.getElementById('rosterCount').textContent = `${entries.length} ${entries.length === 1 ? 'person' : 'personnel'}`;

  if (!entries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No personnel listed</h3>
        <p>${isAdmin() ? 'Add the first agent to start the roster.' : 'The personnel roster has not been filled in yet.'}</p>
      </div>`;
    return;
  }

  const actionHeading = isAdmin() ? '<th>Actions</th>' : '';
  container.innerHTML = `
    <div class="roster-table-wrap">
      <table class="roster-table">
        <thead><tr>
          <th>Rank</th><th>Name</th><th>Discord ID</th><th>Citizen ID</th><th>Responsibility</th>${actionHeading}
        </tr></thead>
        <tbody>
          ${entries.map(entry => `
            <tr>
              <td><span class="roster-rank">${escapeHtml(entry.rank)}</span></td>
              <td class="roster-name">${escapeHtml(entry.name)}</td>
              <td class="mono">${escapeHtml(entry.discordId || '—')}</td>
              <td class="mono">${escapeHtml(entry.citizenId || '—')}</td>
              <td class="roster-responsibility">${escapeHtml(entry.responsibility || '—')}</td>
              ${isAdmin() ? `<td class="roster-row-actions">
                <button class="btn btn-secondary btn-sm" data-roster-edit="${entry.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-roster-delete="${entry.id}">Delete</button>
              </td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;

  if (!isAdmin()) return;
  container.querySelectorAll('[data-roster-edit]').forEach(button => {
    button.addEventListener('click', () => {
      const entry = entries.find(item => item.id === Number(button.dataset.rosterEdit));
      if (entry) openRosterForm(entry);
    });
  });
  container.querySelectorAll('[data-roster-delete]').forEach(button => {
    button.addEventListener('click', async () => {
      const entry = entries.find(item => item.id === Number(button.dataset.rosterDelete));
      if (!entry || !window.confirm(`Delete ${entry.name} from the roster?`)) return;
      try {
        await API.deleteRosterEntry(entry.id);
        showToast('Personnel entry deleted.');
        loadRoster();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

addRosterEntryBtn.addEventListener('click', () => openRosterForm());

document.getElementById('saveRosterEntryBtn').addEventListener('click', async () => {
  if (!isAdmin()) return;
  const form = document.getElementById('rosterForm');
  if (!form.reportValidity()) return;

  const id = document.getElementById('rosterEntryId').value;
  const entry = {
    rank: document.getElementById('rosterRank').value,
    name: document.getElementById('rosterName').value,
    discordId: document.getElementById('rosterDiscordId').value,
    citizenId: document.getElementById('rosterCitizenId').value,
    responsibility: document.getElementById('rosterResponsibility').value
  };
  const button = document.getElementById('saveRosterEntryBtn');
  button.disabled = true;
  try {
    if (id) {
      await API.updateRosterEntry(id, entry);
      showToast('Personnel entry updated.');
    } else {
      await API.createRosterEntry(entry);
      showToast('Personnel entry added.');
    }
    closeModal('rosterFormModal');
    loadRoster();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    button.disabled = false;
  }
});

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

async function loadStats() {
  try {
    const stats = await API.getStats();
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statOpen').textContent = stats.open;
    document.getElementById('statCritical').textContent = stats.critical;
    document.getElementById('statClassified').textContent = stats.classified;
  } catch {
    /* stats are non-critical */
  }
}

async function loadReports() {
  reportsContainer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  const params = {};
  if (searchInput.value.trim()) params.search = searchInput.value.trim();
  if (filterStatus.value) params.status = filterStatus.value;
  if (filterClassification.value) params.classification = filterClassification.value;
  if (filterPriority.value) params.priority = filterPriority.value;

  try {
    allReports = await API.getReports(params);
    renderReports(allReports);
  } catch (err) {
    reportsContainer.innerHTML = `<div class="empty-state"><h3>Failed to load reports</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function renderReports(reports) {
  if (!reports.length) {
    reportsContainer.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <h3>No reports found</h3>
        <p>${canWrite() ? 'Create your first field report to get started.' : 'No reports match your current filters.'}</p>
      </div>`;
    return;
  }

  const iconUser = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
  const iconClock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  const iconPin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  const iconFile = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>';

  reportsContainer.innerHTML = `<div class="reports-grid">${reports.map(r => `
    <div class="report-card" data-id="${r.id}">
      <div class="report-card-main">
        <div class="report-number">${escapeHtml(r.reportNumber)}${canManageReport(r) && !isAdmin() ? '<span class="own-tag">Yours</span>' : ''}</div>
        <div class="report-card-body">
          <h3>${escapeHtml(r.title)}</h3>
          <div class="report-meta">
            <span class="report-meta-item">${iconUser} ${escapeHtml(r.reporter)}${r.reporterCallsign ? ` · ${escapeHtml(r.reporterCallsign)}` : ''}</span>
            <span class="report-meta-item">${iconClock} ${formatDate(r.incidentDate)} · ${escapeHtml(r.incidentTime)}</span>
            ${r.location ? `<span class="report-meta-item">${iconPin} ${escapeHtml(r.location)}</span>` : ''}
            ${r.evidence?.length ? `<span class="report-meta-item">${iconFile} ${r.evidence.length} file${r.evidence.length > 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="report-card-badges">
        <span class="badge ${classificationClass(r.classification)}">${escapeHtml(r.classification)}</span>
        <span class="badge ${statusClass(r.status)}">${escapeHtml(r.status)}</span>
        <span class="badge ${priorityClass(r.priority)}">${escapeHtml(r.priority)}</span>
      </div>
    </div>
  `).join('')}</div>`;

  document.querySelectorAll('.report-card').forEach(card => {
    card.addEventListener('click', () => viewReport(parseInt(card.dataset.id)));
  });
}

async function viewReport(id) {
  try {
    const report = await API.getReport(id);
    const body = document.getElementById('viewModalBody');
    const footer = document.getElementById('viewModalFooter');

    body.innerHTML = `
      <div class="detail-header">
        <span class="report-number mono">${escapeHtml(report.reportNumber)}</span>
        <h2>${escapeHtml(report.title)}</h2>
        <div class="detail-badges">
          <span class="badge ${classificationClass(report.classification)}">${escapeHtml(report.classification)}</span>
          <span class="badge ${statusClass(report.status)}">${escapeHtml(report.status)}</span>
          <span class="badge ${priorityClass(report.priority)}">${escapeHtml(report.priority)}</span>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-field">
          <label>Reporting Agent</label>
          <div class="value">${escapeHtml(report.reporter)}${report.reporterCallsign ? ` <span class="mono" style="color:var(--accent-gold)">(${escapeHtml(report.reporterCallsign)})</span>` : ''}</div>
        </div>
        <div class="detail-field">
          <label>Date & Time</label>
          <div class="value">${formatDate(report.incidentDate)} at ${escapeHtml(report.incidentTime)}</div>
        </div>
        <div class="detail-field">
          <label>Location</label>
          <div class="value">${escapeHtml(report.location) || '—'}</div>
        </div>
        <div class="detail-field">
          <label>Filed</label>
          <div class="value">${formatDateTime(report.createdAt)}</div>
        </div>
      </div>

      ${report.unitCallsigns?.length ? `
        <div class="detail-section">
          <h4>Unit Callsigns</h4>
          <div class="callsign-tags">${report.unitCallsigns.map(c => `<span class="callsign-tag">${escapeHtml(c)}</span>`).join('')}</div>
        </div>
      ` : ''}

      <div class="detail-section">
        <h4>Operational Description</h4>
        <p>${escapeHtml(report.description).replace(/\n/g, '<br>')}</p>
      </div>

      ${report.notes ? `
        <div class="detail-section">
          <h4>Internal Notes</h4>
          <p>${escapeHtml(report.notes).replace(/\n/g, '<br>')}</p>
        </div>
      ` : ''}

      ${report.tags?.length ? `
        <div class="detail-section">
          <h4>Tags</h4>
          <div class="callsign-tags">${report.tags.map(t => `<span class="callsign-tag">${escapeHtml(t)}</span>`).join('')}</div>
        </div>
      ` : ''}

      ${report.evidence?.length ? `
        <div class="detail-section">
          <h4>Evidence & Attachments (${report.evidence.length})</h4>
          <div class="evidence-grid">
            ${report.evidence.map(ev => `
              <div class="evidence-item" data-src="${ev.url}">
                <img src="${ev.url}" alt="${escapeHtml(ev.originalName)}" loading="lazy">
                ${ev.caption ? `<div class="evidence-caption">${escapeHtml(ev.caption)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    footer.innerHTML = `<button class="btn btn-secondary" data-close="viewModal">Close</button>`;

    if (canManageReport(report)) {
      footer.innerHTML = `
        <button class="btn btn-danger btn-sm" id="deleteReportBtn">Delete</button>
        <button class="btn btn-secondary" id="editReportBtn">Edit Report</button>
        <button class="btn btn-secondary" data-close="viewModal">Close</button>
      `;

      document.getElementById('editReportBtn').addEventListener('click', () => {
        closeModal('viewModal');
        openEditForm(report);
      });

      document.getElementById('deleteReportBtn').addEventListener('click', async () => {
        if (!confirm(`Delete report ${report.reportNumber}? This action cannot be undone.`)) return;
        try {
          await API.deleteReport(report.id);
          showToast('Report deleted successfully.');
          closeModal('viewModal');
          loadReports();
          loadStats();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    footer.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    body.querySelectorAll('.evidence-item').forEach(item => {
      item.addEventListener('click', () => {
        document.getElementById('lightboxImg').src = item.dataset.src;
        document.getElementById('lightbox').classList.add('active');
      });
    });

    openModal('viewModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function resetForm() {
  document.getElementById('reportForm').reset();
  syncCustomFormSelects();
  document.getElementById('editReportId').value = '';
  selectedFiles = [];
  removeEvidenceIds = [];
  document.getElementById('filePreviewGrid').innerHTML = '';
  document.getElementById('existingEvidence').innerHTML = '';
}

async function openCreateForm() {
  resetForm();
  document.getElementById('formModalTitle').textContent = 'New Field Report';

  try {
    const { reportNumber } = await API.getNextReportNumber();
    document.getElementById('reportNumber').value = reportNumber;
  } catch {
    document.getElementById('reportNumber').value = 'AUTO-GENERATED';
  }

  const now = new Date();
  document.getElementById('incidentDate').value = now.toISOString().split('T')[0];
  document.getElementById('incidentTime').value = now.toTimeString().slice(0, 5);

  if (currentUser.displayName) {
    document.getElementById('reporter').value = currentUser.displayName;
  }
  if (currentUser.callsign) {
    document.getElementById('reporterCallsign').value = currentUser.callsign;
  }

  openModal('formModal');
}

function openEditForm(report) {
  resetForm();
  document.getElementById('formModalTitle').textContent = 'Edit Field Report';
  document.getElementById('editReportId').value = report.id;
  document.getElementById('reportNumber').value = report.reportNumber;
  document.getElementById('title').value = report.title;
  document.getElementById('reporter').value = report.reporter;
  document.getElementById('reporterCallsign').value = report.reporterCallsign || '';
  document.getElementById('unitCallsigns').value = (report.unitCallsigns || []).join(', ');
  document.getElementById('incidentDate').value = report.incidentDate;
  document.getElementById('incidentTime').value = report.incidentTime;
  document.getElementById('location').value = report.location || '';
  document.getElementById('classification').value = report.classification;
  document.getElementById('status').value = report.status;
  document.getElementById('priority').value = report.priority;
  document.getElementById('tags').value = (report.tags || []).join(', ');
  document.getElementById('description').value = report.description;
  document.getElementById('notes').value = report.notes || '';

  if (report.evidence?.length) {
    document.getElementById('existingEvidence').innerHTML = `
      <p style="font-size:0.78rem;color:var(--text-muted);margin:0.75rem 0 0.5rem;">Existing evidence (click × to remove):</p>
      <div class="file-preview-grid">${report.evidence.map(ev => `
        <div class="file-preview" data-ev-id="${ev.id}">
          <img src="${ev.url}" alt="${escapeHtml(ev.originalName)}">
          <button type="button" class="remove-file" data-ev-id="${ev.id}">&times;</button>
        </div>
      `).join('')}</div>
    `;

    document.querySelectorAll('#existingEvidence .remove-file').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeEvidenceIds.push(parseInt(btn.dataset.evId));
        btn.closest('.file-preview').remove();
      });
    });
  }

  syncCustomFormSelects();
  openModal('formModal');
}

function renderFilePreviews() {
  const grid = document.getElementById('filePreviewGrid');
  grid.innerHTML = selectedFiles.map((file, i) => {
    const url = URL.createObjectURL(file);
    return `
      <div class="file-preview" data-idx="${i}">
        <img src="${url}" alt="${escapeHtml(file.name)}">
        <button type="button" class="remove-file" data-idx="${i}">&times;</button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.remove-file').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderFilePreviews();
    });
  });
}

const fileUploadArea = document.getElementById('fileUploadArea');
const evidenceInput = document.getElementById('evidenceInput');
const MAX_EVIDENCE_FILES = 20;

function addEvidenceFiles(files) {
  const images = Array.from(files).filter(file => file.type.startsWith('image/'));
  const remainingSlots = MAX_EVIDENCE_FILES - selectedFiles.length;
  selectedFiles.push(...images.slice(0, remainingSlots));

  if (images.length > remainingSlots) {
    showToast(`You can attach up to ${MAX_EVIDENCE_FILES} images per upload.`, 'error');
  }

  renderFilePreviews();
}

fileUploadArea.addEventListener('click', () => evidenceInput.click());

fileUploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileUploadArea.classList.add('dragover');
});

fileUploadArea.addEventListener('dragleave', () => {
  fileUploadArea.classList.remove('dragover');
});

fileUploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  fileUploadArea.classList.remove('dragover');
  addEvidenceFiles(e.dataTransfer.files);
});

evidenceInput.addEventListener('change', () => {
  addEvidenceFiles(evidenceInput.files);
  evidenceInput.value = '';
});

document.getElementById('saveReportBtn').addEventListener('click', async () => {
  const form = document.getElementById('reportForm');
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const editId = document.getElementById('editReportId').value;
  const formData = new FormData();

  formData.append('reportNumber', document.getElementById('reportNumber').value);
  formData.append('title', document.getElementById('title').value);
  formData.append('reporter', document.getElementById('reporter').value);
  formData.append('reporterCallsign', document.getElementById('reporterCallsign').value);
  formData.append('unitCallsigns', document.getElementById('unitCallsigns').value);
  formData.append('incidentDate', document.getElementById('incidentDate').value);
  formData.append('incidentTime', document.getElementById('incidentTime').value);
  formData.append('location', document.getElementById('location').value);
  formData.append('classification', document.getElementById('classification').value);
  formData.append('status', document.getElementById('status').value);
  formData.append('priority', document.getElementById('priority').value);
  formData.append('tags', document.getElementById('tags').value);
  formData.append('description', document.getElementById('description').value);
  formData.append('notes', document.getElementById('notes').value);

  selectedFiles.forEach(file => formData.append('evidence', file));
  removeEvidenceIds.forEach(id => formData.append('removeEvidence', id));

  const saveBtn = document.getElementById('saveReportBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    if (editId) {
      await API.updateReport(editId, formData);
      showToast('Report updated successfully.');
    } else {
      await API.createReport(formData);
      showToast('Report submitted successfully.');
    }
    closeModal('formModal');
    loadReports();
    loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Submit Report';
  }
});

document.getElementById('newReportBtn').addEventListener('click', openCreateForm);

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try { await API.logout(); } catch { /* ignore */ }
  localStorage.removeItem('cia_token');
  localStorage.removeItem('cia_user');
  window.location.href = '/login.html';
});

document.getElementById('lightbox').addEventListener('click', (e) => {
  if (e.target.id === 'lightbox' || e.target.classList.contains('lightbox-close')) {
    document.getElementById('lightbox').classList.remove('active');
  }
});

let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadReports, 300);
});

filterStatus.addEventListener('change', loadReports);
filterClassification.addEventListener('change', loadReports);
filterPriority.addEventListener('change', loadReports);

const logSearchInput = document.getElementById('logSearchInput');
const filterLogAction = document.getElementById('filterLogAction');
let logSearchTimeout;

async function loadLogs() {
  const container = document.getElementById('logsContainer');
  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

  const params = {};
  if (logSearchInput.value.trim()) params.search = logSearchInput.value.trim();
  if (filterLogAction.value) params.action = filterLogAction.value;
  params.page = logPage;
  params.pageSize = 50;

  try {
    const response = await API.getLogs(params);
    const result = Array.isArray(response)
      ? { items: response, total: response.length, page: 1, totalPages: 1 }
      : response;
    if (!Array.isArray(result?.items)) {
      throw new Error('The activity log response has an unexpected format. Restart the server and try again.');
    }
    logPage = result.page;
    renderLogs(result);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><h3>Failed to load logs</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function logActionClass(action) {
  const map = {
    LOGIN: 'log-login',
    LOGIN_FAILED: 'log-fail',
    LOGOUT: 'log-logout',
    REPORT_CREATE: 'log-create',
    REPORT_UPDATE: 'log-update',
    REPORT_DELETE: 'log-delete',
    ROSTER_CREATE: 'log-create',
    ROSTER_UPDATE: 'log-update',
    ROSTER_DELETE: 'log-delete'
  };
  return map[action] || 'log-login';
}

function renderLogs(logs) {
  const container = document.getElementById('logsContainer');
  if (!logs.items.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No activity recorded</h3>
        <p>Logins, report changes, and failed access attempts will appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="logs-table-wrap">
      <table class="logs-table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Operative</th>
            <th>Action</th>
            <th>Details</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          ${logs.items.map(log => `
            <tr>
              <td class="mono log-time">${escapeHtml(formatDateTime(log.createdAt))}</td>
              <td>
                <div class="log-user">${escapeHtml(log.username || '—')}</div>
                <div class="log-role">${escapeHtml(roleLabel(log.role))}</div>
              </td>
              <td><span class="log-action ${logActionClass(log.action)}">${escapeHtml(log.action.replace(/_/g, ' '))}</span></td>
              <td class="log-details">${escapeHtml(log.details || '—')}</td>
              <td class="mono log-ip">${escapeHtml(log.ip || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="logs-pagination" aria-label="Activity log pages">
      <span class="logs-count">${logs.total.toLocaleString()} entries · Page ${logs.page} of ${Math.max(1, logs.totalPages)}</span>
      <div class="logs-page-actions">
        <button class="btn btn-secondary btn-sm" id="logsPreviousPage" ${logs.page <= 1 ? 'disabled' : ''}>Previous</button>
        <button class="btn btn-secondary btn-sm" id="logsNextPage" ${logs.page >= logs.totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;

  document.getElementById('logsPreviousPage').addEventListener('click', () => {
    if (logPage > 1) { logPage -= 1; loadLogs(); }
  });
  document.getElementById('logsNextPage').addEventListener('click', () => {
    if (logPage < logs.totalPages) { logPage += 1; loadLogs(); }
  });
}

logSearchInput.addEventListener('input', () => {
  clearTimeout(logSearchTimeout);
  logSearchTimeout = setTimeout(() => { logPage = 1; loadLogs(); }, 300);
});
filterLogAction.addEventListener('change', () => { logPage = 1; loadLogs(); });

enhanceFormSelects();
initUser();
tickClock();
setInterval(tickClock, 1000);
loadStats();
loadReports();
