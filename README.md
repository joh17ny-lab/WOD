# WODBook (PWA)

A CrossFit / functional-fitness workout tracker that installs to your iPhone
home screen — **no Mac and no App Store required**. It's a Progressive Web App
(PWA): you host the files at a free https link, open it in Safari, and tap
**Add to Home Screen**. Friends install it the same way from the same link.

## Features
- **Log** — record any WOD (For Time / AMRAP / EMOM / Rounds / Load / Distance) with result, RX flag, notes, date. Search + delete.
- **Benchmarks** — built-in "Girls" & "Hero" WODs (Fran, Murph, DT, Cindy…), log attempts, see your personal best + history.
- **Lifts** — track 1RM / PRs for common lifts (or custom), automatic estimated 1RM (Epley), per-lift progress chart.
- **Timer** — For Time (stopwatch + splits), AMRAP countdown, EMOM, Tabata; beeps + vibration on rounds and finish, then offers to log the result.
- **Calendar** — month view dotting workout days; tap a day to see entries.
- **More → Progress** — totals, workouts-per-month chart, top-lift maxes.
- **More → Movements** — searchable movement reference.
- **More → Backup & Restore** — export/import all data as a JSON file.

## Files
```
WODBook-PWA/
├── index.html        # markup + styles
├── app.js            # all app logic + data (localStorage)
├── manifest.json     # PWA metadata (name, icons, colors)
├── sw.js             # service worker (offline cache)
└── icons/            # app icons (180/192/512 + maskable)
```

## Deploy with GitHub Pages (free)

You can do all of this from a phone or any computer with a browser.

1. Create a free account at **github.com**.
2. Click **New repository**. Name it e.g. `wodbook`, set it **Public**, click **Create repository**.
3. On the repo page, click **Add file → Upload files**.
4. Upload **everything inside the `WODBook-PWA` folder** — `index.html`, `app.js`,
   `manifest.json`, `sw.js`, and the **`icons`** folder (drag the whole folder in
   so the `icons/` path is preserved). Click **Commit changes**.
5. Go to **Settings → Pages**.
6. Under *Build and deployment* → *Source*, pick **Deploy from a branch**.
   Choose branch **main** and folder **/ (root)**. Click **Save**.
7. Wait ~1 minute, then refresh. GitHub shows your live URL, like:
   `https://YOURNAME.github.io/wodbook/`
8. That's the link you share. 🎉

> Tip: HTTPS is required for PWA install — GitHub Pages provides it automatically.

### Alternative: Netlify drag-and-drop
Go to **app.netlify.com/drop**, drag the `WODBook-PWA` folder onto the page, and
you'll get an instant URL. (Free account lets you keep it.)

## Install on iPhone (Add to Home Screen)
1. Open the link in **Safari** (must be Safari, not Chrome, for install on iOS).
2. Tap the **Share** button (square with an up-arrow).
3. Scroll down and tap **Add to Home Screen** → **Add**.
4. Launch it from the new **WODBook** icon — it opens full-screen like an app and
   works offline.

Send the same link to friends and they repeat these steps.

## Updating the app later
Edit the files, re-upload to GitHub (or re-drag to Netlify). To force the new
version onto an installed phone, bump the cache name in `sw.js`
(`const CACHE = 'wodbook-v2'`) so the service worker refreshes its cache.

## Honest limitations (vs a native iOS app)
- **Data is stored on each device** (browser `localStorage`). It does **not** sync
  between devices automatically — use **Backup & Restore** to move it. Note: if
  you clear Safari website data, app data is removed, so back up periodically.
- **Timer sound/vibration** works well while the app is open and the screen is on.
  iOS may pause audio/JS when the app is backgrounded or the phone is locked —
  keep the screen on during a workout for reliable beeps. (Vibration support in
  Safari is limited and may not fire on all devices.)
- No App Store listing, no push notifications.

If you later get access to a Mac, the original **native SwiftUI version**
(in the sibling `WODBook` folder) can be built and even submitted to the App Store.
