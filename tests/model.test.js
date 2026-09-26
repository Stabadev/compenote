'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js'), S = require('../js/storage.js');
function fixture() {
  const data = M.empty(), cls = M.makeClass('1STH'); data.classes.push(cls);
  M.addStudents(cls, 'Alice\nBob');
  cls.controls.push({ id: M.uid(), mode: 'legacyDistribution', name: 'Pythagore', date: '2026-09-19', skills: [{ skillId: cls.skills[0].id, max: 5 }], results: {} });
  return { data, cls, student: cls.students[0], control: cls.controls[0], skill: cls.skills[0] };
}
function memory() {
  const values = new Map();
  return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}
test('exemple métier : PA 3 + TA 2 sur 5 = 85 %', () => {
  assert.deepEqual(M.resultStatus({ NA: '0', ECA: '0', PA: '3', TA: '2' }, 5), { state: 'complete', sum: 5, weighted: 4.25, score: 85 });
});
test('vide et zéro restent distincts ; une vraie copie tout NA compte', () => {
  assert.equal(M.resultStatus(M.blank(), 5).state, 'empty');
  assert.equal(M.resultStatus({ ...M.blank(), NA: '0' }, 5).state, 'partial');
  assert.equal(M.resultStatus({ ...M.blank(), NA: '5' }, 5).score, 0);
  assert.equal(M.resultStatus({ ...M.blank(), TA: '5' }, 5).score, 100);
});
test('validation stricte : négatifs, texte, exponentielle, trop de décimales, infinis', () => {
  for (const value of ['-1', 'abc', '3abc', '1e2', '0.001', 'NaN', 'Infinity', '100001', '1,']) {
    assert.equal(M.parsePoints(value).kind, 'invalid', value);
    assert.equal(M.resultStatus({ ...M.blank(), NA: value, TA: '5' }, 5).state, 'invalid');
  }
  assert.equal(M.parsePoints('0,25').value, .25);
  assert.equal(M.parsePoints('1.50').value, 1.5);
});
test('partiel et dépassement sont exclus et différenciés', () => {
  assert.equal(M.resultStatus({ ...M.blank(), TA: '4' }, 5).state, 'partial');
  assert.equal(M.resultStatus({ ...M.blank(), TA: '6' }, 5).state, 'excess');
  for (const raw of ['4', '6', '-1']) {
    const f = fixture(); M.setResult(f.control, f.student.id, f.skill.id, 'TA', raw);
    assert.equal(M.aggregate(f.cls, f.student.id).skills[f.skill.id].score, null);
  }
});
test('pondération des barèmes et exclusion du contrôle vide', () => {
  const f = fixture(); M.setResult(f.control, f.student.id, f.skill.id, 'TA', '5');
  f.cls.controls.push({ id: M.uid(), mode: 'legacyDistribution', name: 'Autre', date: '', skills: [{ skillId: f.skill.id, max: 15 }], results: { [f.student.id]: { [f.skill.id]: { ...M.blank(), NA: '15' } } } });
  f.cls.controls.push({ id: M.uid(), mode: 'legacyDistribution', name: 'Vide', date: '', skills: [{ skillId: f.skill.id, max: 100 }], results: {} });
  const total = M.aggregate(f.cls, f.student.id).skills[f.skill.id];
  assert.equal(total.score, 25); assert.equal(total.max, 20); assert.equal(total.count, 2);
});
test('renommer classe, élève et compétence ne change pas les calculs', () => {
  const f = fixture(); M.setResult(f.control, f.student.id, f.skill.id, 'TA', '5');
  f.cls.name = '2AGO'; f.student.name = 'Autre nom'; f.skill.name = 'Compétence renommée';
  assert.equal(M.aggregate(f.cls, f.student.id).skills[f.skill.id].score, 100); M.validate(f.data);
});
test('validation profonde des sauvegardes', () => {
  const mutations = [
    d => d.version = 999, d => d.classes[0].students[0] = null,
    d => d.classes[0].controls[0].skills = [], d => d.classes[0].controls[0].skills[0].max = '5',
    d => d.classes[0].controls[0].skills[0].max = Infinity,
    d => d.classes[0].controls[0].skills[0].skillId = 'inconnu',
    d => d.classes[0].students[1].id = d.classes[0].students[0].id,
    d => d.classes[0].controls[0].results.inconnu = {},
    d => d.classes[0].controls[0].date = '2026-02-30',
    d => d.classes[0].id = '__proto__'
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f.data); assert.throws(() => M.validate(f.data)); }
});
test('brouillons invalides préservés à l’export mais exclus des moyennes', () => {
  const f = fixture(); M.setResult(f.control, f.student.id, f.skill.id, 'NA', '-2');
  const imported = S.parseBackup(JSON.stringify(f.data));
  assert.equal(imported.classes[0].controls[0].results[f.student.id][f.skill.id].NA, '-2');
  assert.equal(M.aggregate(imported.classes[0], f.student.id).global, null);
});
test('stockage : aucun retour silencieux à vide sur corruption', () => {
  const storage = memory(); storage.setItem(S.KEY, '{broken');
  assert.throws(() => S.createStore(storage).load(), error => error.kind === 'corrupt');
  assert.equal(storage.getItem(S.KEY), '{broken');
});
test('stockage : échec d’écriture conserve la précédente version', () => {
  const storage = memory(), store = S.createStore(storage), { data } = fixture();
  store.load(); store.write(data); const before = storage.getItem(S.KEY);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  data.classes[0].name = 'Modification';
  assert.throws(() => store.write(data), error => error.kind === 'write');
  assert.equal(storage.getItem(S.KEY), before);
});
test('deux fenêtres : empêcher l’écrasement d’une révision plus récente', () => {
  const storage = memory(), a = S.createStore(storage), b = S.createStore(storage);
  const da = a.load().data, db = b.load().data; da.classes.push(M.makeClass('A')); a.write(da);
  db.classes.push(M.makeClass('B'));
  assert.throws(() => b.write(db), error => error.kind === 'conflict');
  assert.equal(JSON.parse(storage.getItem(S.KEY)).classes[0].name, 'A');
});
test('copie précédente et restauration sans écraser la copie valide par du contenu corrompu', () => {
  const storage = memory(), store = S.createStore(storage), data = fixture().data;
  store.load(); store.write(data); const before = M.clone(data); data.classes[0].name = 'Autre'; store.write(data);
  assert.deepEqual(store.previous(), before);
  storage.setItem(S.KEY, 'cassé'); const recovery = S.createStore(storage); assert.throws(() => recovery.load());
  recovery.write(before, { recovery: true }); assert.deepEqual(recovery.previous(), before);
});
test('migration prudente du prototype, original conservé', () => {
  const old = { students: [{ id: 'old', name: 'Alice' }], controls: [{ id: 'c', name: 'Test', skills: [{ name: 'Réaliser', max: 5 }], results: { old: { 'Réaliser': { NA: 0, ECA: 0, PA: 3, TA: 2 } } } }] };
  const storage = memory(); storage.setItem(S.LEGACY[0], JSON.stringify(old)); const store = S.createStore(storage), loaded = store.load();
  assert.equal(loaded.migrated, true); assert.equal(M.aggregate(loaded.data.classes[0], loaded.data.classes[0].students[0].id).global, 85);
  store.write(loaded.data); assert.deepEqual(JSON.parse(storage.getItem(S.LEGACY[0])), old);
});
test('dates impossibles refusées ; sauvegardes malformées refusées', () => {
  assert.equal(M.validDate('2024-02-29'), true); assert.equal(M.validDate('2025-02-29'), false);
  assert.throws(() => S.parseBackup('pas une sauvegarde')); assert.throws(() => S.parseBackup('{"version":1}'));
});
test('classes indépendantes et homonymes autorisés', () => {
  const f = fixture(), second = M.makeClass('2AGO'); f.data.classes.push(second); M.addStudents(second, 'Alice\nAlice');
  M.setResult(f.control, f.student.id, f.skill.id, 'TA', '5'); M.validate(f.data);
  assert.notEqual(second.students[0].id, second.students[1].id);
  assert.equal(M.aggregate(second, second.students[0].id).global, null);
});
test('35 élèves et 50 contrôles : agrégats cohérents', () => {
  const cls = M.makeClass('Charge'); M.addStudents(cls, Array.from({ length: 35 }, (_, i) => 'Élève ' + i).join('\n'));
  for (let i = 0; i < 50; i++) {
    const c = { id: M.uid(), mode: 'legacyDistribution', name: 'Contrôle ' + i, date: '', skills: cls.skills.map(s => ({ skillId: s.id, max: 10 })), results: {} };
    cls.controls.push(c); for (const student of cls.students) for (const skill of cls.skills) M.setResult(c, student.id, skill.id, 'TA', '10');
  }
  const data = M.empty(); data.classes.push(cls); M.validate(data);
  for (const s of cls.students) { const totals = M.aggregate(cls, s.id); assert.equal(totals.global, 100); assert.equal(totals.skills[cls.skills[0].id].count, 50); }
});
test('import explicite du fichier exporté depuis le prototype', () => {
  const old = { students: [{id:'s',name:'Alice'}], controls: [] };
  const migrated = S.parseBackup(JSON.stringify(old));
  assert.equal(migrated.version, M.VERSION); assert.equal(migrated.classes[0].students[0].name, 'Alice');
  assert.throws(() => S.parseBackup(JSON.stringify({ ...old, version: 999 })));
});
test('refus d’accès au stockage : erreur explicite et aucune base vide', () => {
  const store = S.createStore({ getItem() { throw new Error('SecurityError'); } });
  assert.throws(() => store.load(), error => error.kind === 'read');
  assert.throws(() => store.write(M.empty()), error => error.kind === 'read');
});
test('couleurs strictes aux seuils ; pas d’arrondi qui annonce un seuil non atteint', () => {
  global.CarnetModel = M; require('../js/views.js');
  const V = global.CarnetViews;
  assert.equal(V.scoreClass(24.99), 'na'); assert.equal(V.scoreClass(25), 'eca');
  assert.equal(V.scoreClass(49.99), 'eca'); assert.equal(V.scoreClass(50), 'pa');
  assert.equal(V.scoreClass(74.99), 'pa'); assert.equal(V.scoreClass(75), 'ta');
  assert.equal(V.percent(74.99), 'Moins de 75 %'); assert.equal(V.percent(85), '85 %');
});
