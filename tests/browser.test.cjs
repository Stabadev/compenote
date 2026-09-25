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
  await p.go(); await p.evaluate('localStorage.clear();window.__reloading=true;location.reload()'); await p.wait('!window.__reloading && document.readyState==="complete" && !!document.querySelector(".welcome")');
  await p.screenshot('carnet-accueil-mobile');
  await p.click('[data-action=new-class]'); await p.fill('#name-field', '1STH'); await p.submit(); await p.wait('!!document.querySelector("[data-action=new-students]")');
  await p.click('[data-action=new-students]'); await p.fill('#student-names', 'ALLIGIER-CUERVA Léonie\nMARTIN Gabriel\nÉlève très long au nom composé pour vérifier le téléphone'); await p.submit();
  assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].students.length'), 3);
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
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'), /Acquisition : 60 %/);
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
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'), /en trop/);
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'), /À corriger/);
  await p.click('.graded-item:first-child [data-action=clear-answer]');
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'),/Provisoire/);
  await p.fill('.graded-item:first-child [data-level=TA]','4');
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'), /encore 1/);
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
  await p.fill('.graded-item:first-child [data-level=TA]', '2,');
  await p.evaluate('window.__reloading=true;location.reload()'); await p.wait('!window.__reloading && !!document.querySelector("[data-distribution]")');
  assert.equal(await p.evaluate('document.querySelector(".graded-item:first-child [data-level=TA]").value'),'2,');
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'),/À corriger/);
  await p.fill('.graded-item:first-child [data-level=TA]', '1');
  await p.click('.student-pager .primary'); await p.wait('document.querySelector("#student-select").selectedIndex===1');
  await fillDistribution(1,[5,0,0,0]); await fillDistribution(2,[0,0,0,8]); await p.fill('[data-answer]', '0');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 8 / 20');
  assert.match(await p.evaluate('document.querySelector(".graded-item .entry-status").textContent'),/Acquisition : 0 %/);
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
  await p.click('.grade-results a'); await p.wait('!!document.querySelector("[data-distribution]")');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 15 / 20');
  await p.click('.class-tabs a:first-child'); await p.wait('!!document.querySelector("[data-action=edit-control]")');
  await p.click('[data-action=edit-control]');
  assert.equal(await p.evaluate('document.querySelector(".graded-config").disabled'),true);
  const beforeRename = await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].controls[0]');
  await p.fill('#control-name','Devoir renommé'); await p.submit(); await p.wait('!!document.querySelector("[data-distribution]")');
  const afterRename = await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].controls[0]');
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
  const itemIdsBeforeEdit = await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].controls.at(-1).items.map(i=>i.id)');
  await p.fill('.skill-config-row input[type=text]','7'); await p.fill('[data-question]:first-child [data-question-max]','2');
  await p.submit(); await p.wait('!!document.querySelector("[data-distribution]")');
  assert.deepEqual(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].controls.at(-1).items.map(i=>i.id)'),itemIdsBeforeEdit);
  const gradedExport = await p.evaluate('localStorage.mon_carnet_v3');
  await p.click('[data-action=backup]'); await p.wait('!!document.querySelector("#restore-file")');
  await p.evaluate(`{const input=document.querySelector('#restore-file'),t=new DataTransfer();t.items.add(new File([${JSON.stringify(gradedExport)}],'v2.json',{type:'application/json'}));input.files=t.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await p.wait('document.querySelector("#dialog").open'); await p.click('[name=confirm]'); await p.submit(); await p.wait('!!document.querySelector(".class-card")');
  assert.deepEqual(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes'),JSON.parse(gradedExport).classes);
  // Retirer uniquement les devoirs de cette fixture isolée pour le scénario V1 suivant.
  await p.evaluate(`{const d=JSON.parse(localStorage.mon_carnet_v3);d.classes[0].controls=[];localStorage.setItem('mon_carnet_v3',JSON.stringify(d));location.hash='#class/'+d.classes[0].id+'/manage';window.__reloading=true;location.reload()}`);
  await p.wait('!window.__reloading && !!document.querySelector("[data-action=new-control]")');
  // Le parcours historique démarre depuis un véritable document V1 migré.
  const legacySource = await p.evaluate(`{const d=JSON.parse(localStorage.mon_carnet_v3),c=d.classes[0];d.version=1;c.controls.push({id:'legacy-control',name:'Pythagore',date:'',skills:[{skillId:c.skills[0].id,max:5}],results:{}});JSON.stringify(d)}`);
  await p.evaluate(`localStorage.removeItem('mon_carnet_v3');localStorage.setItem('mon_carnet_v1',${JSON.stringify(legacySource)});window.__reloading=true;location.hash='#class/'+JSON.parse(${JSON.stringify(legacySource)}).classes[0].id+'/entry/legacy-control';location.reload()`);
  await p.wait('!window.__reloading && !!document.querySelector("[data-point]")');
  assert.equal(await p.evaluate('localStorage.mon_carnet_v1'), legacySource);
  assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].controls[0].mode'), 'legacyDistribution');
  // Récupération depuis la source V1 si la toute première écriture V2 devient illisible.
  await p.evaluate('localStorage.setItem("mon_carnet_v3","cassé");localStorage.removeItem("mon_carnet_v3_previous");window.__reloading=true;location.reload()');
  await p.wait('!window.__reloading && !!document.querySelector("[data-action=original]")');
  await p.click('[data-action=original]'); await p.wait('document.querySelector("#dialog").open');
  await p.click('[name=confirm]'); await p.submit(); await p.wait('!!document.querySelector(".class-card")');
  assert.equal(await p.evaluate('localStorage.mon_carnet_v1'),legacySource);
  await p.click('.class-card .primary'); await p.wait('!!document.querySelector(".control-card")');
  await p.click('.control-card .primary');
  await p.wait('!!document.querySelector("[data-point]")');
  await p.fill('[data-level=PA]', '3'); await p.fill('[data-level=TA]', '2');
  assert.match(await p.evaluate('document.querySelector(".entry-status").textContent'), /85 %/);
  // La frappe ne reconstruit pas les champs et garde le focus.
  await p.evaluate('document.querySelector("[data-level=TA]").focus()'); await p.fill('[data-level=TA]', '2');
  assert.equal(await p.evaluate('document.activeElement.dataset.level'), 'TA');
  await p.screenshot('carnet-saisie-mobile');
  for (const width of [360, 390, 430, 1280]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 }, p.sessionId);
    assert.equal(await p.evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'débordement à ' + width);
  }
  await p.screenshot('carnet-saisie-desktop');
  await p.click('.student-pager .primary'); await p.wait('document.querySelector("#student-select").selectedIndex===1');
  await p.fill('[data-level=NA]', '5'); assert.match(await p.evaluate('document.querySelector(".entry-status").textContent'), /0 %/);
  await p.fill('[data-level=ECA]', '-2'); assert.equal(await p.evaluate('document.querySelector(".entry-status").classList.contains("invalid")'), true);
  await p.evaluate('window.__reloading=true;location.reload()'); await p.wait('!window.__reloading && document.readyState==="complete" && !!document.querySelector("[data-point]")');
  assert.equal(await p.evaluate('document.querySelector("[data-level=ECA]").value'), '-2');
  await p.fill('[data-level=ECA]', '');
  await p.fill('[data-level=NA]', '6'); assert.equal(await p.evaluate('document.querySelector(".entry-status").classList.contains("excess")'), true);
  await p.fill('[data-level=NA]', '5');
  await p.click('.class-tabs a:nth-child(2)'); await p.wait('!!document.querySelector(".summary-card")');
  assert.equal(await p.evaluate('document.querySelectorAll(".summary-card").length'), 3);
  assert.match(await p.evaluate('document.querySelector(".summary-card").textContent'), /85 %/);
  await p.fill('#summary-search', 'leonie'); assert.equal(await p.evaluate('document.querySelectorAll(".summary-card").length'), 1);
  await p.fill('#summary-search', ''); await p.change('#summary-sort', 'za');
  assert.match(await p.evaluate('document.querySelector(".summary-card h3").textContent'), /MARTIN/);
  await p.screenshot('carnet-synthese-desktop');
  const exported = await p.evaluate('localStorage.mon_carnet_v3');
  await p.click('.class-tabs a:nth-child(3)'); await p.wait('!!document.querySelector("[data-action=delete-student]")');
  await p.click('[data-action=delete-student]'); await p.submit(); assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].students.length'), 2);
  await p.click('[data-action=undo]'); assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].students.length'), 3);
  await p.click('[data-action=edit-control]'); await p.fill('.skill-config-row input[type=text]', '10'); await p.submit(); await p.wait('document.querySelector("#dialog-title").textContent.includes("compétences du contrôle")'); await p.submit();
  await p.wait('!!document.querySelector("[data-point]")'); assert.equal(await p.evaluate('document.querySelector(".entry-status").classList.contains("partial")'), true);
  await p.click('[data-action=undo]'); assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].controls[0].skills[0].max'), 5);
  await p.click('[data-action=backup]'); await p.wait('!!document.querySelector("#restore-file")');
  // Déclenchement du vrai parcours d’import avec File et DataTransfer.
  await p.click('[data-action=export]');
  for(let i=0;i<80 && !fs.readdirSync(downloads).some(f=>f.endsWith('.json'));i++) await new Promise(r=>setTimeout(r,25));
  const downloaded=fs.readdirSync(downloads).find(f=>f.endsWith('.json'));
  assert.ok(downloaded,'sauvegarde téléchargée');
  const savedCopy=JSON.parse(fs.readFileSync(path.join(downloads,downloaded),'utf8'));
  assert.equal(savedCopy.classes[0].students.length,3); M.validate(savedCopy);
  const importText = async text => p.evaluate(`{const input=document.querySelector('#restore-file'), transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(text)}],'sauvegarde.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`);
  await importText('{broken'); await p.wait('document.querySelector("#restore-feedback").textContent.length>0');
  assert.equal(await p.evaluate('document.querySelector("#dialog").open'), false);
  await importText(exported); await p.wait('document.querySelector("#dialog").open'); await p.click('input[name=confirm]'); await p.submit(); await p.wait('!!document.querySelector(".class-card")');
  assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].students.length'), 3);
  // Seconde classe et isolation.
  await p.click('[data-action=new-class]'); await p.fill('#name-field', '2AGO'); await p.submit(); await p.wait('!!document.querySelector("[data-action=new-students]")');
  assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[1].students.length'), 0);
  // Prévenir l’écrasement par une autre fenêtre.
  const second = await page(); await second.go(); await second.click('[data-action=new-class]'); await second.fill('#name-field', '3PM'); await second.submit();
  await p.wait('document.querySelector("#notice").textContent.includes("autre fenêtre")');
  await send('Target.closeTarget', { targetId: second.targetId });
  await p.evaluate('window.__reloading=true;location.reload()'); await p.wait('!window.__reloading && document.readyState==="complete" && !!document.querySelector("#main h1")');
  // Une corruption ne devient jamais un carnet vide.
  await p.evaluate('localStorage.setItem("mon_carnet_v3","{broken");window.__reloading=true;location.reload()'); await p.wait('!window.__reloading && document.querySelector("#main h1")?.textContent.includes("Retrouvons")');
  assert.equal(await p.evaluate('localStorage.mon_carnet_v3'), '{broken');
  await p.click('[data-action=previous]'); await p.wait('document.querySelector("#dialog").open'); await p.click('input[name=confirm]'); await p.submit(); await p.wait('!!document.querySelector(".class-card")');
  // Un échec d’écriture est visible, exportable, puis récupérable.
  await p.evaluate('window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError")}');
  await p.click('[data-action=new-class]'); await p.fill('#name-field', 'Non enregistrée'); await p.submit();
  assert.equal(await p.evaluate('document.querySelector("#save-status").textContent'), 'Non enregistré');
  assert.equal(await p.evaluate('localStorage.mon_carnet_v3.includes("Non enregistrée")'), false);
  await p.evaluate('Storage.prototype.setItem=window.originalSetItem'); await p.click('[data-action=retry]');
  assert.equal(await p.evaluate('localStorage.mon_carnet_v3.includes("Non enregistrée")'), true);
  // Copie dense : vérifier les fiches, le mobile, puis le bureau.
  const data = M.empty(), cls = M.makeClass('1STH'); data.classes.push(cls); M.addStudents(cls, Array.from({length:35},(_,i)=>'Élève '+String(i+1).padStart(2,'0')).join('\n'));
  for(let i=0;i<50;i++){const c={id:M.uid(),mode:'legacyDistribution',name:'Contrôle '+i,date:'',skills:cls.skills.map(s=>({skillId:s.id,max:10})),results:{}};cls.controls.push(c);for(const s of cls.students)for(const skill of cls.skills)M.setResult(c,s.id,skill.id,'TA','10');}
  await p.evaluate(`localStorage.setItem('mon_carnet_v3',${JSON.stringify(JSON.stringify(data))});location.hash=${JSON.stringify('#class/'+cls.id+'/summary')};location.reload()`); await p.wait('document.querySelectorAll(".summary-card").length===35');
  for(const width of [360,430,1280]) {await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500},p.sessionId);assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'synthèse déborde '+width);}
  await p.screenshot('carnet-synthese-charge');
  await p.evaluate(`location.hash=${JSON.stringify('#class/'+cls.id+'/entry/'+cls.controls[0].id+'/'+cls.students[0].id)}`); await p.wait('!!document.querySelector("[data-point]")');
  const elapsed = await p.evaluate(`{const start=performance.now();const input=document.querySelector('[data-level=TA]');for(let i=0;i<10;i++){input.value=String(i%2 ? 10 : 9);input.dispatchEvent(new Event('input',{bubbles:true}));}performance.now()-start;}`);
  console.log('Saisie carnet dense : '+Math.round(elapsed/10)+' ms par modification (validation et stockage inclus).');
  for(const width of [360,430,1280]) {await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500},p.sessionId);assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'5 compétences débordent '+width);}
  await p.evaluate(`location.hash=${JSON.stringify('#class/'+cls.id+'/manage')}`); await p.wait('!!document.querySelector("[data-action=new-students]")');
  await send('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true},p.sessionId);
  assert.equal(await p.evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'gestion mobile');
  await p.click('[data-action=new-control]');
  assert.equal(await p.evaluate('document.querySelector("dialog").scrollWidth <= document.querySelector("dialog").clientWidth'),true,'formulaire mobile');
  await p.screenshot('carnet-controle-mobile');
  await p.click('[data-action=close-dialog]');
  await p.evaluate(`location.hash=${JSON.stringify('#class/'+cls.id+'/entry/'+cls.controls[0].id+'/'+cls.students[0].id)}`); await p.wait('!!document.querySelector("[data-point]")');
  // Vérifier la frappe via le clavier Chrome, pas seulement l’événement simulé.
  await p.evaluate('document.querySelector("[data-level=TA]").focus();document.querySelector("[data-level=TA]").select()');
  await send('Input.insertText',{text:'10'},p.sessionId);
  assert.equal(await p.evaluate('document.querySelector("[data-level=TA]").value'),'10');
  const unnamed = await p.evaluate(`Array.from(document.querySelectorAll('input,select,textarea')).filter(el=>!el.getAttribute('aria-label') && !el.labels?.length).map(el=>el.id)`);
  assert.deepEqual(unnamed,[],'champs sans nom accessible');
  const old = {students:[{id:'s',name:'Élève ancien'}],controls:[{id:'c',name:'Ancien contrôle',skills:[{name:'Réaliser',max:5}],results:{s:{'Réaliser':{NA:0,ECA:0,PA:3,TA:2}}}}]};
  await p.evaluate(`localStorage.removeItem('mon_carnet_v3');localStorage.removeItem('mon_carnet_v1');localStorage.setItem('carnet_competences_math_v5',${JSON.stringify(JSON.stringify(old))});window.__reloading=true;location.hash='';location.reload()`);
  await p.wait('!window.__reloading && document.querySelector(".class-card")?.textContent.includes("Ma classe")');
  assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes[0].students[0].name'),'Élève ancien');
  assert.equal(await p.evaluate('!!localStorage.carnet_competences_math_v5'),true);
  // Les pourcentages de la première V2 sont conservés, jamais convertis en répartitions fictives.
  const experimental=M.empty(),expClass=M.makeClass('Essai pourcentages');experimental.classes.push(expClass);experimental.version=2;M.addStudents(expClass,'Alice');
  const expControl={id:M.uid(),mode:'graded',name:'Devoir expérimental',date:'',maxGrade:5,bonusEnabled:true,items:[{id:M.uid(),type:'skill',skillId:expClass.skills[0].id,maxPoints:4},{id:M.uid(),type:'courseQuestion',label:'Cours',maxPoints:1}],results:{}};
  expClass.controls.push(expControl);expControl.results[expClass.students[0].id]={answers:{[expControl.items[0].id]:{raw:'50'},[expControl.items[1].id]:{raw:'1'}},bonusRaw:'1'};
  const experimentalRaw=JSON.stringify(experimental);
  await p.evaluate(`localStorage.clear();localStorage.setItem('mon_carnet_v2',${JSON.stringify(experimentalRaw)});window.__reloading=true;location.hash=${JSON.stringify('#class/'+expClass.id)};location.reload()`);
  await p.wait('!window.__reloading && !!document.querySelector(".control-card")');
  assert.match(await p.evaluate('document.querySelector("#main").textContent'),/saisies de la version de test/);
  assert.equal(await p.evaluate('localStorage.mon_carnet_v2'),experimentalRaw);
  await p.click('.class-tabs a:nth-child(2)');await p.wait('!!document.querySelector(".summary-card")');
  assert.match(await p.evaluate('document.querySelector("#main").textContent'),/saisies de la version de test/);
  await p.click('.class-tabs a:first-child');await p.wait('!!document.querySelector(".control-card")');
  await p.click('.control-card .primary');await p.wait('!!document.querySelector("[data-distribution]")');
  assert.match(await p.evaluate('document.querySelector(".experimental-reference").textContent'),/50/);
  assert.deepEqual(await p.evaluate('Array.from(document.querySelectorAll("[data-distribution]"),el=>el.value)'),['','','','']);
  assert.match(await p.evaluate('document.querySelector("#grade-total").textContent'),/Provisoire/);
  assert.equal(await p.evaluate('document.querySelector("[data-answer]").value'),'1');
  await fillDistribution(1,[1,2,0,1]);
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 4 / 5');
  await p.evaluate('window.__reloading=true;location.reload()');await p.wait('!window.__reloading && !!document.querySelector("[data-distribution]")');
  assert.equal(await p.evaluate('document.querySelector("#grade-total").textContent'),'Note : 4 / 5');
  assert.equal(await p.evaluate('localStorage.mon_carnet_v2'),experimentalRaw);
  // Carnet V2 multi-classes, sans données du profil personnel.
  const dense = M.empty();
  for (let k=0;k<3;k++) {
    const group=M.makeClass('Classe '+(k+1));dense.classes.push(group);
    M.addStudents(group,Array.from({length:35},(_,i)=>'Élève '+String(i+1).padStart(2,'0')).join('\n'));
    for (let n=0;n<30;n++) {
      const c={id:M.uid(),mode:'graded',name:'Devoir '+(n+1),date:'',maxGrade:20,bonusEnabled:true,items:group.skills.map(skill=>({id:M.uid(),type:'skill',skillId:skill.id,maxPoints:3})),results:{}};
      c.items.push({id:M.uid(),type:'courseQuestion',label:'Cours',maxPoints:5});group.controls.push(c);
      for(const student of group.students){for(const item of c.items){if(item.type==='skill')M.setDistribution(c,student.id,item.id,'PA','3');else M.setAnswer(c,student.id,item.id,'4');}M.setBonus(c,student.id,'1');}
    }
  }
  M.validate(dense);
  const group=dense.classes[0], c=group.controls[0];
  await p.evaluate(`localStorage.clear();localStorage.setItem('mon_carnet_v3',${JSON.stringify(JSON.stringify(dense))});window.__reloading=true;location.hash=${JSON.stringify('#class/'+group.id+'/entry/'+c.id+'/'+group.students[0].id)};location.reload()`);
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
  assert.equal(await p.evaluate('JSON.parse(localStorage.mon_carnet_v3).classes.length'),4);
  await send('Target.closeTarget',{targetId:parallel.targetId});
  assert.deepEqual(errors, []);
  console.log('OK : V2 /5, /10, /20, 15/20, 21/20, barèmes, focus, brouillons, notes, import, verrouillage, charge multi-classes ; parcours historiques création, saisie, calculs, invalides, rechargement, synthèse, recherche, tri, suppression/annulation, édition, import, multi-classes, conflits, corruption, quota, 35 élèves × 50 contrôles et largeurs 360/390/430/1280.');
  console.log('Captures dans /tmp/carnet-*.png');
}
main().catch(error => {console.error(error);process.exitCode=1;}).finally(async()=>{try{await send('Browser.close')}catch{} child.kill();for(const p of pending.values())clearTimeout(p.timer);});
