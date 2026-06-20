# Navy-Ready Adaptive Tracker — v19 Firebase Sync RC1

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


## Firebase Sync

This build includes Firebase Auth + Cloud Firestore sync for cross-device access.

Required Firebase console setup:

1. Authentication → Sign-in method → enable Email/Password.
2. Firestore Database → create a Standard database.
3. Firestore rules:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/tracker/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

4. Authentication → Settings → Authorized domains → add `eveandap.github.io`.

The app stores the shared tracker document at `users/{uid}/tracker/current` and keeps local storage + JSON backup/export as fallback recovery.
