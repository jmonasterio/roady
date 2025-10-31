// Database initialization and helper functions
const DB = {
    db: null,
    optionsDb: null,
    syncHandler: null,
    syncStatus: 'idle',
    currentTenant: 'demo', // Default tenant

    init() {
        this.db = new PouchDB('roady');
        this.optionsDb = new PouchDB('roady_options'); // Local-only, never synced
    },

    // Set current tenant
    setTenant(tenantId) {
        this.currentTenant = tenantId;
        console.log('Tenant switched to:', tenantId);
    },

    // Setup sync with remote CouchDB
    setupSync(couchDbUrl) {
        if (!couchDbUrl || !couchDbUrl.trim()) {
            this.cancelSync();
            return;
        }

        // Cancel existing sync if any
        this.cancelSync();

        try {
            // Ensure URL doesn't end with slash
            const baseUrl = couchDbUrl.replace(/\/$/, '');

            // Configure remote DB options
            // Authentication is handled via URL: https://username:password@server.com
            const remoteOptions = {
                skip_setup: true // Don't try to create DB if it doesn't exist
            };

            const remoteDB = new PouchDB(`${baseUrl}/roady`, remoteOptions);

            // Test connection first
            remoteDB.info().then(info => {
                console.log('✓ Remote DB connected:', info);
            }).catch(err => {
                console.error('✗ Failed to connect to remote DB:', err);
                window.dispatchEvent(new CustomEvent('db-sync-error', {
                    detail: { error: { message: 'Connection failed. Check CORS settings and URL format.' } }
                }));
            });

            // Setup bidirectional continuous sync
            this.syncHandler = this.db.sync(remoteDB, {
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
            return false;
        }
    },

    // Cancel all active sync
    cancelSync() {
        if (this.syncHandler) {
            this.syncHandler.cancel();
            this.syncHandler = null;
            this.syncStatus = 'idle';
        }
        console.log('CouchDB sync cancelled');
    },

    // Get sync status
    getSyncStatus() {
        return this.syncStatus;
    },

    // Options operations (local-only, never synced)
    async getOptions() {
        try {
            const doc = await this.optionsDb.get('app_options');
            return doc.options || {};
        } catch (err) {
            if (err.status === 404) {
                return {}; // No options saved yet
            }
            throw err;
        }
    },

    async saveOptions(options) {
        try {
            const doc = await this.optionsDb.get('app_options');
            doc.options = options;
            await this.optionsDb.put(doc);
        } catch (err) {
            if (err.status === 404) {
                // Create new document
                await this.optionsDb.put({
                    _id: 'app_options',
                    options: options
                });
            } else {
                throw err;
            }
        }
    },

    // Equipment operations
    async getAllEquipment() {
        const result = await this.db.allDocs({
            include_docs: true,
            startkey: 'equipment_',
            endkey: 'equipment_\uffff'
        });
        return result.rows
            .map(row => row.doc)
            .filter(doc => doc.type === 'equipment' && doc.tenant === this.currentTenant);
    },

    async addEquipment(item) {
        const doc = {
            _id: 'equipment_' + Date.now(),
            type: 'equipment',
            tenant: this.currentTenant,
            name: item.name,
            description: item.description || '',
            createdAt: new Date().toISOString()
        };
        console.log('Adding equipment:', doc);
        const result = await this.db.put(doc);
        console.log('Equipment added:', result);
        return result;
    },

    async updateEquipment(equipment) {
        return await this.db.put(equipment);
    },

    async deleteEquipment(id) {
        const doc = await this.db.get(id);
        return await this.db.remove(doc);
    },

    // Gig Type operations
    async getAllGigTypes() {
        const result = await this.db.allDocs({
            include_docs: true,
            startkey: 'gig_type_',
            endkey: 'gig_type_\uffff'
        });
        return result.rows
            .map(row => row.doc)
            .filter(doc => doc.type === 'gig_type' && doc.tenant === this.currentTenant);
    },

    async addGigType(type) {
        const doc = {
            _id: 'gig_type_' + Date.now(),
            type: 'gig_type',
            tenant: this.currentTenant,
            name: type.name,
            equipmentIds: type.equipmentIds || [],
            createdAt: new Date().toISOString()
        };
        return await this.db.put(doc);
    },

    async updateGigType(gigType) {
        return await this.db.put(gigType);
    },

    async deleteGigType(id) {
        const doc = await this.db.get(id);
        return await this.db.remove(doc);
    },

    // Gig operations
    async getAllGigs() {
        const result = await this.db.allDocs({
            include_docs: true,
            startkey: 'gig_',
            endkey: 'gig_\uffff'
        });
        // Filter to only documents with type='gig' and tenant, sort by date ascending (soonest first)
        return result.rows
            .map(row => row.doc)
            .filter(doc => doc.type === 'gig' && doc.tenant === this.currentTenant)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    async getGig(id) {
        return await this.db.get(id);
    },

    async addGig(gig, gigType) {
        // Expand equipment quantities into individual checklist items
        const checklist = [];
        const equipment = gigType.equipment || gigType.equipmentIds?.map(id => ({ equipmentId: id, quantity: 1 })) || [];

        equipment.forEach(({ equipmentId, quantity }) => {
            for (let i = 1; i <= quantity; i++) {
                checklist.push({
                    equipmentId,
                    itemNumber: i,
                    checked: false
                });
            }
        });

        const doc = {
            _id: 'gig_' + Date.now(),
            type: 'gig',
            tenant: this.currentTenant,
            name: gig.name,
            gigTypeId: gig.gigTypeId,
            date: gig.date,
            arrivalTime: gig.arrivalTime || '',
            doorsOpenTime: gig.doorsOpenTime || '',
            mapLink: gig.mapLink || '',
            loadoutChecklist: [...checklist],
            loadinChecklist: [...checklist],
            createdAt: new Date().toISOString()
        };
        return await this.db.put(doc);
    },

    async updateGig(gig) {
        return await this.db.put(gig);
    },

    async deleteGig(id) {
        const doc = await this.db.get(id);
        return await this.db.remove(doc);
    }
};

// Initialize database on load
DB.init();
