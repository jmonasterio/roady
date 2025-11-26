# Roady PWA - Remaining Changes for Multi-Tenant Redesign

## Overview

Roady PWA integrates with the new admin tenant system. Tenants are now managed by separate MyCouch admin app. Roady focuses on bands, equipment, and gigs within a tenant context.

The documents no longer need to conaint the tenant id. That wiall be managed in couchdb and transparent tot he application.

In the settings, we weill have the current band name. For now the user just types that into the UI and it is just an option. If you change band name, you're just editing the name. There is only one band's data in the tenant for now.

## Changes Required

### 1. Startup Flow (CRITICAL)

**New:**
- User enters band name
- That becomes the band name, not the tenant ID.


### 2. Database Schema Changes

**Change 1: Rename field**
- We no longer need to write tenanat id anywhere. Maybe someday this will be band name, but we can ignore for now.

**Change 3: Add band document type**
- Documents with `type: "band"`
- Fields: id, type, tenant_id, name, description, owner, createdAt
- Index by: For now , we can assume there is only one band document.

We don't need the demo stuff.
