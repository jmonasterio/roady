// Tenant Management Service
// Handles tenant detection, selection, and JWT metadata management

class TenantManager {
    constructor(mycouchBaseUrl = null) {
        // Get URL from app settings (stored in IndexDB) or fallback to localhost for dev
        this.mycouchBaseUrl = mycouchBaseUrl || this.getMycouchUrl();
        this.currentTenant = null;
        this.tenantList = [];
        this.currentUserSub = null; // Clerk sub (user_<hash>)
        this.currentUserHash = null; // SHA256 hash of sub for API calls
        
        // Phase 1: PouchDB for user/tenant data
        this.usersDb = null; // Will hold replicated user docs
        this.tenantsDb = null; // Will hold replicated tenant docs (shares 'roady' database)
        this.localUserDoc = null; // Cached local user document
        
        // Phase 3: Change listeners and polling
        this.userChangesPoller = null; // Polling interval handle for user changes
        this.tenantChangesPoller = null; // Polling interval handle for tenant changes
        this.lastUserChangeSeq = 0; // Track last seen user change sequence
        this.lastTenantChangeSeq = 0; // Track last seen tenant change sequence
        this.changeCallbacks = []; // Callbacks to notify when changes occur
    }

    /**
     * Get MyCouch URL from app settings (IndexDB) or use stored value
     * App loads settings from IndexDB and stores in Alpine state
     */
    getMycouchUrl() {
        try {
            // Try to get from Alpine app instance (if it's been set up)
            if (window.Alpine && window.Alpine.store) {
                const store = window.Alpine.store('roady');
                if (store && store.options && store.options.mycouchBaseUrl) {
                    console.log('📍 Using MyCouch URL from app settings:', store.options.mycouchBaseUrl);
                    return store.options.mycouchBaseUrl;
                }
            }
        } catch (error) {
            // Alpine store might not be ready yet
        }
        
        // Return the stored URL from constructor (TenantManager was initialized with it)
        if (this.mycouchBaseUrl) {
            console.log('📍 Using stored MyCouch URL:', this.mycouchBaseUrl);
            return this.mycouchBaseUrl;
        }
        
        // No URL available - this is a configuration error
        console.error('❌ MyCouch URL not configured. TenantManager must be initialized with a URL.');
        throw new Error('MyCouch URL not available. Check your app configuration.');
    }

