# Deploying Roady

This guide covers deploying Roady as a Progressive Web App (PWA) to argw.com via GitHub Actions, with optional GitHub Pages deployment.

---

## Prerequisites

- A GitHub account with repo access
- Git installed on your computer
- The Roady code in a local folder
- SSH access to argw.com (as root)

---

## Deploying to argw.com via GitHub Actions

### Step 1: Generate SSH Key

On your local machine:

```bash
ssh-keygen -t ed25519 -C "jm@argw.com" -f ~/.ssh/argw_deploy
```

This creates:
- `~/.ssh/argw_deploy` (private key)
- `~/.ssh/argw_deploy.pub` (public key)

### Step 2: Add Public Key to argw.com

On argw.com (as root):

```bash
# Add public key to root's authorized_keys
cat >> ~/.ssh/authorized_keys << 'EOF'
<paste contents of ~/.ssh/argw_deploy.pub here>
EOF

chmod 600 ~/.ssh/authorized_keys
```

### Step 3: Test SSH Connection

From your local machine:

```bash
ssh -i ~/.ssh/argw_deploy root@argw.com "ls -la /var/www/argw.com/"
```

Should list the roady directory without errors.

### Step 4: Configure GitHub Secrets

In your GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

1. **`DEPLOY_KEY`**
   - Contents of `~/.ssh/argw_deploy` (private key file, entire contents)

2. **`DEPLOY_USER`**
   - Value: `root`

3. **`KNOWN_HOSTS`**
   - Run locally: `ssh-keyscan argw.com`
   - Paste the entire output

### Step 5: Automatic Deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` will:

- Deploy on every push to `main` branch
- Use rsync to sync files to `/var/www/argw.com/roady/`
- Automatically delete files on server that don't exist locally

You can also trigger manual deployments from Actions tab.

---

## Deploying to GitHub Pages (Optional)

### Step 1: Create a GitHub Repository

