// Sync management functionality
window.Sync = {
    syncHandler: null,
    syncStatus: 'idle', // idle, active, paused, error, complete

    // Setup sync with remote CouchDB via MyCouch proxy
    async setupSync(localDb, remoteDbUrl) {
        console.log('🔍 setupSync called with:', {remoteDbUrl, type: typeof remoteDbUrl, length: remoteDbUrl?.length});
        
        if (!remoteDbUrl || !remoteDbUrl.trim()) {
            console.warn('⚠️ setupSync: remoteDbUrl is empty or whitespace');
            this.cancelSync();
            return false;
        }

        console.log('[setupSync] Starting sync setup with MyCouch URL:', remoteDbUrl);

        // Wait for auth to be ready (up to 30 seconds)
        console.log('[setupSync] Waiting for Auth to be ready...');
        await window.Auth?.waitForAuth(30000);
        console.log('[setupSync] Auth ready! Status:', window.Auth?.getAuthStatus());

        // Check if user is authenticated
        if (!window.Auth?.isAuthenticated()) {
            console.error('Cannot setup sync: User not authenticated');
            window.dispatchEvent(new CustomEvent('db-sync-error', {
                detail: { error: { message: 'Please sign in before enabling sync.' } }
            }));
            return false;
        }

        // Validate JWT has required active_tenant_id claim
        try {
            const jwt = await window.Auth?.getToken?.();
            if (jwt) {
                const parts = jwt.split('.');
                if (parts.length === 3) {
                    const payload = JSON.parse(atob(parts[1]));
                    if (!payload.active_tenant_id) {
                        console.error('❌ Cannot setup sync: JWT missing active_tenant_id claim. Clerk Dashboard not configured with JWT custom claims.');
                        window.dispatchEvent(new CustomEvent('db-sync-error', {
                            detail: { error: { message: 'Clerk Dashboard not configured - missing JWT custom claim for active_tenant_id' } }
                        }));
                        return false;
                    }
                }
            }
        } catch (err) {
            console.warn('⚠️ Could not validate JWT claim:', err);
            // Don't block sync if we can't validate - server will reject bad JWT anyway
        }

        // Cancel existing sync if any
        this.cancelSync();

        try {
            // Ensure URL doesn't end with slash
            const baseUrl = remoteDbUrl.replace(/\/$/, '');

            // Extract database name from the MyCouch URL
            // remoteDbUrl format: http://argw.com:5985/roady or http://argw.com:5985/roady-staging
            const potentialDbName = baseUrl.split('/')[baseUrl.split('/').length - 1];
            if (!potentialDbName || potentialDbName.trim() === '') {
                throw new Error('Invalid remoteDbUrl: missing database name. URL must be like http://example.com:5985/databasename');
            }

            // Configure remote DB options with authentication
            const remoteOptions = {
                skip_setup: true, // Don't try to create DB if it doesn't exist
                fetch: async (url, opts) => {
                    try {
                        // Add auth token to all sync requests
                        const authenticatedOpts = await window.Auth.authenticatedFetch(url, opts);
                        
                        // Validate we got a valid auth header before sending
                        if (!authenticatedOpts.headers?.Authorization) {
                            console.warn('[Sync fetch] No auth header in response from authenticatedFetch');
                            // Don't send unauthenticated - this causes 401s
                            // Instead, throw so caller knows auth failed
                            throw new Error('No authorization header available');
                        }
                        
                        console.debug('[Sync fetch]', {
                            url,
                            method: authenticatedOpts.method || 'GET',
                            hasAuth: !!authenticatedOpts.headers?.Authorization,
                            userAuthenticated: window.Auth?.isAuthenticated()
                        });
                        return fetch(url, authenticatedOpts);
                    } catch (err) {
                        console.error('[Sync fetch] Failed to authenticate sync request:', err);
                        // Don't fallback to unauthenticated requests - this causes 401s
                        // Instead, fail the request so PouchDB knows auth failed and retries
                        throw err;
                    }
                }
            };

            // remoteDbUrl is already the full URL including database name from the parameter
            const remoteDB = new PouchDB(remoteDbUrl, remoteOptions);

            // Test connection first (with timeout to fail fast if offline)
            let timeoutId;
            try {
                const controller = new AbortController();
                timeoutId = setTimeout(() => controller.abort(), 2000);
                
                await remoteDB.info();
                clearTimeout(timeoutId);
                console.log('✓ Remote DB connected');
            } catch (connectionError) {
                // Connection test failed - likely offline or server unreachable
                // This is expected behavior - don't try to sync
                if (timeoutId) clearTimeout(timeoutId);
                console.warn('⚠️ MyCouch not reachable (offline or server down), sync unavailable');
                throw connectionError;  // Still throw so calling code knows sync failed
            }

            // Setup bidirectional continuous sync
            this.syncHandler = localDb.sync(remoteDB, {
                live: true,
                retry: true
            })
                .on('change', (info) => {
                    console.log('Sync change:', info);
                    console.log('Direction:', info.direction, 'Docs changed:', info.change?.docs?.length || 0);
                    this.syncStatus = 'active';
                    // Dispatch event for UI to listen
                    window.dispatchEvent(new CustomEvent('db-sync-change', {
                        detail: { info }
                    }));
                })
                .on('paused', (err) => {
                    console.log('Sync paused', err ? `with error: ${err}` : '(waiting for changes)');
                    this.syncStatus = err ? 'error' : 'paused';
                    window.dispatchEvent(new CustomEvent('db-sync-paused', {
                        detail: { error: err }
                    }));
                })
                .on('active', () => {
                    console.log('Sync active');
                    this.syncStatus = 'active';
                    window.dispatchEvent(new CustomEvent('db-sync-active'));
                })
                .on('denied', (err) => {
                    console.error('Sync denied:', err);
                    this.syncStatus = 'error';
                    window.dispatchEvent(new CustomEvent('db-sync-error', {
                        detail: { error: err }
                    }));
                })
                .on('complete', (info) => {
                    console.log('Sync complete:', info);
                    this.syncStatus = 'complete';
                    window.dispatchEvent(new CustomEvent('db-sync-complete', {
                        detail: { info }
                    }));
                })
                .on('error', (err) => {
                    console.error('Sync error:', err);
                    this.syncStatus = 'error';
                    window.dispatchEvent(new CustomEvent('db-sync-error', {
                        detail: { error: err }
                    }));
                });

            console.log('MyCouch sync setup complete for:', baseUrl);
            return true;
        } catch (err) {
            // Network errors expected when offline - don't log as error
            const isNetworkError = err.message?.includes('Failed to fetch') || 
                                   err.name === 'AbortError' ||
                                   err.message?.includes('ERR_CONNECTION_REFUSED') ||
                                   err.message?.includes('Unexpected token') ||  // HTML response instead of JSON
                                   err.message?.includes('SyntaxError');
            
            if (isNetworkError || err.status === 502 || err.status === 503) {
                console.debug('ℹ️ MyCouch sync not available (offline or server error):', err.message);
            } else {
                console.error('Failed to setup MyCouch sync:', err);
            }
            
            this.syncStatus = 'error';
            // Don't dispatch error event for expected network failures
            if (!isNetworkError && err.status !== 502 && err.status !== 503) {
                window.dispatchEvent(new CustomEvent('db-sync-error', {
                    detail: { error: { message: 'Connection failed. Check MyCouch proxy is running and reachable.' } }
                }));
            }
            return false;
        }
    },

    // Cancel all active sync
    cancelSync() {
        if (this.syncHandler) {
            this.syncHandler.cancel();
            this.syncHandler = null;
            this.syncStatus = 'idle';
            window.dispatchEvent(new CustomEvent('db-sync-cancelled'));
        }
        console.log('MyCouch sync cancelled');
    },

    // Get sync status
    getSyncStatus() {
        return this.syncStatus;
    },

    // Check if sync is currently active
    isSyncActive() {
        return this.syncStatus === 'active';
    },

    // Check if sync has errors
    hasSyncErrors() {
        return this.syncStatus === 'error';
    },

    // Get detailed sync information
    getSyncInfo() {
        return {
            status: this.syncStatus,
            isActive: !!this.syncHandler,
            hasErrors: this.hasSyncErrors()
        };
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.Sync;
} else {
    window.Sync = Sync;
}