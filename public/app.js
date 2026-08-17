const DEFAULT_CHECKIN_INTERVAL_MINUTES = 15;
const JIRA_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STORAGE_KEY = 'daily-todo-data';
const FOCUS_KEY = 'daily-todo-jira-focus';

// ── State ──────────────────────────────────────────────────────────────────
let selectedDate = todayStr();
let personalTasks = loadAllTasks();
let jiraIssues = [];
let jiraFocus = loadJiraFocus();
let checkinTimer = null;
let countdownTimer = null;
let jiraSyncTimer = null;
let checkinIntervalMs = DEFAULT_CHECKIN_INTERVAL_MINUTES * 60 * 1000;
let checkinIntervalMinutes = DEFAULT_CHECKIN_INTERVAL_MINUTES;

// ── DOM refs ───────────────────────────────────────────────────────────────
const datePicker = document.getElementById('datePicker');
const todayLabel = document.getElementById('todayLabel');
const taskInput = document.getElementById('taskInput');
const addTaskForm = document.getElementById('addTaskForm');
const personalTaskList = document.getElementById('personalTaskList');
const carryOverSection = document.getElementById('carryOverSection');
const carryOverList = document.getElementById('carryOverList');
const carryOverCount = document.getElementById('carryOverCount');
const pastDayBanner = document.getElementById('pastDayBanner');
const dateNav = document.getElementById('dateNav');
const jiraTaskList = document.getElementById('jiraTaskList');
const jiraStatus = document.getElementById('jiraStatus');
const refreshJiraBtn = document.getElementById('refreshJiraBtn');
const timerBadge = document.getElementById('timerBadge');
const mainApp = document.getElementById('mainApp');
const checkinBanner = document.getElementById('checkinBanner');
const deliveryOverlay = document.getElementById('deliveryOverlay');
const courier = document.getElementById('courier');
const envelopeStand = document.getElementById('envelopeStand');
const envelopeStandBox = document.getElementById('envelopeStandBox');
const snoozeBtn = document.getElementById('snoozeBtn');
const dismissBtn = document.getElementById('dismissBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsForm = document.getElementById('settingsForm');
const settingsTitle = document.getElementById('settingsTitle');
const settingsSubtitle = document.getElementById('settingsSubtitle');
const settingsStatus = document.getElementById('settingsStatus');
const settingsSkipBtn = document.getElementById('settingsSkipBtn');
const settingsTestBtn = document.getElementById('settingsTestBtn');
const cfgBaseUrl = document.getElementById('cfgBaseUrl');
const cfgType = document.getElementById('cfgType');
const cfgUsername = document.getElementById('cfgUsername');
const cfgToken = document.getElementById('cfgToken');
const cfgTokenHint = document.getElementById('cfgTokenHint');
const cfgSkipTls = document.getElementById('cfgSkipTls');
const cfgUserLabel = document.getElementById('cfgUserLabel');
const cfgCheckinInterval = document.getElementById('cfgCheckinInterval');

let jiraConfigured = false;
let settingsHasToken = false;

// ── Helpers ────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function offsetDateStr(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function relativeDayLabel(dateStr) {
  const today = todayStr();
  if (dateStr === today) return 'Today';
  if (dateStr === offsetDateStr(-1)) return 'Yesterday';
  if (dateStr === offsetDateStr(-2)) return '2 days ago';
  return formatShortDate(dateStr);
}

function isPastDate(dateStr) {
  return dateStr < todayStr();
}

function isFutureDate(dateStr) {
  return dateStr > todayStr();
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = todayStr();
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return dateStr === today ? `${label} (Today)` : label;
}

function loadAllTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAllTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(personalTasks));
}

function getTasksForDate(date) {
  return personalTasks[date] || [];
}

