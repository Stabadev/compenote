'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
function fixture(maxGrade = 20) {
  const data = M.empty(), cls = M.makeClass('Classe'); data.classes.push(cls); M.addStudents(cls, 'Alice\nBob');
  const control = { id: M.uid(), name: 'Devoir', date: '', maxGrade, bonusEnabled: true,
    items: [{ id: M.uid(), type: 'skill', skillId: cls.skills[0].id, maxPoints: maxGrade }], results: {} };
  cls.controls.push(control); return { data, cls, control, studentId: cls.students[0].id };
}
function distribution(f, values, index = 0) {
  M.LEVELS.forEach((level, i) => M.setDistribution(f.control, f.studentId, f.control.items[index].id, level, String(values[i] ?? '')));
}
for (const max of [5, 10, 20]) test('création et barème exact /' + max, () => {
  const f = fixture(max); M.validate(f.data); distribution(f, [0,0,0,3]);
  assert.equal(M.gradeStatus(f.control,f.studentId).grade,max);
  for (const wrong of [max-1,max+1,0,-1,1.001,'20']) { f.control.items[0].maxPoints=wrong; assert.throws(()=>M.validate(f.data)); }
});
for (const [label,max,counts,points] of [
  ['référence, N inférieur au barème',4,[1,0,0,1],2],
  ['trois TA sur cinq',5,[0,0,0,3],5], ['deux NA sur cinq',5,[2,0,0,0],0],
  ['ECA et TA',4,[0,1,0,1],3], ['quatre niveaux',3,[1,1,1,1],1.6875],
  ['N égal au barème',10,[3,0,0,7],7], ['ratio périodique',4,[0,0,2,1],4*2.5/3],
  ['N supérieur au barème',4,[2,4,6,8],4*.725],
  ['un seul NA',5,[1,'','',''],0], ['un seul TA',5,['','','',1],5],
  ['tous NA',5,[50,0,0,0],0], ['tous TA',5,[0,0,0,50],5]
]) test(label, () => {
  const f=fixture(5); f.control.items[0].maxPoints=max;
  distribution(f,counts); const status=M.answerStatus(f.control.items[0],f.control.results[f.studentId].answers[f.control.items[0].id]);
  assert.equal(status.state,'complete'); assert.equal(status.sum,counts.reduce((a,v)=>a+Number(v),0));
  assert.ok(Math.abs(status.weighted-points)<1e-12); assert.ok(Math.abs(status.score-points/max*100)<1e-12);
});
test('vide et quatre zéros : aucune note définitive ni contribution',()=>{
  const f=fixture(5);
  for(const [counts,state] of [[['','','',''],'empty'],[[0,0,0,0],'partial']]) {
    distribution(f,counts); assert.equal(M.gradeStatus(f.control,f.studentId).state,state);
    assert.equal(M.gradeStatus(f.control,f.studentId).grade,null); assert.equal(M.aggregate(f.cls,f.studentId).global,null);
  }
});
for(const raw of ['-1','0.5','1,5','1.0','abc','1e2','Infinity',' ','9007199254740992']) test('items invalides : '+JSON.stringify(raw),()=>{
  const f=fixture(5); distribution(f,[raw,0,0,1]); M.validate(f.data);
  assert.equal(M.gradeStatus(f.control,f.studentId).state,'invalid'); assert.equal(M.gradeStatus(f.control,f.studentId).grade,null);
  assert.equal(M.aggregate(f.cls,f.studentId).global,null);
});
test('cours, bonus, provisoire et note finale',()=>{
  const f=fixture(); f.control.items[0].maxPoints=4;
  f.control.items.push({id:M.uid(),type:'skill',skillId:f.cls.skills[1].id,maxPoints:6},{id:M.uid(),type:'courseQuestion',label:'Cours',maxPoints:10});
  distribution(f,[1,0,0,1]); distribution(f,[0,0,0,3],1); M.setBonus(f.control,f.studentId,'1,5');
  M.validate(f.data); assert.equal(M.gradeStatus(f.control,f.studentId).grade,null); assert.equal(M.gradeStatus(f.control,f.studentId).provisional,9.5);
  assert.equal(M.aggregate(f.cls,f.studentId).global,80);
  M.setAnswer(f.control,f.studentId,f.control.items[2].id,'0'); assert.equal(M.gradeStatus(f.control,f.studentId).grade,9.5);
  M.setAnswer(f.control,f.studentId,f.control.items[2].id,'8.25'); assert.equal(M.gradeStatus(f.control,f.studentId).grade,17.75);
  for(const raw of ['10.01','-1','x']) { M.setAnswer(f.control,f.studentId,f.control.items[2].id,raw); assert.equal(M.gradeStatus(f.control,f.studentId).grade,null); }
  M.setAnswer(f.control,f.studentId,f.control.items[2].id,'10'); distribution(f,[0,0,0,1]);
  assert.equal(M.gradeStatus(f.control,f.studentId).grade,21.5);
  M.setBonus(f.control,f.studentId,''); assert.equal(M.gradeStatus(f.control,f.studentId).grade,20);
  M.setBonus(f.control,f.studentId,'-1'); assert.equal(M.gradeStatus(f.control,f.studentId).state,'invalid');
  M.setBonus(f.control,f.studentId,''); f.control.bonusEnabled=false; assert.throws(()=>M.setBonus(f.control,f.studentId,'1'));
});
test('aucun arrondi des contributions périodiques avant addition',()=>{
  const f=fixture(5);f.control.items[0].maxPoints=2;
  f.control.items.push({id:M.uid(),type:'skill',skillId:f.cls.skills[1].id,maxPoints:3});
  distribution(f,[0,0,2,1]);distribution(f,[0,0,2,1],1);M.validate(f.data);
  assert.equal(M.gradeStatus(f.control,f.studentId).grade,2*(2.5/3)+3*(2.5/3));
  assert.notEqual(M.gradeStatus(f.control,f.studentId).grade,4.166667);
});
test('bilan pondéré par barèmes, indépendant du nombre d’items, hors cours/bonus',()=>{
  const f=fixture(5);f.control.items[0].maxPoints=4;f.control.items.push({id:M.uid(),type:'courseQuestion',label:'Cours',maxPoints:1});
  distribution(f,[1,0,0,1]);M.setBonus(f.control,f.studentId,'99');
  const second={id:M.uid(),name:'Second',date:'',maxGrade:10,bonusEnabled:false,items:[{id:M.uid(),type:'skill',skillId:f.cls.skills[0].id,maxPoints:6},{id:M.uid(),type:'courseQuestion',label:'Cours',maxPoints:4}],results:{}};
  f.cls.controls.push(second);M.setDistribution(second,f.studentId,second.items[0].id,'TA','100');M.validate(f.data);
  const total=M.aggregate(f.cls,f.studentId).skills[f.cls.skills[0].id];assert.equal(total.score,80);assert.equal(total.count,2);assert.equal(total.max,10);
  M.setDistribution(second,f.studentId,second.items[0].id,'TA','1');assert.equal(M.aggregate(f.cls,f.studentId).global,80);
});
test('verrouillage dès la première saisie, même effacée ; nom et date modifiables',()=>{
  const f=fixture(); assert.equal(M.gradingLocked(f.control),false);
  M.updateGraded(f.control,{...f.control,name:'Avant'});distribution(f,[0,0,0,1]);
  M.updateGraded(f.control,{...f.control,name:'Après',date:'2026-10-30'});assert.equal(f.control.name,'Après');
  for(const change of [{maxGrade:10},{items:[]},{bonusEnabled:false}]) assert.throws(()=>M.updateGraded(f.control,{...f.control,...change}));
  M.clearAnswer(f.control,f.studentId,f.control.items[0].id);assert.equal(M.gradingLocked(f.control),true);
});
test('plusieurs questions et centièmes de barème',()=>{
  const f=fixture(5);f.control.items[0].maxPoints=.1;
  f.control.items.push({id:M.uid(),type:'skill',skillId:f.cls.skills[1].id,maxPoints:.2},{id:M.uid(),type:'courseQuestion',label:'A',maxPoints:2},{id:M.uid(),type:'courseQuestion',label:'B',maxPoints:2.7});
  M.validate(f.data);distribution(f,[0,0,0,1]);distribution(f,[0,0,0,1],1);
  M.setAnswer(f.control,f.studentId,f.control.items[2].id,'1,25');M.setAnswer(f.control,f.studentId,f.control.items[3].id,'2');
  assert.ok(Math.abs(M.gradeStatus(f.control,f.studentId).grade-3.55)<1e-12);
});
