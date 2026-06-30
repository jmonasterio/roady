// Focused DAL test for the set list feature. Stubs Dexie with an in-memory
// store implementing the subset of the API the DAL uses, then exercises the
// copy/snapshot/soft-delete invariants from SETLIST_FEATURE_PLAN.md §10.

// --- Dexie stub so db.js loads (it news up the options DB at require time) ---
global.Dexie = function () {};
global.Dexie.prototype.version = function () { return { stores: function () {} }; };

const assert = require('assert');
const DB = require('../js/db.js');

// --- In-memory replacement for DB.db (documents + outbox + transaction) ---
function makeMockDb() {
  const docs = new Map();
  const outbox = [];
  let outboxId = 1;
  const documents = {
    async get(id) { return docs.get(id); },
    async put(row) { docs.set(row.doc_id, row); return row.doc_id; },
    where(index) {
      return {
        equals(arr) {
          return {
            async toArray() {
              // index is '[doc_type+tenant_id+deleted]'
              const [t, tenant, del] = arr;
              return [...docs.values()].filter(r =>
                r.doc_type === t && r.tenant_id === tenant && r.deleted === del);
            },
          };
        },
      };
    },
  };
  const outboxTbl = {
    async add(entry) { entry.id = outboxId++; outbox.push(entry); return entry.id; },
  };
  return {
    documents,
    outbox: outboxTbl,
    _docs: docs,
    _outbox: outbox,
    async transaction(_mode, ...rest) {
      const fn = rest[rest.length - 1];
      return await fn();
    },
  };
}

(async () => {
  DB.db = makeMockDb();
  DB.setTenant('t1');

  // 1. Song catalog ------------------------------------------------------
  const r1 = await DB.addSong({ title: 'Zebra', durationSec: 200 });
  const r2 = await DB.addSong({ title: 'Apple', artist: 'X', durationSec: 100 });
  const s1 = r1.id, s2 = r2.id;
  let songs = await DB.getAllSongs();
  assert.strictEqual(songs.length, 2, 'two songs');
  assert.strictEqual(songs[0].title, 'Apple', 'songs sorted by title');
  assert.strictEqual(songs[0].tenant, 't1', 'tenant isolation stamped');

  // 2. Template with two songs (snapshots carried) -----------------------
  const tplRes = await DB.addSetlistTemplate({
    name: 'Bar Show',
    sections: [{ id: 'sec_a', name: 'Set 1', items: [
      { songId: s1, title: 'Zebra', durationSec: 200 },
      { songId: s2, title: 'Apple', durationSec: 100 },
    ] }],
  });
  const tplId = tplRes.id;
  let tpls = await DB.getAllSetlistTemplates();
  assert.strictEqual(tpls.length, 1, 'one template');
  assert.strictEqual(tpls[0].sections[0].items.length, 2, 'template has 2 items');

  // 3. Instance from template = deep copy, re-snapshotted from catalog ----
  const inst = await DB.addSetlistFromTemplate('gig_1', tplId);
  let gigSetlist = await DB.getSetlistForGig('gig_1');
  assert.ok(gigSetlist, 'gig has a set list');
  assert.strictEqual(gigSetlist.sourceTemplateId, tplId, 'provenance recorded');
  assert.strictEqual(gigSetlist.gigId, 'gig_1', 'back-reference to gig');
  assert.strictEqual(gigSetlist.sections[0].items.length, 2, 'instance copied items');
  assert.notStrictEqual(gigSetlist.sections[0].id, 'sec_a', 'section id regenerated on copy');

  // 4. KEY INVARIANT: editing the instance never touches the template ----
  gigSetlist.sections[0].items.push({ songId: s1, title: 'Zebra', durationSec: 200 });
  gigSetlist.sections[0].name = 'Renamed Set';
  await DB.updateSetlist(gigSetlist);
  const tplAfter = (await DB.getAllSetlistTemplates())[0];
  assert.strictEqual(tplAfter.sections[0].items.length, 2, 'template UNCHANGED after instance edit');
  assert.strictEqual(tplAfter.sections[0].name, 'Set 1', 'template section name unchanged');
  const instAfter = await DB.getSetlistForGig('gig_1');
  assert.strictEqual(instAfter.sections[0].items.length, 3, 'instance kept its edit');

  // 5. Duplicate template = independent copy -----------------------------
  await DB.duplicateSetlistTemplate(tplId);
  tpls = await DB.getAllSetlistTemplates();
  assert.strictEqual(tpls.length, 2, 'two templates after duplicate');
  const copy = tpls.find(t => t.name === 'Bar Show (copy)');
  assert.ok(copy, 'copy named with (copy) suffix');
  copy.sections[0].items = [];
  await DB.updateSetlistTemplate(copy);
  const orig = (await DB.getAllSetlistTemplates()).find(t => t.name === 'Bar Show');
  assert.strictEqual(orig.sections[0].items.length, 2, 'editing copy does not affect original');

  // 6. Soft-delete + restore + orphan tolerance --------------------------
  await DB.deleteSong(s1);
  songs = await DB.getAllSongs();
  assert.strictEqual(songs.length, 1, 'deleted song hidden from catalog');
  const deleted = await DB.getDeletedSongs();
  assert.strictEqual(deleted.length, 1, 'deleted song in trash');
  // instance still renders the orphaned song from its snapshot
  const instOrphan = await DB.getSetlistForGig('gig_1');
  assert.ok(instOrphan.sections[0].items.some(i => i.title === 'Zebra'),
    'orphaned song still rendered from snapshot');
  await DB.restoreSong(s1);
  assert.strictEqual((await DB.getAllSongs()).length, 2, 'restore brings song back');

  // 7. Blank set list ----------------------------------------------------
  await DB.addBlankSetlist('gig_2', 'My Gig');
  const blank = await DB.getSetlistForGig('gig_2');
  assert.strictEqual(blank.sourceTemplateId, null, 'blank has no source template');
  assert.deepStrictEqual(blank.sections, [], 'blank starts with no sections');

  // 8. Every write enqueued an outbox op (sync comes free) ---------------
  assert.ok(DB.db._outbox.length >= 10, 'mutations enqueued to outbox: ' + DB.db._outbox.length);

  console.log('ALL SETLIST DAL TESTS PASSED');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
