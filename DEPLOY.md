# Deploy online (no PC needed)

This puts the grimoire on a free always-on URL. You and every player just open
that link from any phone — your PC doesn't need to be on.

Host used: **Render.com** free tier (no credit card, supports WebSockets).
Note: the free service **sleeps after ~15 min idle**, so the first visit after a
quiet spell takes ~30–60s to wake. Games in progress are lost if it restarts —
fine for casual play.

## Step 1 — Put the code on GitHub

1. Create a free account at <https://github.com> (skip if you have one).
2. Make a new **empty** repo (no README): <https://github.com/new> → name it
   `botc-grimoire` → **Create repository**.
3. Back on this PC, push the code (replace `YOURNAME`):

   ```powershell
   cd $env:USERPROFILE\botc
   git remote add origin https://github.com/YOURNAME/botc-grimoire.git
   git push -u origin main
   ```

   The first push opens a browser to sign in to GitHub — approve it.

## Step 2 — Deploy on Render

1. Go to <https://render.com> → **Get Started** → **Sign in with GitHub**
   (one click, authorises Render to read your repos).
2. Dashboard → **New +** → **Blueprint**.
3. Pick your `botc-grimoire` repo → **Connect**. Render reads `render.yaml`
   and sets everything up.
4. **Apply / Create**. First build takes ~2–3 min (it fetches character data,
   downloads token icons, and bundles the app).
5. When it's live you get a URL like `https://botc-grimoire.onrender.com`.

## Step 3 — Use it on your phone

- Open the URL in Chrome on your Android.
- Menu (⋮) → **Add to Home screen** → it installs like an app.
- Storyteller: open it → **Storyteller** → create a game → share the code/QR.
- Players: open the same URL, enter the code.

## Updating later

Any change you commit and `git push` auto-redeploys (Render watches the repo):

```powershell
git add -A
git commit -m "what changed"
git push
```
