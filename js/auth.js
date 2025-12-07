// Generic authentication interface (currently implemented using Clerk)
window.Auth = {
    // Check if user is authenticated
    isAuthenticated() {
        return window.ClerkAuth?.isSignedIn() || false;
    },

    // Get authentication token for API requests
    async getAuthToken() {
        if (!window.ClerkAuth) {
            console.warn('ClerkAuth not available');
            return null;
        }
        return await window.ClerkAuth.getToken();
    },

    // Get current user information
    getUser() {
        if (!window.ClerkAuth) {
            console.warn('ClerkAuth not available');
            return null;
        }
        return window.ClerkAuth.getUser();
    },

    // Get current user ID
    getUserId() {
        if (!window.ClerkAuth) {
            console.warn('ClerkAuth not available');
            return null;
        }
        return window.ClerkAuth.getUserId();
    },

    // Wait for authentication to be ready
    async waitForAuth(maxWait = 5000) {
        if (!window.ClerkAuth) {
            console.warn('ClerkAuth not available');
            return false;
        }
        return await window.ClerkAuth.waitForClerk(maxWait);
    },

    // Get authentication status for debugging
    getAuthStatus() {
        if (!window.ClerkAuth) {
            return {
                isAvailable: false,
                isAuthenticated: false,
                error: 'ClerkAuth not loaded'
            };
        }
        return {
            isAvailable: true,
            ...window.ClerkAuth.getStatus()
        };
    },

    // Create fetch wrapper that adds auth headers
    async authenticatedFetch(url, options = {}) {
        const token = await this.getAuthToken();
        if (token) {
            return {
                ...options,
                headers: {
                    ...options.headers,
                    Authorization: `Bearer ${token}`
                }
            };
        } else {
            console.warn('No auth token available for request to', url);
            return options;
        }
    },

    // Enhanced fetch function that automatically adds auth
    async fetchWithAuth(url, options = {}) {
        const authenticatedOptions = await this.authenticatedFetch(url, options);
        return fetch(url, authenticatedOptions);
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.Auth;
}