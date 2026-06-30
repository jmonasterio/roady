// Alpine.js main application
; document.addEventListener('alpine:init', () => {
    Alpine.data('roady', () => ({
        // State
        currentView: 'gigs',
        equipmentTab: 'catalog', // 'catalog' or 'templates'
        equipment: [],
        gigTypes: [],
        gigs: [],
        selectedGigId: null,
        selectedGig: null,
        gigChecklistMode: null, // 'leavingForGig' or 'leavingFromGig'

        // Set list feature state
        setlistTab: 'songs', // 'songs' or 'templates'
        songs: [],
        setlistTemplates: [],
        showAddSong: false,
        editingSong: null,
        newSong: { title: '', artist: '', durationSec: 0, key: '', bpm: 0, lead: '', notes: '' },
        songDurationInput: '', // mm:ss text bound in the form
        // Template editor (also reused for the gig instance editor)
        editingSetlist: null,        // the template/instance doc being edited
        editingSetlistKind: null,    // 'template' | 'instance'
        setlistSongPicker: { sectionId: null, songId: '', newTitle: '' },
        // Gig set list
        gigSetlist: null,            // setlist instance for selectedGig (or null)
        setlistMode: 'view',         // 'view' | 'edit' for the gig set list panel
        showGigSetlist: false,       // gig set list dialog open
        performanceSetlist: null,    // setlist doc rendered full-screen, or null

        // Deleted items state
        deletedItems: {
            gigs: [],
            equipment: [],
            templates: []
        },
        trashCurrentPage: {
            gigs: 1,
            equipment: 1,
            templates: 1
        },
        trashItemsPerPage: 10,

        // Tenant state
        showTenantSelection: false,
        tenantIdInput: 'demo',

        // Band state
        userBands: [],
        currentBandTenantId: null,
        currentBandName: '',
        showCreateBandDialog: false,
        newBandName: '',
        bandBeingEdited: { name: '' },
        bandNameOriginal: '',
        currentBandMembers: [],
        bandMembers: [],
        showAddBandMember: false,
        newBandMember: { name: '', role: '' },
        editingBandMember: null,
        isCreatingBand: false,  // Prevent double submission
        
        // Invitation state (Members tab)
        showInviteMemberDialog: false,
        showGeneratedInviteLink: false,
        inviteMemberEmail: '',
        inviteMemberRole: 'editor',
        generatedInviteLink: '',
        generatedInviteToken: '',
        inviteMessageTemplate: '',
        inviteCopied: false,
        messageCopied: false,

        // Authentication state
        isAuthenticated: false,
        nostrAvatarHtml:  '',
        nostrDisplayName: '',
        nostrNpub:        '',
        
        // Retry state
        isRetrying: false,
        retryInterval: null,

        // UI state
        showAddEquipment: false,
        showAddGigType: false,
        showAddGig: false,
        editingEquipment: null,
        editingGigType: null,
        editingGig: null,
        showAddItemToGig: false,
        showAddToGigTypeConfirm: false,
        showPastGigs: false,
        showLoadedItems: false,
        showPackedItems: false,
        isLoading: true,

        // Form data
        newEquipment: {
            name: '',
            description: ''
        },
        newGigType: {
            name: '',
            equipment: []  // Array of { equipmentId, quantity }
        },
        newGig: {
            name: '',
            date: '',
            gigTypeId: '',
            arrivalTime: '',
            doorsOpenTime: '',
            mapLink: ''
        },
        newItemForGig: {
            equipmentId: '',
            newEquipmentName: '',
            addedEquipmentId: null,
            addedEquipmentName: ''
        },
        options: {
            mycouchBaseUrl: '',
            tenantId: ''
        },
        currentDbName: '',
        currentSessionToken: '',
        sessionCopied: false,
        syncStatus: 'idle',
        syncError: null,
        syncRetryCount: 0,

        // Confirmation dialog state
        confirmationDialog: {
            isOpen: false,
            title: '',
            message: '',
            confirmText: 'Confirm',
            cancelText: 'Cancel',
            action: null,
            isDangerous: false
        },

        // Diagnostics state
        showDiagnostics: false,
        diagnosticsResults: {
            jwtClaim: null,
            mycouchResponse: null,
            error: null
        },

        // Snackbar state
        snackbar: {
            isOpen: false,
            message: '',
            action: null,
            timeout: null
        },

        // Check for pending invitation token in sessionStorage
        checkPendingInvitation() {
            const pendingToken = sessionStorage.getItem('pendingInviteToken');
            if (pendingToken) {
                console.log('📬 Found pending invitation token in sessionStorage');
                return pendingToken;
            }
            return null;
        },

        // Parse invite_token from URL and store in sessionStorage
        // This runs BEFORE nostr auth, so token survives any redirects
        parseInviteTokenFromUrl() {
            const urlParams = new URLSearchParams(window.location.search);
            const inviteToken = urlParams.get('invite_token');
            
            if (inviteToken) {
                console.log('🔗 Parsing invite_token from URL');
                sessionStorage.setItem('pendingInviteToken', inviteToken);
                
                // Clean URL (remove the token parameter)
                const newUrl = new URL(window.location);
                newUrl.searchParams.delete('invite_token');
                window.history.replaceState({}, document.title, newUrl);
                
                return inviteToken;
            }
            return null;
        },

        // Accept invitation after user is authenticated
        async acceptPendingInvitation(token) {
            try {
                console.log('📬 Accepting pending invitation...');
                if (!window.Auth?.isAuthenticated()) {
                    console.warn('⚠️ Not authenticated; cannot accept invitation');
                    return false;
                }

                // Normalize URL: remove trailing slash to avoid double slashes
                const baseUrl = this.options.mycouchBaseUrl.replace(/\/$/, '');
                const response = await window.Auth.fetchWithAuth(
                    `${baseUrl}/api/invitations/accept`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token }),
                    },
                );

                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ Invitation accepted:', result);

                    // Clear the token from sessionStorage
                    sessionStorage.removeItem('pendingInviteToken');

                    // Adopt the accepted tenant into the TenantManager's
                    // in-memory list. No local Pouch write needed under MNA1 —
                    // the next /api/my-tenants pull confirms it server-side.
                    const accepted = await window.tenantManager?.addOrUpdateTenant(result);
                    const tenantId = accepted?._id || result._id || result.tenant_id;

                    // Update local band list
                    if (tenantId && !this.userBands.find(b => b._id === tenantId)) {
                        this.userBands.push(accepted || result);
                        console.log('✅ Added accepted tenant to userBands:', tenantId);
                    }
                    
                    // Switch to the new band
                    // Use _id ("tenant_<uuid>") to match the format documents are stored under.
                    if (tenantId) {
                        this.currentBandTenantId = tenantId;
                        DB.setTenant(tenantId);
                        await this.loadBandDetails();
                        await this.loadData();
                        console.log('✅ Switched to joined band:', tenantId);
                    }
                    
                    this.showSnackbar('Successfully joined the band!');
                    return true;
                } else if (response.status === 404) {
                    console.warn('⚠️ Invitation token not found or expired');
                    sessionStorage.removeItem('pendingInviteToken');
                    this.showSnackbar('Invitation link expired or invalid', 'error');
                    return false;
                } else if (response.status === 409) {
                    console.warn('⚠️ You are already a member of this band');
                    sessionStorage.removeItem('pendingInviteToken');
                    await this.loadBands();
                    this.showSnackbar('You are already a member of this band');
                    return true; // Not an error, user is already in
                } else if (response.status === 410) {
                    console.warn('⚠️ Invitation has been revoked');
                    sessionStorage.removeItem('pendingInviteToken');
                    this.showSnackbar('Invitation has been revoked', 'error');
                    return false;
                } else {
                    const error = await response.json();
                    throw new Error(error.detail || `Server error: ${response.status}`);
                }
            } catch (e) {
                console.error('❌ Error accepting invitation:', e);
                // Distinguish network errors from other errors
                if (e instanceof TypeError) {
                    // Network error (no connection, CORS, etc)
                    console.error('Network error - cannot reach server');
                    this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                } else {
                    // HTTP error or other
                    this.showSnackbar('Error accepting invitation: ' + e.message, 'error');
                }
                return false;
            }
        },

        // Initialize
        async init() {
            console.log('🚀 Roady App Initializing...');
            
            // CRITICAL: Parse invite token from URL before auth
            this.parseInviteTokenFromUrl();
            
            this.isLoading = true;

            // 1. Wait for Nostr auth — suspend until the login overlay fires nostr-connected
            console.log('⏳ Waiting for Nostr auth...');
            // Update nav profile when background fetch completes
            window.addEventListener('nostr-profile-updated', (e) => {
                this._updateNavProfile(e.detail?.pubkey, e.detail?.profile);
            });
            await new Promise(resolve => {
                if (window.Auth.isAuthenticated()) { resolve(); return; }
                const handler = () => {
                    window.removeEventListener('nostr-connected', handler);
                    resolve();
                };
                window.addEventListener('nostr-connected', handler);
            });

            // Populate nav with profile data already cached by onConnected
            this._updateNavProfile(window.Auth._cachedPubkey || window.Auth.getPubkey(), window.Auth._cachedProfile);

            // User is authenticated
            this.isAuthenticated = true;
            const pubkey = window.Auth.getPubkey();
            console.log('👤 Nostr user connected:', pubkey?.slice(0, 16) + '...');

            // 3. Load Options first (before tenant init, so we have mycouchBaseUrl)
            await this.loadOptions();
            
            // Resolve the MyCouch base BEFORE anything scopes off it. Auth
            // turns '' / '/__api__' / 'host.tld' into a usable absolute base;
            // passing the raw '' downstream silently un-scopes the local DB.
            window.Auth.setMycouchBaseUrl(this.options.mycouchBaseUrl);
            const resolvedMycouchUrl = window.Auth.getMycouchBaseUrl();

            // Set remote identity for scoped local-DB naming.
            // Use pubkey prefix as stable username for DB scoping.
            const username = pubkey ? pubkey.slice(0, 16) : 'user';
            DB.setRemoteIdentity(resolvedMycouchUrl, username);

            // Initialize DB with scoped naming
            DB.init();

            // Set current database name for display
            this.currentDbName = `pouchdb-local-${DB.hashRemoteUrl(resolvedMycouchUrl)}-${username}`;
            // 4. Initialize Tenant Context with loaded options
            try {
                console.log('🏢 Initializing Tenant Context...');
                console.log('🔗 Passing mycouchBaseUrl to TenantManager:', resolvedMycouchUrl);
                const tenantManager = new TenantManager(resolvedMycouchUrl);
                window.tenantManager = tenantManager;
                console.log('✅ TenantManager created with URL:', tenantManager.mycouchBaseUrl);

                const tenant = await tenantManager.initializeTenantContext();
                this.options.tenantId = tenant.tenantId;

                // Set tenant in DB layer
                DB.setTenant(tenant._id);

                console.log('✅ Tenant Initialized:', tenant.name);

                // Tenant initialized - band selector will display it

            } catch (e) {
                console.error('❌ Tenant initialization failed:', e);
                console.warn('⚠️ Continuing in offline mode - MyCouch may be unavailable');
                // Start background reconnection attempts
                this.startBackgroundRetry();
                // Continue anyway with cached data - user can work offline
            }

            // If we still don't have a tenant ID (and init failed), try to get from options
            if (!this.options.tenantId) {
                console.warn('⚠️ No tenant context available');
                // Show tenant selection or error
            }

            // Load user's bands
            await this.loadBands();

            // If loadBands failed (offline), try to restore last selected band from localStorage
            if (!this.currentBandTenantId) {
                const lastSelectedBandId = localStorage.getItem('lastSelectedBandId');
                if (lastSelectedBandId) {
                    console.log('📚 Restored last selected band from localStorage:', lastSelectedBandId);
                    this.currentBandTenantId = lastSelectedBandId;
                    DB.setTenant(lastSelectedBandId);
                }
            }

            // Sync DB tenant to whichever band loadBands() selected.
            // Without this, getAllGigs/getAllEquipment filter by the wrong tenant.
            if (this.currentBandTenantId) {
                DB.setTenant(this.currentBandTenantId);
            }

            // Load current band details
            await this.loadBandDetails();

            // 5. Setup Sync before first render so the listener is attached
            //    before any change event can fire, and sync has a head start.
            this.setupSyncListeners();
            if (this.options.mycouchBaseUrl) {
                this.enableSync();
            }

            // Initial render from local PouchDB (may be empty on new browser;
            // db-sync-change will reload once remote data arrives).
            await this.loadData();
            
            // CRITICAL: Accept pending invitation if one exists
            // This must happen AFTER nostr auth, tenant init, and options loading
            const pendingToken = this.checkPendingInvitation();
            if (pendingToken) {
                console.log('📣 Processing pending invitation acceptance...');
                await this.acceptPendingInvitation(pendingToken);
            }
            
            this.isLoading = false;

        },

        _updateNavProfile(pubkey, profile) {
            if (!pubkey) return;
            const npub = window.encodeNpub ? window.encodeNpub(pubkey) : pubkey;
            this.nostrNpub        = npub;
            this.nostrDisplayName = window.nuiDisplayName
                ? window.nuiDisplayName(profile, npub)
                : npub.slice(0, 20) + '\u2026';
            this.nostrAvatarHtml  = window.nuiAvatarHtml
                ? window.nuiAvatarHtml(profile, pubkey, 28)
                : '';
        },

        startBackgroundRetry() {
            if (this.isRetrying || this.retryInterval) {
                return; // Already retrying
            }

            this.isRetrying = true;
            console.log('🔄 Starting background reconnection attempts every 5 seconds...');

            this.retryInterval = setInterval(async () => {
                try {
                    console.log('🔄 Attempting to reconnect...');
                    const tenant = await window.tenantManager.initializeTenantContext();
                    
                    // Success — stop retrying
                    console.log('✅ Reconnected! Tenant:', tenant.name);
                    clearInterval(this.retryInterval);
                    this.retryInterval = null;
                    this.isRetrying = false;
                    DB.setTenant(tenant._id);
                    await this.loadBands();
                    if (this.currentBandTenantId) DB.setTenant(this.currentBandTenantId);
                    await this.loadData();
                } catch (error) {
                    console.log('⏳ Still waiting for MyCouch...');
                }
            }, 10000); // Try every 10 seconds
        },

        async loadData() {
            this.equipment = await DB.getAllEquipment();
            this.gigTypes = await DB.getAllGigTypes();
            this.gigs = await DB.getAllGigs();
            this.bandMembers = await DB.getAllBandMembers();
            this.songs = await DB.getAllSongs();
            this.setlistTemplates = await DB.getAllSetlistTemplates();
        },

        async loadDeletedItems() {
            this.deletedItems.gigs = await DB.getDeletedGigs();
            this.deletedItems.equipment = await DB.getDeletedEquipment();
            this.deletedItems.templates = await DB.getDeletedGigTypes();
        },

        getDeletedItemsPage(type, currentPage) {
            const items = this.deletedItems[type] || [];
            const start = (currentPage - 1) * this.trashItemsPerPage;
            const end = start + this.trashItemsPerPage;
            return items.slice(start, end);
        },

        getDeletedItemsPageCount(type) {
            const items = this.deletedItems[type] || [];
            return Math.max(1, Math.ceil(items.length / this.trashItemsPerPage));
        },

        async restoreDeletedItem(type, id) {
            if (type === 'gigs') {
                await DB.restoreGig(id);
            } else if (type === 'equipment') {
                await DB.restoreEquipment(id);
            } else if (type === 'templates') {
                await DB.restoreGigType(id);
            }
            await this.loadData();
            await this.loadDeletedItems();
        },

        // Options methods
        async loadOptions() {
            try {
                const saved = await DB.getOptions();
                console.log('📦 Loaded options from storage:', saved);
                if (saved && Object.keys(saved).length > 0) {
                    this.options = saved;
                    console.log('✅ Options loaded from storage:', this.options);
                } else {
                    console.log('📦 No saved options found');
                }

                // Migration: Remove couchDbUrl (use only mycouchBaseUrl)
                if (this.options.couchDbUrl) {
                    console.log('🔧 Removing deprecated couchDbUrl from options');
                    delete this.options.couchDbUrl;
                }

                // Migrate legacy default → same-origin (empty)
                if (this.options.mycouchBaseUrl === 'https://db.argw.com') {
                    console.log('🔧 Migrating legacy default MyCouch URL → same-origin /__api__');
                    this.options.mycouchBaseUrl = '';
                }
                
                console.log('📦 Final options:', {
                    mycouchBaseUrl: this.options.mycouchBaseUrl,
                    tenantId: this.options.tenantId
                });
                
                // Save if any defaults were set
                if (!saved || !saved.mycouchBaseUrl) {
                    await this.saveOptions();
                }
            } catch (e) {
                console.error('Failed to load options:', e);
            }
        },

        async saveOptions() {
            try {
                await DB.saveOptions(this.options);
            } catch (e) {
                console.error('Failed to save options:', e);
            }

            // Update TenantManager if MyCouch URL changed
            if (window.tenantManager && this.options.mycouchBaseUrl) {
                const oldUrl = window.tenantManager.mycouchBaseUrl;
                if (oldUrl !== this.options.mycouchBaseUrl) {
                    console.log('🔗 MyCouch URL changed, switching to scoped database...');
                    
                    // Check if database needs to switch (URL + username combination changed)
                    const username = window.Auth.getPubkey()?.slice(0, 16) || 'user';
                    const newUrlHash = DB.hashRemoteUrl(this.options.mycouchBaseUrl);
                    const oldUrlHash = DB.hashRemoteUrl(oldUrl);
                    
                    if (newUrlHash !== oldUrlHash) {
                        console.log(`💾 Database scope changed: ${oldUrlHash} → ${newUrlHash}`);
                        console.log(`⏸️  Pausing replication...`);
                        
                        // Pause current replication
                        if (window.Sync && window.Sync.disableSync) {
                            window.Sync.disableSync();
                        }
                        
                        // Switch to new database (scoped by new URL + username)
                        const oldDbName = DB.db?.name || 'unknown';
                        DB.setRemoteIdentity(this.options.mycouchBaseUrl, username);
                        DB.init(); // This will create/switch to the new scoped database
                        const newDbName = DB.db?.name || 'unknown';
                        
                        console.log(`📦 Switched database: ${oldDbName} → ${newDbName}`);
                        
                        // Update display name
                        this.currentDbName = newDbName;
                        
                        // Update TenantManager with new URL
                        window.tenantManager.mycouchBaseUrl = this.options.mycouchBaseUrl;
                        
                        // Clear cached bands (will reload from new database)
                        this.userBands = [];
                        this.currentBandTenantId = null;
                        
                        // Restart with new database and TenantManager
                        this.isLoading = true;
                        try {
                            const tenant = await window.tenantManager.initializeTenantContext();
                            this.options.tenantId = tenant.tenantId;
                            DB.setTenant(tenant._id);
                            console.log('✅ Switched to new database and tenant context:', tenant.name);
                            await this.loadBands();
                            await this.loadData();
                        } catch (e) {
                            console.error('Error initializing with new database:', e);
                            this.showSnackbar('Error switching to new CouchDB server', 'error');
                        } finally {
                            this.isLoading = false;
                        }
                        
                        // Re-enable sync with new URL
                        this.enableSync();
                        
                        return; // Exit early - we've done a full reload
                    } else {
                        // Same database scope, just update TenantManager
                        console.log('🔗 Same database scope, updating TenantManager:', this.options.mycouchBaseUrl);
                        window.tenantManager.mycouchBaseUrl = this.options.mycouchBaseUrl;
                        
                        // Restart retry loop with new URL
                        if (this.retryInterval) {
                            clearInterval(this.retryInterval);
                            this.startBackgroundRetry();
                        }
                    }
                }
            }

            // Update sync when URL changes (sync uses mycouchBaseUrl)
            if (this.options.mycouchBaseUrl && this.options.mycouchBaseUrl.trim()) {
                this.enableSync();
            } else {
                this.disableSync();
            }
        },

        async loadSessionToken() {
            // MNA1 has no session token — each request is signed fresh.
            // The diagnostics field now surfaces the active nostr pubkey
            // so users still have a stable identifier to copy.
            const pubkey = window.Auth?.getPubkey();
            this.currentSessionToken = pubkey || '(Not signed in)';
        },

        async copySessionToken() {
            try {
                await navigator.clipboard.writeText(this.currentSessionToken);
                this.sessionCopied = true;
                setTimeout(() => {
                    this.sessionCopied = false;
                }, 2000);
                console.log('✅ Session token copied to clipboard');
            } catch (e) {
                console.error('Failed to copy session token:', e);
                alert('Failed to copy token to clipboard');
            }
        },

        // Sync methods
        async enableSync() {
            console.log('📡 enableSync called with mycouchBaseUrl:', this.options.mycouchBaseUrl);
            
            if (!this.options.mycouchBaseUrl) {
                console.warn('⚠️ enableSync: no mycouchBaseUrl in options');
                return;
            }
            
            // Guard against Sync not being loaded
            if (!window.Sync) {
                console.warn('⚠️ Sync module not loaded yet, deferring sync setup');
                setTimeout(() => this.enableSync(), 100);
                return;
            }

            this.syncError = null;
            // Construct sync URL from MyCouch proxy base URL
            // Determine database name based on environment
            const dbName = window.location.hostname === 'localhost' ? 'roady-staging' : 'roady';
            const syncUrl = `${window.Auth.getMycouchBaseUrl()}/${dbName}`;
            console.log('📡 Calling Sync.setupSync with:', syncUrl);
            
            // Non-blocking sync setup with automatic retry
            // If MyCouch is offline, sync will fail gracefully and retry in background
            // App continues working with local PouchDB data
            Sync.setupSync(DB.getDb(), syncUrl)
                .then(success => {
                    if (!success) {
                        console.warn('⚠️ Sync setup failed - will retry in background');
                        this.syncError = 'Sync not available (offline or server unreachable)';
                        // Retry sync setup in background
                        this.scheduleRetrySync(syncUrl);
                    } else {
                        console.log('✅ Sync setup succeeded');
                        this.syncError = null;
                    }
                })
                .catch(error => {
                    console.error('❌ Sync setup error:', error.message);
                    this.syncError = 'Sync connection failed - retrying in background';
                    // Retry sync setup in background
                    this.scheduleRetrySync(syncUrl);
                });
        },

        scheduleRetrySync(syncUrl) {
            // Stop immediately if auth has permanently failed (repeated 401s from /auth/session)
            if (window.Auth?.isAuthPermanentlyFailed?.()) {
                console.error('[⛔ Sync] Auth permanently failed — backend does not accept Nostr auth. Sync disabled.');
                this.syncError = 'Sync unavailable: server auth rejected. Check backend /auth/session configuration.';
                this.syncRetryCount = 0;
                return;
            }

            // Exponential backoff: 5s, 10s, 20s, 30s, 30s...
            const baseDelay = 5000;
            const maxDelay = 30000;
            const retryCount = this.syncRetryCount || 0;
            const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);

            console.log(`📡 Scheduling sync retry in ${delay}ms (attempt ${retryCount + 1})`);
            setTimeout(() => {
                this.syncRetryCount = (this.syncRetryCount || 0) + 1;
                Sync.setupSync(DB.getDb(), syncUrl)
                    .then(success => {
                        if (success) {
                            console.log('✅ Sync reconnected!');
                            this.syncError = null;
                            this.syncRetryCount = 0;
                        } else {
                            this.scheduleRetrySync(syncUrl);
                        }
                    })
                    .catch(error => {
                        console.warn('⚠️ Sync retry failed:', error.message);
                        this.scheduleRetrySync(syncUrl);
                    });
            }, delay);
        },

        disableSync() {
            if (window.Sync) {
                Sync.cancelSync();
            }
            this.syncStatus = 'idle';
            this.syncError = null;
        },



        setupSyncListeners() {
            window.addEventListener('db-sync-change', (e) => {
                this.syncStatus = window.Sync ? Sync.getSyncStatus() : 'idle';
                // Reload bands first — they may have just synced in for the first time.
                // Then re-sync DB tenant in case the selection changed, then reload data.
                this.loadBands().then(() => {
                    if (this.currentBandTenantId) DB.setTenant(this.currentBandTenantId);
                    this.loadData();
                    this.loadDeletedItems();
                });
            });

            window.addEventListener('db-sync-error', (e) => {
                this.syncError = `Sync error: ${e.detail.error.message || 'Unknown error'}`;
                this.syncStatus = window.Sync ? Sync.getSyncStatus() : 'idle';
            });

            window.addEventListener('db-sync-paused', (e) => {
                this.syncStatus = window.Sync ? Sync.getSyncStatus() : 'idle';
            });
        },

        getSyncStatusText() {
            if (this.syncStatus === 'active') return 'Syncing...';
            if (this.syncStatus === 'error') return 'Sync Error';
            if (this.syncStatus === 'paused') return 'Connected';
            if (this.syncStatus === 'idle') return 'Not syncing';
            return 'Connected';
        },

        // Tenant methods
        async selectTenant() {
            if (!this.tenantIdInput.trim()) return;

            this.options.tenantId = this.tenantIdInput.trim();
            await this.saveOptions();

            // Set tenant in DB layer
            DB.setTenant(this.options.tenantId);

            // Hide dialog and load data
            this.showTenantSelection = false;
            this.isLoading = true;
            await this.loadData();
            await this.loadDeletedItems();
            this.isLoading = false;
            this.setupSyncListeners();

            // Setup sync if URL is configured
            if (this.options.couchDbUrl) {
                this.enableSync();
            }
        },

        async switchBand() {
            // Clear tenant and show selection dialog
            this.options.tenantId = '';
            await this.saveOptions();

            // Reset input and show dialog
            this.tenantIdInput = '';
            this.showTenantSelection = true;
            this.currentView = 'gigs'; // Reset to gigs view
        },

        // Equipment methods
        async saveEquipment() {
            if (!this.newEquipment.name.trim()) return;

            if (this.editingEquipment) {
                await DB.updateEquipment({
                    ...this.editingEquipment,
                    name: this.newEquipment.name,
                    description: this.newEquipment.description
                });
            } else {
                await DB.addEquipment(this.newEquipment);
            }

            await this.loadData();
            this.cancelEquipmentEdit();
        },

        editEquipment(equipment) {
            this.editingEquipment = equipment;
            this.newEquipment = {
                name: equipment.name,
                description: equipment.description || ''
            };
            this.showAddEquipment = true;
        },

        cancelEquipmentEdit() {
            this.showAddEquipment = false;
            this.editingEquipment = null;
            this.resetNewEquipment();
        },

        async deleteEquipment(id) {
            const confirmed = await this.showConfirmation(
                'Delete Equipment',
                'Delete this equipment item?',
                'Delete',
                true
            );

            if (confirmed) {
                const equipment = this.equipment.find(e => e._id === id);
                await DB.deleteEquipment(id);
                await this.loadData();
                this.cancelEquipmentEdit();

                // Show snackbar with undo
                this.showSnackbar(
                    `Deleted "${equipment?.name || 'Equipment'}"`,
                    async () => {
                        await DB.restoreEquipment(id);
                        await this.loadData();
                    }
                );
            }
        },

        resetNewEquipment() {
            this.newEquipment = { name: '', description: '' };
        },

        // Template methods
        async saveGigType() {
            if (!this.newGigType.name.trim()) return;

            if (this.editingGigType) {
                await DB.updateGigType({
                    ...this.editingGigType,
                    name: this.newGigType.name,
                    equipment: this.newGigType.equipment
                });
            } else {
                await DB.addGigType(this.newGigType);
            }

            await this.loadData();
            this.cancelGigTypeEdit();
        },

        editGigType(gigType) {
            this.editingGigType = gigType;

            // Handle old format (equipmentIds array) for backward compatibility
            let equipment;
            if (gigType.equipment) {
                // New format: array of {equipmentId, quantity}
                equipment = gigType.equipment.map(e => ({ ...e }));
            } else if (gigType.equipmentIds) {
                // Old format: convert to new format with quantity = 1
                equipment = gigType.equipmentIds.map(id => ({
                    equipmentId: id,
                    quantity: 1
                }));
            } else {
                equipment = [];
            }

            this.newGigType = {
                name: gigType.name,
                equipment: equipment
            };
        },

        toggleEquipmentInTemplate(equipmentId) {
            const existingIndex = this.newGigType.equipment.findIndex(e => e.equipmentId === equipmentId);
            if (existingIndex >= 0) {
                // Remove it
                this.newGigType.equipment.splice(existingIndex, 1);
            } else {
                // Add it with default quantity of 1
                this.newGigType.equipment.push({ equipmentId, quantity: 1 });
            }
        },

        updateEquipmentQuantity(equipmentId, value) {
            const item = this.newGigType.equipment.find(e => e.equipmentId === equipmentId);
            if (item) {
                const quantity = parseInt(value) || 1;
                item.quantity = Math.max(1, Math.min(99, quantity)); // Clamp between 1 and 99
            }
        },

        cancelGigTypeEdit() {
            this.showAddGigType = false;
            this.editingGigType = null;
            this.resetNewGigType();
        },

        async deleteGigType(id) {
            const confirmed = await this.showConfirmation(
                'Delete Template',
                'Delete this template? Existing gigs will keep their current equipment list.',
                'Delete',
                true
            );

            if (confirmed) {
                const gigType = this.gigTypes.find(t => t._id === id);
                await DB.deleteGigType(id);
                await this.loadData();
                this.cancelGigTypeEdit();

                // Show snackbar with undo
                this.showSnackbar(
                    `Deleted template "${gigType?.name || 'Template'}"`,
                    async () => {
                        await DB.restoreGigType(id);
                        await this.loadData();
                    }
                );
            }
        },

        resetNewGigType() {
            this.newGigType = { name: '', equipment: [] };
        },

        getEquipmentCount(gigType) {
            // Handle both old and new format, only counting active (non-deleted) equipment
            if (gigType.equipment) {
                // New format: sum up quantities for equipment that still exists
                return gigType.equipment.reduce((sum, item) => {
                    const equipmentExists = this.equipment.some(e => e._id === item.equipmentId);
                    return equipmentExists ? sum + item.quantity : sum;
                }, 0);
            } else if (gigType.equipmentIds) {
                // Old format: count only equipment that still exists
                return gigType.equipmentIds.filter(id =>
                    this.equipment.some(e => e._id === id)
                ).length;
            }
            return 0;
        },

        // Gig methods
        async saveGig() {
            if (!this.newGig.name.trim() || !this.newGig.date || !this.newGig.gigTypeId) {
                alert('Please fill in Name, Date, and Template');
                return;
            }

            if (this.editingGig) {
                // Check if gig type is changing
                const gigTypeChanged = this.editingGig.gigTypeId !== this.newGig.gigTypeId;

                if (gigTypeChanged) {
                    // Check if there's checklist progress
                    if (this.gigHasChecklistProgress(this.editingGig)) {
                        const confirmed = await this.showConfirmation(
                            'Change Template?',
                            'Changing the template will reset all checklist progress. Are you sure you want to continue?',
                            'Change Template',
                            true
                        );

                        if (!confirmed) {
                            return;
                        }
                    }

                    // Get new template and rebuild checklists (expand quantities)
                    const gigType = this.gigTypes.find(t => t._id === this.newGig.gigTypeId);
                    if (!gigType) return;

                    const newChecklist = [];
                    const equipment = gigType.equipment || gigType.equipmentIds?.map(id => ({ equipmentId: id, quantity: 1 })) || [];

                    equipment.forEach(({ equipmentId, quantity }) => {
                        for (let i = 1; i <= quantity; i++) {
                            newChecklist.push({
                                equipmentId,
                                itemNumber: i,
                                checked: false
                            });
                        }
                    });

                    await DB.updateGig({
                        ...this.editingGig,
                        name: this.newGig.name,
                        date: this.newGig.date,
                        gigTypeId: this.newGig.gigTypeId,
                        arrivalTime: this.newGig.arrivalTime,
                        doorsOpenTime: this.newGig.doorsOpenTime,
                        mapLink: this.newGig.mapLink,
                        loadoutChecklist: [...newChecklist],
                        loadinChecklist: [...newChecklist]
                    });
                } else {
                    // Just update name, date, and optional fields
                    await DB.updateGig({
                        ...this.editingGig,
                        name: this.newGig.name,
                        date: this.newGig.date,
                        arrivalTime: this.newGig.arrivalTime,
                        doorsOpenTime: this.newGig.doorsOpenTime,
                        mapLink: this.newGig.mapLink
                    });
                }
            } else {
                // Create new gig
                const gigType = this.gigTypes.find(t => t._id === this.newGig.gigTypeId);
                if (!gigType) return;
                await DB.addGig(this.newGig, gigType);
            }

            await this.loadData();
            this.cancelGigEdit();
        },

        editGig(gig) {
            this.editingGig = gig;
            this.newGig = {
                name: gig.name,
                date: gig.date,
                gigTypeId: gig.gigTypeId,
                arrivalTime: gig.arrivalTime || '',
                doorsOpenTime: gig.doorsOpenTime || '',
                mapLink: gig.mapLink || ''
            };
        },

        cancelGigEdit() {
            this.showAddGig = false;
            this.editingGig = null;
            this.resetNewGig();
        },

        async confirmDeleteGig() {
            if (!this.editingGig) return;

            const confirmed = await this.showConfirmation(
                'Delete Gig',
                `Delete "${this.editingGig.name}"? You can restore it from Trash.`,
                'Delete',
                true
            );

            if (confirmed) {
                await DB.deleteGig(this.editingGig._id);
                const gigName = this.editingGig.name;
                await this.loadData();
                this.cancelGigEdit();

                // Show snackbar with undo
                this.showSnackbar(
                    `Deleted gig "${gigName}"`,
                    async () => {
                        await DB.restoreGig(this.editingGig._id);
                        await this.loadData();
                    }
                );
            }
        },

        async deleteGig(id) {
            const gig = this.gigs.find(g => g._id === id);
            if (!gig) return;

            const confirmed = await this.showConfirmation(
                'Delete Gig',
                `Delete "${gig.name}"? You can restore it from Trash.`,
                'Delete',
                true
            );

            if (confirmed) {
                await DB.deleteGig(id);
                const gigName = gig.name;
                await this.loadData();
                this.closeGigDetail();

                // Show snackbar with undo
                this.showSnackbar(
                    `Deleted gig "${gigName}"`,
                    async () => {
                        await DB.restoreGig(id);
                        await this.loadData();
                    }
                );
            }
        },

        resetNewGig() {
            this.newGig = { name: '', date: '', gigTypeId: '', arrivalTime: '', doorsOpenTime: '', mapLink: '' };
        },

        async viewGigDetail(gigId, mode) {
            this.selectedGigId = gigId;
            this.gigChecklistMode = mode; // 'leavingForGig' or 'leavingFromGig'
            this.selectedGig = await DB.getGig(gigId);

            // If gig is clean (not dirty), sync with current template
            if (!this.gigHasChecklistProgress(this.selectedGig)) {
                const gigType = this.gigTypes.find(t => t._id === this.selectedGig.gigTypeId);
                if (gigType) {
                    const templateEquipment = gigType.equipment || gigType.equipmentIds?.map(id => ({ equipmentId: id, quantity: 1 })) || [];

                    // Build new checklists from current template (only include non-deleted equipment)
                    const newChecklist = [];
                    templateEquipment.forEach(({ equipmentId, quantity }) => {
                        // Only add if equipment still exists (not deleted)
                        if (this.equipment.some(e => e._id === equipmentId)) {
                            for (let i = 1; i <= quantity; i++) {
                                newChecklist.push({
                                    equipmentId,
                                    itemNumber: i,
                                    checked: false
                                });
                            }
                        }
                    });

                    // Only update if equipment changed
                    const currentEquipmentIds = new Set(this.selectedGig.loadoutChecklist.map(i => i.equipmentId));
                    const newEquipmentIds = new Set(newChecklist.map(i => i.equipmentId));

                    if (currentEquipmentIds.size !== newEquipmentIds.size ||
                        ![...currentEquipmentIds].every(id => newEquipmentIds.has(id))) {
                        this.selectedGig.loadoutChecklist = newChecklist;
                        this.selectedGig.loadinChecklist = [...newChecklist];
                        await DB.updateGig(this.selectedGig);
                    }
                }
            }
        },

        closeGigDetail() {
            this.selectedGigId = null;
            this.selectedGig = null;
            this.gigChecklistMode = null;
            this.showAddItemToGig = false;
            this.showAddToGigTypeConfirm = false;
            this.showLoadedItems = false;
            this.showPackedItems = false;
            this.resetNewItemForGig();
        },

        async toggleChecklistItem(checklistType, index) {
            if (!this.selectedGig) return;

            const checklist = checklistType === 'loadout'
                ? this.selectedGig.loadoutChecklist
                : this.selectedGig.loadinChecklist;

            checklist[index].checked = !checklist[index].checked;

            await DB.updateGig(this.selectedGig);
            await this.loadData();

            // Refresh selected gig
            this.selectedGig = await DB.getGig(this.selectedGigId);
        },

        async toggleLoadinItem(index) {
            if (!this.selectedGig) return;

            this.selectedGig.loadinChecklist[index].checked = !this.selectedGig.loadinChecklist[index].checked;

            await DB.updateGig(this.selectedGig);
            await this.loadData();

            // Refresh selected gig
            this.selectedGig = await DB.getGig(this.selectedGigId);
        },

        getItemsBrought(gig) {
            if (!gig) return [];
            return gig.loadinChecklist
                .map((item, index) => ({
                    ...item,
                    originalIndex: index,
                    loadinChecked: item.checked
                }))
                .filter((item, index) => gig.loadoutChecklist[index].checked);
        },

        getItemsNotBrought(gig) {
            if (!gig) return [];
            return gig.loadinChecklist
                .map((item, index) => ({
                    ...item,
                    originalIndex: index,
                    loadinChecked: item.checked
                }))
                .filter((item, index) => !gig.loadoutChecklist[index].checked);
        },

        getFilteredGigs() {
            // Hide gigs that are more than 24 hours in the past
            if (this.showPastGigs) {
                return this.gigs; // Show all gigs
            }

            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            return this.gigs.filter(gig => {
                // Parse gig date as local time at end of day
                const [year, month, day] = gig.date.split('-').map(Number);
                const gigEndOfDay = new Date(year, month - 1, day, 23, 59, 59).getTime();

                // Keep gig if it's within last 24 hours
                return (now - gigEndOfDay) < twentyFourHours;
            });
        },

        isGigInPast(gig) {
            const now = Date.now();
            const twentyFourHours = 24 * 60 * 60 * 1000;

            const [year, month, day] = gig.date.split('-').map(Number);
            const gigEndOfDay = new Date(year, month - 1, day, 23, 59, 59).getTime();

            return (now - gigEndOfDay) >= twentyFourHours;
        },

        getAvailableEquipment() {
            if (!this.selectedGig) return this.equipment;
            const gigEquipmentIds = this.selectedGig.loadoutChecklist.map(item => item.equipmentId);
            return this.equipment.filter(eq => !gigEquipmentIds.includes(eq._id));
        },

        resetNewItemForGig() {
            this.newItemForGig = {
                equipmentId: '',
                newEquipmentName: '',
                addedEquipmentId: null,
                addedEquipmentName: ''
            };
        },

        cancelAddItemToGig() {
            this.showAddItemToGig = false;
            this.resetNewItemForGig();
        },

        async addItemToGig() {
            if (!this.selectedGig) return;

            let equipmentId = this.newItemForGig.equipmentId;
            let equipmentName = '';

            // If creating new equipment
            if (!equipmentId && this.newItemForGig.newEquipmentName.trim()) {
                const newEquipment = {
                    name: this.newItemForGig.newEquipmentName.trim(),
                    description: ''
                };
                const result = await DB.addEquipment(newEquipment);
                equipmentId = result.id;
                equipmentName = newEquipment.name;
                await this.loadData();
            } else if (equipmentId) {
                const item = this.equipment.find(e => e._id === equipmentId);
                equipmentName = item ? item.name : '';
            } else {
                return; // Nothing selected or entered
            }

            // Add to gig checklists
            this.selectedGig.loadoutChecklist.push({ equipmentId, checked: false });
            this.selectedGig.loadinChecklist.push({ equipmentId, checked: false });
            await DB.updateGig(this.selectedGig);
            await this.loadData();
            this.selectedGig = await DB.getGig(this.selectedGigId);

            // Store for confirmation dialog
            this.newItemForGig.addedEquipmentId = equipmentId;
            this.newItemForGig.addedEquipmentName = equipmentName;

            // Show confirmation dialog
            this.showAddItemToGig = false;
            this.showAddToGigTypeConfirm = true;
        },

        async confirmAddToGigType(addToType) {
            if (addToType && this.selectedGig && this.newItemForGig.addedEquipmentId) {
                const gigType = this.gigTypes.find(t => t._id === this.selectedGig.gigTypeId);
                if (gigType) {
                    // Handle both old and new format
                    if (gigType.equipment) {
                        // New format: check if equipment already exists
                        const exists = gigType.equipment.some(e => e.equipmentId === this.newItemForGig.addedEquipmentId);
                        if (!exists) {
                            gigType.equipment.push({ equipmentId: this.newItemForGig.addedEquipmentId, quantity: 1 });
                            await DB.updateGigType(gigType);
                            await this.loadData();
                        }
                    } else if (gigType.equipmentIds) {
                        // Old format: convert to new format and add
                        gigType.equipment = gigType.equipmentIds.map(id => ({ equipmentId: id, quantity: 1 }));
                        gigType.equipment.push({ equipmentId: this.newItemForGig.addedEquipmentId, quantity: 1 });
                        delete gigType.equipmentIds;
                        await DB.updateGigType(gigType);
                        await this.loadData();
                    }
                }
            }

            this.showAddToGigTypeConfirm = false;
            this.resetNewItemForGig();
        },

        gigHasChecklistProgress(gig) {
            if (!gig) return false;
            const hasLoadoutProgress = gig.loadoutChecklist.some(item => item.checked);
            const hasLoadinProgress = gig.loadinChecklist.some(item => item.checked);
            return hasLoadoutProgress || hasLoadinProgress;
        },

        // Checklist filtering helpers
        getUnloadedItems(checklist) {
            if (!checklist) return [];
            return checklist
                .map((item, index) => ({ ...item, originalIndex: index }))
                .filter(item => !item.checked);
        },

        getLoadedItems(checklist) {
            if (!checklist) return [];
            return checklist
                .map((item, index) => ({ ...item, originalIndex: index }))
                .filter(item => item.checked);
        },

        // Helper methods
        getGigTypeName(gigTypeId) {
            const type = this.gigTypes.find(t => t._id === gigTypeId);
            return type ? type.name : 'Unknown';
        },

        getEquipmentName(equipmentId, itemNumber) {
            const item = this.equipment.find(e => e._id === equipmentId);
            const baseName = item ? item.name : 'Unknown';

            // Only show item number if it exists and is > 1 (meaning there are multiple items)
            if (itemNumber && itemNumber > 0) {
                // Check if there are multiple items with the same equipmentId in the current gig
                if (this.selectedGig) {
                    const checklist = this.gigChecklistMode === 'leavingForGig'
                        ? this.selectedGig.loadoutChecklist
                        : this.selectedGig.loadinChecklist;

                    const itemsWithSameId = checklist.filter(i => i.equipmentId === equipmentId);
                    if (itemsWithSameId.length > 1) {
                        return `${baseName} #${itemNumber}`;
                    }
                }
            }

            return baseName;
        },

        getChecklistProgress(checklist) {
            const checked = checklist.filter(item => item.checked).length;
            return `${checked}/${checklist.length}`;
        },

        formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        },

        openCreateGigDialog() {
            // If no templates exist, create a default template
            if (this.gigTypes.length === 0) {
                const defaultTemplate = {
                    name: 'Default Template',
                    equipment: []
                };
                DB.addGigType(defaultTemplate).then(async () => {
                    await this.loadData();
                    // Optionally, select the new template for the new gig
                    if (this.gigTypes.length > 0) {
                        this.newGig.gigTypeId = this.gigTypes[0]._id;
                    }
                    this.showAddGig = true;
                });
            } else {
                this.showAddGig = true;
            }
        },

        // Confirmation dialog helpers
        showConfirmation(title, message, confirmText = 'Confirm', isDangerous = false) {
            return new Promise((resolve) => {
                this.confirmationDialog = {
                    isOpen: true,
                    title,
                    message,
                    confirmText,
                    cancelText: 'Cancel',
                    action: resolve,
                    isDangerous
                };
            });
        },

        async confirmDialogAction(confirmed) {
            const action = this.confirmationDialog.action;
            this.confirmationDialog.isOpen = false;

            if (confirmed && action) {
                action(true);
            } else if (action) {
                action(false);
            }
        },

        // Snackbar helpers
        showSnackbar(message, undoAction, duration = 4000) {
            // Clear any existing timeout
            if (this.snackbar.timeout) {
                clearTimeout(this.snackbar.timeout);
            }

            this.snackbar = {
                isOpen: true,
                message,
                action: undoAction,
                timeout: setTimeout(() => {
                    this.snackbar.isOpen = false;
                }, duration)
            };
        },

        async snackbarUndo() {
            if (this.snackbar.action) {
                if (this.snackbar.timeout) {
                    clearTimeout(this.snackbar.timeout);
                }
                this.snackbar.isOpen = false;
                await this.snackbar.action();
            }
        },

        dismissSnackbar() {
            if (this.snackbar.timeout) {
                clearTimeout(this.snackbar.timeout);
            }
            this.snackbar.isOpen = false;
        },

        // Band management methods
        async loadBands() {
             try {
                 // Refresh tenant list from server (not cached)
                 if (!window.tenantManager) {
                     console.error('❌ TenantManager not available');
                     return;
                 }
                 
                 // Reload tenants from server to get latest (including newly created tenants)
                 const tenantsResponse = await window.tenantManager.getMyTenants();
                 this.userBands = Array.isArray(tenantsResponse) ? tenantsResponse : [];
                 console.log('✅ Tenants refreshed from server:', this.userBands);
                 
                 // VALIDATION: Check if user.tenants was corrupted with full tenant documents
                 // This catches the data corruption bug described in INVITATION_ACCEPTANCE_CODE_REVIEW.md
                 if (window.tenantManager?.localUserDoc) {
                     const validation = window.tenantManager.validateUserTenantsFormat(window.tenantManager.localUserDoc);
                     if (!validation.valid) {
                         window.tenantManager.logValidationErrors(validation);
                         console.error('⚠️ Detected data corruption in user.tenants - see INVITATION_ACCEPTANCE_CODE_REVIEW.md for details');
                         // Continue anyway, but alert user
                         this.showSnackbar('⚠️ Data integrity issue detected. Please refresh the page.', 'warning');
                     }
                 }
                
                // Determine which band to select
                // Priority: 1) Already selected (don't override), 2) Last selected band, 3) Current tenant from tenantManager, 4) First band
                
                // If already have a selected band, keep it (don't override on reload)
                if (this.currentBandTenantId && this.userBands.some(b => b._id === this.currentBandTenantId)) {
                    console.log('✅ Keeping current band:', this.currentBandTenantId);
                } else {
                    const lastSelectedBandId = localStorage.getItem('lastSelectedBandId');
                    if (lastSelectedBandId && this.userBands.some(b => b._id === lastSelectedBandId)) {
                        // Use last selected band if it still exists
                        this.currentBandTenantId = lastSelectedBandId;
                        console.log('✅ Using last selected band:', lastSelectedBandId);
                    } else {
                        // Fall back to current tenant or first band
                        const currentTenant = window.tenantManager.getCurrentTenant();
                        if (currentTenant) {
                            this.currentBandTenantId = currentTenant._id;
                            console.log('✅ Using current tenant:', currentTenant._id);
                        } else if (this.userBands.length > 0) {
                            this.currentBandTenantId = this.userBands[0]._id;
                            console.log('✅ Using first band:', this.userBands[0]._id);
                        }
                    }
                }
                
                // Update current band name
                this.updateCurrentBandName();
            } catch (e) {
                console.error('❌ Error loading bands:', e);
            }
        },

        updateCurrentBandName() {
            const currentBand = this.userBands.find(b => b._id === this.currentBandTenantId);
            // Use tenant name field (standard across all apps)
            this.currentBandName = currentBand?.name || '';
        },

        async switchBand(bandTenantId) {
            try {
                console.log('🔄 Switching to band:', bandTenantId);
                
                // Switch tenant in tenantManager
                if (window.tenantManager) {
                    try {
                        await window.tenantManager.switchTenant(bandTenantId);
                    } catch (e) {
                        console.warn('⚠️ Could not switch tenant via endpoint:', e);
                        // Continue anyway - local switching still works
                    }
                }
                
                // Update app state
                this.currentBandTenantId = bandTenantId;
                this.updateCurrentBandName();
                
                // Set tenant in DB layer
                DB.setTenant(bandTenantId);
                
                // Save last selected band to local storage
                localStorage.setItem('lastSelectedBandId', bandTenantId);
                
                // Reload data for new band
                await this.loadData();
                
                // Load band details for settings
                await this.loadBandDetails();
                
                // Show notification
                this.showSnackbar(`Switched to ${this.currentBandName}`);
            } catch (e) {
                console.error('❌ Error switching band:', e);
                this.showSnackbar('Error switching band', 'error');
            }
        },

        /**
         * Extract virtual tenant ID from local storage format
         * Local PouchDB stores as tenant_<uuid>, but APIs need just <uuid>
         */
        getVirtualTenantId(tenantId) {
            if (!tenantId) return tenantId;
            if (tenantId.startsWith('tenant_')) {
                return tenantId.substring(7);  // Remove "tenant_" prefix
            }
            return tenantId;
        },

        openCreateBandDialog() {
            this.newBandName = '';
            this.showCreateBandDialog = true;
        },

        async createBand() {
            if (!this.newBandName.trim()) {
                this.showSnackbar('Band name is required', 'error');
                return;
            }

            // Prevent double submission (e.g., Enter key + button click)
            if (this.isCreatingBand) {
                console.warn('⚠️ Band creation already in progress, ignoring duplicate request');
                return;
            }
            this.isCreatingBand = true;

            try {
                if (!window.Auth?.isAuthenticated()) {
                    console.error('Not authenticated');
                    this.showSnackbar('Authentication error: Please sign in again', 'error');
                    this.isCreatingBand = false;
                    return;
                }

                const bandName = this.newBandName;

                // Create tenant via the TenantManager — under the hood this
                // POSTs `/api/tenants` with MNA1 auth and normalizes the
                // server's `Tenant` response into the legacy `_id` shape.
                try {
                    console.log('📤 Creating band via TenantManager.createTenant:', bandName);
                    const newTenant = await window.tenantManager.createTenant({ name: bandName });
                    const newBandId = newTenant.tenantId; // bare uuid for sub-systems that expect it
                    const internalId = newTenant._id;     // `tenant_<...>` for DAL + active-tenant
                    console.log('✅ Band created:', newTenant);

                    this.showCreateBandDialog = false;
                    this.newBandName = '';

                    // Create band-info document in the new tenant's roady DB.
                    try {
                        const previousTenant = DB.currentTenant;
                        console.log('📝 Setting tenant to new band:', internalId);
                        DB.setTenant(internalId);
                        console.log('📝 Saving band-info for:', internalId);
                        await DB.saveBandInfo({ name: bandName });
                        if (previousTenant) DB.setTenant(previousTenant);
                    } catch (e) {
                        console.error('❌ Failed to create band-info for', internalId, e);
                    }

                    // Add to local app state. TenantManager.createTenant already
                    // pushed into its own tenantList; userBands mirrors that for UI.
                    if (!this.userBands.find(b => b._id === internalId)) {
                        this.userBands.push(newTenant);
                    }
                    console.log('✅ Added new band to local lists:', internalId);

                    // Refresh from server to pick up server-side normalization
                    // (e.g. membership rows) before switching.
                    try {
                        const fresh = await window.tenantManager.getMyTenants();
                        if (Array.isArray(fresh) && fresh.length > 0) this.userBands = fresh;
                    } catch (e) {
                        console.warn('⚠️ Tenant refresh after create failed:', e.message);
                    }

                    
                    // Switch to new band (becomes active in JWT)
                    await this.switchBand(newBandId);
                    this.showSnackbar(`Created new band: ${bandName}`);
                } catch (e) {
                    console.error('❌ Failed to create band via backend:', e);
                    // Distinguish network errors from server errors
                    if (e instanceof TypeError) {
                        // Network error (no connection, CORS, etc)
                        console.error('Network error - cannot reach server');
                        this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                    } else {
                        // HTTP error or other
                        this.showSnackbar('Error creating band: ' + e.message, 'error');
                    }
                } finally {
                    this.isCreatingBand = false;
                }
            } catch (outerError) {
                console.error('❌ Unexpected error in band creation:', outerError);
                this.showSnackbar('Error creating band: ' + outerError.message, 'error');
                this.isCreatingBand = false;
            }
        },

        // Band settings methods
        async loadBandDetails() {
            if (!this.currentBandTenantId) return;
            
            try {
                // CRITICAL: Use tenant name from userBands (server source of truth)
                // NOT from local band-info document which may be stale
                const currentBand = this.userBands.find(b => b._id === this.currentBandTenantId);
                const tenantName = currentBand?.name;
                
                // Set tenant context for getBandInfo (for other band-specific data if needed)
                DB.setTenant(this.currentBandTenantId);
                const bandInfo = await DB.getBandInfo();
                
                // Use tenant name as source of truth, fallback to band-info if needed
                const nameToUse = tenantName || bandInfo?.name || this.currentBandName;
                
                this.bandBeingEdited = { name: nameToUse };
                this.bandNameOriginal = nameToUse;
                this.currentBandName = nameToUse;
                
                console.log('✅ Band details loaded:', { 
                    tenantName, 
                    bandInfoName: bandInfo?.name,
                    finalName: nameToUse 
                });
            } catch (e) {
                console.error('❌ Error loading band details:', e);
            }
            
            await this.loadBandMembers();
        },

        async loadBandMembers() {
            // Members live in the `tenant_members` server table (B.6a). The
            // old `tenantDoc.userIds` array was a virtual-tables-era affordance
            // (B.7) that the post-C.11 server-shape tenants don't carry. Fetch
            // authoritative state from `GET /api/tenants/:tid/members` so a
            // freshly-created tenant or one whose membership changed remotely
            // displays correctly without a round-trip through `/api/my-tenants`.
            this.currentBandMembers = [];
            if (!this.currentBandTenantId) return;

            try {
                const base = window.Auth.getMycouchBaseUrl().replace(/\/+$/, '');
                const tid = encodeURIComponent(this.currentBandTenantId);
                const res = await window.Auth.fetchWithAuth(
                    `${base}/api/tenants/${tid}/members`,
                    { method: 'GET' },
                );
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    console.warn(`⚠️ loadBandMembers ${res.status}:`, text);
                    return;
                }
                const data = await res.json();
                const members = Array.isArray(data?.members) ? data.members : [];
                // Server shape: { members: [{ user_hash, role, joined_at }, ...] }.
                // UI shape: { userId: 'user_<hash>', name, role }. Email is no
                // longer stored — under MNA1 the only identity is the pubkey.
                this.currentBandMembers = members.map(m => ({
                    userId: `user_${m.user_hash}`,
                    name: `${m.user_hash.slice(0, 8)}…`,
                    role: m.role,
                    joinedAt: m.joined_at,
                }));
                console.log(`✅ Band members loaded (${this.currentBandMembers.length}):`, this.currentBandMembers);
            } catch (e) {
                console.error('❌ loadBandMembers failed:', e);
            }
        },

        getCurrentUserRole() {
            // Get current user's ID
            const currentUserId = `user_${window.tenantManager?.currentUserHash}`;
            if (!currentUserId || !this.currentBandTenantId) {
                return 'member'; // default fallback
            }

            // Find current band in userBands
            const virtualTenantId = this.currentBandTenantId.replace('tenant_', '');
            const currentBand = this.userBands.find(b =>
                b._id === virtualTenantId || b.tenantId === virtualTenantId || b._id === this.currentBandTenantId
            );

            if (!currentBand) {
                return 'member';
            }

            // Check role in band.members array
            if (currentBand.members && Array.isArray(currentBand.members)) {
                const memberInfo = currentBand.members.find(m => m.userId === currentUserId);
                if (memberInfo && memberInfo.role) {
                    return memberInfo.role;
                }
            }

            // Fallback: check band.role (from user.tenants)
            return currentBand.role || 'member';
        },

        cancelBandEdit() {
            this.bandBeingEdited = { name: this.bandNameOriginal };
        },

        async saveBandName() {
            if (!this.bandBeingEdited.name.trim()) {
                this.showSnackbar('Band name cannot be empty', 'error');
                return;
            }

            try {
                // Update tenant name via the API; TenantManager keeps the
                // local list in sync.
                const band = this.userBands.find(b => b._id === this.currentBandTenantId);
                if (band && window.tenantManager) {
                    try {
                        const updated = await window.tenantManager.updateTenant(
                            band._id,
                            { name: this.bandBeingEdited.name },
                        );
                        band.name = updated.name;
                        console.log('✅ Updated tenant name to:', updated.name);
                    } catch (e) {
                        console.error('Error updating tenant name:', e);
                        throw e;
                    }
                }
                
                // Save band-info for roady-specific metadata (optional)
                const bandInfo = {
                    name: this.bandBeingEdited.name,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                await DB.saveBandInfo(bandInfo);
                
                // Update app state
                this.currentBandName = this.bandBeingEdited.name;
                this.bandNameOriginal = this.currentBandName;
                this.showSnackbar(`Band renamed to ${this.currentBandName}`);
            } catch (e) {
                console.error('Error saving band name:', e);
                this.showSnackbar('Error saving band name', 'error');
            }
        },

        // Band Roster methods
        async addBandMember() {
            if (!this.newBandMember.name.trim()) {
                this.showSnackbar('Member name is required', 'error');
                return;
            }
            try {
                await DB.addBandMember(this.newBandMember);
                this.newBandMember = { name: '', role: '' };
                this.showAddBandMember = false;
                this.bandMembers = await DB.getAllBandMembers();
            } catch (e) {
                console.error('Error adding band member:', e);
                this.showSnackbar('Error adding member', 'error');
            }
        },

        startEditBandMember(member) {
            this.editingBandMember = { ...member };
        },

        cancelEditBandMember() {
            this.editingBandMember = null;
        },

        async saveEditBandMember() {
            if (!this.editingBandMember?.name.trim()) {
                this.showSnackbar('Member name is required', 'error');
                return;
            }
            try {
                await DB.updateBandMember(this.editingBandMember);
                this.editingBandMember = null;
                this.bandMembers = await DB.getAllBandMembers();
            } catch (e) {
                console.error('Error updating band member:', e);
                this.showSnackbar('Error saving member', 'error');
            }
        },

        async deleteBandMember(member) {
            const confirmed = await this.showConfirmation(
                'Remove Member',
                `Remove ${member.name} from the band roster?`,
                'Remove',
                true
            );
            if (!confirmed) return;
            try {
                await DB.deleteBandMember(member._id);
                this.bandMembers = await DB.getAllBandMembers();
            } catch (e) {
                console.error('Error deleting band member:', e);
                this.showSnackbar('Error removing member', 'error');
            }
        },

        openInviteMemberDialog() {
            this.inviteMemberEmail = '';
            this.inviteMemberRole = 'editor';
            this.showInviteMemberDialog = true;
        },

        async inviteMember() {
             // Email is optional (just for reference)
             try {
                 // API expects internal format (with tenant_ prefix)
                 const tenantId = this.currentBandTenantId.startsWith('tenant_')
                     ? this.currentBandTenantId
                     : `tenant_${this.currentBandTenantId}`;

                 const body = { role: this.inviteMemberRole };
                 if (this.inviteMemberEmail.trim()) {
                     body.email = this.inviteMemberEmail.trim();
                 }

                 const baseUrl = this.options.mycouchBaseUrl.replace(/\/$/, '');
                 const response = await window.Auth.fetchWithAuth(
                    `${baseUrl}/api/tenants/${tenantId}/invitations`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    },
                );

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to generate invitation');
                }

                const invitationData = await response.json();
                console.log('✅ Invitation created:', invitationData);

                // Generate shareable link with token
                const inviteToken = invitationData.token || invitationData.id;
                const appBaseUrl = window.location.origin;
                this.generatedInviteLink = `${appBaseUrl}?invite_token=${inviteToken}`;
                this.generatedInviteToken = inviteToken;
                
                // Create message template
                const bandName = this.currentBandName || 'my band';
                this.inviteMessageTemplate = `Join my band on Roady!\n\n${this.generatedInviteLink}\n\nClick the link above to accept the invitation and start collaborating with ${bandName}.`;
                
                // Show link sharing dialog
                this.showInviteMemberDialog = false;
                this.showGeneratedInviteLink = true;
                
                console.log('✅ Invitation link generated');
            } catch (e) {
                console.error('Error inviting member:', e);
                // Distinguish network errors from server errors
                if (e instanceof TypeError) {
                    // Network error (no connection, CORS, etc)
                    console.error('Network error - cannot reach server');
                    this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                } else {
                    // HTTP error or other
                    this.showSnackbar('Error generating invitation: ' + e.message, 'error');
                }
            }
        },

        resetInviteForm() {
            this.inviteMemberEmail = '';
            this.inviteMemberRole = 'editor';
            this.generatedInviteLink = '';
            this.generatedInviteToken = '';
            this.inviteMessageTemplate = '';
        },

        async copyInviteLink() {
            try {
                await navigator.clipboard.writeText(this.generatedInviteLink);
                this.inviteCopied = true;
                setTimeout(() => {
                    this.inviteCopied = false;
                }, 2000);
                console.log('✅ Invite link copied to clipboard');
            } catch (e) {
                console.error('Failed to copy invite link:', e);
                this.showSnackbar('Failed to copy link', 'error');
            }
        },

        async copyInviteMessage() {
            try {
                await navigator.clipboard.writeText(this.inviteMessageTemplate);
                this.messageCopied = true;
                setTimeout(() => {
                    this.messageCopied = false;
                }, 2000);
                console.log('✅ Invite message copied to clipboard');
            } catch (e) {
                console.error('Failed to copy invite message:', e);
                this.showSnackbar('Failed to copy message', 'error');
            }
        },

        async confirmRemoveMember(member) {
            const memberEmail = member.email || member.name || 'Unknown User';
            const confirmed = await this.showConfirmation(
                'Remove Member',
                `Are you sure you want to remove ${memberEmail} from ${this.currentBandName}?`,
                'Remove',
                true
            );

            if (confirmed) {
                await this.removeMember(member);
            }
        },

        async removeMember(member) {
             try {
                 const tenantId = this.currentBandTenantId.startsWith('tenant_')
                     ? this.currentBandTenantId
                     : `tenant_${this.currentBandTenantId}`;
                 const userId = member.userId;
                 const baseUrl = this.options.mycouchBaseUrl.replace(/\/$/, '');
                 const response = await window.Auth.fetchWithAuth(
                    `${baseUrl}/api/tenants/${tenantId}/members/${userId}`,
                    { method: 'DELETE' },
                );

                if (!response.ok) {
                    if (response.status === 403) {
                        this.showSnackbar('You do not have permission to remove members', 'error');
                    } else {
                        const error = await response.json();
                        throw new Error(error.detail || 'Failed to remove member');
                    }
                    return;
                }

                // Remove from local list
                this.currentBandMembers = this.currentBandMembers.filter(m => m.userId !== userId);

                const memberEmail = member.email || member.name || 'Unknown User';
                this.showSnackbar(`Removed ${memberEmail} from the band`);
                console.log('✅ Member removed:', userId);

                // Reload band details to sync
                await this.loadBandMembers();
            } catch (e) {
                console.error('Error removing member:', e);
                // Distinguish network errors from server errors
                if (e instanceof TypeError) {
                    // Network error (no connection, CORS, etc)
                    console.error('Network error - cannot reach server');
                    this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                } else {
                    // HTTP error or other
                    this.showSnackbar('Error removing member: ' + e.message, 'error');
                }
            }
        },

        async confirmLeaveBand() {
            const currentBand = this.userBands.find(b => b._id === this.currentBandTenantId || b.tenantId === this.currentBandTenantId);
            const bandName = currentBand?.name || 'Unknown Band';

            const confirmed = await this.showConfirmation(
                'Leave Band',
                `Are you sure you want to leave "${bandName}"? You will lose access to all equipment and gigs in this band.`,
                'Leave Band',
                true  // danger style
            );

            if (confirmed) {
                await this.leaveBand();
            }
        },

        async leaveBand() {
            try {
                const bandToLeave = this.userBands.find(
                    b => b._id === this.currentBandTenantId || b.tenantId === this.currentBandTenantId,
                );
                const leavingBandName = bandToLeave?.name || 'Unknown Band';

                try {
                    await window.tenantManager.leaveTenant(this.currentBandTenantId);
                } catch (e) {
                    if (e.message?.includes('403')) {
                        this.showSnackbar('Owners cannot leave. Transfer ownership or delete the band.', 'error');
                        return;
                    }
                    throw e;
                }

                // Remove from local list
                this.userBands = this.userBands.filter(
                    b => b._id !== this.currentBandTenantId && b.tenantId !== this.currentBandTenantId,
                );

                // Switch to first available band
                if (this.userBands.length > 0) {
                    this.currentBandTenantId = this.userBands[0]._id;
                    this.updateCurrentBandName();
                    DB.setTenant(this.userBands[0]._id);
                    await this.loadData();
                    await this.loadBandDetails();
                } else {
                    this.currentBandTenantId = null;
                    this.currentBandName = '';
                }

                this.showSnackbar(`Left "${leavingBandName}"`);
                console.log('✅ Successfully left band:', leavingBandName);
            } catch (e) {
                console.error('Error leaving band:', e);
                if (e instanceof TypeError) {
                    this.showSnackbar('Cannot reach server. Please check your internet connection.', 'error');
                } else {
                    this.showSnackbar('Error leaving band: ' + e.message, 'error');
                }
            }
        },

        async openDeleteBandConfirmationForBand(band) {
            // Get the band name directly from the band object passed to us
            const bandNameToDelete = band.bandName || 'Unknown Band';
            
            // Set the band to delete (use _id from virtual endpoint)
            this.currentBandTenantId = band._id || band.tenantId;
            
            const confirmed = await this.showConfirmation(
                'Delete Band',
                `Are you sure you want to delete "${bandNameToDelete}"? This will permanently delete all equipment and gigs in this band. This action cannot be undone.`,
                'Delete Band',
                true
            );
            
            if (confirmed) {
                await this.deleteBand();
            }
        },

        async openDeleteBandConfirmation() {
            const confirmed = await this.showConfirmation(
                'Delete Band',
                `Are you sure you want to delete "${this.currentBandName}"? This will permanently delete all equipment and gigs in this band. This action cannot be undone.`,
                'Delete Band',
                true
            );
            
            if (confirmed) {
                await this.deleteBand();
            }
        },

        async deleteBand() {
            try {
                const bandToDelete = this.userBands.find(b => b._id === this.currentBandTenantId);
                const deletedBandName = bandToDelete?.bandName || bandToDelete?.name || 'Unknown Band';

                // Server-side cascade: DELETE /api/tenants/:tid removes the
                // tenant document; equipment/gigs/templates in that tenant
                // become orphans in D1 but are invisible to clients because
                // the DAL filters by `currentTenant`. If/when orphan GC is
                // needed it lives on the server, not the client.
                await window.tenantManager.deleteTenant(this.currentBandTenantId);

                // Update UI
                this.userBands = this.userBands.filter(b => b._id !== this.currentBandTenantId);
                if (this.userBands.length > 0) {
                    this.currentBandTenantId = this.userBands[0]._id;
                    this.updateCurrentBandName();
                    DB.setTenant(this.userBands[0]._id);
                    await this.loadData();
                    await this.loadBandDetails();
                } else {
                    this.currentBandTenantId = null;
                    this.currentBandName = '';
                }

                this.showSnackbar(`Band "${deletedBandName}" has been deleted`);
            } catch (e) {
                console.error('Error deleting band:', e);
                this.showSnackbar('Error deleting band. Changes not saved.', 'error');
            }
        }
    }));
});