1. Go to [GitHub.com](https://github.com) and sign in
2. Click the **"+"** icon in the top-right corner
3. Select **"New repository"**
4. Fill in the details:
   - **Repository name**: `roady` (or your preferred name)
   - **Description**: "Equipment checklist PWA for band roadies"
   - **Visibility**: Public (required for GitHub Pages on free accounts)
   - **Do NOT** check "Add a README file"
5. Click **"Create repository"**

---

## Step 2: Initialize Git and Push Code

Open a terminal/command prompt in your `roady` folder and run:

```bash
# Initialize Git repository
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Roady PWA"

# Add GitHub as remote (replace YOUR-USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR-USERNAME/roady.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

## Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **"Settings"** tab
3. In the left sidebar, click **"Pages"**
4. Under **"Source"**, select:
   - Branch: `main`
   - Folder: `/ (root)`
5. Click **"Save"**
6. Wait 1-2 minutes for deployment

Your site will be available at:
```
https://YOUR-USERNAME.github.io/roady/
```

---

## Step 4: Update Service Worker (if needed)

If your GitHub Pages URL is **not** at the root domain (e.g., `github.io/roady/` instead of a custom domain), you may need to update the service worker scope.

**Option A: No changes needed** (try this first)
- The app should work as-is since all paths are relative

**Option B: If PWA install doesn't work**

Edit `manifest.json`:
```json
{
  "name": "Roady",
  "short_name": "Roady",
  "start_url": "/roady/",
  "scope": "/roady/",
  ...
}
```

Edit `index.html` service worker registration:
```html
navigator.serviceWorker.register('/sw.js')
```

Edit `js/sw.js` cache URLs:
```javascript
const PRECACHE_URLS = [
  '/roady/',
  '/roady/index.html',
  '/roady/css/styles.css',
  '/roady/js/app.js',
  '/roady/js/db.js',
  '/roady/manifest.json',
  // CDN resources stay the same
  ...
];
```

Then commit and push:
```bash
git add .
git commit -m "Update paths for GitHub Pages"
git push
```

---

## Step 5: Test the Deployment

1. Open your GitHub Pages URL in a mobile browser:
   ```
   https://YOUR-USERNAME.github.io/roady/
   ```

2. Verify the app loads correctly:
   - ✅ Navigation works
   - ✅ Can create equipment, templates, and gigs
   - ✅ Data persists on refresh (PouchDB)

---

## Step 6: Install PWA on Mobile

### **iOS (iPhone/iPad)**

1. Open the GitHub Pages URL in **Safari** (must use Safari, not Chrome)
2. Tap the **Share** button (square with arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Edit the name if desired (default: "Roady")
5. Tap **"Add"**
6. The app icon appears on your home screen

**Features:**
- ✅ Works offline
- ✅ Full-screen mode (no browser UI)
- ✅ Launches like a native app
- ⚠️ iOS doesn't support push notifications or background sync (PWA limitations)

### **Android**

1. Open the GitHub Pages URL in **Chrome**
2. You may see an automatic **"Install"** banner at the bottom
   - If so, tap **"Install"** or **"Add to Home Screen"**
3. If no banner appears:
   - Tap the **⋮** menu (three dots)
   - Select **"Add to Home Screen"** or **"Install app"**
4. Tap **"Add"** or **"Install"**
5. The app icon appears on your home screen

**Features:**
- ✅ Works offline
- ✅ Full-screen mode
- ✅ Launches like a native app
- ✅ Better PWA support than iOS

---

## Step 7: Set Up CouchDB Sync (Optional)

To sync data across devices, you'll need a CouchDB server:

1. **Set Up CouchDB Server:**

   **Option A: Self-hosted**
   - Install CouchDB on your own server
   - Create a database named `roady`
   - Enable CORS for your GitHub Pages domain

   **Option B: Hosted Service**
   - Use any CouchDB hosting provider
   - Create a database named `roady`
   - Configure CORS to allow your domain

2. **Configure Authentication:**

   CouchDB URL should include credentials:
   ```
   https://username:password@your-couchdb-server.com
   ```

   Example:
   ```
   https://admin:secretpass@couch.myserver.com
   ```

3. **Configure in App:**
   - Open the deployed Roady app
   - Go to Settings → Options
   - Enter your CouchDB URL (with credentials)
   - The app will start syncing automatically

4. **Install on Multiple Devices:**
   - Install the PWA on multiple phones/tablets
   - Configure same CouchDB URL on each
   - Data syncs automatically between all devices

---

## Troubleshooting

### PWA Won't Install

**Symptoms:** No "Add to Home Screen" or "Install" option appears

**Solutions:**
1. **iOS:** Must use Safari browser (not Chrome)
2. **HTTPS Required:** GitHub Pages uses HTTPS by default ✅
3. **Manifest Issues:** Check browser console (F12) for errors
4. **Service Worker:** Verify `/js/sw.js` loads without errors

### App Shows Blank Page

**Solutions:**
1. Check browser console for errors
2. Verify all paths in `index.html` are correct
3. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
4. Clear browser cache and service worker

### Data Not Syncing

**Solutions:**
1. Check CouchDB URL format includes credentials: `https://user:pass@server.com`
2. Verify CORS is enabled on your CouchDB server
3. Ensure database named `roady` exists
4. Look at browser console for sync errors

### Service Worker Not Updating

**Solutions:**
1. Increment cache version in `js/sw.js`:
   ```javascript
   const CACHE_NAME = 'roady-v2'; // Change v1 → v2
   ```
2. Commit and push changes
3. On devices: Hard refresh or unregister old service worker

---

## Updating the App

When you make changes to the code:

1. **Edit files locally**
2. **Test locally** (open `index.html` in browser)
3. **Commit changes:**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```
4. **Wait 1-2 minutes** for GitHub Pages to rebuild
5. **On devices:** Close and reopen the app (may need to hard refresh)

---

## Using a Custom Domain (Optional)

Instead of `github.io/roady/`, use your own domain:

1. Buy a domain (e.g., from Namecheap, Google Domains)
2. In your GitHub repo: Settings → Pages → Custom domain
3. Enter your domain (e.g., `roady.yourdomain.com`)
4. Update DNS records at your domain provider:
   ```
   Type: CNAME
   Name: roady
   Value: YOUR-USERNAME.github.io
   ```
5. Wait for DNS propagation (up to 24 hours)
6. Enable "Enforce HTTPS" in GitHub Pages settings

**Benefits:**
- Professional URL
- No need to update paths in code
- Easier to remember and share

---

## Sharing with Your Band

Once deployed, share the URL with your band:

```
Install Roady on your phone:

📱 iPhone: Open in Safari → Share → Add to Home Screen
📱 Android: Open in Chrome → Menu → Install app

🔗 https://YOUR-USERNAME.github.io/roady/

⚙️ Optional: Set up CouchDB sync to share data across devices
```

---

## Summary

✅ **Deployed to GitHub Pages** - Free hosting
✅ **PWA installable** - Works on iOS and Android
✅ **Works offline** - Service worker caching
✅ **Data persists** - PouchDB local storage
✅ **Optional sync** - CouchDB for multi-device sync
✅ **No backend required** - Client-side only (except optional CouchDB)

Your band roadie app is now live and accessible from anywhere! 🎸🎤
