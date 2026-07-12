(function () {
  'use strict';

  /*
   * Navy Ready v20 enhancement layer
   * Loaded by the existing v19.1 index.html through <script src="./pwa.js">.
   * It intentionally leaves the established APP_KEY, Firebase project, and all
   * historical daily/BCA/PRT records untouched.
   */

  const STATUS_READY = 'Install is ready. Use the button or your browser menu to add it to your device.';
  const STATUS_INSTALLED = 'Installed as an app on this device.';
  const STATUS_BROWSER = 'Open in Chrome, Edge, or Safari and use the browser install/share menu if no prompt appears.';
  const SETTINGS_KEY = 'navy_ready_pwa_notification_settings';
  const LAST_NOTIFY_KEY = 'navy_ready_pwa_last_notification';
  const APP_KEY_FALLBACK = 'navy_ready_tracker_v4_adaptive_2026_05_31';
  const SNAPSHOT_KEY_FALLBACK = APP_KEY_FALLBACK + '_recovery_snapshots';
  const PRE_REVISION_BACKUP_KEY = APP_KEY_FALLBACK + '_pre_v20_2026_07_12';
  const REVISION_VERSION = 'v20.0-july12-trajectory';
  const REVISION_START = '2026-07-12';
  const HISTORICAL_CUTOFF = '2026-07-11';
  const CLOUD_BACKUP_DOC = 'backup_pre_revision_2026_07_12';
  const BUILD_WEEKS_V20 = 36;
  const MS_DAY = 86400000;
  // December 2025 Guide-4, Table-2: minimum male Height-Waist Difference
  // that corresponds to 26% BF or lower for each rounded weight range.
  const MALE_STEP2_26_DIFF_RANGES = [
    [101,109,22],[110,119,22.5],[120,129,23],[130,139,23.5],
    [140,149,24],[150,159,24.5],[160,170,25],[171,180,25.5],
    [181,190,26],[191,200,26.5],[201,210,27],[211,220,27.5],
    [221,230,28],[231,240,28.5],[241,250,29],[251,260,29.5],
    [261,271,30],[272,281,30.5],[282,291,31],[292,301,31.5],
    [302,311,32],[312,321,32.5],[322,331,33],[332,341,33.5],
    [342,351,34],[352,361,34.5],[362,372,35],[373,380,35.5]
  ];

  let deferredInstallPrompt = null;
  let reminderTimer = null;
  let enhancementObserver = null;
  let enhanceTimer = null;
  let coreWrapped = false;
  let migrationFinished = false;

  function status(message) {
    const el = document.getElementById('installStatus');
    if (el) el.textContent = message;
  }

  function pushStatus(message) {
    const el = document.getElementById('pushStatus');
    if (el) el.textContent = message;
  }

  function appToast(message) {
    try {
      if (typeof toast === 'function') toast(message);
      else if (typeof window.toast === 'function') window.toast(message);
    } catch (_) {
      // The core app may not be initialized yet.
    }
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      status('This browser does not support offline install service workers.');
      return null;
    }
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      status(isStandalone() ? STATUS_INSTALLED : STATUS_BROWSER);
      return registration;
    } catch (err) {
      console.warn('Service worker registration failed:', err);
      status('Offline install setup failed. Host through HTTPS/GitHub Pages and reload.');
      return null;
    }
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    status(STATUS_READY);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    status(STATUS_INSTALLED);
  });

  async function installApp() {
    if (isStandalone()) {
      status(STATUS_INSTALLED);
      appToast('Already installed.');
      return;
    }
    if (!deferredInstallPrompt) {
      status(STATUS_BROWSER);
      alert('No automatic install prompt is available right now. On GitHub Pages, use your browser menu: Chrome/Edge: Install app; iPhone/iPad Safari: Share → Add to Home Screen.');
      return;
    }
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    status(choice.outcome === 'accepted' ? STATUS_INSTALLED : STATUS_BROWSER);
  }

  async function enablePush() {
    if (!('Notification' in window)) {
      pushStatus('This browser does not support notifications.');
      alert('This browser does not support notifications.');
      return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      pushStatus('Notifications allowed. Open-app reminders and test notifications are enabled. Background push still requires Firebase/server scheduling.');
      await registerServiceWorker();
      appToast('Notification permission enabled.');
    } else {
      pushStatus('Notifications not allowed. Check browser/site settings to enable them later.');
    }
    return permission;
  }

  function showNotification(title, options) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const payload = Object.assign({
      body: 'Navy Ready reminder',
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      tag: 'navy-ready-reminder',
      renotify: false,
      data: { url: './?tab=today' }
    }, options || {});
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => registration.showNotification(title, payload));
    } else {
      new Notification(title, payload);
    }
    return true;
  }

  async function testNotification() {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications.');
      return;
    }
    if (Notification.permission !== 'granted') {
      const permission = await enablePush();
      if (permission !== 'granted') return;
    }
    const ok = showNotification('Navy Ready', {
      body: 'Test notification: train, improve, endure, comeback.',
      data: { url: './?tab=today' }
    });
    if (ok) pushStatus('Test notification sent.');
  }

  function loadReminderSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (_) {
      return {};
    }
  }

  function syncReminderSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings || {}));
    } catch (_) {}
    scheduleOpenAppReminders(settings || loadReminderSettings());
  }

  function notificationBody(slot, settings) {
    const tone = settings && settings.tone ? settings.tone : 'hard';
    if (slot === 'morning') {
      if (tone === 'no_mercy') return 'No excuses. Log your starting status, execute today, and earn the comeback.';
      if (tone === 'hard') return 'Morning muster: review today, train smart, and log the work.';
      return 'Morning reminder: open Navy Ready and review today.';
    }
    if (slot === 'midday') {
      if (tone === 'no_mercy') return 'Midday check: hydrate, hit protein, and do not drift.';
      if (tone === 'hard') return 'Midday check: water, protein, pain status, and next action.';
      return 'Midday reminder: check your nutrition and recovery.';
    }
    if (tone === 'no_mercy') return 'Evening accountability: log it honestly. Misses do not hide.';
    if (tone === 'hard') return 'Evening accountability: save the day, review compliance, prep tomorrow.';
    return 'Evening reminder: log your day in Navy Ready.';
  }

  function scheduleOpenAppReminders(settings) {
    if (reminderTimer) clearInterval(reminderTimer);
    if (!settings || settings.enabled !== true) {
      pushStatus('Reminder settings saved. Notifications are off.');
      return;
    }
    pushStatus('Open-app reminders armed. Background closed-app push requires Firebase/server scheduling.');
    const slots = ['morning', 'midday', 'evening'];
    const tick = () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const today = localISO(now);
      let last = {};
      try {
        last = JSON.parse(localStorage.getItem(LAST_NOTIFY_KEY) || '{}');
      } catch (_) {}
      for (const slot of slots) {
        const target = settings[slot];
        if (!target || target !== hhmm) continue;
        const key = today + ':' + slot;
        if (last[key]) continue;
        last[key] = new Date().toISOString();
        try {
          localStorage.setItem(LAST_NOTIFY_KEY, JSON.stringify(last));
        } catch (_) {}
        showNotification('Navy Ready — ' + slot.charAt(0).toUpperCase() + slot.slice(1), {
          body: notificationBody(slot, settings),
          data: { url: './?tab=today' },
          tag: 'navy-ready-' + slot + '-' + today
        });
      }
    };
    tick();
    reminderTimer = setInterval(tick, 30000);
  }

  function syncDailyStatus() {
    scheduleEnhancementRender();
  }

  function showImmediateFeedback(q) {
    const el = document.getElementById('pushStatus');
    if (el && q && q.message) el.textContent = 'Latest feedback: ' + q.message;
  }

  // ---------- Core access and migration ----------

  function coreReady() {
    try {
      return typeof state === 'object' && state !== null && typeof saveState === 'function' && typeof getInfo === 'function';
    } catch (_) {
      return false;
    }
  }

  function getCoreState() {
    try {
      if (typeof state === 'object' && state) return state;
    } catch (_) {}
    try {
      return JSON.parse(localStorage.getItem(APP_KEY_FALLBACK) || '{}');
    } catch (_) {
      return {};
    }
  }

  function persistCoreState(options) {
    try {
      if (typeof saveState === 'function') return saveState(Object.assign({ skipCloud: false }, options || {}));
    } catch (err) {
      console.warn('v20 core save fallback:', err);
    }
    try {
      localStorage.setItem(APP_KEY_FALLBACK, JSON.stringify(getCoreState()));
      return true;
    } catch (_) {
      return false;
    }
  }

  function deepCopy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function migrateRevisionState() {
    if (migrationFinished || !coreReady()) return;
    migrationFinished = true;

    let rawBefore = '';
    try {
      rawBefore = localStorage.getItem(APP_KEY_FALLBACK) || '';
      if (rawBefore && !localStorage.getItem(PRE_REVISION_BACKUP_KEY)) {
        localStorage.setItem(PRE_REVISION_BACKUP_KEY, rawBefore);
      }
    } catch (err) {
      console.warn('Could not write independent pre-revision local backup:', err);
    }

    // Add a true pre-migration state to the existing rolling snapshot lane.
    if (rawBefore) {
      try {
        const beforeState = JSON.parse(rawBefore);
        let snaps = JSON.parse(localStorage.getItem(SNAPSHOT_KEY_FALLBACK) || '[]');
        if (!Array.isArray(snaps)) snaps = [];
        const already = snaps.some((s) => s && s.reason === 'before July 12 program revision');
        if (!already) {
          snaps.unshift({
            createdAt: new Date().toISOString(),
            reason: 'before July 12 program revision',
            appVersion: beforeState.meta && beforeState.meta.appVersion ? beforeState.meta.appVersion : 'v19.1',
            schemaVersion: beforeState.meta && beforeState.meta.schemaVersion ? beforeState.meta.schemaVersion : 10,
            state: beforeState
          });
          localStorage.setItem(SNAPSHOT_KEY_FALLBACK, JSON.stringify(snaps.slice(0, 5)));
        }
      } catch (err) {
        console.warn('Could not add pre-revision rolling snapshot:', err);
      }
    }

    const s = getCoreState();
    s.meta = s.meta || {};
    s.meta.enhancementVersion = REVISION_VERSION;
    s.meta.programRevisionStart = REVISION_START;
    s.meta.historicalCutoff = HISTORICAL_CUTOFF;
    s.meta.migrationNotes = Array.isArray(s.meta.migrationNotes) ? s.meta.migrationNotes : [];
    if (!s.meta.migrationNotes.some((n) => n && n.note && String(n.note).includes(REVISION_VERSION))) {
      s.meta.migrationNotes.push({
        at: new Date().toISOString(),
        from: s.meta.appVersion || 'v19.1',
        to: REVISION_VERSION,
        note: REVISION_VERSION + ': added a July 12 cutoff, trajectory lanes, recruiter milestones, official BCA command card, run/checkpoint command logic, and pre-save backups without modifying historical logs.'
      });
    }

    const existing = s.revisionV20 || {};
    s.revisionV20 = Object.assign({
      version: REVISION_VERSION,
      migratedAt: new Date().toISOString(),
      historicalCutoff: HISTORICAL_CUTOFF,
      revisionStart: REVISION_START,
      cloudBackupCreatedAt: '',
      recruiter: {
        initialContact: {
          completed: true,
          completedMonth: '2026-04',
          notes: 'Informational contact completed in April 2026; requirements understood. Current limiting lane is physical readiness.'
        },
        milestones: {},
        notes: '',
        nextFollowUp: ''
      },
      checkpoints: {},
      dismissedNotices: {}
    }, existing);
    s.revisionV20.recruiter = Object.assign({
      initialContact: {
        completed: true,
        completedMonth: '2026-04',
        notes: 'Informational contact completed in April 2026; requirements understood. Current limiting lane is physical readiness.'
      },
      milestones: {},
      notes: '',
      nextFollowUp: ''
    }, existing.recruiter || {});
    s.revisionV20.recruiter.initialContact = Object.assign({ completed: true, completedMonth: '2026-04' }, s.revisionV20.recruiter.initialContact || {});
    s.revisionV20.recruiter.milestones = s.revisionV20.recruiter.milestones || {};
    s.revisionV20.checkpoints = s.revisionV20.checkpoints || {};
    s.revisionV20.dismissedNotices = s.revisionV20.dismissedNotices || {};

    persistCoreState({ snapshot: false, skipCloud: true, reason: 'v20 additive migration' });
    wrapCloudSave();
    scheduleEnhancementRender();
  }

  async function ensureCloudBackup() {
    if (!coreReady()) return false;
    const s = getCoreState();
    if (s.revisionV20 && s.revisionV20.cloudBackupCreatedAt) return true;
    try {
      if (typeof cloudSync === 'undefined' || !cloudSync || !cloudSync.user || !cloudSync.db) return false;
      const currentRef = cloudSync.db.collection('users').doc(cloudSync.user.uid).collection('tracker').doc('current');
      const backupRef = cloudSync.db.collection('users').doc(cloudSync.user.uid).collection('tracker').doc(CLOUD_BACKUP_DOC);
      const existingBackup = await backupRef.get();
      const existingData = existingBackup.exists ? (existingBackup.data() || {}) : null;
      const existingIsUsable = !!(existingData && (
        existingData.noSourceDocument === true ||
        typeof existingData.payload === 'string' ||
        (existingData.state && typeof existingData.state === 'object')
      ));
      if (!existingIsUsable) {
        const current = await currentRef.get();
        if (current.exists) {
          const currentData = current.data() || {};
          const currentIsUsable = typeof currentData.payload === 'string' || (currentData.state && typeof currentData.state === 'object');
          if (!currentIsUsable) throw new Error('Current cloud document exists but its tracker payload could not be verified.');
          await backupRef.set(Object.assign({}, currentData, {
            backupCreatedAtMs: Date.now(),
            backupCreatedAt: new Date().toISOString(),
            backupReason: 'Pre-v20 July 12 revision safeguard',
            sourceDoc: 'current'
          }), { merge: false });
        } else {
          await backupRef.set({
            backupCreatedAtMs: Date.now(),
            backupCreatedAt: new Date().toISOString(),
            backupReason: 'Pre-v20 safeguard; current cloud document did not yet exist.',
            sourceDoc: 'current',
            noSourceDocument: true
          }, { merge: false });
        }
        const verified = await backupRef.get();
        const verifiedData = verified.exists ? (verified.data() || {}) : {};
        if (!verified.exists || !(
          verifiedData.noSourceDocument === true ||
          typeof verifiedData.payload === 'string' ||
          (verifiedData.state && typeof verifiedData.state === 'object')
        )) throw new Error('The pre-revision cloud backup write could not be verified.');
      }
      s.revisionV20 = s.revisionV20 || {};
      s.revisionV20.cloudBackupCreatedAt = new Date().toISOString();
      s.revisionV20.cloudBackupDoc = CLOUD_BACKUP_DOC;
      persistCoreState({ snapshot: false, skipCloud: true });
      try {
        if (typeof updateCloudStatus === 'function') updateCloudStatus('Pre-revision cloud backup verified. Current document may sync safely.');
      } catch (_) {}
      return true;
    } catch (err) {
      console.warn('Pre-revision cloud backup failed:', err);
      try {
        if (typeof updateCloudStatus === 'function') updateCloudStatus('Cloud sync paused: pre-revision backup could not be verified. Local data remains safe.');
      } catch (_) {}
      return false;
    }
  }

  function wrapCloudSave() {
    if (coreWrapped || !coreReady()) return;
    coreWrapped = true;
    try {
      if (typeof saveToCloud === 'function' && !saveToCloud.__v20Wrapped) {
        const originalSaveToCloud = saveToCloud;
        const wrapped = async function (options) {
          const backupOK = await ensureCloudBackup();
          const signedIn = (typeof cloudSync !== 'undefined' && cloudSync && cloudSync.user);
          if (signedIn && !backupOK) {
            if (!(options && options.silent)) {
              alert('Cloud save was paused because the pre-revision backup could not be verified. Your local data is still saved. Check the connection and try Save to Cloud again.');
            }
            return false;
          }
          return originalSaveToCloud(options || {});
        };
        wrapped.__v20Wrapped = true;
        saveToCloud = wrapped;
      }
    } catch (err) {
      console.warn('Could not wrap cloud save:', err);
    }
  }

  // ---------- Dates and data extraction ----------

  function localISO(date) {
    const d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseLocalISO(value) {
    const p = String(value || '').split('-').map(Number);
    if (p.length !== 3 || p.some(Number.isNaN)) return new Date(NaN);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function daysBetween(a, b) {
    return Math.floor((parseLocalISO(b) - parseLocalISO(a)) / MS_DAY);
  }

  function addDaysISO(value, amount) {
    const d = parseLocalISO(value);
    d.setDate(d.getDate() + amount);
    return localISO(d);
  }

  function selectedDateValue() {
    try {
      if (typeof selectedDate === 'string' && selectedDate) return selectedDate;
    } catch (_) {}
    return localISO(new Date());
  }

  function campaignInfo(dateValue) {
    const s = getCoreState();
    const start = (s.settings && s.settings.startDate) || '2026-06-08';
    const d = dateValue || localISO(new Date());
    const date = parseLocalISO(d);
    let week = Math.max(1, Math.min(62, Math.floor(daysBetween(start, d) / 7) + 1));
    let dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];

    // The core tracker owns campaign week/day semantics. Reuse them whenever
    // available so the enhancement layer cannot drift at Sunday boundaries.
    try {
      if (typeof getInfo === 'function') {
        const coreInfo = getInfo(d);
        if (coreInfo && Number.isFinite(Number(coreInfo.week))) week = Number(coreInfo.week);
        if (coreInfo && coreInfo.dayName) dayName = coreInfo.dayName;
      }
    } catch (_) {}

    return { start, date: d, week, dayName, beforeRevision: d <= HISTORICAL_CUTOFF };
  }

  function sortedEntries(object) {
    return Object.entries(object || {}).filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function latestEntry(object) {
    const entries = sortedEntries(object);
    return entries.length ? { date: entries[entries.length - 1][0], value: entries[entries.length - 1][1] } : null;
  }

  function firstEntry(object) {
    const entries = sortedEntries(object);
    return entries.length ? { date: entries[0][0], value: entries[0][1] } : null;
  }

  function numberOrNaN(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function timeSeconds(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parts = String(value || '').trim().split(':').map(Number);
    if (!parts.length || parts.some(Number.isNaN)) return NaN;
    if (parts.length === 1) return parts[0];
    return parts[0] * 60 + parts[1];
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const value = Math.max(0, Math.round(seconds));
    return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
  }

  function roundDown4(value) {
    return Math.floor(value * 10000) / 10000;
  }

  function officialHeight(value) {
    return Math.ceil((Number(value) * 2) - 1e-9) / 2;
  }

  function officialWaist(value) {
    return Math.floor((Number(value) * 2) + 1e-9) / 2;
  }

  function maleStep2Threshold(weight) {
    const rounded = Math.round(Number(weight));
    if (!Number.isFinite(rounded)) return NaN;
    const range = MALE_STEP2_26_DIFF_RANGES.find((r) => rounded >= r[0] && rounded <= r[1]);
    return range ? range[2] : NaN;
  }

  function step1MaxWaist(height) {
    const roundedHeight = officialHeight(height);
    if (!Number.isFinite(roundedHeight)) return NaN;
    // Waist is measured in 0.5-inch increments; choose the highest increment
    // whose rounded-down WHtR remains at or below 0.5499.
    let candidate = Math.floor((roundedHeight * 0.55) * 2) / 2;
    while (candidate > 0 && roundDown4(candidate / roundedHeight) > 0.5499) candidate -= 0.5;
    return candidate;
  }

  function officialBCAAssessment(entry, settings) {
    const rawHeight = numberOrNaN(entry && (entry.height || (settings && settings.height)));
    const rawWaist = numberOrNaN(entry && entry.waist);
    const rawWeight = numberOrNaN(entry && entry.weight);
    const sex = String((settings && settings.sex) || 'male').toLowerCase();
    const height = officialHeight(rawHeight);
    const waist = officialWaist(rawWaist);
    const weight = Math.round(rawWeight);
    const ratio = Number.isFinite(height) && Number.isFinite(waist) ? roundDown4(waist / height) : NaN;
    const diff = Number.isFinite(height) && Number.isFinite(waist) ? height - waist : NaN;
    const step1Pass = Number.isFinite(ratio) && ratio <= 0.5499;
    const threshold = sex === 'male' ? maleStep2Threshold(weight) : NaN;
    const step2Supported = Number.isFinite(threshold);
    const step2Pass = step2Supported && Number.isFinite(diff) && diff >= threshold;
    const step1Waist = step1MaxWaist(height);
    const step2Waist = step2Supported ? height - threshold : NaN;
    const planningMaxWaist = Number.isFinite(step2Waist) ? Math.max(step1Waist, step2Waist) : step1Waist;
    return { sex, height, waist, weight, ratio, diff, step1Pass, threshold, step2Supported, step2Pass, step1Waist, step2Waist, planningMaxWaist, within: step1Pass || step2Pass };
  }

  function statusObject(code, label, detail, action) {
    const tones = {
      ahead: 'good',
      on_track: 'good',
      at_risk: 'warn',
      behind: 'bad',
      neutral: 'neutral'
    };
    return { code, label, tone: tones[code] || 'neutral', detail: detail || '', action: action || '' };
  }

  function trajectoryFromFraction(actual, expected, hasData, noun) {
    if (!hasData || !Number.isFinite(actual)) {
      return statusObject('neutral', 'Needs Data', 'No current ' + noun + ' checkpoint is saved yet.', 'Record the next scheduled checkpoint; do not manufacture a test early just to feed the dashboard.');
    }
    if (actual >= expected + 0.10) return statusObject('ahead', 'Ahead', 'Progress is materially ahead of the current Week ' + Math.max(1, Math.round(expected * 36)) + ' trajectory.', 'Keep the same progression unless recovery starts to deteriorate.');
    if (actual >= expected - 0.08) return statusObject('on_track', 'On Track', 'Progress is within the expected trajectory band.', 'Continue the calendar plan and protect clean execution.');
    if (actual >= expected - 0.18) return statusObject('at_risk', 'At Risk', 'Progress is below the preferred band but the Week 36 objective remains recoverable.', 'Use the next checkpoint to decide whether to repeat, substitute conditioning, or tighten consistency.');
    return statusObject('behind', 'Behind', 'Progress is materially behind the current trajectory.', 'Intervene now; do not wait for the next phase to solve a foundational deficit.');
  }

  function calculateBodyLane(info) {
    const s = getCoreState();
    const baseline = firstEntry(s.bcaLogs);
    const latest = latestEntry(s.bcaLogs);
    if (!baseline || !latest) return statusObject('neutral', 'Needs Data', 'No BCA records are available.', 'Save height, waist, and weight at the next check-in.');

    const current = officialBCAAssessment(latest.value, s.settings);
    const base = officialBCAAssessment(baseline.value, s.settings);
    if (![current.height, current.waist, base.waist].every(Number.isFinite)) return statusObject('neutral', 'Needs Data', 'The latest BCA entry is incomplete.', 'Save height, waist, and weight.');

    const targetWaist = Number.isFinite(current.planningMaxWaist) ? current.planningMaxWaist : current.step1Waist;
    const elapsed = Math.max(0, Math.min(BUILD_WEEKS_V20 - 1, info.week - 1));
    const expectedWaist = base.waist + (targetWaist - base.waist) * (elapsed / (BUILD_WEEKS_V20 - 1));
    const staleDays = daysBetween(latest.date, info.date);
    const standardText = current.step1Pass ? 'Step 1 within standard.' : current.step2Pass ? 'Male Step 2 table within 26%.' : current.step2Supported ? 'Not yet within the male Step 2 26% threshold.' : 'Step 2 requires the official table/PRIMS.';
    const detail = 'Latest: ' + current.waist.toFixed(1) + ' in waist, ' + current.weight + ' lb, WHtR ' + (Number.isFinite(current.ratio) ? current.ratio.toFixed(4) : '—') + '. Week ' + info.week + ' reference: about ' + expectedWaist.toFixed(1) + ' in. ' + standardText;

    if (latest.date === baseline.date && info.week < 12) {
      return statusObject('neutral', 'Building Data', detail + ' Only the locked baseline is on file.', 'Save the next planned BCA check-in; the baseline alone is not evidence of falling behind.');
    }
    if (staleDays > 35) return statusObject('at_risk', 'At Risk', detail + ' The measurement is more than five weeks old.', 'Complete a measurement check-in before changing calories.');
    if (current.within) return statusObject('ahead', 'Ahead', detail, 'Maintain the trend and avoid crash tactics.');
    if (current.waist <= expectedWaist - 0.75) return statusObject('ahead', 'Ahead', detail, 'Hold the plan; do not accelerate calories solely because the lane is green.');
    if (current.waist <= expectedWaist + 1.0) return statusObject('on_track', 'On Track', detail, 'Continue the current nutrition calibration and weekly execution.');
    if (current.waist <= expectedWaist + 2.5) return statusObject('at_risk', 'At Risk', detail, 'Audit calorie logging, protein, and four-week waist trend before changing targets.');
    return statusObject('behind', 'Behind', detail, 'Use the next four-week review to make a measured nutrition adjustment.');
  }

  function calculatePRTLane(info, type) {
    const s = getCoreState();
    const baseline = firstEntry(s.prtLogs);
    const latest = latestEntry(s.prtLogs);
    if (!baseline || !latest || latest.date === baseline.date) {
      return statusObject('neutral', 'Needs Checkpoint', 'Only the locked May 31 baseline is available.', 'Use the scheduled checkpoint rather than an unscheduled max test.');
    }

    const expected = Math.max(0, Math.min(1, (info.week - 1) / (BUILD_WEEKS_V20 - 1)));
    let actual = NaN;
    let detail = '';
    if (type === 'pushups') {
      const base = numberOrNaN(baseline.value.pushups);
      const current = numberOrNaN(latest.value.pushups);
      actual = (current - base) / (92 - base);
      detail = 'Latest checkpoint: ' + (Number.isFinite(current) ? current : '—') + ' pushups. Week 36 domination target: 92.';
    } else if (type === 'plank') {
      const base = timeSeconds(baseline.value.plank);
      const current = timeSeconds(latest.value.plank);
      actual = (current - base) / (204 - base);
      detail = 'Latest checkpoint: ' + formatTime(current) + ' plank. Week 36 domination target: 3:24.';
    } else {
      const base = timeSeconds(baseline.value.run);
      const current = timeSeconds(latest.value.run);
      actual = (base - current) / (base - 495);
      detail = 'Latest checkpoint: ' + formatTime(current) + ' for 1.5 miles. Week 36 domination target: 8:15.';
    }
    const lane = trajectoryFromFraction(actual, expected, Number.isFinite(actual), type === 'run' ? 'run' : type);
    lane.detail = detail + ' ' + lane.detail;
    return lane;
  }

  function logHasCompletion(log) {
    const items = Object.values((log && log.items) || {});
    const habits = Object.values((log && log.habits) || {});
    return items.some((item) => item && (item.done || item.completionStatus === 'complete' || Number(item.completionRatio) > 0)) || habits.some(Boolean);
  }

  function completionRatio(log) {
    const items = Object.values((log && log.items) || {}).filter((item) => item && item.category !== 'optional');
    if (!items.length) return logHasCompletion(log) ? 1 : NaN;
    const values = items.map((item) => {
      if (Number.isFinite(Number(item.completionRatio))) return Math.max(0, Math.min(1, Number(item.completionRatio)));
      return item.done || item.completionStatus === 'complete' ? 1 : item.completionStatus === 'partial' ? 0.5 : 0;
    });
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  function calculateConsistencyLane(info) {
    const s = getCoreState();
    const today = localISO(new Date());
    const selectedEnd = info.date >= today ? addDaysISO(today, -1) : info.date;
    const start = [REVISION_START, addDaysISO(selectedEnd, -27)].sort().reverse()[0];
    if (selectedEnd < start) {
      return statusObject('neutral', 'Building Data', 'The v20 consistency window begins July 12, 2026.', 'Start logging the revised program; legacy blank days are not retroactively scored.');
    }

    const logMap = Object.fromEntries(sortedEntries(s.dailyLogs));
    const expectedDates = [];
    for (let cursor = start; cursor <= selectedEnd; cursor = addDaysISO(cursor, 1)) {
      // Sunday is the physical-rest/check-in day and does not lower training consistency.
      if (parseLocalISO(cursor).getDay() !== 0) expectedDates.push(cursor);
    }
    if (expectedDates.length < 7) {
      const recorded = expectedDates.filter((date) => logHasCompletion(logMap[date])).length;
      return statusObject('neutral', 'Building Data', recorded + ' of ' + expectedDates.length + ' post-revision training days currently have a completion receipt.', 'Keep logging honestly; the lane will score after seven eligible days.');
    }

    const ratios = expectedDates.map((date) => {
      const value = completionRatio(logMap[date]);
      return Number.isFinite(value) ? value : 0;
    });
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const pct = Math.round(avg * 100);
    const recorded = expectedDates.filter((date) => logHasCompletion(logMap[date])).length;
    const detail = pct + '% completion across ' + expectedDates.length + ' eligible post-revision days; ' + recorded + ' days contain a receipt.';
    if (pct >= 90) return statusObject('ahead', 'Ahead', detail, 'Maintain the minimum standard without turning optional work into mandatory fatigue.');
    if (pct >= 75) return statusObject('on_track', 'On Track', detail, 'Continue; solve recurring misses by schedule, not guilt.');
    if (pct >= 55) return statusObject('at_risk', 'At Risk', detail, 'Identify the single most repeated failure point this week.');
    return statusObject('behind', 'Behind', detail, 'Re-establish the daily minimum before adding intensity.');
  }

  function painValuesFromLog(log) {
    const values = [];
    ['kneePain', 'shinPain', 'backPain'].forEach((key) => {
      const raw = log && log[key];
      if (raw === '' || raw == null) return;
      const value = Number(raw);
      if (Number.isFinite(value)) values.push(value);
    });
    Object.values((log && log.items) || {}).forEach((item) => {
      const raw = item && item.pain;
      if (raw === '' || raw == null) return;
      const value = Number(raw);
      if (Number.isFinite(value)) values.push(value);
    });
    return values;
  }

  function calculateRecoveryLane(info) {
    const s = getCoreState();
    const start = addDaysISO(info.date, -27);
    const recent = sortedEntries(s.dailyLogs).filter(([date]) => date >= start && date <= info.date);
    const values = recent.flatMap(([, log]) => painValuesFromLog(log));
    if (values.length < 3) return statusObject('neutral', 'Needs Logging', 'Too few recent pain/recovery ratings are saved for a reliable trend.', 'Keep logging pain honestly, including zeroes.');
    const high = values.filter((v) => v >= 5).length;
    const caution = values.filter((v) => v >= 3).length;
    const max = Math.max.apply(null, values);
    if (high >= 2 || max >= 7) return statusObject('behind', 'Intervention Needed', 'Repeated high pain is present in the 28-day trend; peak ' + max + '/10.', 'Stop impact progression and obtain appropriate clinical guidance when symptoms warrant it.');
    if (caution >= 3) return statusObject('at_risk', 'At Risk', caution + ' pain ratings were 3/10 or higher; peak ' + max + '/10.', 'Use the pain gate: hold or substitute rather than forcing calendar progression.');
    return statusObject('on_track', 'On Track', 'Recent logged pain is controlled; peak ' + max + '/10.', 'Continue the aggressive plan while mechanics and next-day response stay normal.');
  }

  function calculateOARLane(info) {
    if (info.week < 9) return statusObject('neutral', 'Not Active Yet', 'OAR preparation begins in Week 9.', 'Keep the current physical-development focus.');
    const s = getCoreState();
    const start = addDaysISO(info.date, -13);
    let sessions = 0;
    sortedEntries(s.dailyLogs).filter(([date]) => date >= start && date <= info.date).forEach(([, log]) => {
      const items = Object.entries((log && log.items) || {});
      const hasOAR = items.some(([key, item]) => {
        const text = (key + ' ' + (item && item.name || '') + ' ' + (item && item.category || '')).toLowerCase();
        return text.includes('oar') && (item.done || item.completionStatus === 'complete' || Number(item.completionRatio) > 0);
      });
      if (hasOAR) sessions += 1;
    });
    if (sessions >= 6) return statusObject('ahead', 'Ahead', sessions + ' OAR sessions were recorded in the last 14 days.', 'Protect quality; more minutes are not automatically better.');
    if (sessions >= 3) return statusObject('on_track', 'On Track', sessions + ' OAR sessions were recorded in the last 14 days.', 'Continue focused sessions and maintain an error log.');
    if (sessions >= 1) return statusObject('at_risk', 'At Risk', 'Only ' + sessions + ' OAR session was recorded in the last 14 days.', 'Schedule the next focused block before adding miscellaneous review.');
    return statusObject('behind', 'Behind', 'No OAR sessions were recorded in the last 14 days.', 'Restart with the programmed minimum this week.');
  }

  const recruiterMilestones = [
    { id: 'week12_review', week: 12, title: 'Internal physical-progress review', kind: 'internal' },
    { id: 'week16_update', week: 16, title: 'Recruiter progress update available', kind: 'recruiter' },
    { id: 'week20_update_due', week: 20, title: 'Recruiter progress update due', kind: 'recruiter' },
    { id: 'week24_application_decision', week: 24, title: 'Application-timing decision window opens', kind: 'decision' },
    { id: 'week28_application_decision', week: 28, title: 'Application-timing decision due', kind: 'decision' },
    { id: 'week32_coordination', week: 32, title: 'Active recruiter/application coordination', kind: 'coordination' },
    { id: 'week36_followthrough', week: 36, title: 'Package follow-through review', kind: 'coordination' }
  ];

  function milestoneDate(startDate, week) {
    return addDaysISO(startDate, (week - 1) * 7);
  }

  function currentRecruiterMilestone(info) {
    const s = getCoreState();
    const recruiter = (s.revisionV20 && s.revisionV20.recruiter) || { milestones: {} };
    const milestones = recruiter.milestones || {};
    const due = recruiterMilestones.filter((m) => {
      const record = milestones[m.id] || {};
      if (info.week < m.week || record.completed) return false;
      if (record.snoozedUntil && record.snoozedUntil > info.date) return false;
      return true;
    });
    return due.length ? due[due.length - 1] : null;
  }

  function snoozedRecruiterMilestone(info) {
    const s = getCoreState();
    const recruiter = (s.revisionV20 && s.revisionV20.recruiter) || { milestones: {} };
    const milestones = recruiter.milestones || {};
    const snoozed = recruiterMilestones.filter((m) => {
      const record = milestones[m.id] || {};
      return info.week >= m.week && !record.completed && record.snoozedUntil && record.snoozedUntil > info.date;
    });
    if (!snoozed.length) return null;
    const milestone = snoozed[snoozed.length - 1];
    return { milestone, record: milestones[milestone.id] };
  }

  function recruiterTriggerReason() {
    const s = getCoreState();
    const latestBCA = latestEntry(s.bcaLogs);
    const latestPRT = latestEntry(s.prtLogs);
    const reasons = [];
    if (latestBCA) {
      const height = numberOrNaN(latestBCA.value.height || (s.settings && s.settings.height));
      const waist = numberOrNaN(latestBCA.value.waist);
      if (Number.isFinite(height) && Number.isFinite(waist) && roundDown4(waist / height) <= 0.5499) reasons.push('Step-1 BCA compliance reached');
    }
    if (latestPRT) {
      const push = numberOrNaN(latestPRT.value.pushups);
      const plank = timeSeconds(latestPRT.value.plank);
      const run = timeSeconds(latestPRT.value.run);
      if (push >= 33 && plank >= 75 && run <= 885) reasons.push('all three minimum PRT markers reached');
    }
    return reasons.join(' and ');
  }

  function calculateRecruiterLane(info) {
    const s = getCoreState();
    const recruiter = s.revisionV20 && s.revisionV20.recruiter;
    if (!recruiter || !recruiter.initialContact || !recruiter.initialContact.completed) {
      return statusObject('behind', 'Behind', 'No informational recruiter contact is recorded.', 'Establish contact and confirm requirements.');
    }
    const current = currentRecruiterMilestone(info);
    const trigger = recruiterTriggerReason();
    if (current) {
      const overdueBy = Math.max(0, info.week - current.week);
      if (overdueBy >= 4 || current.id === 'week20_update_due' && info.week >= 24 || current.id === 'week28_application_decision' && info.week >= 32) {
        return statusObject('behind', 'Behind', current.title + ' remains unresolved.', 'Complete, snooze with a reason, or record recruiter guidance.');
      }
      return statusObject('at_risk', 'Action Due', current.title + ' is active.' + (trigger ? ' Trigger: ' + trigger + '.' : ''), 'Resolve the reminder from the Recruiter Check-In card.');
    }
    const snoozed = snoozedRecruiterMilestone(info);
    if (snoozed) {
      return statusObject('at_risk', 'Snoozed', snoozed.milestone.title + ' returns on ' + snoozed.record.snoozedUntil + '.' + (snoozed.record.snoozeReason ? ' Reason: ' + snoozed.record.snoozeReason + '.' : ''), 'Complete the physical work that justified the snooze, then resolve the reminder when it returns.');
    }
    if (recruiter.nextFollowUp && recruiter.nextFollowUp <= info.date) {
      return statusObject('at_risk', 'Action Due', 'A recruiter-directed follow-up date of ' + recruiter.nextFollowUp + ' has arrived.', 'Contact the recruiter or update the recorded follow-up date and notes.');
    }
    const next = recruiterMilestones.find((m) => info.week < m.week);
    return statusObject('on_track', 'On Track', 'April 2026 informational contact is complete.' + (next ? ' Next scheduled action: Week ' + next.week + ' — ' + next.title + '.' : ' Scheduled milestones are complete.') + (trigger ? ' Early update trigger: ' + trigger + '.' : ''), 'Continue physical qualification development and keep measurable progress ready to summarize.');
  }

  function calculateTrajectory(info) {
    const lanes = {
      body: calculateBodyLane(info),
      run: calculatePRTLane(info, 'run'),
      pushups: calculatePRTLane(info, 'pushups'),
      plank: calculatePRTLane(info, 'plank'),
      consistency: calculateConsistencyLane(info),
      recovery: calculateRecoveryLane(info),
      oar: calculateOARLane(info),
      recruiter: calculateRecruiterLane(info)
    };

    const scored = Object.values(lanes).filter((lane) => lane.code !== 'neutral');
    const critical = [lanes.body, lanes.run, lanes.recovery].filter((lane) => lane.code !== 'neutral');
    const behind = critical.filter((lane) => lane.code === 'behind').length + scored.filter((lane) => lane.code === 'behind' && !critical.includes(lane)).length;
    const risk = scored.filter((lane) => lane.code === 'at_risk').length;
    const ahead = scored.filter((lane) => lane.code === 'ahead').length;
    let overall;
    if (behind > 0) overall = statusObject('behind', 'Behind', 'At least one readiness lane requires immediate intervention.', 'Attack the limiting lane; strengths elsewhere do not cancel it.');
    else if (risk >= 2 || critical.some((lane) => lane.code === 'at_risk')) overall = statusObject('at_risk', 'At Risk', 'The Week 36 objective remains recoverable, but one or more limiting lanes need action.', 'Follow the single highest-priority action shown below.');
    else if (ahead >= 2 && risk === 0) overall = statusObject('ahead', 'Ahead', 'Multiple measured lanes are ahead without a current critical warning.', 'Keep the plan aggressive but do not add fatigue merely to defend the label.');
    else overall = statusObject('on_track', 'On Track', 'No measured critical lane is currently behind. Neutral lanes are waiting for scheduled checkpoint data.', 'Continue execution and complete the next planned check-in.');
    return { overall, lanes };
  }

  // ---------- Post-cutoff command logic ----------

  function checkpointForWeek(week) {
    const map = {
      12: 'Week 12 decision: controlled 1.5-mile walk/run. Decide Ahead / On Track / At Risk from pain, mechanics, and next-day response.',
      20: 'Week 20 decision: controlled 1.5-mile effort or about 20 minutes continuous. Confirm the continuous-run transition is real.',
      28: 'Week 28 decision: controlled 1.5-mile test plus total session volume. Confirm quality volume is recoverable.',
      32: 'Week 32 decision: approximately three easy miles without compromising the next training week.'
    };
    return map[week] || '';
  }

  function commandDirective(info) {
    if (info.beforeRevision) {
      return {
        title: 'Legacy program — preserved',
        tone: 'neutral',
        lines: ['No v20 prescription changes apply on or before July 11, 2026.', 'A blank July 11 remains an honest missed/unlogged day; no workout record is fabricated.']
      };
    }
    const lines = [];
    if (info.dayName === 'Monday') {
      if (info.week >= 21 && info.week <= 35 && info.week % 2 === 1) {
        lines.push('Convert the conditioning block—do not add a workout: use a controlled 10–15 minute OCS-style circuit in place of harder bike work.');
      } else if (info.week >= 25) {
        lines.push('Strength A remains. Keep bike work Zone 2 because Wednesday now carries the harder running stimulus.');
      } else {
        lines.push('Strength A remains. This is the preferred home for any harder bike conditioning, not Friday.');
      }
    }
    if (info.dayName === 'Wednesday') {
      lines.push('Calendar-led run: perform the scheduled level unless physical evidence says hold.');
      lines.push('Hold or repeat for pain 3–4/10, altered mechanics, meaningful next-morning flare, or physical inability. A life/weather miss does not automatically regress the level.');
    }
    if (info.dayName === 'Friday') {
      lines.push('Strength B remains unchanged. Any cardio is optional and genuinely easy: 10–20 minutes of relaxed spinning.');
      lines.push('No hard bike intervals today; protect Saturday’s easy-distance exposure.');
    }
    if (info.dayName === 'Saturday') {
      lines.push('Easy-distance run/run-walk remains the priority. Keep it conversational and judge success partly by next-day response.');
    }
    if (info.dayName === 'Sunday') {
      lines.push('BCA/check-in and meal planning may remain. Full physical rest is a valid completion; optional recovery work is not mandatory.');
    }
    if ((info.week >= 13 && info.week <= 36) && [2, 4].includes(((info.week - 1) % 4) + 1)) {
      lines.push('This block includes one supervised Third Class swim-skill exposure. It replaces an optional swim; it does not add a training day.');
    }
    const checkpoint = checkpointForWeek(info.week);
    if (checkpoint) lines.push(checkpoint);
    if (!lines.length) lines.push('Existing prescription remains in command. Continue GTG and the aggressive Week 36 progression as written.');
    return { title: 'v20 command override — July 12 forward', tone: 'command', lines };
  }

  // ---------- UI ----------

  function injectStyles() {
    if (document.getElementById('nr-v20-styles')) return;
    const style = document.createElement('style');
    style.id = 'nr-v20-styles';
    style.textContent = `
      .nrV20Card{background:#fff;border:2px solid #0b2340;border-radius:16px;padding:14px;margin:10px 0;box-shadow:0 3px 12px #00000012}
      .nrV20Card h2,.nrV20Card h3{color:#0b2340;margin:.1rem 0 .55rem}.nrV20Header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
      .nrV20Badge{display:inline-block;border-radius:999px;padding:7px 10px;font-weight:900;font-size:.82rem}.nrV20Badge.good{background:#e8f6ee;color:#147a45}.nrV20Badge.warn{background:#fff0df;color:#9a4b00}.nrV20Badge.bad{background:#fde8ec;color:#971f33}.nrV20Badge.neutral{background:#e8f2fa;color:#0b2340}
      .nrV20Grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:10px}.nrV20Lane{border:1px solid #cbd8e5;border-radius:12px;padding:10px;background:#f8fbfe}.nrV20Lane b{color:#0b2340}.nrV20Lane p{margin:.35rem 0;font-size:.86rem;line-height:1.35}.nrV20Action{font-size:.78rem;color:#506579;border-top:1px dashed #cbd8e5;padding-top:6px;margin-top:6px}
      .nrV20Command{border-left:6px solid #f0b429}.nrV20Command ul{margin:.45rem 0 .1rem;padding-left:1.25rem}.nrV20Command li{margin:.35rem 0;line-height:1.35}.nrV20Tiny{font-size:.76rem;color:#607285}.nrV20Buttons{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.nrV20Buttons button{padding:8px 10px}
      .nrV20BCA{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.nrV20Metric{background:#f8fbfe;border:1px solid #cbd8e5;border-radius:12px;padding:10px}.nrV20Metric strong{display:block;color:#0b2340;font-size:1.05rem}.nrV20Notice{background:#fff7d9;border:1px solid #e2bd55;border-radius:12px;padding:10px;margin-top:8px}
      .nrV20Float{position:fixed;right:14px;bottom:82px;z-index:35;border-radius:999px!important;box-shadow:0 4px 18px #0005;background:#0b2340!important;color:white!important}
      @media(max-width:700px){.nrV20Grid,.nrV20BCA{grid-template-columns:1fr}.nrV20Float{bottom:76px;right:10px}}
    `;
    document.head.appendChild(style);
  }

  function badge(lane) {
    return '<span class="nrV20Badge ' + escapeHTML(lane.tone) + '">' + escapeHTML(lane.label) + '</span>';
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  function laneHTML(name, lane) {
    return '<div class="nrV20Lane"><div class="nrV20Header"><b>' + escapeHTML(name) + '</b>' + badge(lane) + '</div><p>' + escapeHTML(lane.detail) + '</p><div class="nrV20Action"><b>Next command:</b> ' + escapeHTML(lane.action) + '</div></div>';
  }

  function officialBCACard(info) {
    const s = getCoreState();
    const latest = latestEntry(s.bcaLogs);
    if (!latest) return '<div class="nrV20Card"><h3>Official BCA command card</h3><p>No BCA entry is saved.</p></div>';
    const bca = officialBCAAssessment(latest.value, s.settings);
    let resultLane;
    if (bca.step1Pass) resultLane = statusObject('on_track', 'Step 1 Within Standard');
    else if (bca.step2Pass) resultLane = statusObject('on_track', 'Step 2 Within Standard');
    else if (bca.step2Supported) resultLane = statusObject('at_risk', 'Not Yet Within Standard');
    else resultLane = statusObject('at_risk', 'Step 2 PRIMS Required');
    const step2Text = bca.step1Pass ? 'Not required' : bca.step2Supported ? 'H−W ≥ ' + bca.threshold.toFixed(1) + ' in' : 'Official table/PRIMS';
    const planningText = Number.isFinite(bca.planningMaxWaist) ? bca.planningMaxWaist.toFixed(1) + ' in at ' + bca.weight + ' lb' : 'See official process';
    return '<div class="nrV20Card"><div class="nrV20Header"><div><h3>Official BCA command card</h3><div class="nrV20Tiny">December 2025 two-step workflow. Neck is retained only as legacy history.</div></div>' + badge(resultLane) + '</div><div class="nrV20BCA"><div class="nrV20Metric"><span>WHtR</span><strong>' + (Number.isFinite(bca.ratio) ? bca.ratio.toFixed(4) : '—') + '</strong><small>Step 1 is within standard at 0.5499 or less</small></div><div class="nrV20Metric"><span>Height − waist</span><strong>' + (Number.isFinite(bca.diff) ? bca.diff.toFixed(1) + ' in' : '—') + '</strong><small>Rounded height ' + (Number.isFinite(bca.height) ? bca.height.toFixed(1) : '—') + ' · waist ' + (Number.isFinite(bca.waist) ? bca.waist.toFixed(1) : '—') + '</small></div><div class="nrV20Metric"><span>Step 2 male 26% line</span><strong>' + escapeHTML(step2Text) + '</strong><small>Planning max waist: ' + escapeHTML(planningText) + '</small></div></div><div class="nrV20Notice">This is a home planning screen based on the published male table when the rounded weight is 101–380 lb. Official CFL measurements and PRIMS control. Values outside the table must be resolved in PRIMS.</div></div>';
  }

  function commandCard(info) {
    const command = commandDirective(info);
    return '<div class="nrV20Card nrV20Command"><div class="nrV20Header"><div><h3>' + escapeHTML(command.title) + '</h3><div class="nrV20Tiny">Selected date: ' + escapeHTML(info.date) + ' · Week ' + info.week + ' · ' + escapeHTML(info.dayName) + '</div></div>' + (info.beforeRevision ? '<span class="nrV20Badge neutral">Untouched</span>' : '<span class="nrV20Badge warn">Authoritative</span>') + '</div><ul>' + command.lines.map((line) => '<li>' + escapeHTML(line) + '</li>').join('') + '</ul></div>';
  }

  function trajectoryCard(info, trajectory) {
    const lanes = trajectory.lanes;
    return '<div class="nrV20Card"><div class="nrV20Header"><div><h2>36-Week Trajectory</h2><div class="nrV20Tiny">Week ' + info.week + ' of 36 · aggressive targets remain unchanged</div></div>' + badge(trajectory.overall) + '</div><p><b>Command assessment:</b> ' + escapeHTML(trajectory.overall.detail) + '</p><div class="nrV20Grid">' +
      laneHTML('Body composition', lanes.body) +
      laneHTML('Running', lanes.run) +
      laneHTML('Pushups', lanes.pushups) +
      laneHTML('Plank', lanes.plank) +
      laneHTML('Consistency', lanes.consistency) +
      laneHTML('Pain & recovery', lanes.recovery) +
      laneHTML('OAR', lanes.oar) +
      laneHTML('Recruiter/application', lanes.recruiter) +
      '</div></div>';
  }

  function recruiterCard(info) {
    const s = getCoreState();
    const recruiter = (s.revisionV20 && s.revisionV20.recruiter) || { milestones: {} };
    const current = currentRecruiterMilestone(info);
    const snoozed = snoozedRecruiterMilestone(info);
    const next = recruiterMilestones.find((m) => info.week < m.week && !(recruiter.milestones && recruiter.milestones[m.id] && recruiter.milestones[m.id].completed));
    const trigger = recruiterTriggerReason();
    let body = '<p><b>April 2026 informational contact:</b> complete. Requirements understood. Current phase: physical qualification development.</p>';
    if (current) {
      body += '<div class="nrV20Notice"><b>Active reminder:</b> Week ' + current.week + ' — ' + escapeHTML(current.title) + '.</div>';
    } else if (snoozed) {
      body += '<div class="nrV20Notice"><b>Reminder snoozed until ' + escapeHTML(snoozed.record.snoozedUntil) + ':</b> ' + escapeHTML(snoozed.milestone.title) + (snoozed.record.snoozeReason ? '<br><span class="nrV20Tiny">' + escapeHTML(snoozed.record.snoozeReason) + '</span>' : '') + '</div>';
    } else if (recruiter.nextFollowUp && recruiter.nextFollowUp <= info.date) {
      body += '<div class="nrV20Notice"><b>Recruiter-directed follow-up is due:</b> ' + escapeHTML(recruiter.nextFollowUp) + '.</div>';
    } else if (next) {
      body += '<p><b>Next scheduled action:</b> Week ' + next.week + ' (' + escapeHTML(milestoneDate(info.start, next.week)) + ') — ' + escapeHTML(next.title) + '.</p>';
    } else {
      body += '<p>All scheduled recruiter milestones are recorded complete.</p>';
    }
    if (trigger) body += '<div class="nrV20Notice"><b>Early-contact trigger:</b> ' + escapeHTML(trigger) + '.</div>';
    if (recruiter.nextFollowUp) body += '<p><b>Recruiter-directed next follow-up:</b> ' + escapeHTML(recruiter.nextFollowUp) + '</p>';
    if (recruiter.notes) body += '<p><b>Standing notes:</b> ' + escapeHTML(recruiter.notes) + '</p>';
    const buttons = current ? '<div class="nrV20Buttons"><button data-nrv20-action="complete-milestone" data-milestone="' + escapeHTML(current.id) + '">Complete Check-In</button><button class="secondary" data-nrv20-action="snooze-milestone" data-milestone="' + escapeHTML(current.id) + '">Snooze 1 Week</button><button class="ghost" data-nrv20-action="notes-milestone" data-milestone="' + escapeHTML(current.id) + '">Add Notes</button></div>' : '<div class="nrV20Buttons"><button class="secondary" data-nrv20-action="recruiter-notes">Update Recruiter Notes / Follow-Up</button></div>';
    return '<div class="nrV20Card"><div class="nrV20Header"><h3>Recruiter Check-In Timeline</h3>' + badge(calculateRecruiterLane(info)) + '</div>' + body + buttons + '</div>';
  }

  function backupCard() {
    const s = getCoreState();
    const migrated = s.revisionV20 && s.revisionV20.migratedAt;
    const cloud = s.revisionV20 && s.revisionV20.cloudBackupCreatedAt;
    let localBackup = false;
    try { localBackup = !!localStorage.getItem(PRE_REVISION_BACKUP_KEY); } catch (_) {}
    return '<div class="nrV20Card"><h3>Revision Data Safeguards</h3><div class="nrV20BCA"><div class="nrV20Metric"><span>Historical cutoff</span><strong>July 11, 2026</strong><small>Legacy prescriptions and records preserved</small></div><div class="nrV20Metric"><span>Local backup</span><strong>' + (localBackup ? 'Verified' : 'Not verified') + '</strong><small>Independent pre-v20 browser copy</small></div><div class="nrV20Metric"><span>Cloud backup</span><strong>' + (cloud ? 'Verified' : 'Pending sign-in') + '</strong><small>' + escapeHTML(CLOUD_BACKUP_DOC) + '</small></div></div><p class="nrV20Tiny">Migration: ' + escapeHTML(migrated || 'pending') + '. Existing storage key and Firebase current document remain unchanged.</p></div>';
  }

  function upsertCard(containerId, cardId, html, position) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let card = document.getElementById(cardId);
    if (!card) {
      card = document.createElement('div');
      card.id = cardId;
      if (position === 'end') container.appendChild(card);
      else container.insertBefore(card, container.firstChild);
    }
    const signature = String(hashString(html));
    if (card.dataset.signature !== signature) {
      card.innerHTML = html;
      card.dataset.signature = signature;
    }
  }

  function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    return hash;
  }

  const BOWFLEX_WEIGHT_OPTIONS = ['BW', '2.5', '5', '7.5', '10', '12.5', '15', '17.5', '20', '22.5', '25', '27.5', '30', '32.5', '35', '37.5', '40', '42.5', '45', '47.5', '50', '52.5', '55', '55.2'];

  function applyBowflexEquipmentCeiling() {
    // weightOptions is a mutable core array even though its binding is const.
    // Updating the array ensures all future core rerenders preserve 55.2 correctly.
    try {
      if (typeof weightOptions !== 'undefined' && Array.isArray(weightOptions)) {
        const same = weightOptions.length === BOWFLEX_WEIGHT_OPTIONS.length && weightOptions.every((v, i) => String(v) === BOWFLEX_WEIGHT_OPTIONS[i]);
        if (!same) weightOptions.splice(0, weightOptions.length, ...BOWFLEX_WEIGHT_OPTIONS);
      }
    } catch (_) {}
  }

  function fixPostCutoffWeightSelectors(info) {
    if (info.beforeRevision) return;
    const legal = BOWFLEX_WEIGHT_OPTIONS;
    document.querySelectorAll('select.weightSelect').forEach((select) => {
      const current = select.value;
      const values = Array.from(select.options).map((o) => o.value);
      const needsPatch = !values.includes('55.2') || values.some((v) => Number(v) > 55.2);
      if (!needsPatch) return;
      select.innerHTML = legal.map((v) => '<option value="' + v + '">' + v + '</option>').join('');
      if (legal.includes(current)) select.value = current;
      else if (Number(current) > 55.2) select.value = '55.2';
    });
  }

  function ensureFloatingButton() {
    if (document.getElementById('nr-v20-float')) return;
    const button = document.createElement('button');
    button.id = 'nr-v20-float';
    button.className = 'nrV20Float';
    button.textContent = 'Trajectory';
    button.setAttribute('data-nrv20-action', 'scroll-trajectory');
    document.body.appendChild(button);
  }

  function renderEnhancements() {
    if (!coreReady()) return;
    injectStyles();
    const info = campaignInfo(selectedDateValue());
    const trajectory = calculateTrajectory(info);
    applyBowflexEquipmentCeiling();
    upsertCard('view-today', 'nr-v20-trajectory', trajectoryCard(info, trajectory), 'start');
    upsertCard('view-today', 'nr-v20-command', commandCard(info), 'start');
    upsertCard('view-checkins', 'nr-v20-recruiter', recruiterCard(info), 'start');
    upsertCard('view-checkins', 'nr-v20-bca', officialBCACard(info), 'start');
    upsertCard('view-data', 'nr-v20-backup', backupCard(), 'start');
    fixPostCutoffWeightSelectors(info);
    ensureFloatingButton();
    maybeNotifyMilestone(info);
  }

  function scheduleEnhancementRender() {
    clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(renderEnhancements, 40);
  }

  function observeCoreRenders() {
    if (enhancementObserver) return;
    enhancementObserver = new MutationObserver(() => scheduleEnhancementRender());
    const main = document.querySelector('main') || document.body;
    if (main) enhancementObserver.observe(main, { childList: true, subtree: true });
  }

  function saveRecruiterChange(mutator, message) {
    const s = getCoreState();
    s.revisionV20 = s.revisionV20 || {};
    s.revisionV20.recruiter = s.revisionV20.recruiter || { initialContact: { completed: true, completedMonth: '2026-04' }, milestones: {} };
    s.revisionV20.recruiter.milestones = s.revisionV20.recruiter.milestones || {};
    mutator(s.revisionV20.recruiter);
    persistCoreState({ snapshot: true, reason: 'recruiter timeline update' });
    appToast(message || 'Recruiter timeline updated.');
    scheduleEnhancementRender();
  }

  function handleAction(event) {
    const button = event.target.closest('[data-nrv20-action]');
    if (!button) return;
    const action = button.getAttribute('data-nrv20-action');
    const id = button.getAttribute('data-milestone');
    if (action === 'scroll-trajectory') {
      try {
        if (typeof activeTab !== 'undefined' && activeTab !== 'today' && typeof switchTab === 'function') switchTab('today');
      } catch (_) {}
      setTimeout(() => {
        const card = document.getElementById('nr-v20-trajectory');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return;
    }
    if (action === 'complete-milestone' && id) {
      const milestone = recruiterMilestones.find((m) => m.id === id);
      const notes = prompt('What did you share, learn, or decide during this check-in?', '');
      if (notes === null) return;
      const followUp = prompt('Next follow-up date requested by the recruiter (YYYY-MM-DD), or leave blank:', '');
      saveRecruiterChange((recruiter) => {
        recruiter.milestones[id] = { completed: true, completedAt: new Date().toISOString(), notes: notes.trim() };
        if (followUp && /^\d{4}-\d{2}-\d{2}$/.test(followUp.trim())) recruiter.nextFollowUp = followUp.trim();
      }, (milestone ? milestone.title : 'Check-in') + ' recorded complete.');
      return;
    }
    if (action === 'snooze-milestone' && id) {
      const reason = prompt('Why is this reminder being moved one week?', 'Continue physical qualification development before updating recruiter.');
      if (reason === null) return;
      saveRecruiterChange((recruiter) => {
        recruiter.milestones[id] = Object.assign({}, recruiter.milestones[id] || {}, {
          completed: false,
          snoozedAt: new Date().toISOString(),
          snoozedUntil: addDaysISO(localISO(new Date()), 7),
          snoozeReason: reason.trim()
        });
      }, 'Recruiter reminder snoozed one week.');
      return;
    }
    if (action === 'notes-milestone' && id) {
      const s = getCoreState();
      const existing = s.revisionV20 && s.revisionV20.recruiter && s.revisionV20.recruiter.milestones && s.revisionV20.recruiter.milestones[id] && s.revisionV20.recruiter.milestones[id].notes || '';
      const notes = prompt('Milestone notes:', existing);
      if (notes === null) return;
      saveRecruiterChange((recruiter) => {
        recruiter.milestones[id] = Object.assign({}, recruiter.milestones[id] || {}, { notes: notes.trim(), updatedAt: new Date().toISOString() });
      });
      return;
    }
    if (action === 'recruiter-notes') {
      const s = getCoreState();
      const recruiter = s.revisionV20 && s.revisionV20.recruiter || {};
      const notes = prompt('Standing recruiter/application notes:', recruiter.notes || '');
      if (notes === null) return;
      const followUp = prompt('Next recruiter-directed follow-up date (YYYY-MM-DD), or leave blank:', recruiter.nextFollowUp || '');
      saveRecruiterChange((r) => {
        r.notes = notes.trim();
        r.nextFollowUp = followUp && /^\d{4}-\d{2}-\d{2}$/.test(followUp.trim()) ? followUp.trim() : '';
      });
    }
  }

  function maybeNotifyMilestone(info) {
    const milestone = currentRecruiterMilestone(info);
    if (!milestone || !('Notification' in window) || Notification.permission !== 'granted') return;
    const s = getCoreState();
    const record = s.revisionV20 && s.revisionV20.recruiter && s.revisionV20.recruiter.milestones && s.revisionV20.recruiter.milestones[milestone.id];
    if (record && record.snoozedUntil && record.snoozedUntil > info.date) return;
    const today = localISO(new Date());
    const key = 'nr-v20-milestone-notified-' + milestone.id + '-' + today;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString());
    } catch (_) {}
    showNotification('Navy Ready — Check-In Due', {
      body: 'Week ' + milestone.week + ': ' + milestone.title + '.',
      tag: 'navy-ready-recruiter-' + milestone.id + '-' + today,
      data: { url: './?tab=today' }
    });
  }

  function initializeEnhancements() {
    let attempts = 0;
    const wait = () => {
      attempts += 1;
      if (coreReady()) {
        migrateRevisionState();
        wrapCloudSave();
        injectStyles();
        applyBowflexEquipmentCeiling();
        observeCoreRenders();
        document.addEventListener('click', handleAction);
        renderEnhancements();
        setTimeout(() => ensureCloudBackup(), 2500);
        return;
      }
      if (attempts < 120) setTimeout(wait, 50);
      else console.warn('Navy Ready v20 enhancement layer could not find the v19.1 core.');
    };
    wait();
  }

  window.NavyReadyPWA = {
    installApp,
    enablePush,
    testNotification,
    syncReminderSettings,
    syncDailyStatus,
    showImmediateFeedback,
    registerServiceWorker,
    renderEnhancements,
    ensureCloudBackup,
    revisionVersion: REVISION_VERSION
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerServiceWorker();
      scheduleOpenAppReminders(loadReminderSettings());
      setTimeout(initializeEnhancements, 0);
    });
  } else {
    registerServiceWorker();
    scheduleOpenAppReminders(loadReminderSettings());
    setTimeout(initializeEnhancements, 0);
  }
})();
