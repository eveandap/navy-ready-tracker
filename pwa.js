(function () {
  'use strict';

  const STATUS_READY = 'Install is ready. Use the button or your browser menu to add it to your device.';
  const STATUS_INSTALLED = 'Installed as an app on this device.';
  const STATUS_BROWSER = 'Open in Chrome, Edge, or Safari and use the browser install/share menu if no prompt appears.';
  const SETTINGS_KEY = 'navy_ready_pwa_notification_settings';
  const LAST_NOTIFY_KEY = 'navy_ready_pwa_last_notification';
  let deferredInstallPrompt = null;
  let reminderTimer = null;

  function status(message) {
    const el = document.getElementById('installStatus');
    if (el) el.textContent = message;
  }

  function pushStatus(message) {
    const el = document.getElementById('pushStatus');
    if (el) el.textContent = message;
  }

  function toast(message) {
    if (typeof window.toast === 'function') window.toast(message);
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
      toast('Already installed.');
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
      toast('Notification permission enabled.');
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
      renotify: false
    }, options || {});
    if (navigator.serviceWorker?.controller) {
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
      data: { url: './' }
    });
    if (ok) pushStatus('Test notification sent.');
  }

  function loadSettings() {
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
    scheduleOpenAppReminders(settings || loadSettings());
  }

  function notificationBody(slot, settings) {
    const tone = settings?.tone || 'hard';
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
      const today = now.toISOString().slice(0, 10);
      let last = {};
      try { last = JSON.parse(localStorage.getItem(LAST_NOTIFY_KEY) || '{}'); } catch (_) {}
      for (const slot of slots) {
        const target = settings[slot];
        if (!target || target !== hhmm) continue;
        const key = today + ':' + slot;
        if (last[key]) continue;
        last[key] = new Date().toISOString();
        try { localStorage.setItem(LAST_NOTIFY_KEY, JSON.stringify(last)); } catch (_) {}
        showNotification('Navy Ready — ' + slot.charAt(0).toUpperCase() + slot.slice(1), {
          body: notificationBody(slot, settings),
          data: { url: './' },
          tag: 'navy-ready-' + slot + '-' + today
        });
      }
    };
    tick();
    reminderTimer = setInterval(tick, 30000);
  }

  function syncDailyStatus() {
    // Reserved for future Firebase/Cloud Function sync. Local data remains in the existing app storage key.
  }

  function showImmediateFeedback(q) {
    const el = document.getElementById('pushStatus');
    if (el && q?.message) el.textContent = 'Latest feedback: ' + q.message;
  }

  window.NavyReadyPWA = {
    installApp,
    enablePush,
    testNotification,
    syncReminderSettings,
    syncDailyStatus,
    showImmediateFeedback,
    registerServiceWorker
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerServiceWorker();
      scheduleOpenAppReminders(loadSettings());
    });
  } else {
    registerServiceWorker();
    scheduleOpenAppReminders(loadSettings());
  }
})();
