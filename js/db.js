// Database initialization and helper functions
const DB = {
    db: null,
    optionsDb: null,
    currentTenant: null, // Will be set by TenantManager

    init() {
        // Initialize local PouchDB without auth (auth handled at higher level)
        this.db = new PouchDB('roady');

        // These are local indexDB only.
        this.optionsDb = new PouchDB('roady_options'); // Local-only, never synced
    },

    // Set current tenant
    setTenant(tenantId) {
        this.currentTenant = tenantId;
    },

    // Get database instance (for sync operations)
    getDb() {
        return this.db;
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
            .filter(doc => doc.type === 'equipment' && doc.tenant === this.currentTenant && !doc.deletedAt);
    },

    async getDeletedEquipment() {
        const result = await this.db.allDocs({
            include_docs: true,
            startkey: 'equipment_',
            endkey: 'equipment_\uffff'
        });
        return result.rows
            .map(row => row.doc)
            .filter(doc => doc.type === 'equipment' && doc.tenant === this.currentTenant && doc.deletedAt)
            .sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
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
        try {
            // Fetch latest version to ensure _rev is current (prevents 409 conflicts)
            const latest = await this.db.get(equipment._id);
            equipment._rev = latest._rev;
            return await this.db.put(equipment);
        } catch (err) {
            // If fetch fails, try update anyway
            return await this.db.put(equipment);
        }
    },

    async deleteEquipment(id) {
        const doc = await this.db.get(id);
        doc.deletedAt = new Date().toISOString();
        return await this.db.put(doc);
    },

    async restoreEquipment(id) {
        const doc = await this.db.get(id);
        delete doc.deletedAt;
        return await this.db.put(doc);
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
            .filter(doc => doc.type === 'gig_type' && doc.tenant === this.currentTenant && !doc.deletedAt);
    },

    async getDeletedGigTypes() {
        const result = await this.db.allDocs({
            include_docs: true,
            startkey: 'gig_type_',
            endkey: 'gig_type_\uffff'
        });
        return result.rows
            .map(row => row.doc)
            .filter(doc => doc.type === 'gig_type' && doc.tenant === this.currentTenant && doc.deletedAt)
            .sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
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
        try {
            // Fetch latest version to ensure _rev is current (prevents 409 conflicts)
            const latest = await this.db.get(gigType._id);
            gigType._rev = latest._rev;
            return await this.db.put(gigType);
        } catch (err) {
            // If fetch fails, try update anyway
            return await this.db.put(gigType);
        }
    },

    async deleteGigType(id) {
        const doc = await this.db.get(id);
        doc.deletedAt = new Date().toISOString();
        return await this.db.put(doc);
    },

    async restoreGigType(id) {
        const doc = await this.db.get(id);
        delete doc.deletedAt;
        return await this.db.put(doc);
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
            .filter(doc => doc.type === 'gig' && doc.tenant === this.currentTenant && !doc.deletedAt)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    async getDeletedGigs() {
        const result = await this.db.allDocs({
            include_docs: true,
            startkey: 'gig_',
            endkey: 'gig_\uffff'
        });
        return result.rows
            .map(row => row.doc)
            .filter(doc => doc.type === 'gig' && doc.tenant === this.currentTenant && doc.deletedAt)
            .sort((a, b) => new Date(a.deletedAt) - new Date(b.deletedAt));
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
        try {
            // Fetch latest version to ensure _rev is current (prevents 409 conflicts)
            const latest = await this.db.get(gig._id);
            gig._rev = latest._rev;
            return await this.db.put(gig);
        } catch (err) {
            // If fetch fails, try update anyway
            return await this.db.put(gig);
        }
    },

    async deleteGig(id) {
        const doc = await this.db.get(id);
        doc.deletedAt = new Date().toISOString();
        return await this.db.put(doc);
    },

    async restoreGig(id) {
        const doc = await this.db.get(id);
        delete doc.deletedAt;
        return await this.db.put(doc);
    },

    // Band info operations
    async getBandInfo() {
        try {
            const doc = await this.db.get('band-info');
            // Verify it belongs to current tenant
            if (doc.tenant === this.currentTenant) {
                return doc;
            }
        } catch (err) {
            if (err.status === 404) {
                return null; // No band info yet
            }
            throw err;
        }
    },

    async saveBandInfo(bandInfo) {
        // Ensure tenant is set
        bandInfo.tenant = this.currentTenant;
        bandInfo.type = 'band-info';
        
        try {
            // Try to get existing to preserve _rev
            const existing = await this.db.get('band-info');
            bandInfo._rev = existing._rev;
        } catch (err) {
            if (err.status !== 404) {
                throw err;
            }
            // 404 is fine - it's a new doc
        }
        
        bandInfo._id = 'band-info';
        return await this.db.put(bandInfo);
    }
};

// Initialize database on load
DB.init();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DB;
} else {
    window.DB = DB;
}