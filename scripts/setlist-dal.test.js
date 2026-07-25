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
    async delete(id) { docs.delete(id); },
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
    async get(id) { return outbox.find(e => e.id === id); },
    async delete(id) {
      const i = outbox.findIndex(e => e.id === id);
      if (i >= 0) outbox.splice(i, 1);
    },
    async update(id, patch) {
      const e = outbox.find(x => x.id === id);
      if (e) Object.assign(e, patch);
      return e ? 1 : 0;
    },
    where(field) {
      return {
        equals(val) {
          const match = () => outbox.filter(e => e[field] === val);
          return {
            async toArray() { return match(); },
            async modify(patch) {
              const rows = match();
              rows.forEach(e => Object.assign(e, patch));
              return rows.length;
            },
            limit(n) { return { async toArray() { return match().slice(0, n); } }; },
          };
        },
      };
    },
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

  // 9. Soft-delete enqueues an op:'delete' carrying the LWW guard version --
  const dr = await DB.addSong({ title: 'Doomed', durationSec: 60 });
  const beforeDel = (await DB.getAllSongs()).find(s => s._id === dr.id);
  await DB.deleteSong(dr.id);
  const delEntry = DB.db._outbox.find(e => e.doc_id === dr.id && e.op === 'delete');
  assert.ok(delEntry, 'soft-delete enqueues an op:delete outbox entry (not a PUT)');
  assert.strictEqual(delEntry.ifVersion, beforeDel._version,
    'delete entry carries ifVersion = version at delete time');
  await DB.restoreSong(dr.id);

  // 10. outboxRequeueInflight rescues entries stranded by a refresh -------
  await DB.db.outbox.update(DB.db._outbox[0].id, { status: 'inflight' });
  await DB.outboxRequeueInflight();
  assert.ok(DB.db._outbox.every(e => e.status !== 'inflight'),
    'no inflight entries remain after requeue');

  // 11. outboxDrop decrements the doc pending counter and removes entry ---
  const pr = await DB.addSong({ title: 'PendingProbe', durationSec: 10 });
  const probeEntry = DB.db._outbox.find(e => e.doc_id === pr.id);
  const pendingBefore = DB.db._docs.get(pr.id).pending;
  await DB.outboxDrop(probeEntry.id);
  assert.strictEqual(DB.db._docs.get(pr.id).pending, pendingBefore - 1,
    'outboxDrop decrements the doc pending counter');
  assert.ok(!DB.db._outbox.find(e => e.id === probeEntry.id), 'outboxDrop removes the entry');

  // 12. outboxAck keeps the row version when the server returns none (204) -
  const av = await DB.addSong({ title: 'AckProbe', durationSec: 10 });
  const ackEntry = DB.db._outbox.find(e => e.doc_id === av.id);
  const ackRowVer = DB.db._docs.get(av.id).version;
  await DB.outboxAck(ackEntry.id, { version: undefined, updated_at: undefined });
  assert.strictEqual(DB.db._docs.get(av.id).version, ackRowVer,
    'ack with no version leaves the row version intact (no blind-PUT trap)');
  assert.strictEqual(DB.db._docs.get(av.id).pending, 0, 'ack still decrements pending to 0');

  // 13. applyServerChange tombstones on a delete frame (no hard-delete) ---
  const tv = await DB.addSong({ title: 'TombProbe', durationSec: 10 });
  const tvRow = DB.db._docs.get(tv.id);
  tvRow.pending = 0; await DB.db.documents.put(tvRow); // simulate acked
  await DB.applyServerChange({ doc_id: tv.id, version: tvRow.version + 1, deleted: true, doc: null });
  const tomb = DB.db._docs.get(tv.id);
  assert.ok(tomb, 'server delete keeps a local row (not hard-deleted)');
  assert.strictEqual(tomb.deleted, 1, 'row is marked deleted');
  assert.ok((await DB.getDeletedSongs()).some(s => s._id === tv.id),
    'server-deleted doc appears in trash (restorable) on the non-deleting device');

  // 14. Doc ids are collision-resistant within the same millisecond -------
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(DB._newId('probe_'));
  assert.strictEqual(ids.size, 100, 'minted ids are unique within a tight loop');

  console.log('ALL SETLIST DAL TESTS PASSED');
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
