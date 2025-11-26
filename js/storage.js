// High-level storage API that combines database, auth, and sync
const Storage = {
    // Initialize storage with authentication and sync
    async init(couchDbUrl = null) {
        console.log('🚀 Initializing Storage with auth and sync...');

        // Wait for authentication to be ready
        const isAuthenticated = await window.Auth?.waitForAuth();
        if (!isAuthenticated) {
            console.warn('Storage: User not authenticated, proceeding with local-only mode');
            return false;
        }

        // Setup sync if URL provided
        if (couchDbUrl) {
            const db = window.DB.getDb();
            const syncSuccess = await window.Sync.setupSync(db, couchDbUrl);
            if (syncSuccess) {
                console.log('✓ Storage: Sync initialized successfully');
                return true;
            } else {
                console.warn('Storage: Sync initialization failed, proceeding with local-only mode');
                return false;
            }
        }

        console.log('✓ Storage: Initialized in local-only mode');
        return true;
    },

    // Cancel sync
    cancelSync() {
        window.Sync.cancelSync();
    },

    // Get sync status
    getSyncStatus() {
        return window.Sync.getSyncStatus();
    },

    // Get authentication status
    getAuthStatus() {
        return window.Auth.getAuthStatus();
    },

    // Equipment operations (with built-in auth)
    async getAllEquipment() {
        return await window.DB.getAllEquipment();
    },

    async addEquipment(item) {
        return await window.DB.addEquipment(item);
    },

    async updateEquipment(equipment) {
        return await window.DB.updateEquipment(equipment);
    },

    async deleteEquipment(id) {
        return await window.DB.deleteEquipment(id);
    },

    async restoreEquipment(id) {
        return await window.DB.restoreEquipment(id);
    },

    // Gig Type operations (with built-in auth)
    async getAllGigTypes() {
        return await window.DB.getAllGigTypes();
    },

    async addGigType(type) {
        return await window.DB.addGigType(type);
    },

    async updateGigType(gigType) {
        return await window.DB.updateGigType(gigType);
    },

    async deleteGigType(id) {
        return await window.DB.deleteGigType(id);
    },

    async restoreGigType(id) {
        return await window.DB.restoreGigType(id);
    },

    // Gig operations (with built-in auth)
    async getAllGigs() {
        return await window.DB.getAllGigs();
    },

    async getGig(id) {
        return await window.DB.getGig(id);
    },

    async addGig(gig, gigType) {
        return await window.DB.addGig(gig, gigType);
    },

    async updateGig(gig) {
        return await window.DB.updateGig(gig);
    },

    async deleteGig(id) {
        return await window.DB.deleteGig(id);
    },

    async restoreGig(id) {
        return await window.DB.restoreGig(id);
    },

    // Options operations (local-only)
    async getOptions() {
        return await window.DB.getOptions();
    },

    async saveOptions(options) {
        return await window.DB.saveOptions(options);
    },

    // Tenant management
    setTenant(tenantId) {
        window.DB.setTenant(tenantId);
    },

    // Get user info
    getUser() {
        return window.Auth.getUser();
    },

    getUserId() {
        return window.Auth.getUserId();
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
} else {
    window.Storage = Storage;
}