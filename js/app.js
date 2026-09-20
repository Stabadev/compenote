/* Coordination : navigation, commandes, événements. Aucun calcul métier dans les vues. */
(function () {
  'use strict';
  const M = CarnetModel, S = CarnetStorage, V = CarnetViews;
  const main = document.getElementById('main'), dialog = document.getElementById('dialog');
  const state = { data: null, recovery: false, error: null, dirty: false, conflict: false, undo: null, query: '', sort: 'az', classId: null };
  let store, formSubmit = null, toastTimer, restoreCandidate = null;
  try { store = S.createStore(window.localStorage); }
  catch { store = S.createStore({ getItem() { throw new Error(); } }); }
  function notify(message) {
    const el = document.getElementById('toast'); el.textContent = message; el.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 5000);
  }
  function updateNotice() {
    const el = document.getElementById('notice'), status = document.getElementById('save-status');
    status.textContent = state.recovery ? 'À récupérer' : state.conflict ? 'Autre fenêtre ouverte' : state.dirty ? 'Non enregistré' : '✓ Enregistré';
    status.className = state.dirty || state.recovery || state.conflict ? 'save-error' : '';
    if (state.error) {
      el.hidden = false; el.innerHTML = `<div><strong>${V.esc(state.error.message)}</strong><div class="notice-actions">${state.data ? V.button('Télécharger ma copie', 'export', 'small-button') : ''}${state.conflict ? V.button('Rouvrir le carnet enregistré', 'reload', 'small-button') : state.dirty ? V.button('Réessayer l’enregistrement', 'retry', 'small-button') : ''}</div></div>`;
    } else if (state.undo) {
      el.hidden = false; el.innerHTML = `<div><strong>${V.esc(state.undo.label)}</strong><p>Vous pouvez annuler jusqu’à la prochaine modification.</p>${V.button('Annuler cette action', 'undo', 'small-button')}</div>`;
    } else { el.hidden = true; el.innerHTML = ''; }
  }
  function persist(options) {
    try { store.write(state.data, options); state.dirty = false; state.error = null; state.conflict = false; }
    catch (error) { state.dirty = true; state.error = error; state.conflict = error.kind === 'conflict'; }
    updateNotice();
    return !state.dirty;
  }
  function mutate(edit, { undoLabel = '', render = true } = {}) {
    if (state.conflict || state.recovery) { notify('Conservez votre copie puis rouvrez le carnet enregistré avant de continuer.'); return false; }
    const before = undoLabel ? M.clone(state.data) : null, next = M.clone(state.data);
    try { edit(next); next.revision = M.uid(); next.updatedAt = new Date().toISOString(); M.validate(next); }
    catch (error) { notify(error.message); return false; }
    state.data = next; state.undo = undoLabel ? { data: before, label: undoLabel } : null;
    persist(); if (render) renderRoute(false); return true;
  }
  function route() {
    const parts = location.hash.slice(1).split('/');
    if (parts[0] !== 'class') return { tab: parts[0] === 'backup' ? 'backup' : 'home' };
    const cls = state.data?.classes.find(c => c.id === parts[1]);
    if (!cls) return { tab: 'home' };
    const tab = ['entry', 'summary', 'manage'].includes(parts[2]) ? parts[2] : 'entry';
    const control = cls.controls.find(c => c.id === parts[3]);
    const student = cls.students.find(s => s.id === parts[4]) || V.sortedStudents(cls)[0];
    return { cls, tab, control, student };
  }
  function renderRoute(focus = true) {
    if (dialog.open) dialog.close();
    const r = route();
    if (state.recovery) main.innerHTML = V.backup(null, true);
    else if (r.tab === 'home') main.innerHTML = V.home(state.data);
    else if (r.tab === 'backup') main.innerHTML = V.backup(state.data);
    else {
      if (state.classId !== r.cls.id) { state.query = ''; state.sort = 'az'; state.classId = r.cls.id; }
      let content;
      if (r.tab === 'summary') content = V.summary(r.cls, state.query, state.sort);
      else if (r.tab === 'manage') content = V.manage(r.cls);
      else content = r.control && r.student ? V.entry(r.cls, r.control, r.student) : V.chooseControl(r.cls);
      main.innerHTML = V.shell(r.cls, r.tab, content);
    }
    document.body.dataset.page = r.tab;
    updateNotice();
    if (focus) { main.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  }
  function navigate(hash) { if (location.hash === hash) renderRoute(); else location.hash = hash; }
  function openForm(title, fields, submit, onSubmit) {
    dialog.innerHTML = V.dialogForm(title, fields, submit); formSubmit = onSubmit;
    if (!dialog.open) dialog.showModal();
    const field = dialog.querySelector('input:not([type=checkbox]),textarea'); field?.focus();
  }
  function ask(title, message, confirmText, callback, danger = false) {
    openForm(title, `<div class="confirm-copy">${message}</div>`, confirmText, () => { dialog.close(); callback(); });
    if (danger) dialog.querySelector('[type=submit]').classList.add('destructive');
    dialog.querySelector('[data-action=close-dialog]')?.focus();
  }
  function nameForm(title, initial, callback) {
    openForm(title, `<label for="name-field">Nom</label><input id="name-field" name="name" maxlength="120" required value="${V.esc(initial)}" autocomplete="off">`, 'Enregistrer', form => {
      const name = form.elements.name.value.trim(); if (!name) throw new Error('Indiquez un nom.'); callback(name); dialog.close();
    });
  }
  function editClass(data, clsId) { return data.classes.find(c => c.id === clsId); }
  function controlDialog(cls, control) {
    openForm(control ? 'Modifier le contrôle' : 'Nouveau contrôle', V.controlFields(cls, control), control ? 'Enregistrer' : 'Créer et saisir →', form => {
      const name = form.elements.name.value.trim(), date = form.elements.date.value;
      if (!name || !M.validDate(date)) throw new Error('Vérifiez le nom et la date du contrôle.');
      const skills = [...form.querySelectorAll('input[name=skill]:checked')].map(input => {
        const parsed = M.parsePoints(form.elements['max-' + input.value].value);
        if (parsed.kind !== 'valid' || parsed.value <= 0) throw new Error('Indiquez un nombre de points supérieur à zéro pour chaque compétence choisie (2 décimales maximum).');
        return { skillId: input.value, max: parsed.value };
      });
      if (!skills.length) throw new Error('Choisissez au moins une compétence.');
      const apply = () => {
        const controlId = control?.id || M.uid();
        const ok = mutate(data => {
          const target = editClass(data, cls.id), existing = target.controls.find(c => c.id === controlId);
          if (existing) {
            existing.name = name; existing.date = date; existing.skills = skills;
            for (const results of Object.values(existing.results)) for (const skillId of Object.keys(results)) if (!skills.some(s => s.skillId === skillId)) delete results[skillId];
          } else target.controls.push({ id: controlId, name, date, skills, results: {} });
        }, { undoLabel: control ? 'Contrôle modifié.' : '' });
        if (ok) { dialog.close(); navigate(V.path(cls, 'entry', controlId)); notify(control ? 'Contrôle mis à jour.' : 'Contrôle créé. Prenez votre première copie.'); }
      };
      const changed = control && JSON.stringify(control.skills) !== JSON.stringify(skills);
      if (changed && Object.keys(control.results).length) ask('Modifier les compétences du contrôle ?', '<p>Les moyennes seront recalculées avec les nouveaux barèmes. Les saisies des compétences retirées seront supprimées.</p><p>Vous pourrez annuler cette action avant la prochaine modification.</p>', 'Appliquer les changements', apply, true);
      else apply();
    });
  }
  function download(content, name, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a');
    link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function exportData() {
    if (!state.data) return;
    download(JSON.stringify(state.data, null, 2), 'mon-carnet-' + new Date().toISOString().slice(0, 10) + '.json');
    notify('Sauvegarde préparée. Vérifiez le fichier dans vos téléchargements.');
  }
  function previewRestore(candidate) {
    restoreCandidate = candidate;
    const counts = `${candidate.classes.length} classe(s), ${candidate.classes.reduce((n, c) => n + c.students.length, 0)} élève(s), ${candidate.classes.reduce((n, c) => n + c.controls.length, 0)} contrôle(s)`;
    const fields = `<p>La sauvegarde est lisible. Elle contient :</p><p><strong>${counts}</strong></p><ul>${candidate.classes.map(c => `<li>${V.esc(c.name)}</li>`).join('')}</ul><p>Elle remplacera <strong>tout le carnet actuel</strong> sur cet appareil.</p>${state.data ? V.button('D’abord sauvegarder mon carnet actuel', 'export', 'button secondary full') : ''}<label class="check-label confirm-check"><input name="confirm" type="checkbox" required>Je souhaite remplacer le carnet actuel.</label>`;
    openForm('Restaurer cette sauvegarde ?', fields, 'Restaurer le carnet', form => {
      if (!form.elements.confirm.checked) throw new Error('Confirmez le remplacement du carnet.');
      if (state.conflict || store.changedExternally()) throw new Error('Une autre fenêtre a modifié le carnet. Rouvrez la version enregistrée avant de restaurer.');
      const candidate = M.clone(restoreCandidate); candidate.revision = M.uid(); candidate.updatedAt = new Date().toISOString();
      // Contrairement à la saisie, une restauration ne remplace la mémoire qu’après écriture réussie.
      store.write(candidate, { recovery: state.recovery });
      const before = state.data; state.data = candidate; state.recovery = false; state.dirty = false; state.error = null;
      state.undo = before ? { data: before, label: 'Sauvegarde restaurée.' } : null;
      dialog.close(); navigate('#'); renderRoute(); notify('Votre carnet a été restauré.');
    });
  }
  const actions = {
    backup: () => navigate('#backup'),
    'close-dialog': () => dialog.close(),
    'new-class': () => nameForm('Ajouter une classe', '', name => {
      const cls = M.makeClass(name);
      if (mutate(data => data.classes.push(cls))) navigate(V.path(cls, 'manage'));
    }),
    'rename-class': r => nameForm('Renommer la classe', r.cls.name, name => mutate(data => { editClass(data, r.cls.id).name = name; })),
    'new-students': r => openForm('Ajouter mes élèves', '<label for="student-names">Un élève par ligne</label><textarea id="student-names" name="names" rows="8" required placeholder="ALLIGIER-CUERVA Léonie\nMARTIN Gabriel\n…"></textarea><p class="helper">Vous pouvez coller une liste entière. Les homonymes sont autorisés ; vérifiez les noms avant d’ajouter.</p>', 'Ajouter les élèves', form => {
      const text = form.elements.names.value;
      const probe = M.clone(r.cls), count = M.addStudents(probe, text);
      if (mutate(data => { M.addStudents(editClass(data, r.cls.id), text); })) { dialog.close(); notify(`${count} élève(s) ajouté(s).`); }
    }),
    'rename-student': (r, btn) => {
      const student = r.cls.students.find(s => s.id === btn.dataset.id);
      nameForm('Modifier le nom de l’élève', student.name, name => mutate(data => { editClass(data, r.cls.id).students.find(s => s.id === student.id).name = name; }));
    },
    'new-control': r => controlDialog(r.cls),
    'edit-control': (r, btn) => controlDialog(r.cls, r.cls.controls.find(c => c.id === btn.dataset.id)),
    'delete-class': r => ask(`Supprimer ${V.esc(r.cls.name)} ?`, `<p>${r.cls.students.length} élèves · ${r.cls.controls.length} contrôles</p><p>Toutes les saisies associées seront supprimées. Vous pourrez annuler avant la prochaine modification.</p>`, 'Supprimer la classe', () => {
      if (mutate(data => { data.classes = data.classes.filter(c => c.id !== r.cls.id); }, { undoLabel: 'Classe supprimée.' })) navigate('#');
    }, true),
    'delete-student': (r, btn) => {
      const student = r.cls.students.find(s => s.id === btn.dataset.id);
      ask(`Supprimer ${V.esc(student.name)} ?`, '<p>Ses résultats dans tous les contrôles de cette classe seront également supprimés. Vous pourrez annuler avant la prochaine modification.</p>', 'Supprimer l’élève', () => mutate(data => {
        const cls = editClass(data, r.cls.id); cls.students = cls.students.filter(s => s.id !== student.id); cls.controls.forEach(c => delete c.results[student.id]);
      }, { undoLabel: 'Élève et résultats supprimés.' }), true);
    },
    'delete-control': (r, btn) => {
      const control = r.cls.controls.find(c => c.id === btn.dataset.id);
      ask(`Supprimer ${V.esc(control.name)} ?`, `<p>Les résultats des ${r.cls.students.length} élèves pour ce contrôle seront supprimés. Vous pourrez annuler avant la prochaine modification.</p>`, 'Supprimer le contrôle', () => mutate(data => {
        const cls = editClass(data, r.cls.id); cls.controls = cls.controls.filter(c => c.id !== control.id);
      }, { undoLabel: 'Contrôle et résultats supprimés.' }), true);
    },
    undo: () => {
      if (!state.undo) return;
      const previous = M.clone(state.undo.data);
      mutate(data => { data.classes = previous.classes; }); notify('Action annulée.');
    },
    export: exportData,
    'raw-export': () => download(JSON.stringify(store.rawCopies(), null, 2), 'carnet-a-recuperer.json'),
    previous: () => { try { const data = store.previous(); if (!data) notify('Il n’y a pas encore de copie précédente sur cet appareil.'); else previewRestore(data); } catch (error) { notify(error.message); } },
    retry: () => { if (persist()) notify('Toutes vos modifications sont enregistrées.'); },
    reload: () => ask('Rouvrir le carnet enregistré ?', '<p>Les modifications non enregistrées de cette fenêtre seront abandonnées. Téléchargez votre copie si vous souhaitez les conserver.</p>' + V.button('Télécharger ma copie', 'export', 'button secondary'), 'Rouvrir', () => location.reload()),
    print: () => window.print()
  };
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-action]'); if (!btn) return;
    const action = btn.dataset.action;
    if (!actions[action]) return;
    if ((state.recovery || state.conflict) && !['backup', 'export', 'raw-export', 'previous', 'reload', 'close-dialog', 'retry'].includes(action)) { notify('Retrouvez votre carnet avant de le modifier.'); return; }
    actions[action](route(), btn);
  });
  dialog.addEventListener('submit', event => {
    event.preventDefault();
    try { formSubmit?.(event.target); }
    catch (error) { const el = dialog.querySelector('#form-error'); if (el) el.textContent = error.message; }
  });
  dialog.addEventListener('change', event => {
    if (event.target.name === 'skill') {
      const field = dialog.querySelector('#max-' + event.target.value); field.disabled = !event.target.checked;
      field.parentElement.hidden = !event.target.checked;
      if (event.target.checked) field.focus();
    }
  });
  main.addEventListener('input', event => {
    const input = event.target, r = route();
    if (input.id === 'summary-search') { state.query = input.value; document.getElementById('summary-results').innerHTML = V.summaryCards(r.cls, state.query, state.sort); return; }
    if (!input.hasAttribute('data-point')) return;
    if (state.conflict) { input.value = r.control.results[r.student.id]?.[input.dataset.skill]?.[input.dataset.level] || ''; notify('Rouvrez le carnet enregistré avant de poursuivre la saisie.'); return; }
    const skillId = input.dataset.skill, level = input.dataset.level, raw = input.value;
    mutate(data => {
      const control = editClass(data, r.cls.id).controls.find(c => c.id === r.control.id);
      M.setResult(control, r.student.id, skillId, level, raw);
    }, { render: false });
    const current = route(), spec = current.control.skills.find(s => s.skillId === skillId);
    const status = M.resultStatus(current.control.results[current.student.id]?.[skillId], spec.max);
    input.setAttribute('aria-invalid', String(M.parsePoints(raw).kind === 'invalid'));
    const el = document.getElementById('status-' + skillId); el.textContent = V.statusText(status, spec.max); el.className = 'entry-status ' + status.state;
    const progress = M.studentProgress(current.control, current.student.id);
    document.getElementById('student-progress').textContent = `${progress.complete} / ${progress.total} compétences complètes`;
  });
  main.addEventListener('change', async event => {
    const el = event.target, r = route();
    if (el.id === 'control-select') navigate(V.path(r.cls, 'entry', el.value));
    if (el.id === 'student-select') navigate(V.path(r.cls, 'entry', r.control.id, el.value));
    if (el.id === 'summary-sort') { state.sort = el.value; document.getElementById('summary-results').innerHTML = V.summaryCards(r.cls, state.query, state.sort); }
    if (el.id === 'restore-file' && el.files[0]) {
      const feedback = document.getElementById('restore-feedback');
      try { if (el.files[0].size > 20 * 1024 * 1024) throw new Error('Ce fichier est trop volumineux.'); const candidate = S.parseBackup(await el.files[0].text()); feedback.textContent = ''; previewRestore(candidate); }
      catch (error) { feedback.textContent = error.message; }
      finally { el.value = ''; }
    }
  });
  window.addEventListener('hashchange', () => renderRoute());
  window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  function checkExternal() {
    if (!state.recovery && store.changedExternally()) {
      state.conflict = true; state.error = new S.StorageError('Le carnet a changé dans une autre fenêtre. Rouvrez sa version enregistrée avant de continuer. Vous pouvez d’abord télécharger votre copie.', 'conflict'); updateNotice();
    }
  }
  window.addEventListener('storage', event => { if (event.key === S.KEY || event.key === null) checkExternal(); });
  window.addEventListener('focus', checkExternal);
  try {
    const loaded = store.load(); state.data = loaded.data;
    if (loaded.migrated) { persist(); notify('Votre ancien carnet a été récupéré dans « Ma classe ». L’original est conservé.'); }
  } catch (error) { state.recovery = true; state.error = error; }
  renderRoute(false);
})();