function loadJiraFocus() {
  try {
    return JSON.parse(localStorage.getItem(FOCUS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveJiraFocus() {
  localStorage.setItem(FOCUS_KEY, JSON.stringify(jiraFocus));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function priorityClass(priority) {
  const p = (priority || '').toLowerCase();
  if (p.includes('high') || p.includes('critical') || p.includes('blocker')) return 'tag-priority-high';
  if (p.includes('medium')) return 'tag-priority-medium';
  return '';
}

// ── Personal tasks ─────────────────────────────────────────────────────────
function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (!personalTasks[selectedDate]) personalTasks[selectedDate] = [];
  personalTasks[selectedDate].push({ id: uid(), text: trimmed, done: false, createdAt: Date.now() });
  saveAllTasks();
  renderPersonalTasks();
  updateStats();
}

function togglePersonalTask(id) {
  const tasks = personalTasks[selectedDate] || [];
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.done = !task.done;
    saveAllTasks();
    renderPersonalTasks();
    renderCarryOver();
    updateStats();
  }
}

function deletePersonalTask(id, date = selectedDate) {
  personalTasks[date] = (personalTasks[date] || []).filter((t) => t.id !== id);
  if (personalTasks[date].length === 0) delete personalTasks[date];
  saveAllTasks();
  renderPersonalTasks();
  renderCarryOver();
  updateStats();
}

function getPastIncompleteTasks() {
  const today = todayStr();
  const results = [];

  for (const [date, tasks] of Object.entries(personalTasks)) {
    if (date >= today) continue;
    for (const task of tasks) {
      if (!task.done) results.push({ ...task, date });
    }
  }

  return results.sort((a, b) => b.date.localeCompare(a.date) || (a.createdAt || 0) - (b.createdAt || 0));
}

function moveTaskToDate(taskId, fromDate, toDate) {
  if (toDate < todayStr()) return false;

  const sourceTasks = personalTasks[fromDate] || [];
  const index = sourceTasks.findIndex((t) => t.id === taskId);
  if (index === -1) return false;

  const task = sourceTasks[index];
  if (task.done) return false;

  sourceTasks.splice(index, 1);
  if (sourceTasks.length === 0) delete personalTasks[fromDate];

  if (!personalTasks[toDate]) personalTasks[toDate] = [];
  personalTasks[toDate].push({
    ...task,
    movedFrom: fromDate,
    movedAt: Date.now(),
  });

  saveAllTasks();
  return true;
}

function goToDate(dateStr) {
  selectedDate = dateStr;
  datePicker.value = dateStr;
  todayLabel.textContent = formatDateLabel(selectedDate);
  updateDateNav();
  renderPersonalTasks();
  renderCarryOver();
  renderJiraTasks();
  updateStats();
}

function renderMoveActions(taskId, fromDate, compact = false) {
  const tomorrow = offsetDateStr(1);
  return `
    <div class="task-actions">
      <button class="move-btn primary" data-action="move" data-id="${taskId}" data-from="${fromDate}" data-to="${todayStr()}" title="Move to today">→ Today</button>
      <button class="move-btn" data-action="move" data-id="${taskId}" data-from="${fromDate}" data-to="${tomorrow}" title="Move to tomorrow">→ Tomorrow</button>
      <input type="date" class="move-date-input" data-action="move-picker" data-id="${taskId}" data-from="${fromDate}" min="${todayStr()}" title="Move to date" />
    </div>`;
}

function bindTaskActionHandlers(container) {
  container.querySelectorAll('[data-action="move"]').forEach((el) => {
    el.addEventListener('click', () => {
      if (moveTaskToDate(el.dataset.id, el.dataset.from, el.dataset.to)) {
        renderPersonalTasks();
        renderCarryOver();
        updateStats();
      }
    });
  });

  container.querySelectorAll('[data-action="move-picker"]').forEach((el) => {
    el.addEventListener('change', () => {
      if (!el.value) return;
      if (moveTaskToDate(el.dataset.id, el.dataset.from, el.value)) {
        el.value = '';
        renderPersonalTasks();
        renderCarryOver();
        updateStats();
      }
    });
  });

  container.querySelectorAll('[data-action="view-day"]').forEach((el) => {
    el.addEventListener('click', () => goToDate(el.dataset.date));
  });
}

function renderCarryOver() {
  const items = getPastIncompleteTasks();
  const showOnToday = selectedDate === todayStr();

  carryOverSection.classList.toggle('hidden', !showOnToday || items.length === 0);
  carryOverCount.textContent = items.length;

  if (!showOnToday || items.length === 0) return;

  carryOverList.innerHTML = items
    .map(
      (t) => `
    <li class="task-item">
      <span style="width:16px;flex-shrink:0"></span>
      <div class="task-content">
        <div class="task-text">${escapeHtml(t.text)}</div>
        <div class="task-meta">
          <span class="tag tag-date">${relativeDayLabel(t.date)}</span>
        </div>
      </div>
      <button class="view-day-btn" data-action="view-day" data-date="${t.date}">View</button>
      ${renderMoveActions(t.id, t.date, true)}
    </li>`
    )
    .join('');

  bindTaskActionHandlers(carryOverList);
}

function updateDateNav() {
  dateNav.querySelectorAll('.date-nav-btn').forEach((btn) => {
    const offset = Number(btn.dataset.offset);
    const btnDate = offsetDateStr(offset);
    btn.classList.toggle('active', btnDate === selectedDate);
  });
}

function updatePastDayBanner() {
  if (!isPastDate(selectedDate)) {
    pastDayBanner.classList.add('hidden');
    pastDayBanner.textContent = '';
    return;
  }

  const tasks = getTasksForDate(selectedDate);
  const openCount = tasks.filter((t) => !t.done).length;
  pastDayBanner.classList.remove('hidden');
  pastDayBanner.textContent =
    openCount > 0
      ? `Viewing ${relativeDayLabel(selectedDate)} — ${openCount} open task${openCount !== 1 ? 's' : ''}. Move unfinished items to today or a future date.`
      : `Viewing ${relativeDayLabel(selectedDate)} — all tasks completed.`;
}

function renderPersonalTasks() {
  const tasks = getTasksForDate(selectedDate);
  document.getElementById('personalCount').textContent = tasks.filter((t) => !t.done).length;

  updatePastDayBanner();
  renderCarryOver();

  if (tasks.length === 0) {
    personalTaskList.innerHTML = `<li class="empty-state">No tasks for ${relativeDayLabel(selectedDate)} — add one above!</li>`;
    return;
  }

  personalTaskList.innerHTML = tasks
    .map((t) => {
      const showMove = !t.done && !isFutureDate(selectedDate);
      return `
    <li class="task-item${t.done ? ' done' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''} data-id="${t.id}" class="personal-check" />
      <div class="task-content">
        <div class="task-text">${escapeHtml(t.text)}</div>
        ${t.movedFrom ? `<div class="task-meta"><span class="tag tag-date">Moved from ${relativeDayLabel(t.movedFrom)}</span></div>` : ''}
      </div>
      ${showMove ? renderMoveActions(t.id, selectedDate) : ''}
      <button class="btn-icon delete-btn" data-id="${t.id}" title="Delete">✕</button>
    </li>`;
    })
    .join('');

  personalTaskList.querySelectorAll('.personal-check').forEach((el) => {
    el.addEventListener('change', () => togglePersonalTask(el.dataset.id));
  });
  personalTaskList.querySelectorAll('.delete-btn').forEach((el) => {
    el.addEventListener('click', () => deletePersonalTask(el.dataset.id));
  });
  bindTaskActionHandlers(personalTaskList);
}

// ── Jira ───────────────────────────────────────────────────────────────────
function formatLastSynced() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function fetchJiraIssues(silent = false) {
  if (!silent) {
    jiraStatus.className = 'status-msg loading';
    jiraStatus.textContent = 'Loading Jira issues…';
    refreshJiraBtn.disabled = true;
  }

  try {
    const res = await fetch('/api/jira/issues');
    const data = await res.json();

    if (!res.ok) {
      jiraStatus.className = 'status-msg error';
      jiraStatus.textContent = data.message || data.error || 'Failed to load Jira';
      jiraIssues = [];
    } else {
      jiraIssues = data.issues;
      jiraStatus.className = 'status-msg';
      jiraStatus.textContent = `${data.total} open issue${data.total !== 1 ? 's' : ''} (since ${data.sinceDate}) · synced ${formatLastSynced()}`;
    }
  } catch (err) {
    jiraStatus.className = 'status-msg error';
    jiraStatus.textContent = 'Network error — is the server running?';
    jiraIssues = [];
  }

  refreshJiraBtn.disabled = false;
  renderJiraTasks();
  updateStats();
}

function toggleJiraFocus(key) {
  const dateFocus = jiraFocus[selectedDate] || {};
  if (dateFocus[key]) {
    delete dateFocus[key];
  } else {
    dateFocus[key] = { done: false, addedAt: Date.now() };
  }
  jiraFocus[selectedDate] = dateFocus;
  saveJiraFocus();
  renderJiraTasks();
  updateStats();
}

function toggleJiraDone(key) {
  const dateFocus = jiraFocus[selectedDate] || {};
  if (dateFocus[key]) {
    dateFocus[key].done = !dateFocus[key].done;
    jiraFocus[selectedDate] = dateFocus;
    saveJiraFocus();
    renderJiraTasks();
    updateStats();
  }
}

function renderJiraTasks() {
  const dateFocus = jiraFocus[selectedDate] || {};
  const focusedCount = Object.keys(dateFocus).length;
  document.getElementById('jiraCount').textContent = jiraIssues.length;

  if (jiraIssues.length === 0 && !jiraStatus.textContent) {
    jiraTaskList.innerHTML = '<li class="empty-state">No Jira issues loaded</li>';
    return;
  }

  jiraTaskList.innerHTML = jiraIssues
    .map((issue) => {
      const focused = Boolean(dateFocus[issue.key]);
      const done = focused && dateFocus[issue.key].done;
      return `
      <li class="task-item${done ? ' done' : ''}">
        ${
          focused
            ? `<input type="checkbox" ${done ? 'checked' : ''} data-key="${issue.key}" class="jira-check" />`
            : '<span style="width:16px;flex-shrink:0"></span>'
        }
        <div class="task-content">
          <a href="${issue.url}" target="_blank" rel="noopener" class="task-link">
            <div class="task-text">${escapeHtml(issue.summary)}</div>
          </a>
          <div class="task-meta">
            <span class="tag tag-key">${issue.key}</span>
            <span class="tag tag-status">${escapeHtml(issue.status)}</span>
            ${issue.priority !== 'None' ? `<span class="tag ${priorityClass(issue.priority)}">${escapeHtml(issue.priority)}</span>` : ''}
          </div>
        </div>
        <button class="focus-toggle${focused ? ' active' : ''}" data-key="${issue.key}" title="Add to today's focus">
          ${focused ? '★ Focus' : '+ Focus'}
        </button>
      </li>`;
    })
    .join('');

  jiraTaskList.querySelectorAll('.focus-toggle').forEach((el) => {
    el.addEventListener('click', () => toggleJiraFocus(el.dataset.key));
  });
  jiraTaskList.querySelectorAll('.jira-check').forEach((el) => {
    el.addEventListener('change', () => toggleJiraDone(el.dataset.key));
  });
}

// ── Stats ──────────────────────────────────────────────────────────────────
function updateStats() {
  const personal = getTasksForDate(selectedDate);
  const dateFocus = jiraFocus[selectedDate] || {};

  const personalOpen = personal.filter((t) => !t.done).length;
  const jiraOpen = jiraIssues.length;
  const personalDone = personal.filter((t) => t.done).length;
  const jiraDone = Object.values(dateFocus).filter((f) => f.done).length;

  document.getElementById('statPersonal').textContent = personalOpen;
  document.getElementById('statJira').textContent = jiraOpen;
  document.getElementById('statDone').textContent = personalDone + jiraDone;
}

// ── 5-minute check-in popup ────────────────────────────────────────────────
const isDesktop = Boolean(window.electronAPI?.isDesktop);

function updateSnoozeLabel(minutes = checkinIntervalMinutes) {
  snoozeBtn.textContent = `Snooze ${minutes} min`;
}

function applyCheckinInterval(minutes) {
  checkinIntervalMinutes = minutes;
  checkinIntervalMs = minutes * 60 * 1000;
  secondsUntilCheckin = checkinIntervalMs / 1000;
  updateSnoozeLabel(minutes);
  updateTimerBadge();
  startCheckinTimer();

  if (isDesktop && window.electronAPI?.applyCheckinInterval) {
    window.electronAPI.applyCheckinInterval(minutes);
  }
}

async function loadAppPreferences() {
  const res = await fetch('/api/config');
  const data = await res.json();
  applyCheckinInterval(data.checkinIntervalMinutes ?? DEFAULT_CHECKIN_INTERVAL_MINUTES);
}

function startCheckinTimer() {
  clearInterval(checkinTimer);
  clearInterval(countdownTimer);
  secondsUntilCheckin = checkinIntervalMs / 1000;
  updateTimerBadge();

  countdownTimer = setInterval(() => {
    secondsUntilCheckin--;
    updateTimerBadge();
    if (secondsUntilCheckin <= 0) secondsUntilCheckin = checkinIntervalMs / 1000;
  }, 1000);

  // Desktop app: main process owns the 5-min timer (works when window is hidden)
  if (!isDesktop) {
    checkinTimer = setInterval(showCheckinPopup, checkinIntervalMs);
  }
}

function setupDesktopCheckin() {
  if (!isDesktop) return;

  window.electronAPI.onCheckinRequest(() => {
    showCheckinPopup(true);
    secondsUntilCheckin = checkinIntervalMs / 1000;
  });

  window.electronAPI.onPrepareEmerge(() => {
    document.body.classList.add('awaiting-emerge');
  });

  window.electronAPI.onEmergeFromEnvelope(() => {
    emergeAppFromEnvelope();
    secondsUntilCheckin = checkinIntervalMs / 1000;
  });
}

function startJiraSyncTimer() {
  if (jiraSyncTimer) clearInterval(jiraSyncTimer);

  if (isDesktop) {
    window.electronAPI.onJiraSyncRequest(() => fetchJiraIssues(true));
  } else {
    jiraSyncTimer = setInterval(() => fetchJiraIssues(true), JIRA_SYNC_INTERVAL_MS);
  }
}

function updateTimerBadge() {
  const mins = Math.floor(secondsUntilCheckin / 60);
  const secs = secondsUntilCheckin % 60;
  timerBadge.textContent = `⏱ ${mins}:${secs.toString().padStart(2, '0')}`;
}

const FLY_DURATION_MS = 3000;
const BIRD_EXIT_MS = 500;
const ENVELOPE_OPEN_MS = 700;
const APP_EMERGE_MS = 700;

function enterDeliveryMode() {
  document.body.classList.add('delivery-mode');
  mainApp.classList.remove('app-emerge', 'app-emerge--play');
  checkinBanner.classList.add('hidden');
}

function startCourierFlight() {
  courier.classList.remove('courier--fly', 'courier--bird-leave');
  void courier.offsetWidth;
  courier.classList.add('courier--fly');

  setTimeout(() => {
    courier.classList.add('courier--bird-leave');
    envelopeStand.classList.remove('hidden');

    setTimeout(() => {
      courier.classList.remove('courier--fly', 'courier--bird-leave');
      envelopeStandBox.classList.add('envelope--open');

      setTimeout(() => {
        emergeAppFromEnvelope();
      }, ENVELOPE_OPEN_MS);
    }, BIRD_EXIT_MS);
  }, FLY_DURATION_MS);
}

function playDeliveryAnimation() {
  enterDeliveryMode();

  deliveryOverlay.classList.remove('hidden');
  envelopeStand.classList.add('hidden');
  envelopeStandBox.classList.remove('envelope--open');

  requestAnimationFrame(() => {
    requestAnimationFrame(startCourierFlight);
  });
}

function resetDeliveryAnimation() {
  deliveryOverlay.classList.add('hidden');
  deliveryOverlay.classList.remove('delivery-overlay--fade');
  courier.classList.remove('courier--fly', 'courier--bird-leave');
  envelopeStand.classList.add('hidden');
  envelopeStandBox.classList.remove('envelope--open');
  mainApp.classList.remove('app-emerge', 'app-emerge--play');
  document.body.classList.remove('delivery-mode');
}

function emergeAppFromEnvelope() {
  document.body.classList.remove('delivery-mode', 'awaiting-emerge');
  deliveryOverlay.classList.add('hidden');
  deliveryOverlay.classList.remove('delivery-overlay--fade');

  mainApp.classList.add('app-emerge');
  void mainApp.offsetWidth;
  mainApp.classList.add('app-emerge--play');
  checkinBanner.classList.remove('hidden');
  document.title = '⏰ Check in — Daily TODO';

  setTimeout(() => {
    deliveryOverlay.classList.add('hidden');
    deliveryOverlay.classList.remove('delivery-overlay--fade');
    mainApp.classList.remove('app-emerge', 'app-emerge--play');

    if (isDesktop && window.electronAPI?.signalDeliveryComplete) {
      window.electronAPI.signalDeliveryComplete();
    }
  }, APP_EMERGE_MS);
}

function showCheckinPopup(animated = true) {
  if (animated) {
    playDeliveryAnimation();
  } else {
    checkinBanner.classList.remove('hidden');
  }

  if (!isDesktop && Notification.permission === 'granted') {
    new Notification('Daily TODO — Check-in', {
      body: 'Time to review and mark your completed tasks.',
    });
  }
}

function dismissCheckin() {
  checkinBanner.classList.add('hidden');
  resetDeliveryAnimation();
  document.title = 'Daily TODO';
  secondsUntilCheckin = checkinIntervalMs / 1000;
}

function requestNotificationPermission() {
  if (isDesktop) return;
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ── Settings ───────────────────────────────────────────────────────────────
function updateCfgLabels() {
  const isCloud = cfgType.value === 'cloud';
  cfgUserLabel.textContent = isCloud ? 'Email' : 'Username';
  cfgUsername.placeholder = isCloud ? 'you@company.com' : 'your.username';
  cfgTokenLabel.textContent = isCloud ? 'API token' : 'Password or PAT';
  cfgToken.placeholder = isCloud ? 'Atlassian API token' : 'Jira password or personal access token';
}

function setSettingsStatus(message, type = '') {
  settingsStatus.textContent = message;
  settingsStatus.className = `status-msg${type ? ` ${type}` : ''}`;
  settingsStatus.classList.toggle('hidden', !message);
}

function readSettingsForm() {
  return {
    checkinIntervalMinutes: Number(cfgCheckinInterval.value),
    jiraBaseUrl: cfgBaseUrl.value.trim(),
    jiraUsername: cfgUsername.value.trim(),
    jiraApiToken: cfgToken.value,
    jiraType: cfgType.value,
    tlsRejectUnauthorized: !cfgSkipTls.checked,
  };
}

async function loadSettingsForm() {
  const res = await fetch('/api/config');
  const data = await res.json();
  jiraConfigured = data.configured;
  settingsHasToken = data.hasToken;

  cfgBaseUrl.value = data.jiraBaseUrl || '';
  cfgType.value = data.jiraType || 'server';
  cfgUsername.value = data.jiraUsername || '';
  cfgToken.value = '';
  cfgSkipTls.checked = data.tlsRejectUnauthorized === false;
  cfgCheckinInterval.value = data.checkinIntervalMinutes ?? DEFAULT_CHECKIN_INTERVAL_MINUTES;
  cfgTokenHint.textContent = settingsHasToken
    ? 'Leave blank to keep your saved credential.'
    : '';
  cfgToken.required = !settingsHasToken;
  updateCfgLabels();
}

async function openSettings(firstRun = false) {
  await loadSettingsForm();
  settingsTitle.textContent = firstRun ? 'Welcome — set up Daily TODO' : 'Settings';
  settingsSubtitle.textContent = firstRun
    ? 'Set your check-in interval and optionally connect Jira. Everything stays on your machine.'
    : 'App preferences and Jira credentials are stored locally on your machine only.';
  settingsSkipBtn.classList.toggle('hidden', !firstRun);
  setSettingsStatus('');
  settingsOverlay.classList.remove('hidden');
  cfgBaseUrl.focus();
}

async function savePreferencesOnly() {
  const minutes = Number(cfgCheckinInterval.value);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) return;

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkinIntervalMinutes: minutes }),
    });
    const data = await res.json();
    if (res.ok) {
      applyCheckinInterval(data.config?.checkinIntervalMinutes ?? minutes);
    }
  } catch {
    // ignore — skip still closes settings
  }
}

