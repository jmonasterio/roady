// Tenant Management Service
// Handles tenant detection, selection, and JWT metadata management

class TenantManager {
    constructor() {
        this.mycouchBaseUrl = 'http://localhost:5985'; // MyCouch proxy
        this.currentTenant = null;
        this.tenantList = [];
    }

    /**
     * Initialize tenant context after Clerk login
     * This is the critical flow: /my-tenants -> pick first -> /choose-tenant -> JWT refresh
     */
    async initializeTenantContext() {
        try {
            console.log('🔍 Initializing tenant context...');

            // Step 1: Get all user's tenants
            const tenantList = await this.getMyTenants();
            this.tenantList = tenantList.tenants || [];

            console.log(`📋 Found ${this.tenantList.length} tenants:`, this.tenantList);

            // Step 2: Select personal tenant (not just first tenant)
            // Look for a tenant marked as personal, or use activeTenantId from response
            let selectedTenant = null;

            // First, try to use the activeTenantId from the response
            if (tenantList.activeTenantId) {
                selectedTenant = this.tenantList.find(t => t.tenantId === tenantList.activeTenantId);
                if (selectedTenant) {
                    console.log(`🎯 Using active tenant from server: ${selectedTenant.name} (${selectedTenant.tenantId})`);
                }
            }

            // If no active tenant, look for a personal tenant
            if (!selectedTenant) {
                selectedTenant = this.tenantList.find(t => t.personal === true || t.isPersonal === true);
                if (selectedTenant) {
                    console.log(`🎯 Selected personal tenant: ${selectedTenant.name} (${selectedTenant.tenantId})`);
                }
            }

            // If still no tenant found, this is an error condition
            if (!selectedTenant) {
                console.error('❌ No personal tenant found for user');
                console.error('Available tenants:', this.tenantList);
                throw new Error('No personal tenant available. Please contact support or try signing in again.');
            }

            this.currentTenant = selectedTenant;

            // Step 3: Set active tenant in Clerk session metadata
            await this.setActiveTenant(selectedTenant.tenantId);

            // Step 4: Trigger JWT metadata refresh
            await this.refreshJWTWithTenant();

            console.log('✅ Tenant context initialized successfully');
            return selectedTenant;

        } catch (error) {
            console.error('❌ Failed to initialize tenant context:', error);
            throw error;
        }
    }

    /**
     * Get all tenants accessible to the user
     */
    async getMyTenants() {
        console.log('🔍 Fetching user tenants...');

        const jwt = await this.getClerkToken();
        console.log('🔑 Got JWT token:', jwt ? `${jwt.substring(0, 20)}...` : 'NULL');

        if (!jwt) {
            throw new Error('No JWT token available - user not authenticated');
        }

        const url = `${this.mycouchBaseUrl}/my-tenants`;
        console.log('📡 Making request to:', url);
        console.log('📡 Request headers:', {
            'Authorization': `Bearer ${jwt.substring(0, 20)}...`,
            'Content-Type': 'application/json'
        });

        try {
            console.log('📡 Calling fetch...');
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('📡 Fetch completed, status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Request failed:', response.status, errorText);
                throw new Error(`Failed to get tenants (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            console.log('✅ Retrieved tenant list:', data);
            return data;
        } catch (error) {
            console.error('❌ Error in getMyTenants:', error);
            console.error('❌ Error stack:', error.stack);
            throw error;
        }
    }

    /**
     * Set active tenant in Clerk session metadata
     */
    async setActiveTenant(tenantId) {
        console.log(`🔧 Setting active tenant: ${tenantId}`);

        const jwt = await this.getClerkToken();
        if (!jwt) {
            throw new Error('No JWT token available for tenant selection');
        }

        const response = await fetch(`${this.mycouchBaseUrl}/choose-tenant`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwt}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tenantId })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to set active tenant (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        console.log('✅ Active tenant set in Clerk metadata:', data);
        return data;
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
     */
    async switchTenant(tenantId) {
        console.log(`🔄 Switching to tenant: ${tenantId}`);

        const tenant = this.tenantList.find(t => t.tenantId === tenantId);
        if (!tenant) {
            throw new Error(`Tenant ${tenantId} not found in user's tenant list`);
        }

        await this.setActiveTenant(tenantId);
        await this.refreshJWTWithTenant();
        this.currentTenant = tenant;

        console.log(`✅ Switched to tenant: ${tenant.name}`);
        return tenant;
    }
}

// Export for global use
window.TenantManager = TenantManager;