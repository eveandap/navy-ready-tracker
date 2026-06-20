# Navy-Ready Adaptive Tracker — v18 PWA RC1

This package is ready to deploy as a static Progressive Web App on GitHub Pages.

## Files

- `index.html` — the tracker app, converted from the v18 split delt raises release candidate.
- `manifest.webmanifest` — PWA metadata and install settings.
- `service-worker.js` — offline app-shell cache for GitHub Pages.
- `pwa.js` — install prompt, service worker registration, notification permission, and open-app reminder handling.
- `icons/` — app icons generated from the EP eagle/anchor icon.
- `.nojekyll` — prevents GitHub Pages/Jekyll processing.

## Deploy on GitHub Pages

1. Unzip this package.
2. Copy the files into the root of your GitHub Pages repository, or into `/docs` if your Pages settings use `/docs`.
3. Commit and push.
4. In GitHub: **Settings → Pages → Build and deployment**.
5. Select the branch/folder you uploaded to and save.
6. Open the GitHub Pages URL over HTTPS.

## Install

- Desktop Chrome/Edge: use the address-bar install icon or the app's **Install App** button.
- Android Chrome: menu → **Install app** or **Add to Home screen**.
- iPhone/iPad Safari: Share → **Add to Home Screen**.

## Notes

The existing tracker storage key is preserved, so current browser data should remain available after the PWA version loads on the same origin/path. Use **Export JSON** before replacing a live deployment.

The notification button enables browser notification permission and open-app reminders. True background scheduled push while the app is closed still requires Firebase/server scheduling.