function closeSettings() {
  settingsOverlay.classList.add('hidden');
  setSettingsStatus('');
}

async function saveSettings(event) {
  event.preventDefault();
  setSettingsStatus('Saving…', 'loading');

  const payload = readSettingsForm();
  if (
    !Number.isFinite(payload.checkinIntervalMinutes)
    || payload.checkinIntervalMinutes < 1
    || payload.checkinIntervalMinutes > 240
  ) {
    setSettingsStatus('Check-in interval must be between 1 and 240 minutes.', 'error');
    return;
  }

  const savingJira = payload.jiraBaseUrl || payload.jiraUsername || payload.jiraApiToken;
  const canSaveJira =
    payload.jiraBaseUrl
    && payload.jiraUsername
    && (payload.jiraApiToken || settingsHasToken);

  if (savingJira && !canSaveJira) {
    setSettingsStatus('Jira URL, username, and password/token are required.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setSettingsStatus(data.message || 'Failed to save settings.', 'error');
      return;
    }

    applyCheckinInterval(data.config.checkinIntervalMinutes ?? payload.checkinIntervalMinutes);

    if (canSaveJira) {
      jiraConfigured = true;
      settingsHasToken = true;
      fetchJiraIssues();
    }

    closeSettings();
  } catch {
    setSettingsStatus('Could not save settings.', 'error');
  }
}

