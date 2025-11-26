# Product Requirements Documents (PRDs)

This folder contains all Product Requirements Documents for the Roady PWA project.

## Documents

### Core PRDs

- **[PRD.md](./PRD.md)** - Main product requirements
  - Overall application vision and goals
  - Core features and functionality
  - User experience requirements

- **[PRD-multi-tenant.md](./PRD-multi-tenant.md)** - Multi-tenant band management
  - How band switching works
  - Data isolation between bands
  - Tenant configuration

- **[PRD-couch-db.md](./PRD-couch-db.md)** - CouchDB integration
  - Offline-first sync strategy
  - Database schema and design
  - Replication and conflict resolution

### Implementation PRDs

- **[PRD-roady-pwa-changes.md](./PRD-roady-pwa-changes.md)** - PWA feature changes
  - Recent UI updates
  - Dialog improvements
  - Feature enhancements

## Reading Order

For new contributors or reviewers:

1. Start with **PRD.md** - Understand the overall vision
2. Read **PRD-multi-tenant.md** - Understand band management
3. Read **PRD-couch-db.md** - Understand data layer
4. Reference **PRD-roady-pwa-changes.md** - See recent changes

## How to Update

When making significant feature changes:

1. Update the appropriate PRD document
2. Add clear description of changes
3. Include context for why the change was made
4. Keep related documents in sync

## Related Documentation

- See `../README.md` for project overview
- See `../FEATURES.md` for feature list
- See `../TODO.md` for current tasks
- See `../DEPLOY.md` for deployment information
