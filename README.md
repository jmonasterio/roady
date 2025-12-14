# Roady

Equipment checklist management for band roadies and touring professionals.

## Documentation

- **[Product Requirements](PRD.md)** - Features and requirements
- **[Database Design](docs/database-design.md)** - Schema and architecture
- **[Terminology](docs/terminology.md)** - Glossary of terms
- **[Agent Guide](docs/agent.md)** - Developer/AI agent guidance
- **[Virtual Tables Migration](VIRTUAL_TABLES_MIGRATION.md)** - MyCouch endpoint updates (NEW)
- **[MyCouch API Docs](../mycouch/docs/VIRTUAL_TABLES_API.md)** - Complete API reference

## Quick Start

### Development Mode

1. Start live-reload server:

```bash
npx live-server --port=8000
```

This will:
- Start a local server on port 8000
- Auto-reload browser when files change
- No global installation needed

**Alternative options:**
```bash
# Python (manual reload)
python -m http.server 8000

# Browser-sync (advanced features)
npx browser-sync start --server --files "**/*.html, **/*.css, **/*.js"
```

2. Open browser to `http://localhost:8000`

## Multi-Tenancy & Clerk Configuration

Roady supports multi-tenant deployments with MyCouch proxy handling user/tenant management via virtual table endpoints.

### JWT Configuration

Roady requires the `active_tenant_id` claim in the session token to support multi-tenancy. You must configure this in the **Default Session Token** for your Clerk application.

**Important**: DEV and PROD environments use **different Clerk applications**:
- **DEV**: `https://desired-lab-27.clerk.accounts.dev` (local development)
- **PROD**: `https://clerk.jmonasterio.github.io` (production deployment)

#### Configuration Steps

1. Go to your Clerk Dashboard for the appropriate environment
2. Navigate to **Configure** → **Sessions**
3. Find the **Customize session token** section (click "Edit" or the link)
4. Add the following to the **Claims** JSON:

```json
{
  "active_tenant_id": "{{session.public_metadata.active_tenant_id}}"
}
```

5. **Save** the changes

> **Note**: This configuration ensures that `window.Clerk.session.getToken()` automatically includes the tenant ID without needing a specific template name.

### Multi-Tenant System

Roady uses a personal tenant system managed by MyCouch:

1. **First Login**: New user automatically gets a personal tenant (e.g., "John's Workspace")
2. **Tenant Switching**: Users can switch between owned/joined tenants
3. **Tenant Access**: Equipment data is isolated per active tenant
4. **PouchDB Sync**: Data syncs to MyCouch `roady` database with tenant isolation

For details, see [Virtual Tables Migration](VIRTUAL_TABLES_MIGRATION.md).


## Tech Stack

- **Alpine.js** - Lightweight reactive framework
- **PouchDB** - In-browser database
- **Pico CSS** - Classless CSS framework
- **PWA** - Progressive Web App with offline support
- **No build step** - Direct browser execution

## Project Structure

```
/roady
  /css
    styles.css          # All styles
  /js
    app.js             # Alpine.js application logic
    db.js              # PouchDB database operations
  index.html           # Main application
  PRD.md              # Product requirements
  README.md           # This file
```

## Features (MVP)

- ✅ Equipment catalog management
- ✅ Gig type templates
- ✅ Create gig instances
- ✅ Load-out checklist
- ✅ Load-in checklist
- ✅ Progress tracking
- ✅ Mobile responsive
- ✅ PWA - Install on home screen
- ✅ Offline support

## PWA Installation

### iOS (iPhone/iPad)
1. Open in Safari
2. Tap Share button
3. Tap "Add to Home Screen"
4. Tap "Add"

### Android
1. Open in Chrome
2. Tap menu (three dots)
3. Tap "Install app" or "Add to Home Screen"

### Desktop
1. Open in Chrome/Edge
2. Click install icon in address bar
3. Click "Install"

## Browser Compatibility

Requires modern browser with:
- ES6+ JavaScript support
- IndexedDB (for PouchDB)
- Service Workers (for PWA)
- CSS Grid/Flexbox

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Data Storage

All data stored locally in browser IndexedDB via PouchDB. No backend required.

**Note**: Data persists in browser storage. Works offline after first load. Clearing browser data will remove all gigs and equipment.

## Future Enhancements

- Photo uploads for equipment
- Shareable checklists
- Export/print functionality
- Equipment categories
- Venue information
