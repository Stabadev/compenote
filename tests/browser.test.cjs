/* Parcours réels dans Chrome via son protocole natif. Aucune dépendance npm. */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const M = require('../js/model.js');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-browser-'));
const chrome = process.env.CHROME_BIN || '/usr/bin/google-chrome';
const child = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', '--user-data-dir=' + profile], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let stderr = '', buffer = '', sequence = 0; const pending = new Map(), errors = [];
child.stderr.on('data', b => { stderr += b; });
for(const stream of [child.stdio[3],child.stdio[4]]) stream.on('error',error=>{console.error('Chrome pipe:',error.message,stderr.slice(-1200));});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.stdio[4].on('data', chunk => {
  buffer += chunk.toString(); let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const raw = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!raw) continue;
    const message = JSON.parse(raw);
    if (message.id) { const p = pending.get(message.id); if (p) { pending.delete(message.id); clearTimeout(p.timer); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result); } }
    else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value || arg.description).join(' '));
  }
});
function send(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timeout ' + method + '\n' + stderr.slice(-1200))); }, 15000);
    pending.set(id, { resolve, reject, timer }); child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}
const url = 'file://' + path.resolve(__dirname, '../index.html');
async function page() {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Runtime.enable', {}, sessionId); await send('Page.enable', {}, sessionId);
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const wait = async expression => { for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 25)); } throw new Error('Attente : ' + expression); };
  const go = async () => { await send('Page.navigate', { url }, sessionId); await wait('!!document.querySelector("#main h1")'); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));}`);
  const change = (selector, value) => evaluate(`{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));}`);
  const submit = () => evaluate('document.querySelector("#edit-form").requestSubmit()');
  const screenshot = async name => { await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))'); const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId); fs.writeFileSync(path.join(os.tmpdir(), name + '.png'), Buffer.from(r.data, 'base64')); };
  return { sessionId, targetId, evaluate, wait, go, click, fill, change, submit, screenshot };
}
async function main() {
  await send('Browser.getVersion');
  const p = await page();
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'carnet-downloads-'));
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, p.sessionId);
  await p.go(); await p.evaluate('localStorage.clear();localStorage.setItem("mon_carnet_v3","ancienne-base");window.__reloading=true;location.reload()'); await p.wait('!window.__reloading && document.readyState==="complete" && !!document.querySelector(".welcome")');
  assert.equal(await p.evaluate('localStorage.mon_carnet_v3'),'ancienne-base');
  assert.match(await p.evaluate('document.querySelector(".experimental-banner").textContent'),/Version expérimentale/);
  await p.screenshot('carnet-items-accueil-mobile');
  await p.click('[data-action=new-class]'); await p.fill('#name-field', '1STH'); await p.submit(); await p.wait('!!document.querySelector("[data-action=new-students]")');
  await p.click('[data-action=new-students]'); await p.fill('#student-names', 'ALLIGIER-CUERVA Léonie\nMARTIN Gabriel\nÉlève très long au nom composé pour vérifier le téléphone'); await p.submit();
  assert.equal(await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes[0].students.length'), 3);
  // Nouveau parcours : création, barème, acquisitions, cours, bonus et résultats.
  await p.click('[data-action=new-control]'); await p.fill('#control-name', 'Devoir V2');
  assert.equal(await p.evaluate('document.querySelector("#edit-form [type=submit]").disabled'), true);
  await p.click('input[name=skill]'); await p.fill('.skill-config-row input[type=text]', '5');
  await p.click('.skill-config-row:nth-child(3) input[name=skill]');
  await p.fill('.skill-config-row:nth-child(3) input[type=text]', '8');
  assert.match(await p.evaluate('document.querySelector("#rubric-status").textContent'), /13 \/ 20.*reste 7/);
  await p.click('[data-action=add-question]'); await p.fill('[data-question-label]', 'Questions de cours'); await p.fill('[data-question-max]', '8');
  assert.equal(await p.evaluate('document.querySelector("#edit-form [type=submit]").disabled'), true);
  assert.match(await p.evaluate('document.querySelector("#rubric-status").textContent'), /retirer 1/);
  await p.fill('[data-question-max]', '7'); await p.click('[name=bonusEnabled]');
  await p.click('[data-action=add-question]'); await p.fill('[data-question]:last-child [data-question-label]', 'Question à retirer');
  assert.equal(await p.evaluate('document.querySelector("#edit-form [type=submit]").disabled'), true);
  await p.click('[data-question]:last-child [data-action=remove-question]');
  for (const width of [360,390,430,1280]) {
    await send('Emulation.setDeviceMetricsOverride', {width,height:844,deviceScaleFactor:1,mobile:width<500},p.sessionId);
    assert.equal(await p.evaluate('document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth'),true,'formulaire V2 '+width);
  }
  await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true},p.sessionId);
  await p.screenshot('carnet-v2-creation');
  await p.evaluate('document.querySelector("dialog").scrollTop=0'); await p.screenshot('carnet-v2-creation-haut'); await p.submit(); await p.wait('!!document.querySelector("[data-distribution]")');
  const fillDistribution = async (index, values) => {
    for (let i=0;i<4;i++) await p.fill('.graded-item:nth-child('+index+') [data-level='+M.LEVELS[i]+']',String(values[i]??''));
  };
  await fillDistribution(1,[1,1,2,1]);
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'), /Maîtrise : 60 %/);
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'), /Points obtenus : 3 \/ 5/);
  assert.equal(await p.evaluate('document.querySelectorAll(".graded-item:first-child [data-distribution]").length'),4);
  assert.equal(await p.evaluate('document.querySelectorAll("[data-action=set-acquisition]").length'),0);
  await fillDistribution(2,[0,2,4,2]);
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'), /Provisoire/);
  await p.fill('[data-answer]', '5'); await p.fill('#bonus-points','1');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'), 'Note : 15 / 20');
  await p.evaluate(`window.keptInput=document.querySelector('.graded-item:first-child [data-level=TA]');window.keptInput.focus();window.keptInput.select()`);
  await send('Input.insertText',{text:'2'},p.sessionId);
  assert.equal(await p.evaluate('document.activeElement===window.keptInput && window.keptInput.isConnected'),true,'focus V2');
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'), /6 items évalués/);
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'), /Note :/);
  await p.click('.graded-item:first-child [data-action=clear-answer]');
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'),/Provisoire/);
  await p.fill('.graded-item:first-child [data-level=TA]','4');
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'), /4 items évalués/);
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'), /Note : 17/);
  await fillDistribution(1,[1,0,0,1]);
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'),/2 items évalués/);
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'),/Points obtenus : 2,5 \/ 5/);
  await fillDistribution(1,[1,1,2,1]);
  for (const width of [360,390,430,1280]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500},p.sessionId);
    assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'correction V2 '+width);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},p.sessionId);
  await p.evaluate('document.querySelector(".graded-item").scrollIntoView({block:"start",behavior:"instant"});document.querySelector("#toast").classList.remove("visible")');
  await p.screenshot('carnet-v2-correction');
  const unnamedGraded = await p.evaluate(`Array.from(document.querySelectorAll('input,select,textarea')).filter(el=>!el.getAttribute('aria-label') && !el.labels?.length).map(el=>el.id)`);
  assert.deepEqual(unnamedGraded,[],'champs V2 nommés');
  // Hauteur réduite : approximation du clavier ouvert, avec champs et navigation accessibles.
  for (const width of [360,390,430]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:360,deviceScaleFactor:1,mobile:true},p.sessionId);
    for (const selector of ['.graded-item:first-child [data-level=TA]', '#bonus-points', '.student-pager .primary']) {
      const visible = await p.evaluate(`{const el=document.querySelector(${JSON.stringify(selector)});el.focus({preventScroll:true});el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);({width:r.width,height:r.height,reachable:!!hit && (hit===el || el.contains(hit))})}`);
      assert.ok(visible.width >= 44 && visible.height >= 44, 'cible tactile '+selector+' à '+width);
      assert.ok(visible.reachable, 'champ ou bouton masqué à '+width+': '+selector);
    }
    assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'hauteur réduite '+width);
  }
  assert.deepEqual(await p.evaluate(`{const ids=Array.from(document.querySelectorAll('[id]'),el=>el.id);ids.filter((id,index)=>ids.indexOf(id)!==index)}`),[], 'identifiants HTML uniques');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},p.sessionId);
  await p.fill('.graded-item:first-child [data-level=TA]', '2,');
  await p.evaluate('window.__reloading=true;location.reload()'); await p.wait('!window.__reloading && !!document.querySelector("[data-distribution]")');
  assert.equal(await p.evaluate('document.querySelector(".graded-item:first-child [data-level=TA]").value'),'2,');
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'),/À corriger/);
  await p.fill('.graded-item:first-child [data-level=TA]', '1');
  await p.click('.student-pager .primary'); await p.wait('document.querySelector("#student-select").selectedIndex===1');
  await fillDistribution(1,[5,0,0,0]); await fillDistribution(2,[0,0,0,8]); await p.fill('[data-answer]', '0');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 8 / 20');
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'),/Maîtrise : 0 %/);
  await fillDistribution(1,[0,0,0,5]); await p.fill('[data-answer]', '7'); await p.fill('#bonus-points','1');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 21 / 20');
  await p.click('.entry-top .text-link'); await p.wait('!!document.querySelector(".grade-results")');
  const resultText = await p.evaluate('document.querySelector(".grade-results").textContent');
  assert.match(resultText,/15 \/ 20/); assert.match(resultText,/21 \/ 20/); assert.match(resultText,/À terminer/);
  for (const width of [360,390,430,1280]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<500},p.sessionId);
    assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'résultats V2 '+width);
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true},p.sessionId);
  await p.screenshot('carnet-v2-resultats');
  await send('Emulation.setEmulatedMedia',{media:'print'},p.sessionId);
  assert.equal(await p.evaluate('getComputedStyle(document.querySelector(".class-tabs")).display'),'none');
  assert.equal(await p.evaluate('Array.from(document.querySelectorAll(".result-open"),el=>getComputedStyle(el).display).every(v=>v==="none")'),true);
  const printed = await send('Page.printToPDF',{printBackground:true},p.sessionId);
  assert.ok(Buffer.from(printed.data,'base64').subarray(0,5).equals(Buffer.from('%PDF-')), 'impression PDF des notes');
  await send('Emulation.setEmulatedMedia',{media:''},p.sessionId);
  await p.click('.grade-results a'); await p.wait('!!document.querySelector("[data-distribution]")');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 15 / 20');
  await p.click('.class-tabs a:first-child'); await p.wait('!!document.querySelector("[data-action=edit-control]")');
  await p.click('[data-action=edit-control]');
  assert.equal(await p.evaluate('document.querySelector(".graded-config").disabled'),true);
  const beforeRename = await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes[0].controls[0]');
  await p.fill('#control-name','Devoir renommé'); await p.submit(); await p.wait('!!document.querySelector("[data-distribution]")');
  const afterRename = await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes[0].controls[0]');
  assert.equal(afterRename.name,'Devoir renommé'); assert.deepEqual(afterRename.items,beforeRename.items); assert.deepEqual(afterRename.results,beforeRename.results);
  // Création des deux autres maxima, plusieurs questions et modification avant saisie.
  for (const max of [5,10]) {
    await p.click('.class-tabs a:first-child'); await p.wait('!!document.querySelector("[data-action=new-control]")');
    await p.click('[data-action=new-control]'); await p.fill('#control-name','Sur '+max); await p.click('[name=maxGrade][value="'+max+'"]');
    await p.click('input[name=skill]'); await p.fill('.skill-config-row input[type=text]',String(max-2));
    for (let i=0;i<2;i++) {await p.click('[data-action=add-question]'); await p.fill('[data-question]:last-child [data-question-label]','Question '+i); await p.fill('[data-question]:last-child [data-question-max]','1');}
    await p.submit(); await p.wait('!!document.querySelector("[data-distribution]")');
    assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'),new RegExp('sur '+max));
  }
  await p.click('.class-tabs a:first-child'); await p.wait('!!document.querySelector("[data-action=edit-control]")');
  await p.click('[data-action=edit-control]');
  assert.equal(await p.evaluate('document.querySelector(".graded-config").disabled'),false,'barème encore modifiable');
  const itemIdsBeforeEdit = await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes[0].controls.at(-1).items.map(i=>i.id)');
  await p.fill('.skill-config-row input[type=text]','7'); await p.fill('[data-question]:first-child [data-question-max]','2');
  await p.submit(); await p.wait('!!document.querySelector("[data-distribution]")');
  assert.deepEqual(await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes[0].controls.at(-1).items.map(i=>i.id)'),itemIdsBeforeEdit);
  const gradedExport = await p.evaluate('localStorage.compenote_items_experimental_v1');
  await p.click('[data-action=backup]'); await p.wait('!!document.querySelector("#restore-file")');
  await p.evaluate(`{const input=document.querySelector('#restore-file'),t=new DataTransfer();t.items.add(new File([${JSON.stringify(gradedExport)}],'v2.json',{type:'application/json'}));input.files=t.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await p.wait('document.querySelector("#dialog").open'); await p.click('[name=confirm]'); await p.submit(); await p.wait('!!document.querySelector(".class-card")');
  assert.deepEqual(await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes'),JSON.parse(gradedExport).classes);
  await p.click('.class-card .class-links a'); await p.wait('!!document.querySelector(".summary-card")');
  await p.fill('#summary-search','leonie'); assert.equal(await p.evaluate('document.querySelectorAll(".summary-card").length'),1);
  await p.fill('#summary-search',''); await p.change('#summary-sort','za');
  assert.match(await p.evaluate('document.querySelector(".summary-card h3").textContent'),/MARTIN/);
  await p.click('.class-tabs a:nth-child(3)'); await p.wait('!!document.querySelector("[data-action=delete-student]")');
  await p.click('[data-action=delete-student]'); await p.submit();
  assert.equal(await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes[0].students.length'),2);
  await p.click('[data-action=undo]'); assert.equal(await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes[0].students.length'),3);
  await p.click('[data-action=backup]'); await p.wait('!!document.querySelector("#restore-file")'); await p.click('[data-action=export]');
  for(let i=0;i<80 && !fs.readdirSync(downloads).some(f=>f.endsWith('.json'));i++) await new Promise(r=>setTimeout(r,25));
  const downloaded=fs.readdirSync(downloads).find(f=>f.endsWith('.json'));assert.ok(downloaded,'export téléchargé');
  M.validate(JSON.parse(fs.readFileSync(path.join(downloads,downloaded),'utf8')));
  await p.evaluate(`{const input=document.querySelector('#restore-file'),t=new DataTransfer();t.items.add(new File(['{"version":3}'],'ancien.json'));input.files=t.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await p.wait('document.querySelector("#restore-feedback").textContent.length>0');assert.equal(await p.evaluate('document.querySelector("#dialog").open'),false);
  await p.evaluate('localStorage.setItem("compenote_items_experimental_v1","{broken");window.__reloading=true;location.reload()');
  await p.wait('!window.__reloading && document.querySelector("#main h1")?.textContent.includes("Retrouvons")');
  assert.equal(await p.evaluate('localStorage.compenote_items_experimental_v1'),'{broken');
  await p.click('[data-action=previous]');await p.wait('document.querySelector("#dialog").open');await p.click('[name=confirm]');await p.submit();await p.wait('!!document.querySelector(".class-card")');
  // Carnet V2 multi-classes, sans données du profil personnel.
  const dense = M.empty();
  for (let k=0;k<3;k++) {
    const group=M.makeClass('Classe '+(k+1));dense.classes.push(group);
    M.addStudents(group,Array.from({length:35},(_,i)=>'Élève '+String(i+1).padStart(2,'0')).join('\n'));
    for (let n=0;n<30;n++) {
      const c={id:M.uid(),name:'Devoir '+(n+1),date:'',maxGrade:20,bonusEnabled:true,items:group.skills.map(skill=>({id:M.uid(),type:'skill',skillId:skill.id,maxPoints:3})),results:{}};
      c.items.push({id:M.uid(),type:'courseQuestion',label:'Cours',maxPoints:5});group.controls.push(c);
      for(const student of group.students){for(const item of c.items){if(item.type==='skill')M.setDistribution(c,student.id,item.id,'PA','3');else M.setAnswer(c,student.id,item.id,'4');}M.setBonus(c,student.id,'1');}
    }
  }
  M.validate(dense);
  const group=dense.classes[0], c=group.controls[0];
  await p.evaluate(`localStorage.clear();localStorage.setItem('compenote_items_experimental_v1',${JSON.stringify(JSON.stringify(dense))});window.__reloading=true;location.hash=${JSON.stringify('#class/'+group.id+'/entry/'+c.id+'/'+group.students[0].id)};location.reload()`);
  await p.wait('!window.__reloading && !!document.querySelector("[data-distribution]")');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 16,25 / 20');
  const gradedElapsed=await p.evaluate(`{const start=performance.now(),input=document.querySelector('[data-distribution][data-level=PA]');for(let i=0;i<10;i++){input.value=i%2?'3':'2';input.dispatchEvent(new Event('input',{bubbles:true}));}performance.now()-start;}`);
  assert.equal(await p.evaluate('document.querySelector("#save-status").textContent'),'✓ Enregistré');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 16,25 / 20');
  console.log('Saisie V2 3 classes × 35 élèves × 30 devoirs : '+Math.round(gradedElapsed/10)+' ms par modification.');
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},p.sessionId);
  await p.screenshot('carnet-v2-bureau');
  await send('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true},p.sessionId);
  assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'carnet V2 dense mobile');
  // Échec de sauvegarde pendant une correction V2, puis reprise sans perte.
  await p.evaluate('window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError")}');
  await p.fill('[data-distribution][data-level=PA]','2,');
  assert.equal(await p.evaluate('document.querySelector("#save-status").textContent'),'Non enregistré');
  assert.equal(await p.evaluate('document.querySelector("[data-distribution][data-level=PA]").value'),'2,');
  await p.evaluate('Storage.prototype.setItem=window.originalSetItem'); await p.click('[data-action=retry]');
  assert.equal(await p.evaluate('document.querySelector("#save-status").textContent'),'✓ Enregistré');
  await p.evaluate('window.__reloading=true;location.reload()'); await p.wait('!window.__reloading && !!document.querySelector("[data-distribution]")');
  assert.equal(await p.evaluate('document.querySelector("[data-distribution][data-level=PA]").value'),'2,');
  // Conflit pendant une correction V2 : les nouvelles frappes ne remplacent rien.
  const parallel=await page();await parallel.go();await parallel.click('[data-action=new-class]');await parallel.fill('#name-field','Autre fenêtre');await parallel.submit();
  await p.wait('document.querySelector("#notice").textContent.includes("autre fenêtre")');
  await p.fill('[data-distribution][data-level=PA]','0');assert.equal(await p.evaluate('document.querySelector("[data-distribution][data-level=PA]").value'),'2,');
  assert.equal(await p.evaluate('JSON.parse(localStorage.compenote_items_experimental_v1).classes.length'),4);
  await send('Target.closeTarget',{targetId:parallel.targetId});
  assert.deepEqual(errors, []);
  console.log('OK : items, /5 /10 /20, notes, bonus, focus, invalides, rechargement, import/export, verrouillage, recherche, tri, annulation, corruption, quota, conflits, PDF, charge et mobile.');
  console.log('Captures dans /tmp/carnet-*.png');
}
main().catch(error => {console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close')}catch{} child.kill();for(const p of pending.values())clearTimeout(p.timer);});
