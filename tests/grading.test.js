'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
function fixture(maxGrade = 20) {
  const data = M.empty(), cls = M.makeClass('Classe'); data.classes.push(cls); M.addStudents(cls, 'Alice\nBob');
  const control = { id: M.uid(), mode: 'graded', name: 'Devoir', date: '', maxGrade, bonusEnabled: true,
    items: [{ id: M.uid(), type: 'skill', skillId: cls.skills[0].id, maxPoints: maxGrade }], results: {} };
  cls.controls.push(control); return { data, cls, control, studentId: cls.students[0].id };
}
function distribution(f, index, values) {
  M.clearAnswer(f.control, f.studentId, f.control.items[index].id);
  M.LEVELS.forEach((level, i) => M.setDistribution(f.control, f.studentId, f.control.items[index].id, level, String(values[i] ?? '')));
}
function reference() {
  const f = fixture();
  f.control.items[0].maxPoints = 5;
  f.control.items.push({ id: M.uid(), type: 'skill', skillId: f.cls.skills[1].id, maxPoints: 8 }, { id: M.uid(), type: 'courseQuestion', label: 'Cours', maxPoints: 7 });
  distribution(f, 0, [1,1,2,1]); distribution(f, 1, [0,2,4,2]);
  M.setAnswer(f.control, f.studentId, f.control.items[2].id, '5');
  M.setBonus(f.control, f.studentId, '1'); return f;
}
for (const max of [5, 10, 20]) test('devoir /' + max + ' : validation et calcul', () => {
  const f = fixture(max); M.validate(f.data);
  distribution(f, 0, [0,0,0,f.control.maxGrade]);
  assert.equal(M.gradeStatus(f.control, f.studentId).grade, max);
  for (const wrong of [max - 1, max + 1]) { f.control.items[0].maxPoints = wrong; assert.throws(() => M.validate(f.data)); }
});
test('exemple de référence : 15 / 20, cours et bonus hors bilan', () => {
  const f = reference(); M.validate(f.data);
  assert.equal(M.gradeStatus(f.control, f.studentId).grade, 15);
  const aggregate = M.aggregate(f.cls, f.studentId);
  assert.equal(aggregate.skills[f.cls.skills[0].id].score, 60);
  assert.equal(aggregate.skills[f.cls.skills[1].id].score, 75);
  assert.equal(aggregate.global, 9 / 13 * 100);
});
for (const [label, max, values, weighted, score] of [
  ['cas 1',4,[1,2,0,1],2,50], ['cas 2',5,[1,1,2,1],3,60],
  ['tout NA',4,[4,0,0,0],0,0], ['tout TA',4,[0,0,0,4],4,100],
  ['sur 8',8,[0,2,4,2],6,75]
]) test('répartition '+label+' : somme, acquisition et contribution', () => {
  const f=fixture(10); f.control.items[0].maxPoints=max;
  f.control.items.push({id:M.uid(),type:'courseQuestion',label:'Cours',maxPoints:10-max});
  distribution(f,0,values); M.setAnswer(f.control,f.studentId,f.control.items[1].id,'0'); M.validate(f.data);
  const answer=f.control.results[f.studentId].answers[f.control.items[0].id], status=M.answerStatus(f.control.items[0],answer);
  assert.equal(status.sum,max); assert.equal(status.state,'complete'); assert.equal(status.weighted,weighted); assert.equal(status.score,score);
  assert.deepEqual(status,M.resultStatus(answer,max)); assert.equal(M.gradeStatus(f.control,f.studentId).grade,weighted);
});
test('vide, zéro explicite, partiel et excessif ne produisent pas de note ni de bilan', () => {
  const f=fixture(5),item=f.control.items[0];
  for (const [values,state] of [[['','','',''],'empty'],[[0,0,0,0],'partial'],[[0,0,0,4],'partial'],[[0,0,0,6],'excess']]) {
    distribution(f,0,values); const answer=f.control.results[f.studentId].answers[item.id];
    assert.equal(M.answerStatus(item,answer).state,state); assert.equal(M.gradeStatus(f.control,f.studentId).grade,null);
    assert.equal(M.gradeStatus(f.control,f.studentId).provisional,0); assert.equal(M.aggregate(f.cls,f.studentId).global,null);
  }
  distribution(f,0,[5,'','','']); assert.equal(M.gradeStatus(f.control,f.studentId).grade,0);
});
test('brouillons invalides préservés mais exclus du calcul', () => {
  const f = fixture();
  for (const raw of ['101', '-1', 'abc', '1e2', '50,', '0.001']) {
    M.setDistribution(f.control, f.studentId, f.control.items[0].id, 'TA', raw); M.validate(f.data);
    assert.equal(M.gradeStatus(f.control, f.studentId).state, 'invalid');
    assert.equal(M.gradeStatus(f.control, f.studentId).grade, null);
    assert.equal(M.aggregate(f.cls, f.studentId).global, null);
    assert.equal(M.upgrade(f.data).classes[0].controls[0].results[f.studentId].answers[f.control.items[0].id].TA, raw);
  }
});
test('cours : vide distinct de zéro, plusieurs questions, limites', () => {
  const f = reference(), question = f.control.items[2];
  M.setAnswer(f.control, f.studentId, question.id, '');
  assert.equal(M.gradeStatus(f.control, f.studentId).grade, null);
  assert.equal(M.aggregate(f.cls, f.studentId).skills[f.cls.skills[0].id].score, 60);
  M.setAnswer(f.control, f.studentId, question.id, '0');
  assert.equal(M.gradeStatus(f.control, f.studentId).grade, 10);
  for (const raw of ['7.01', '-1', 'x']) {
    M.setAnswer(f.control, f.studentId, question.id, raw);
    assert.equal(M.gradeStatus(f.control, f.studentId).state, 'invalid');
  }
  question.maxPoints = 4;
  const second = { id: M.uid(), type: 'courseQuestion', label: 'Définition', maxPoints: 3 }; f.control.items.push(second);
  M.setAnswer(f.control, f.studentId, question.id, '4'); M.setAnswer(f.control, f.studentId, second.id, '3'); M.validate(f.data);
  assert.equal(M.gradeStatus(f.control, f.studentId).grade, 17);
});
test('bonus vide, positif, au-dessus du maximum, invalide et désactivé', () => {
  const f = fixture(); distribution(f, 0, [0,0,0,f.control.maxGrade]);
  assert.equal(M.gradeStatus(f.control, f.studentId).grade, 20);
  M.setBonus(f.control, f.studentId, '1'); assert.equal(M.gradeStatus(f.control, f.studentId).grade, 21);
  assert.equal(M.aggregate(f.cls, f.studentId).global, 100);
  M.setBonus(f.control, f.studentId, ''); assert.equal(M.gradeStatus(f.control, f.studentId).grade, 20);
  M.setBonus(f.control, f.studentId, '-1'); assert.equal(M.gradeStatus(f.control, f.studentId).grade, null);
  M.setBonus(f.control, f.studentId, ''); f.control.bonusEnabled = false; M.validate(f.data);
  assert.throws(() => M.setBonus(f.control, f.studentId, '1'));
});
test('barème exact en centièmes et pas d’arrondi des points par élément', () => {
  const f = fixture(5); f.control.items[0].maxPoints = 0.1;
  f.control.items.push({ id: M.uid(), type: 'skill', skillId: f.cls.skills[1].id, maxPoints: 0.2 }, { id: M.uid(), type: 'courseQuestion', label: 'Cours', maxPoints: 4.7 });
  distribution(f,0,['0,01','0,02','0,03','0,04']); distribution(f,1,['0.02','0.04','0.06','0.08']);
  M.setAnswer(f.control,f.studentId,f.control.items[2].id,'0');
  M.validate(f.data); assert.equal(M.gradeStatus(f.control, f.studentId).grade, 0.2175);
});
test('validation des références, identifiants et formes des nouvelles réponses', () => {
  for (const corrupt of [
    f => f.control.maxGrade = 15,
    f => f.control.items[0].skillId = 'inconnu',
    f => f.control.items[0].maxPoints = '20',
    f => f.control.items[0].maxPoints = 0,
    f => f.control.items.push({ ...f.control.items[0], id: M.uid() }),
    f => f.control.results.inconnu = { answers: {}, bonusRaw: '' },
    f => f.control.results[f.studentId] = { answers: { inconnu: { raw: '5' } }, bonusRaw: '' },
    f => f.control.results[f.studentId] = { answers: {}, bonusRaw: 1 },
    f => f.control.items[0] = { id: M.uid(), type: 'courseQuestion', skillId: f.cls.skills[0].id, label: 'Cours', maxPoints: 20 }
  ]) { const f = fixture(); corrupt(f); assert.throws(() => M.validate(f.data)); }
});
test('verrouillage après première saisie, même effacée ; nom et date restent modifiables', () => {
  const f = fixture(), control = f.control;
  assert.equal(M.gradingLocked(control), false);
  M.setDistribution(control, f.studentId, control.items[0].id, 'NA', '20');
  assert.equal(M.gradingLocked(control), true);
  M.updateGraded(control, { ...control, name: 'Renommé', date: '2026-09-25' });
  assert.equal(control.name, 'Renommé');
  assert.throws(() => M.updateGraded(control, { ...control, bonusEnabled: false }));
  assert.throws(() => M.updateGraded(control, { ...control, maxGrade: 10 }));
  assert.throws(() => M.updateGraded(control, { ...control, items: [] }));
  M.clearAnswer(control, f.studentId, control.items[0].id); assert.equal(M.gradingLocked(control), true);
});
test('bilans pondérés sur plusieurs devoirs et coexistence historique', () => {
  const f = fixture(5), second = { ...M.clone(f.control), id: M.uid(), maxGrade: 10, results: {} };
  second.items[0].id = M.uid(); second.items[0].maxPoints = 10; f.cls.controls.push(second);
  distribution(f, 0, [0,0,0,f.control.maxGrade]); M.setDistribution(second, f.studentId, second.items[0].id, 'ECA', '10');
  assert.equal(M.aggregate(f.cls, f.studentId).skills[f.cls.skills[0].id].score, 10 / 15 * 100);
  const legacy = { id: M.uid(), mode: 'legacyDistribution', name: 'Ancien', date: '', skills: [{ skillId: f.cls.skills[0].id, max: 5 }], results: {} };
  f.cls.controls.push(legacy); M.setResult(legacy, f.studentId, f.cls.skills[0].id, 'NA', '5'); M.validate(f.data);
  const total = M.aggregate(f.cls, f.studentId).skills[f.cls.skills[0].id];
  assert.equal(total.score, 50); assert.equal(total.count, 3); assert.equal(total.max, 20);
});
test('migration V1 exacte, barème /25, ratios non arrondis et brouillons préservés', () => {
  const data = M.empty(), cls = M.makeClass('Historique'); data.version = 1; data.classes.push(cls); M.addStudents(cls, 'Alice\nBob');
  cls.controls.push({ id: M.uid(), name: 'Ancien', date: '', skills: [{ skillId: cls.skills[0].id, max: 3 }, { skillId: cls.skills[1].id, max: 22 }], results: {} });
  M.setResult(cls.controls[0], cls.students[0].id, cls.skills[0].id, 'PA', '1'); M.setResult(cls.controls[0], cls.students[0].id, cls.skills[0].id, 'TA', '2');
  M.setResult(cls.controls[0], cls.students[1].id, cls.skills[1].id, 'NA', '-2');
  const source = JSON.stringify(data), before = cls.students.map(s => M.aggregate(cls, s.id));
  const migrated = M.migrateV1(data); M.validate(migrated);
  assert.equal(JSON.stringify(data), source);
  assert.deepEqual(migrated.classes[0].students.map(s => M.aggregate(migrated.classes[0], s.id)), before);
  assert.equal(migrated.classes[0].controls[0].mode, 'legacyDistribution');
  assert.equal(Object.hasOwn(migrated.classes[0].controls[0], 'maxGrade'), false);
  const reversed = M.clone(migrated); reversed.version = 1; delete reversed.classes[0].controls[0].mode;
  assert.deepEqual(reversed, data);
  assert.deepEqual(M.upgrade(migrated), migrated);
  assert.throws(() => M.upgrade({ ...data, version: 999 }));
});
const S = require('../js/storage.js');
function memory() {
  const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function oldDocument() {
  const data = M.empty(), cls = M.makeClass('V1'); data.version = 1; data.classes.push(cls); M.addStudents(cls, 'Alice');
  cls.controls.push({ id: M.uid(), name: 'Brouillon', date: '', skills: [{ skillId: cls.skills[0].id, max: 5 }], results: {} });
  M.setResult(cls.controls[0], cls.students[0].id, cls.skills[0].id, 'TA', '2,'); return data;
}
test('stockage V1 → V2, source et copie précédente intactes, rechargement', () => {
  const storage = memory(), old = oldDocument(), raw = JSON.stringify(old);
  storage.setItem(S.V1, raw); storage.setItem(S.V1_PREVIOUS, raw);
  const store = S.createStore(storage), loaded = store.load();
  assert.equal(loaded.migrated, true); store.write(loaded.data);
  assert.equal(storage.getItem(S.V1), raw); assert.equal(storage.getItem(S.V1_PREVIOUS), raw);
  assert.deepEqual(S.createStore(storage).load(), { data: loaded.data, migrated: false });
  assert.deepEqual(store.previous(), loaded.data);
  assert.deepEqual(S.parseBackup(raw), loaded.data);
  assert.deepEqual(S.parseBackup(storage.getItem(S.KEY)), loaded.data);
  assert.equal(store.rawCopies()[S.V1], raw);
});
test('migration : refus sur corruption V1/V2 et échec d’écriture sans perte', () => {
  const storage = memory(), raw = JSON.stringify(oldDocument()); storage.setItem(S.V1, raw);
  storage.setItem(S.KEY, 'cassé'); assert.throws(() => S.createStore(storage).load(), e => e.kind === 'corrupt');
  storage.values.delete(S.KEY); const store = S.createStore(storage), loaded = store.load();
  storage.setItem = () => { throw new Error('Quota'); }; assert.throws(() => store.write(loaded.data), e => e.kind === 'write');
  assert.equal(storage.getItem(S.V1), raw); assert.equal(storage.getItem(S.KEY), null);
  storage.values.set(S.V1, 'cassé'); assert.throws(() => S.createStore(storage).load(), e => e.kind === 'legacy');
});
test('migration : modification concurrente de la source bloquée', () => {
  const storage = memory(); storage.setItem(S.V1, JSON.stringify(oldDocument()));
  const store = S.createStore(storage), loaded = store.load(); storage.setItem(S.V1, JSON.stringify(oldDocument()));
  assert.equal(store.changedExternally(), true); assert.throws(() => store.write(loaded.data), e => e.kind === 'conflict');
  assert.equal(storage.getItem(S.KEY), null);
});
test('sauvegarde des corrections V2 et brouillons puis export/import fidèle', () => {
  const f = reference(), storage = memory(), store = S.createStore(storage); store.load(); store.write(f.data);
  M.setDistribution(f.control, f.studentId, f.control.items[0].id, 'TA', '2,'); store.write(f.data);
  const loaded = S.createStore(storage).load().data;
  assert.deepEqual(loaded, f.data); assert.deepEqual(S.parseBackup(JSON.stringify(loaded)), f.data);
  assert.equal(M.gradeStatus(loaded.classes[0].controls[0], f.studentId).grade, null);
  assert.equal(M.gradeStatus(store.previous().classes[0].controls[0], f.studentId).grade, 15);
});
test('récupération explicite de la source V1 après corruption V2, sans réécriture V1', () => {
  const storage = memory(), raw = JSON.stringify(oldDocument()); storage.setItem(S.V1, raw); storage.setItem(S.KEY, 'cassé');
  const store = S.createStore(storage); assert.throws(() => store.load());
  const original = store.original(); assert.deepEqual(original, M.migrateV1(JSON.parse(raw)));
  store.write(original, { recovery: true }); assert.equal(storage.getItem(S.V1), raw);
  assert.deepEqual(S.createStore(storage).load().data, original);
});
function experimentalDocument(raw = '60') {
  const f=reference(); f.data.version=2;
  f.control.results[f.studentId].answers[f.control.items[0].id]={raw};
  f.control.results[f.studentId].answers[f.control.items[1].id]={raw:'75'};
  return f;
}
test('version expérimentale : conservation exacte des pourcentages, sans invention de répartition', () => {
  for (const raw of ['60','0','','85,','invalide']) {
    const f=experimentalDocument(raw), before=JSON.stringify(f.data); M.validateV2(f.data);
    const data=M.upgrade(f.data), control=data.classes[0].controls[0], result=control.results[f.studentId];
    assert.equal(data.version,3); assert.equal(JSON.stringify(f.data),before);
    assert.equal(result.experimentalPercentages[control.items[0].id],raw);
    assert.equal(Object.hasOwn(result.answers,control.items[0].id),false);
    assert.deepEqual(result.answers[control.items[2].id],{raw:'5'}); assert.equal(result.bonusRaw,'1');
    assert.equal(M.gradeStatus(control,f.studentId).grade,null); assert.equal(M.aggregate(data.classes[0],f.studentId).global,null);
    M.setDistribution(control,f.studentId,control.items[0].id,'TA','5');
    assert.equal(M.aggregate(data.classes[0],f.studentId).skills[f.cls.skills[0].id].score,100);
    assert.equal(result.experimentalPercentages[control.items[0].id],raw);
    assert.deepEqual(S.parseBackup(JSON.stringify(data)),data);
    assert.deepEqual(M.upgrade(data),data);
  }
});
test('version expérimentale : conservation des contrôles historiques et de leurs bilans', () => {
  const data=M.migrateV1(oldDocument());data.version=2;
  const before=M.aggregate(data.classes[0],data.classes[0].students[0].id), converted=M.upgrade(data);
  assert.deepEqual(converted.classes,data.classes); assert.deepEqual(M.aggregate(converted.classes[0],converted.classes[0].students[0].id),before);
});
test('migration du stockage expérimental vers une nouvelle clé, copie et import préservés', () => {
  const f=experimentalDocument(),raw=JSON.stringify(f.data),storage=memory();storage.setItem(S.V2,raw);storage.setItem(S.V2_PREVIOUS,raw);
  const store=S.createStore(storage),loaded=store.load();assert.equal(loaded.migrated,true);store.write(loaded.data);
  assert.equal(storage.getItem(S.V2),raw);assert.equal(storage.getItem(S.V2_PREVIOUS),raw);
  assert.deepEqual(S.createStore(storage).load().data,loaded.data);assert.deepEqual(store.previous(),loaded.data);
  assert.deepEqual(store.original(),loaded.data);assert.deepEqual(S.parseBackup(raw),loaded.data);
  storage.setItem(S.KEY,'cassé');assert.throws(()=>S.createStore(storage).load(),e=>e.kind==='corrupt');
});
test('refuser les réponses de pourcentage dans le nouveau schéma et les archives malformées', () => {
  const f=experimentalDocument();f.data.version=3;assert.throws(()=>M.validate(f.data));
  const g=reference();g.control.results[g.studentId].experimentalPercentages={inconnu:'50'};assert.throws(()=>M.validate(g.data));
  assert.throws(()=>M.setAnswer(g.control,g.studentId,g.control.items[0].id,'50'));
});
