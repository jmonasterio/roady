// Tenant Management Service
// Handles tenant detection, selection, and JWT metadata management

class TenantManager {
    constructor() {
        this.mycouchBaseUrl = 'http://localhost:5985'; // MyCouch proxy
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
            this.tenantsDb = new PouchDB('roady');
            
            // Fetch initial user doc from MyCouch virtual endpoint
            // MyCouch: GET /__users/{hash} → returns user document
            const jwt = await this.getClerkToken();
            if (!jwt) {
                throw new Error('No JWT token available for fetching user doc');
            }
            
            try {
                const userDocResponse = await fetch(`${this.mycouchBaseUrl}/__users/${this.currentUserHash}`, {
                    headers: {
                        'Authorization': `Bearer ${jwt}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (userDocResponse.ok) {
                    const userDoc = await userDocResponse.json();
                    // Store in local PouchDB as "user_{hash}" (matches CouchDB convention)
                    userDoc._id = `user_${this.currentUserHash}`;
                    await this.usersDb.put(userDoc);
                    console.log('✅ Initial user document fetched and stored in PouchDB');
                } else {
                    console.warn('⚠️ Could not fetch initial user doc from MyCouch, will be created on sync');
                }
            } catch (error) {
                console.warn('⚠️ Failed to fetch initial user doc:', error);
                // Document will be created when first synced
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
                    console.warn('⚠️ User document not found locally yet, will be created on sync');
                    return null;
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
     * Phase 3: Start polling for user document changes
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
            const jwt = await this.getClerkToken();
            if (!jwt) return;

            const url = `${this.mycouchBaseUrl}/__users/_changes?since=${this.lastUserChangeSeq}&include_docs=true`;
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
     * Phase 3: Start polling for tenant document changes
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
            const jwt = await this.getClerkToken();
            if (!jwt) return;

            const url = `${this.mycouchBaseUrl}/__tenants/_changes?since=${this.lastTenantChangeSeq}&include_docs=true`;
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
                            // Mark as soft-deleted instead of removing
                            change.doc.deletedAt = new Date().toISOString();
                            console.log(`🗑️ Marked tenant deleted: ${docId}`);
                        } else {
                            console.log(`✅ Updated tenant: ${docId}`);
                        }
                        
                        await this.tenantsDb.put(change.doc);
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
     * Phase 3: Stop all change polling
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
            const tenantList = await this.getMyTenants();
            this.tenantList = tenantList || [];

            console.log(`📋 Found ${this.tenantList.length} tenants:`, this.tenantList);

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

            // Step 3: Set active tenant via virtual endpoint
            // Only if it's not already set in JWT (skip for reconnection scenarios)
            const activeTenantIdFromJWT = this.extractActiveTenantIdFromJWT(jwt);
            if (!activeTenantIdFromJWT) {
                try {
                    await this.setActiveTenant(selectedTenant._id);
                    // Step 4: Trigger JWT metadata refresh
                    await this.refreshJWTWithTenant();
                } catch (error) {
                    console.warn('⚠️ Could not set active tenant via endpoint, continuing with JWT tenant');
                    // Continue anyway - JWT already has a tenant context
                }
            } else {
                console.log('✅ Active tenant already set in JWT, skipping update');
            }

            // Step 4: Start Phase 3 polling for changes
            try {
                await this.startUserChangesPolling(5000); // Poll every 5 seconds
                await this.startTenantChangesPolling(5000);
            } catch (error) {
                console.warn('⚠️ Could not start changes polling, app will work without real-time updates', error);
                // Continue - polling is optimization, not required
            }

            console.log('✅ Tenant context initialized successfully');
            return selectedTenant;

        } catch (error) {
            console.error('❌ Failed to initialize tenant context:', error);
            throw error;
        }
    }

    /**
     * Phase 2: Initialize tenant document replication
     * Fetches tenants from MyCouch and stores in local 'roady' PouchDB
     */
    async initializeTenantsReplication() {
        try {
            console.log('🔄 Phase 2: Initializing tenant document replication...');
            
            if (!this.tenantsDb) {
                console.warn('⚠️ Tenants database not available');
                return [];
            }
            
            // Fetch tenants from MyCouch virtual endpoint
            const tenants = await this.getMyTenantsFromServer();
            if (!tenants || tenants.length === 0) {
                console.log('ℹ️ No tenants returned from server');
                return [];
            }
            
            // Store each tenant in local PouchDB with proper ID format: tenant_{uuid}
            // Use sequential processing to avoid conflicts
            for (const tenant of tenants) {
                try {
                    // Ensure proper ID format
                    const tenantId = tenant._id || tenant.tenantId || tenant.id;
                    if (!tenantId) {
                        console.warn('⚠️ Tenant missing ID:', tenant);
                        continue;
                    }
                    
                    // Ensure ID has tenant_ prefix for consistency
                    const docId = tenantId.startsWith('tenant_') ? tenantId : `tenant_${tenantId}`;
                    
                    // Always fetch latest from DB to get current _rev
                    let existingRev = null;
                    try {
                        const existing = await this.tenantsDb.get(docId);
                        existingRev = existing._rev;
                        console.log(`ℹ️ Tenant ${docId} exists, will update`);
                    } catch (e) {
                        if (e.status !== 404) {
                            console.warn(`⚠️ Error checking tenant ${docId}:`, e.message);
                        }
                        // 404 is fine - new document
                    }
                    
                    // Prepare document for local storage
                    const docToStore = {
                        _id: docId,
                        type: 'tenant',
                        name: tenant.name || 'Unnamed',
                        userIds: tenant.userIds || [],
                        syncedAt: new Date().toISOString(),
                        ...tenant // Spread tenant data but don't overwrite our fields
                    };
                    
                    // Preserve _rev if updating
                    if (existingRev) {
                        docToStore._rev = existingRev;
                    }
                    
                    // Store with retry on conflict
                    let retries = 0;
                    let stored = false;
                    while (retries < 3 && !stored) {
                        try {
                            const result = await this.tenantsDb.put(docToStore);
                            console.log(`✅ Stored tenant: ${docId}`);
                            stored = true;
                        } catch (putError) {
                            if (putError.status === 409 && retries < 2) {
                                // Conflict - another write happened (possibly polling)
                                retries++;
                                console.warn(`⚠️ Conflict storing ${docId}, retrying (${retries}/2)...`);
                                try {
                                    const fresh = await this.tenantsDb.get(docId);
                                    docToStore._rev = fresh._rev;
                                    // Continue loop to retry with fresh _rev
                                } catch (e) {
                                    if (e.status === 404) {
                                        // Doc was deleted/changed by polling - that's ok, skip it
                                        console.log(`ℹ️ Tenant ${docId} modified by polling, skipping retry`);
                                        stored = true; // Treat as success - polling has it
                                    } else {
                                        console.error(`❌ Cannot recover from conflict for ${docId}:`, e);
                                        throw putError;
                                    }
                                }
                            } else {
                                throw putError;
                            }
                        }
                    }
                } catch (error) {
                    console.error(`❌ Failed to store tenant:`, error);
                    // Continue with next tenant instead of failing completely
                }
            }
            
            console.log('✅ Tenant replication initialized');
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

        const jwt = await this.getClerkToken();
        console.log('🔑 Got JWT token:', jwt ? `${jwt.substring(0, 20)}...` : 'NULL');

        if (!jwt) {
            throw new Error('No JWT token available - user not authenticated');
        }

        const url = `${this.mycouchBaseUrl}/__tenants`;
        console.log('📡 Making request to:', url);

        try {
            console.log('📡 Calling fetch (10s timeout)...');
            
            // Use AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
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
            } else {
                console.error('❌ Error fetching tenants from server:', error);
            }
            throw error;
        }
    }

    /**
     * Get all tenants (Phase 2: reads from local, falls back to server)
     * This is the main entry point for getting tenant list
     */
    async getMyTenants() {
        try {
            // Phase 2: Try to read from local PouchDB first
            const localTenants = await this.getMyTenantsFromLocal();
            if (localTenants.length > 0) {
                console.log('📖 Using tenants from local PouchDB');
                return localTenants;
            }
            
            console.log('⚠️ No tenants in local PouchDB, fetching from server...');
            
            // Fallback: fetch from server if local is empty
            const serverTenants = await this.getMyTenantsFromServer();
            
            // Store fetched tenants locally for future use
            try {
                await this.initializeTenantsReplication();
            } catch (error) {
                console.warn('⚠️ Failed to cache tenants locally:', error);
                // Continue anyway - local storage is optimization, not required
            }
            
            return serverTenants;
        } catch (error) {
            console.error('❌ Failed to get tenants:', error);
            throw error;
        }
    }

    /**
     * Phase 4: Set active tenant - offline-first with optional HTTP sync
     * Writes to local PouchDB first (optimistic), then syncs to server
     * Works offline - changes will sync when connection restored
     */
    async setActiveTenant(tenantId) {
        console.log(`🔧 Phase 4: Setting active tenant (offline-first): ${tenantId}`);

        if (!this.currentUserHash) {
            throw new Error('Current user hash not set - call initializeTenantContext first');
        }

        // Virtual endpoint expects virtual tenant ID (UUID without "tenant_" prefix)
        // If given an internal ID, strip the prefix
        const virtualTenantId = tenantId.startsWith('tenant_') ? tenantId.substring(7) : tenantId;
        const hashedUserId = this.currentUserHash;

        console.log(`📋 User ID (hashed): ${hashedUserId}`);
        console.log(`📋 Tenant ID: ${virtualTenantId}`);

        // Step 1: Update local PouchDB (REQUIRED - offline capability)
        let localUpdateSuccess = false;
        if (this.usersDb && this.localUserDoc) {
            try {
                this.localUserDoc.active_tenant_id = virtualTenantId;
                this.localUserDoc.syncedAt = new Date().toISOString();
                await this.usersDb.put(this.localUserDoc);
                console.log('✅ Updated local user doc in PouchDB (offline write)');
                localUpdateSuccess = true;
            } catch (error) {
                console.error('❌ Failed to update local user doc (offline write failed):', error);
                throw new Error(`Cannot set active tenant - local storage failed: ${error.message}`);
            }
        } else {
            throw new Error('Cannot set active tenant - PouchDB not initialized');
        }

        // Step 2: Sync to server (ASYNC - fire and forget, optional)
        // If offline, the change will sync when connection restored
        // If online, syncs immediately
        this.syncActiveTenantToServer(hashedUserId, virtualTenantId)
            .catch(error => {
                console.warn('⚠️ Could not sync active tenant to server (will retry on next polling cycle):', error);
                // Not fatal - local change is persisted, will sync eventually
            });

        return { success: true, localOnly: true };
    }

    /**
     * Phase 4: Sync active tenant change to server (background operation)
     * This runs asynchronously - doesn't block app operation
     * Will be retried on next polling cycle if it fails
     * (Internal use only - called from setActiveTenant)
     */
    async syncActiveTenantToServer(hashedUserId, virtualTenantId) {
        try {
            const jwt = await this.getClerkToken();
            if (!jwt) {
                console.warn('⚠️ No JWT available for sync (will retry on next poll)');
                return;
            }

            const response = await fetch(`${this.mycouchBaseUrl}/__users/${hashedUserId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ active_tenant_id: virtualTenantId })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Server sync failed: ${response.status} - ${errorText}`);
                throw new Error(`Server returned ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ Active tenant synced to server:', data);
            return data;
        } catch (error) {
            console.warn('⚠️ Failed to sync active tenant to server:', error.message);
            // Will be retried on next polling cycle
            throw error;
        }
    }

    /**
     * Refresh JWT to get updated tenant metadata from Clerk
     */
    async refreshJWTWithTenant() {
        console.log('🔄 Refreshing JWT with tenant metadata...');

        const MAX_RETRIES = 5;
        const RETRY_DELAY = 500; // ms

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            // Force Clerk to issue a completely fresh JWT with updated metadata
            // Add a small delay to ensure metadata update propagates
            if (attempt > 1) {
                console.log(`⏳ Waiting for metadata propagation (attempt ${attempt}/${MAX_RETRIES})...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            } else {
                // Initial small delay
                await new Promise(resolve => setTimeout(resolve, 200));
            }

            try {
                // Force Clerk to reload session from server to get updated metadata
                if (window.Clerk.session?.reload) {
                    await window.Clerk.session.reload();
                }
                
                // Get a fresh token - Clerk should include updated metadata
                const refreshedToken = await window.Clerk.session.getToken();

                if (!refreshedToken) {
                    console.warn(`⚠️ No token returned (attempt ${attempt}/${MAX_RETRIES})`);
                    continue; // Try again
                }

                // Verify the token contains tenant information
                const parts = refreshedToken.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));

                    // Check for tenant-related claims
                    const hasTenant = payload.tenant_id || payload.active_tenant_id || payload.metadata?.active_tenant_id;

                    if (hasTenant) {
                        console.log('✅ JWT refreshed successfully with tenant metadata:', {
                            tenant_id: payload.tenant_id,
                            active_tenant_id: payload.active_tenant_id
                        });
                        return refreshedToken;
                    } else {
                        console.warn(`⚠️ JWT missing tenant claims (attempt ${attempt}/${MAX_RETRIES})`);
                        console.log('📋 Full JWT payload:', payload);

                        // If this is the last attempt, log a helpful instruction
                        if (attempt === MAX_RETRIES) {
                            console.error(`
🛑 MISSING CLERK CONFIGURATION 🛑
The JWT token is missing the 'active_tenant_id' claim. 
You must configure the Default Session Token in your Clerk Dashboard.

INSTRUCTIONS:
1. Go to Clerk Dashboard > Configure > Sessions > Customize session token
2. Add this to the Claims:
   {
     "active_tenant_id": "{{session.public_metadata.active_tenant_id}}"
   }
3. Save changes
                            `);
                        }
                        // Continue to next retry
                    }
                }
            } catch (error) {
                console.error(`❌ Error on attempt ${attempt}/${MAX_RETRIES}:`, error);
                // Continue to next retry unless it's the last attempt
                if (attempt === MAX_RETRIES) {
                    throw error;
                }
            }
        }

        console.error('❌ Failed to get JWT with tenant metadata after multiple attempts');
        // We throw an error here to stop the flow - strict enforcement
        throw new Error('Failed to obtain valid tenant token. Please try again.');
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
     * Finds tenant by ID in tenantList and updates active_tenant_id
     */
    async switchTenant(tenantId) {
        console.log(`🔄 Switching to tenant: ${tenantId}`);

        // Try to find tenant in cached list
        const tenant = this.tenantList.find(t => t._id === tenantId || t._id === `tenant_${tenantId}`);
        
        // If not found in list, refresh the list and try again
        if (!tenant) {
            console.warn('Tenant not in cached list, refreshing...');
            try {
                this.tenantList = await this.getMyTenants();
                const refreshedTenant = this.tenantList.find(t => t._id === tenantId || t._id === `tenant_${tenantId}`);
                if (!refreshedTenant) {
                    throw new Error(`Tenant ${tenantId} not found in user's tenant list`);
                }
                await this.setActiveTenant(refreshedTenant._id);
                await this.refreshJWTWithTenant();
                this.currentTenant = refreshedTenant;
                console.log(`✅ Switched to tenant: ${refreshedTenant.name}`);
                return refreshedTenant;
            } catch (e) {
                console.error('Failed to refresh tenant list:', e);
                throw e;
            }
        }

        await this.setActiveTenant(tenant._id);
        await this.refreshJWTWithTenant();
        this.currentTenant = tenant;

        console.log(`✅ Switched to tenant: ${tenant.name}`);
        return tenant;
    }
}

// Export for global use
window.TenantManager = TenantManager;