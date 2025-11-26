// Sync management functionality
const Sync = {
    syncHandler: null,
    syncStatus: 'idle', // idle, active, paused, error, complete

    // Setup sync with remote CouchDB
    async setupSync(localDb, couchDbUrl) {
        if (!couchDbUrl || !couchDbUrl.trim()) {
            this.cancelSync();
            return false;
        }

        console.log('[setupSync] Starting sync setup with URL:', couchDbUrl);
        console.log('[setupSync] Auth status:', window.Auth?.getAuthStatus());

        // Check if user is authenticated
        if (!window.Auth?.isAuthenticated()) {
            console.error('Cannot setup sync: User not authenticated');
            window.dispatchEvent(new CustomEvent('db-sync-error', {
                detail: { error: { message: 'Please sign in before enabling sync.' } }
            }));
            return false;
        }

        // Cancel existing sync if any
        this.cancelSync();

        try {
            // Ensure URL doesn't end with slash
            const baseUrl = couchDbUrl.replace(/\/$/, '');

            // Configure remote DB options with authentication
            const remoteOptions = {
                skip_setup: true, // Don't try to create DB if it doesn't exist
                fetch: async (url, opts) => {
                    try {
                        console.debug('[Sync fetch]', {
                            url,
                            method: opts.method || 'GET',
                            hasAuth: !!opts.headers?.Authorization,
                            userAuthenticated: window.Auth?.isAuthenticated()
                        });

                        // Add auth token to all sync requests
                        const authenticatedOpts = await window.Auth.authenticatedFetch(url, opts);
                        return PouchDB.fetch(url, authenticatedOpts);
                    } catch (err) {
                        console.warn('[Sync fetch] Could not get auth token for sync:', err);
                        return PouchDB.fetch(url, opts);
                    }
                }
            };

            const remoteDB = new PouchDB(`${baseUrl}/roady`, remoteOptions);

            // Test connection first
            await remoteDB.info();
            console.log('✓ Remote DB connected');

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

            console.log('CouchDB sync setup complete for:', baseUrl);
            return true;
        } catch (err) {
            console.error('Failed to setup CouchDB sync:', err);
            this.syncStatus = 'error';
            window.dispatchEvent(new CustomEvent('db-sync-error', {
                detail: { error: { message: 'Connection failed. Check CORS settings and URL format.' } }
            }));
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
        console.log('CouchDB sync cancelled');
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
    module.exports = Sync;
} else {
    window.Sync = Sync;
}