async function testSettings() {
  setSettingsStatus('Testing connection…', 'loading');
  const payload = readSettingsForm();

  if (!payload.jiraBaseUrl || !payload.jiraUsername) {
    setSettingsStatus('Enter Jira URL and username first.', 'error');
    return;
  }
  if (!payload.jiraApiToken && !settingsHasToken) {
    setSettingsStatus('Enter your password or API token to test.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setSettingsStatus(data.message || 'Connection failed.', 'error');
      return;
    }
    setSettingsStatus(`Connected as ${data.displayName || data.username}`, 'success');
  } catch {
    setSettingsStatus('Connection test failed.', 'error');
  }
}

function setupDesktopSettings() {
  if (!isDesktop || !window.electronAPI.onOpenSettings) return;
  window.electronAPI.onOpenSettings(() => openSettings(false));
}

// ── Utils ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
  datePicker.value = selectedDate;
  todayLabel.textContent = formatDateLabel(selectedDate);
  updateDateNav();

  datePicker.addEventListener('change', (e) => {
    goToDate(e.target.value);
  });

  dateNav.querySelectorAll('.date-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => goToDate(offsetDateStr(Number(btn.dataset.offset))));
  });

  addTaskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    addTask(taskInput.value);
    taskInput.value = '';
    taskInput.focus();
  });

  refreshJiraBtn.addEventListener('click', fetchJiraIssues);
  settingsBtn.addEventListener('click', () => openSettings(false));
  settingsForm.addEventListener('submit', saveSettings);
  settingsTestBtn.addEventListener('click', testSettings);
  settingsSkipBtn.addEventListener('click', async () => {
    await savePreferencesOnly();
    closeSettings();
  });
  cfgType.addEventListener('change', updateCfgLabels);

  snoozeBtn.addEventListener('click', dismissCheckin);
  dismissBtn.addEventListener('click', dismissCheckin);

  await loadAppPreferences();
  renderPersonalTasks();
  setupDesktopCheckin();
  setupDesktopSettings();
  startJiraSyncTimer();
  requestNotificationPermission();

  try {
    const health = await fetch('/api/health').then((r) => r.json());
    jiraConfigured = health.jiraConfigured;
    if (jiraConfigured) {
      fetchJiraIssues();
    } else {
      jiraStatus.className = 'status-msg';
      jiraStatus.textContent = 'Jira not configured — open Settings to connect.';
      openSettings(true);
    }
  } catch {
    jiraStatus.className = 'status-msg error';
    jiraStatus.textContent = 'Could not reach the app server.';
  }
}

init();