    /**
     * Hash a user ID (Clerk sub) using SHA256
     * Matches backend hashing: sha256("user_34tzJwWB3jaQT6ZKPqZIQoJwsmz")
     */
    async hashUserId(sub) {
        const encoder = new TextEncoder();
        const data = encoder.encode(sub);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    /**
     * Phase 1: Initialize PouchDB for local user document storage
     * Fetches user doc from MyCouch virtual endpoint and stores locally
     * Watches for changes via polling (Phase 3 will add real-time listeners)
     */
    async initializePouchDBReplication() {
        try {
            console.log('🔄 Phase 1: Initializing PouchDB user document storage...');
            
            // Open local 'users' database (separate from 'roady' which handles tenants/equipment)
            this.usersDb = new PouchDB('users');
            console.log('✅ Local users database created/opened');
            
            // Also get reference to 'roady' database for tenant replication (Phase 2)
            // This is opened by DB.js but we'll use it for tenant queries
            // Use staging database on localhost
            const dbName = window.location.hostname === 'localhost' ? 'roady-staging' : 'roady';
            this.tenantsDb = new PouchDB(dbName);
            
            // Fetch initial user doc from MyCouch virtual endpoint
            // MyCouch: GET /__users/{hash} → returns user document
            const jwt = await this.getClerkToken();
            if (!jwt) {
                throw new Error('No JWT token available for fetching user doc');
            }
            
            // Don't fetch from server - read from local PouchDB only
            // PouchDB sync will populate user doc when connected
            try {
                const localUserDoc = await this.usersDb.get(`user_${this.currentUserHash}`);
                console.log('✅ User document exists in local PouchDB');
            } catch (error) {
                if (error.status === 404) {
                    // User doc doesn't exist yet - that's ok, will be created on sync
                    console.log('ℹ️ User document not in local PouchDB yet (will sync when connected)');
                } else {
                    console.warn('⚠️ Error checking user document:', error);
                }
            }
            
            // TODO Phase 3: Start periodic polling of /__users/_changes endpoint
            // TODO Phase 3: Listen for active_tenant_id changes and update locally
            
            console.log('✅ PouchDB user document storage initialized');
        } catch (error) {
            console.error('❌ Failed to initialize PouchDB:', error);
            throw error;
        }
    }

    /**
     * Load user document from local PouchDB
     * Returns user doc with active_tenant_id
     */
    async loadLocalUserDoc() {
        try {
            if (!this.usersDb) {
                console.warn('⚠️ Users database not initialized');
                return null;
            }
            
            // User doc is stored as "user_{hash}" in CouchDB
            const docId = `user_${this.currentUserHash}`;
            try {
                this.localUserDoc = await this.usersDb.get(docId);
                console.log('✅ Loaded local user doc:', {
                    _id: this.localUserDoc._id,
                    active_tenant_id: this.localUserDoc.active_tenant_id
                });
                return this.localUserDoc;
            } catch (error) {
                if (error.status === 404) {
                    console.warn('⚠️ User document not found locally yet, creating empty doc');
                    // Create empty user doc for offline capability
                    this.localUserDoc = {
                        _id: docId,
                        type: 'user',
                        createdAt: new Date().toISOString()
                    };
                    return this.localUserDoc;
                }
                throw error;
            }
        } catch (error) {
            console.error('❌ Error loading local user doc:', error);
            return null;
        }
    }

    /**
     * Get active tenant ID from local user doc (Phase 1 source of truth)
     * Falls back to JWT if local doc not available
     */
    async getActiveTenantIdFromLocalDoc() {
        if (this.localUserDoc && this.localUserDoc.active_tenant_id) {
            console.log('📖 Reading active_tenant_id from local user doc:', this.localUserDoc.active_tenant_id);
            return this.localUserDoc.active_tenant_id;
        }
        
        // Fallback to JWT
        const jwt = await this.getClerkToken();
        if (!jwt) {
            console.log('⚠️ No JWT available, cannot get active tenant from fallback');
            return null;
        }
        const activeTenantFromJWT = this.extractActiveTenantIdFromJWT(jwt);
        console.log('📖 Reading active_tenant_id from JWT fallback:', activeTenantFromJWT);
        return activeTenantFromJWT;
    }

    /**
     * Phase 3: Register callback for when data changes
     * Callback will be called whenever user or tenant documents change
     */
    onChanges(callback) {
        if (typeof callback === 'function') {
            this.changeCallbacks.push(callback);
            console.log('📡 Registered change callback');
        }
    }

    /**
     * Phase 3: Notify all registered callbacks of changes
     */
    notifyChanges() {
        console.log('🔔 Notifying listeners of changes');
        this.changeCallbacks.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('❌ Error in change callback:', error);
            }
        });
    }

    /**
     * Phase 3 (DEPRECATED): Start polling for user document changes
     * 
     * DEPRECATED: PouchDB.sync() handles all replication. Polling is no longer called.
     * Kept for reference only. If real-time notifications needed in future, use db.changes().
     * 
     * Polls /__users/_changes endpoint periodically
     */
    async startUserChangesPolling(intervalMs = 5000) {
        if (this.userChangesPoller) {
            console.log('⚠️ User changes polling already running');
            return;
        }

        console.log(`🔄 Starting user changes polling (${intervalMs}ms interval)`);
        
        // Initial poll
        await this.pollUserChanges();
        
        // Set up recurring polls
        this.userChangesPoller = setInterval(() => {
            this.pollUserChanges().catch(error => {
                console.error('❌ User polling error:', error);
            });
        }, intervalMs);
    }

    /**
     * Phase 3: Poll for user document changes
     */
    async pollUserChanges() {
        try {
            // Refresh URL from settings in case it changed
            this.mycouchBaseUrl = this.getMycouchUrl();
            
            const jwt = await this.getClerkToken();
            if (!jwt) return;

            const baseUrl = this.mycouchBaseUrl.endsWith('/') ? this.mycouchBaseUrl.slice(0, -1) : this.mycouchBaseUrl;
            const url = `${baseUrl}/__users/_changes?since=${this.lastUserChangeSeq}&include_docs=true`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn(`⚠️ User changes poll failed: ${response.status}`);
                return;
            }

            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                return; // No changes
            }

            console.log(`📨 User changes detected: ${data.results.length}`);
            
            // Process each change
            let hasChanges = false;
            for (const change of data.results) {
                if (change.doc && change.doc.type === 'user') {
                    // Update local user doc
                    const docId = change.doc._id || `user_${this.currentUserHash}`;
                    change.doc._id = docId;
                    await this.usersDb.put(change.doc);
                    this.localUserDoc = change.doc;
                    console.log(`✅ Updated user doc: ${docId}`);
                    hasChanges = true;
                }
                // Track sequence for next poll
                if (change.seq) {
                    this.lastUserChangeSeq = change.seq;
                }
            }

            if (hasChanges) {
                this.notifyChanges();
            }
        } catch (error) {
            console.error('❌ Error polling user changes:', error);
        }
    }

    /**
     * Phase 3 (DEPRECATED): Start polling for tenant document changes
     * 
     * DEPRECATED: PouchDB.sync() handles all replication. Polling is no longer called.
     * Kept for reference only. If real-time notifications needed in future, use db.changes().
     * 
     * Polls /__tenants/_changes endpoint periodically
     */
    async startTenantChangesPolling(intervalMs = 5000) {
        if (this.tenantChangesPoller) {
            console.log('⚠️ Tenant changes polling already running');
            return;
        }

        console.log(`🔄 Starting tenant changes polling (${intervalMs}ms interval)`);
        
        // Initial poll
        await this.pollTenantChanges();
        
        // Set up recurring polls
        this.tenantChangesPoller = setInterval(() => {
            this.pollTenantChanges().catch(error => {
                console.error('❌ Tenant polling error:', error);
            });
        }, intervalMs);
    }

    /**
     * Phase 3: Poll for tenant document changes
     */
    async pollTenantChanges() {
        try {
            // Refresh URL from settings in case it changed
            this.mycouchBaseUrl = this.getMycouchUrl();
            
            const jwt = await this.getClerkToken();
            if (!jwt) return;

            // Remove trailing slash from mycouchBaseUrl if present
            const baseUrl = this.mycouchBaseUrl.replace(/\/$/, '');
            const url = `${baseUrl}/__tenants/_changes?since=${this.lastTenantChangeSeq}&include_docs=true`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn(`⚠️ Tenant changes poll failed: ${response.status}`);
                return;
            }

            const data = await response.json();
            if (!data.results || data.results.length === 0) {
                return; // No changes
            }

            console.log(`📨 Tenant changes detected: ${data.results.length}`);
            
            // Process each change
            let hasChanges = false;
            for (const change of data.results) {
                if (change.doc) {
                    // Handle tenant changes
                    if (change.doc.type === 'tenant') {
                         const docId = change.doc._id || `tenant_${change.doc.id}`;
                         change.doc._id = docId;
                         
                         if (change.deleted) {
                             // Document was hard-deleted from server
                             // Remove from local DB to match server state
                             try {
                                 await this.tenantsDb.remove(change.doc);
                                 console.log(`🗑️ Removed hard-deleted tenant from local DB: ${docId}`);
                             } catch (e) {
                                 console.warn(`⚠️ Failed to remove hard-deleted tenant from local DB: ${e.message}`);
                             }
                         } else {
                             // Document updated (or soft-deleted with deletedAt field)
                             console.log(`✅ Updated tenant: ${docId}`);
                             await this.tenantsDb.put(change.doc);
                         }
                         hasChanges = true;
                     }
                }
                // Track sequence for next poll
                if (change.seq) {
                    this.lastTenantChangeSeq = change.seq;
                }
            }

            if (hasChanges) {
                this.notifyChanges();
            }
        } catch (error) {
            console.error('❌ Error polling tenant changes:', error);
        }
    }

    /**
     * Phase 3 (DEPRECATED): Stop all change polling
     * 
     * No longer called since polling is not started.
     */
    stopChangesPolling() {
        if (this.userChangesPoller) {
            clearInterval(this.userChangesPoller);
            this.userChangesPoller = null;
            console.log('⏸️ User changes polling stopped');
        }

        if (this.tenantChangesPoller) {
            clearInterval(this.tenantChangesPoller);
            this.tenantChangesPoller = null;
            console.log('⏸️ Tenant changes polling stopped');
        }
    }

    /**
     * Initialize tenant context after Clerk login
     * This is the critical flow: /__tenants -> pick first -> /__users/<id> -> JWT refresh
     */
    async initializeTenantContext() {
        try {
            console.log('🍊 Initializing tenant context...');

            // Step 0: Extract user ID from JWT and hash it for API calls
            const jwt = await this.getClerkToken();
            const sub = this.extractUserIdFromJWT(jwt);
            if (!sub) {
                throw new Error('Cannot extract user ID from JWT - missing sub claim');
            }
            // Store both the original sub and the hashed version
            this.currentUserSub = sub;
            this.currentUserHash = await this.hashUserId(sub);
            console.log(`👤 Current user ID (hash): ${this.currentUserHash}`);

            // Step 0.5: Initialize PouchDB replication (Phase 1)
            // This must happen before we try to read the local user doc
            try {
                await this.initializePouchDBReplication();
                // Wait a moment for initial sync to complete
                await new Promise(resolve => setTimeout(resolve, 500));
                await this.loadLocalUserDoc();
            } catch (error) {
                console.warn('⚠️ PouchDB replication failed, falling back to HTTP:', error);
                // Continue with HTTP fetching - PouchDB optional for Phase 1
            }

            // Step 1: Initialize Phase 2 tenant replication
            // This fetches and stores tenants in local PouchDB
            try {
                await this.initializeTenantsReplication();
            } catch (error) {
                console.warn('⚠️ Tenant replication initialization failed, will fetch from server', error);
                // Continue - getMyTenants() will fall back to server
            }

            // Step 1b: Get all user's tenants (Phase 2: from local, falls back to server)
            let tenantList = await this.getMyTenants();
            this.tenantList = tenantList || [];

            console.log(`📋 Found ${this.tenantList.length} tenants:`, this.tenantList);
            
            // Step 1c: Create personal tenant if this is first run (no tenants yet)
            if (this.tenantList.length === 0) {
                console.log('📍 First run - creating personal tenant for user');
                try {
                    const personalTenantId = crypto.randomUUID();
                    const userName = Clerk?.user?.firstName || Clerk?.user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'User';
                    
                    const personalTenant = {
                        _id: `tenant_${personalTenantId}`,
                        type: 'tenant',
                        tenantId: personalTenantId,
                        name: `${userName}'s Band`,
                        userIds: [`user_${this.currentUserHash}`],
                        createdAt: new Date().toISOString(),
                        syncedAt: null
                    };
                    
                    // Store in local PouchDB
                    if (this.tenantsDb) {
                        await this.tenantsDb.put(personalTenant);
                        console.log('✅ Created personal tenant in local PouchDB:', personalTenant);
                        this.tenantList = [personalTenant];
                    }
                } catch (error) {
                    console.error('❌ Failed to create personal tenant:', error);
                    // Continue without personal tenant - user can create one manually
                }
            }

            // Step 2: Select active tenant
            // Priority: 1) Local user doc (Phase 1), 2) JWT claim, 3) First tenant
            let selectedTenant = null;

            // First, try to use active_tenant_id from local user doc (Phase 1 source of truth)
            const activeTenantIdFromLocal = await this.getActiveTenantIdFromLocalDoc();
            console.log(`🔍 Active tenant ID from local doc:`, activeTenantIdFromLocal, typeof activeTenantIdFromLocal);
            
            if (activeTenantIdFromLocal && typeof activeTenantIdFromLocal === 'string') {
                // Map internal ID (tenant_xxx) to virtual ID (xxx)
                const virtualTenantId = activeTenantIdFromLocal.startsWith('tenant_')
                    ? activeTenantIdFromLocal.substring(7)
                    : activeTenantIdFromLocal;
                selectedTenant = this.tenantList.find(t => t._id === activeTenantIdFromLocal || t._id === virtualTenantId);
                if (selectedTenant) {
                    console.log(`🎯 Using active tenant from local doc: ${selectedTenant.name} (${selectedTenant._id})`);
                }
            }

            // Fall back to JWT if local doc doesn't have it
            if (!selectedTenant) {
                const activeTenantIdFromJWT = this.extractActiveTenantIdFromJWT(jwt);
                if (activeTenantIdFromJWT) {
                    const virtualTenantId = activeTenantIdFromJWT.startsWith('tenant_')
                        ? activeTenantIdFromJWT.substring(7)
                        : activeTenantIdFromJWT;
                    selectedTenant = this.tenantList.find(t => t._id === activeTenantIdFromJWT || t._id === virtualTenantId);
                    if (selectedTenant) {
                        console.log(`🎯 Using active tenant from JWT: ${selectedTenant.name} (${selectedTenant._id})`);
                    }
                }
            }

            // If no active tenant, just use the first one
            if (!selectedTenant && this.tenantList.length > 0) {
                selectedTenant = this.tenantList[0];
                console.log(`🎯 Using first available tenant: ${selectedTenant.name} (${selectedTenant._id})`);
            }

            // If still no tenant found, this is an error condition
            if (!selectedTenant) {
                console.error('❌ No tenants available for user');
                console.error('Available tenants:', this.tenantList);
                throw new Error('No tenants available. Please contact support or try signing in again.');
            }

            this.currentTenant = selectedTenant;

            // Step 3: Sync active tenant to MyCouch (session document is source of truth)
            const virtualTenantId = selectedTenant._id.startsWith('tenant_') 
                ? selectedTenant._id.substring(7) 
                : selectedTenant._id;
            try {
                await this.syncActiveTenantToServer(this.currentUserHash, virtualTenantId);
            } catch (error) {
                console.warn('⚠️ Could not sync to MyCouch at initialization:', error.message);
                // Continue offline - app will work with local PouchDB data
                // Next polling cycle will complete the sync
            }

            // Step 4: Polling removed - PouchDB sync handles all data replication
            // Phase 3 polling code is kept but not called. PouchDB.sync() provides continuous bidirectional sync.
            // If real-time change notifications are needed in future, use PouchDB's db.changes() instead of HTTP polling.
            
            console.log('✅ Tenant context initialized successfully');
            return selectedTenant;

        } catch (error) {
            console.error('❌ Failed to initialize tenant context:', error);
            throw error;
        }
    }

    /**
     * Phase 2: Initialize tenant document replication
     * Reads tenants from local 'roady' PouchDB
     * PouchDB syncs with MyCouch in the background - app always reads from local
     */
    async initializeTenantsReplication() {
        try {
            console.log('🔄 Phase 2: Initializing tenant document access (reading from local PouchDB)...');
            
            if (!this.tenantsDb) {
                console.warn('⚠️ Tenants database not available');
                return [];
            }
            
            // Read tenants from local PouchDB
            // PouchDB sync will populate this automatically when connected to MyCouch
            const tenants = await this.getMyTenantsFromLocal();
            
            if (!tenants || tenants.length === 0) {
                console.log('ℹ️ No tenants in local database yet (will sync when connected)');
                return [];
            }
            
            console.log(`✅ Loaded ${tenants.length} tenants from local PouchDB`);
            return tenants;
        } catch (error) {
            console.error('❌ Failed to initialize tenant replication:', error);
            throw error;
        }
    }

    /**
     * Phase 2: Query tenants from local PouchDB
     * Returns tenants stored locally (source of truth after Phase 2)
     */
    async getMyTenantsFromLocal() {
        try {
            if (!this.tenantsDb) {
                console.warn('⚠️ Tenants database not available');
                return [];
            }
            
            // Query all documents where type === 'tenant'
            const result = await this.tenantsDb.allDocs({
                include_docs: true,
                startkey: 'tenant_',
                endkey: 'tenant_\uffff'
            });
            
            const tenants = result.rows
                .map(row => row.doc)
                .filter(doc => doc && doc.type === 'tenant' && !doc.deletedAt);
            
            console.log(`✅ Loaded ${tenants.length} tenants from local PouchDB`);
            return tenants;
        } catch (error) {
            console.error('❌ Failed to load tenants from local PouchDB:', error);
            return [];
        }
    }

    /**
     * Get all tenants from server (HTTP fetch)
     * This is still used in Phase 2 for initial fetch
     * Phase 3 will add polling for updates
     */
    async getMyTenantsFromServer() {
        console.log('🔍 Fetching user tenants from server...');

        // Refresh URL from settings in case it changed
        this.mycouchBaseUrl = this.getMycouchUrl();

        const jwt = await this.getClerkToken();
        console.log('🔑 Got JWT token:', jwt ? `${jwt.substring(0, 20)}...` : 'NULL');

        if (!jwt) {
            throw new Error('No JWT token available - user not authenticated');
        }

        // Remove trailing slash from mycouchBaseUrl if present
        const baseUrl = this.mycouchBaseUrl.replace(/\/$/, '');
        const url = `${baseUrl}/__tenants`;
        console.log('📡 Making request to:', url);

        try {
            console.log('📡 Calling fetch (2s timeout for fast failure)...');
            
            // Use AbortController for timeout - shorter timeout to fail fast
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s - fail fast on network errors
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Content-Type': 'application/json'
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            console.log('📡 Fetch completed, status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Request failed:', response.status, errorText);
                throw new Error(`Failed to get tenants (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            console.log('✅ Retrieved tenant list from server:', data);
            
            // Virtual endpoint returns array of tenant documents directly
            return Array.isArray(data) ? data : data.docs || [];
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('⚠️ Tenant loading timeout: network may be slow or MyCouch unavailable');
            } else if (error instanceof TypeError) {
                console.error('❌ Network error fetching tenants (no connection or CORS issue):', error.message);
            } else {
                console.error('❌ Error fetching tenants from server:', error);
            }
            throw error;
        }
    }

    /**
     * Get all tenants (reads from local PouchDB only)
     * This is the main entry point for getting tenant list
     * PouchDB sync handles fetching from server in background
     */
    async getMyTenants() {
        try {
            // Always read from local PouchDB
            // PouchDB sync will populate this automatically when connected
            const localTenants = await this.getMyTenantsFromLocal();
            if (localTenants.length > 0) {
                console.log(`📖 Using ${localTenants.length} tenants from local PouchDB`);
                return localTenants;
            }
            
            console.log('⚠️ No tenants in local PouchDB yet (first run or offline)');
            // Return empty array - sync will populate data when connected
            // App will show empty state instead of trying to fetch from server
            return [];
        } catch (error) {
            console.error('❌ Failed to read tenants from local PouchDB:', error);
            throw error;
        }
    }

    /**
     * Sync active tenant to MyCouch session document
     * 
     * Backend creates/updates a session document with the active_tenant_id.
     * Each device/session maintains its own active_tenant_id independently.
     * 
     * PUT /__users/{id} with { active_tenant_id } triggers:
     * 1. Backend extracts sid from JWT
     * 2. Creates/updates session document: session_<sid>
     * 3. Returns updated user document
     * 
     * Session document is source of truth (not JWT claims).
     */
    async syncActiveTenantToServer(hashedUserId, virtualTenantId) {
        try {
            // Refresh MyCouch URL from app settings in case it was changed
            this.mycouchBaseUrl = this.getMycouchUrl();
            
            const jwt = await this.getClerkToken();
            if (!jwt) {
                console.warn('⚠️ No JWT available for sync');
                throw new Error('No JWT token available');
            }

            console.log(`🔄 Syncing active tenant to MyCouch for user ${hashedUserId}`);
            
            // Send internal user ID format (user_<hash>)
            const internalUserId = `user_${hashedUserId}`;
            const baseUrl = this.mycouchBaseUrl.endsWith('/') ? this.mycouchBaseUrl.slice(0, -1) : this.mycouchBaseUrl;
            const response = await fetch(`${baseUrl}/__users/${internalUserId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ active_tenant_id: virtualTenantId })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ MyCouch sync failed: ${response.status} - ${errorText}`);
                throw new Error(`MyCouch returned ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            console.log('✅ MyCouch created/updated session document with active_tenant_id:', virtualTenantId);
            
            // Session document is the source of truth for per-device tenant tracking
            return { success: true, activeTenantId: virtualTenantId };
        } catch (error) {
            if (error instanceof TypeError) {
                console.error('❌ Network error syncing to MyCouch (no connection or CORS issue):', error.message);
            } else {
                console.error('❌ Failed to sync active tenant to MyCouch:', error.message);
            }
            throw error;
        }
    }



    /**
     * Extract user ID from JWT (from 'sub' claim)
     */
    extractUserIdFromJWT(jwt) {
        try {
            if (!jwt) return null;
            const parts = jwt.split('.');
            if (parts.length !== 3) return null;
            
            const payload = JSON.parse(atob(parts[1]));
            return payload.sub;
        } catch (error) {
            console.error('Error extracting user ID from JWT:', error);
            return null;
        }
    }

    /**
     * Extract active_tenant_id from JWT claim
     */
    extractActiveTenantIdFromJWT(jwt) {
        try {
            if (!jwt) return null;
            const parts = jwt.split('.');
            if (parts.length !== 3) return null;
            
            const payload = JSON.parse(atob(parts[1]));
            return payload.active_tenant_id;
        } catch (error) {
            console.error('Error extracting active_tenant_id from JWT:', error);
            return null;
        }
    }

    /**
     * Get Clerk JWT token
     */
    async getClerkToken() {
        try {
            if (!window.Clerk?.isSignedIn) {
                console.warn('User not signed in with Clerk');
                return null;
            }

            // Use default session token (must be configured in Clerk Dashboard)
            const jwt = await window.Clerk.session.getToken();
            return jwt;
        } catch (error) {
            console.error('Error getting Clerk token:', error);
            return null;
        }
    }

    /**
     * Get current tenant
     */
    getCurrentTenant() {
        return this.currentTenant;
    }

    /**
     * Get all available tenants
     */
    getTenantList() {
        return this.tenantList;
    }

    /**
     * Switch to a different tenant
     * Design B: Local write first, then synchronous MyCouch sync
     * 
     * 1. Write to local PouchDB (required, offline-first)
     * 2. Sync to MyCouch (required for JWT claim)
     * 3. Continue offline gracefully if MyCouch fails
     */
    async switchTenant(tenantId) {
        console.log(`🔄 Switching to tenant: ${tenantId}`);

        // Try to find tenant in cached list
        const tenant = this.tenantList.find(t => t._id === tenantId || t._id === `tenant_${tenantId}`);
        
        // If not found in list, refresh the list and try again
        if (!tenant) {
            console.warn('⚠️ Tenant not in cached list, refreshing...');
            try {
                this.tenantList = await this.getMyTenants();
                const refreshedTenant = this.tenantList.find(t => t._id === tenantId || t._id === `tenant_${tenantId}`);
                if (!refreshedTenant) {
                    throw new Error(`Tenant ${tenantId} not found in user's tenant list`);
                }
                await this.syncActiveTenantToServer(this.currentUserHash, this.extractVirtualTenantId(refreshedTenant._id));
                this.currentTenant = refreshedTenant;
                console.log(`✅ Switched to tenant: ${refreshedTenant.name}`);
                return refreshedTenant;
            } catch (error) {
                console.error('❌ Failed to switch tenant:', error.message);
                throw error;
            }
        }

        // Step 1: Sync to MyCouch (session document stores active_tenant_id per-device)
        const virtualTenantId = this.extractVirtualTenantId(tenant._id);
        try {
            console.log('🔄 Syncing active tenant to MyCouch...');
            const syncResult = await this.syncActiveTenantToServer(this.currentUserHash, virtualTenantId);
            console.log('✅ MyCouch sync completed:', syncResult);
            
            // Successfully synced
            this.currentTenant = tenant;
            console.log(`✅ Switched to tenant: ${tenant.name}`);
            return tenant;
        } catch (error) {
            // MyCouch failed - continue with local data
            console.warn('⚠️ MyCouch sync failed:', error.message);
            
            // Update current tenant anyway (graceful offline fallback)
            this.currentTenant = tenant;
            console.log(`✅ Switched to tenant locally: ${tenant.name} (offline mode)`);
            console.log('💡 Will sync to server when network available');
            
            // Return success - app continues with local data
            // Session document will be created/updated when network reconnects
            return tenant;
        }
    }
    
    /**
     * Extract virtual tenant ID from internal ID
     * Strips "tenant_" prefix if present
     */
    extractVirtualTenantId(tenantId) {
        return tenantId.startsWith('tenant_') ? tenantId.substring(7) : tenantId;
    }

    /**
     * Validate tenant format in user.tenants array
     * 
     * CRITICAL: Detects when full tenant documents are incorrectly assigned to user.tenants
     * See INVITATION_ACCEPTANCE_CODE_REVIEW.md for details on data corruption bug.
     * 
     * Correct format for user.tenants entry:
     * {
     *   tenantId: "<uuid>",    // Virtual format without "tenant_" prefix
     *   role: "member",        // Role for this user in this tenant
     *   personal: false,       // Whether this is user's personal tenant
     *   joinedAt: "2025-01-12T...",  // When user joined
     *   userIds: [...]         // Copy of tenant's member list
     * }
     * 
     * WRONG format (full tenant document):
     * {
     *   _id: "tenant_<uuid>",  // ← Wrong! Should not have _id
     *   type: "tenant",        // ← Wrong! Should not have type
     *   name: "Band Name",     // ← Wrong! Should not have name at top level
     *   userIds: [...],
     *   createdAt: "...",
     *   members: [...]         // ← Wrong! Should not have members array
     * }
     */
    validateUserTenantsFormat(userDoc) {
        if (!userDoc || !userDoc.tenants) {
            return { valid: true, errors: [] };
        }

        const errors = [];
        for (let i = 0; i < userDoc.tenants.length; i++) {
            const entry = userDoc.tenants[i];
            
            // Check for signs of full tenant document corruption
            if (entry._id) {
                errors.push(`Entry ${i}: Has _id field (indicates full tenant document corruption)`);
            }
            if (entry.type === 'tenant') {
                errors.push(`Entry ${i}: Has type='tenant' field (indicates full tenant document corruption)`);
            }
            if (entry.members && Array.isArray(entry.members)) {
                errors.push(`Entry ${i}: Has members array (indicates full tenant document corruption)`);
            }
            if (entry.createdAt && !entry.joinedAt) {
                errors.push(`Entry ${i}: Has createdAt but no joinedAt (indicates full tenant document corruption)`);
            }
            
            // Check for missing required fields
            if (!entry.tenantId) {
                errors.push(`Entry ${i}: Missing tenantId field`);
            }
            if (!entry.role) {
                errors.push(`Entry ${i}: Missing role field`);
            }
            if (entry.personal === undefined) {
                errors.push(`Entry ${i}: Missing personal field`);
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Log validation errors with context
     * Used to detect data corruption early
     */
    logValidationErrors(validation) {
        if (!validation.valid) {
            console.error('❌ CRITICAL: user.tenants format validation FAILED');
            console.error('This indicates data corruption from assigning full tenant documents');
            console.error('to user.tenants array. See INVITATION_ACCEPTANCE_CODE_REVIEW.md');
            validation.errors.forEach(error => console.error(`  - ${error}`));
            return false;
        }
        return true;
    }
}

// Export for global use
window.TenantManager = TenantManager;