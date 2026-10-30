'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../js/model.js'),S=require('../js/storage.js');
function memory() {const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
function fixture() {
  const data=M.empty(),cls=M.makeClass('Classe');data.classes.push(cls);M.addStudents(cls,'Alice\nBob');
  const control={id:M.uid(),name:'Devoir',date:'',maxGrade:5,bonusEnabled:true,items:[{id:M.uid(),type:'skill',skillId:cls.skills[0].id,maxPoints:5}],results:{}};cls.controls.push(control);
  M.setDistribution(control,cls.students[0].id,control.items[0].id,'TA','3');return {data,cls,control};
}
test('nouvelle clé exclusivement : anciennes données ignorées et intactes',()=>{
  const storage=memory();for(const key of ['mon_carnet_v1','mon_carnet_v2','mon_carnet_v3','carnet_competences_math_v5','gestion_competences_points_v4'])storage.setItem(key,'ancien');
  const before=new Map(storage.values),store=S.createStore(storage),data=store.load().data;assert.deepEqual(data.classes,[]);store.write(fixture().data);
  for(const [key,value]of before)assert.equal(storage.getItem(key),value);
  assert.deepEqual(Object.keys(store.rawCopies()),[S.KEY]);assert.equal(store.previous(),null);
});
test('persistance, export/import fidèle et brouillon invalide récupérable',()=>{
  const f=fixture(),storage=memory(),store=S.createStore(storage);store.load();store.write(f.data);
  assert.deepEqual(S.createStore(storage).load().data,f.data);assert.deepEqual(S.parseBackup(JSON.stringify(f.data)),f.data);
  M.setDistribution(f.control,f.cls.students[0].id,f.control.items[0].id,'TA','2,');store.write(f.data);
  const imported=S.parseBackup(storage.getItem(S.KEY));assert.deepEqual(imported,f.data);assert.equal(M.gradeStatus(imported.classes[0].controls[0],f.cls.students[0].id).grade,null);
  assert.equal(M.gradeStatus(store.previous().classes[0].controls[0],f.cls.students[0].id).grade,5);
});
test('anciens exports, JSON invalide et formats inconnus refusés',()=>{
  for(const version of [1,2,3,999])assert.throws(()=>S.parseBackup(JSON.stringify({...M.empty(),version})));
  for(const raw of ['cassé','null','{}',JSON.stringify({students:[],controls:[]})])assert.throws(()=>S.parseBackup(raw));
});
test('validation profonde des références et des formes',()=>{
  for(const edit of [
    f=>f.control.maxGrade=15,f=>f.cls.students[0]=null,f=>f.control.items=[],f=>f.control.items[0].maxPoints=0,
    f=>f.control.items[0].maxPoints='5',f=>f.control.items[0].maxPoints=Infinity,
    f=>f.control.results[f.cls.students[0].id].bonusRaw=1,
    f=>f.control.items[0]={id:M.uid(),type:'courseQuestion',skillId:f.cls.skills[0].id,label:'Cours',maxPoints:5},
    f=>f.control.items[0].skillId='inconnu',f=>f.control.items.push({...f.control.items[0],id:M.uid()}),
    f=>f.control.results.inconnu={answers:{},bonusRaw:''},f=>f.control.results[f.cls.students[0].id].answers.inconnu={raw:'1'},
    f=>f.control.results[f.cls.students[0].id].answers[f.control.items[0].id]={raw:'50'},
    f=>f.control.date='2026-02-30',f=>f.cls.id='__proto__',f=>f.cls.students[1].id=f.cls.students[0].id,
    f=>{M.setBonus(f.control,f.cls.students[0].id,'1');f.control.bonusEnabled=false;},f=>f.control.items[0].type='unknown'
  ]){const f=fixture();edit(f);assert.throws(()=>M.validate(f.data));}
});
test('corruption : aucun retour silencieux à vide',()=>{
  const storage=memory();storage.setItem(S.KEY,'{broken');assert.throws(()=>S.createStore(storage).load(),e=>e.kind==='corrupt');assert.equal(storage.getItem(S.KEY),'{broken');
});
test('quota : version enregistrée conservée',()=>{
  const storage=memory(),store=S.createStore(storage),f=fixture();store.load();store.write(f.data);const before=storage.getItem(S.KEY);
  storage.setItem=()=>{throw Error('Quota')};f.cls.name='Autre';assert.throws(()=>store.write(f.data),e=>e.kind==='write');assert.equal(storage.getItem(S.KEY),before);
});
test('conflits entre fenêtres et détection externe',()=>{
  const storage=memory(),a=S.createStore(storage),b=S.createStore(storage),da=a.load().data,db=b.load().data;
  da.classes.push(M.makeClass('A'));a.write(da);assert.equal(b.changedExternally(),true);assert.throws(()=>b.write(db),e=>e.kind==='conflict');
});
test('copie précédente et restauration après corruption',()=>{
  const storage=memory(),store=S.createStore(storage),f=fixture();store.load();store.write(f.data);const before=M.clone(f.data);f.cls.name='Autre';store.write(f.data);assert.deepEqual(store.previous(),before);
  storage.setItem(S.KEY,'cassé');const recovery=S.createStore(storage);assert.throws(()=>recovery.load());recovery.write(before,{recovery:true});assert.deepEqual(recovery.previous(),before);
});
test('refus de stockage et vérification après écriture',()=>{
  const denied=S.createStore({getItem(){throw Error('SecurityError')}});assert.throws(()=>denied.load(),e=>e.kind==='read');assert.throws(()=>denied.write(M.empty()),e=>e.kind==='read');
  const storage=memory(),store=S.createStore(storage);store.load();storage.setItem=()=>{};assert.throws(()=>store.write(M.empty()),e=>e.kind==='conflict');
});
test('dates, points de cours, homonymes et classes indépendantes',()=>{
  assert.equal(M.validDate('2024-02-29'),true);assert.equal(M.validDate('2025-02-29'),false);
  for(const raw of ['-1','1e2','1,','100001','0.001'])assert.equal(M.parsePoints(raw).kind,'invalid');assert.equal(M.parsePoints('1,25').value,1.25);
  const f=fixture(),second=M.makeClass('B');M.addStudents(second,'Alice\nAlice');f.data.classes.push(second);M.validate(f.data);
  assert.notEqual(second.students[0].id,second.students[1].id);assert.equal(M.aggregate(second,second.students[0].id).global,null);
  f.cls.name='Renommée';f.cls.students[0].name='Autre';f.cls.skills[0].name='Autre';assert.equal(M.aggregate(f.cls,f.cls.students[0].id).global,100);
});
test('35 élèves et 50 devoirs : agrégats cohérents',()=>{
  const cls=M.makeClass('Charge'),data=M.empty();data.classes.push(cls);M.addStudents(cls,Array.from({length:35},(_,i)=>'Élève '+i).join('\n'));
  for(let n=0;n<50;n++){const c={id:M.uid(),name:'Devoir '+n,date:'',maxGrade:20,bonusEnabled:false,items:cls.skills.map(s=>({id:M.uid(),type:'skill',skillId:s.id,maxPoints:4})),results:{}};cls.controls.push(c);for(const student of cls.students)for(const item of c.items)M.setDistribution(c,student.id,item.id,'TA','3');}
  M.validate(data);for(const student of cls.students){const a=M.aggregate(cls,student.id);assert.equal(a.global,100);assert.equal(a.skills[cls.skills[0].id].count,50);}
});
test('vues : précision, seuils, items et échappement',()=>{
  global.CarnetModel=M;require('../js/views.js');const V=global.CarnetViews;
  for(const [value,color]of [[24.99,'na'],[25,'eca'],[49.99,'eca'],[50,'pa'],[74.99,'pa'],[75,'ta']])assert.equal(V.scoreClass(value),color);
  assert.equal(V.percent(74.99),'Moins de 75 %');assert.equal(V.fmt(1.6875),'1,69');assert.equal(V.esc('<script>'),'&lt;script&gt;');
  const status=M.resultStatus({NA:'1',ECA:'',PA:'',TA:'1'},4);assert.match(V.answerText({type:'skill',maxPoints:4},status),/2 items évalués\nMaîtrise : 50 %\nPoints obtenus : 2 \/ 4/);
});
