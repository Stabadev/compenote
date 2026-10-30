/* Vues sans mutation : les valeurs utilisateur sont échappées systématiquement. */
(function (root) {
  'use strict';
  const M = root.CarnetModel;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = value => Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  // Ne jamais afficher un seuil atteint alors que la valeur réelle lui est inférieure.
  const percent = value => {
    if (value == null) return '—';
    const rounded = Math.round(value * 10) / 10;
    const boundary = [25, 50, 75, 100].find(t => value < t && rounded >= t);
    return boundary ? 'Moins de ' + boundary + ' %' : Number(rounded).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
  };
  const scoreClass = value => value == null ? 'empty-score' : value < 25 ? 'na' : value < 50 ? 'eca' : value < 75 ? 'pa' : 'ta';
  const sortedStudents = cls => [...cls.students].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  const path = (cls, tab = 'entry', control = '', student = '') => '#class/' + cls.id + '/' + tab + (control ? '/' + control : '') + (student ? '/' + student : '');
  const button = (text, action, cls = 'button', attrs = '') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;
  const empty = (title, text, action = '') => `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">▤</span><h2>${title}</h2><p>${text}</p>${action}</div>`;
  function home(data) {
    return `<div class="page-heading"><div><p class="eyebrow">UN PEU MOINS DE PAPIER, UN PEU PLUS DE CLARTÉ</p><h1>Mes classes<span class="heading-dot">.</span></h1><p>Vos élèves, leurs progrès. Tout simplement.</p></div>${button('+ Ajouter une classe', 'new-class', 'button primary')}</div>
      ${data.classes.length ? `<div class="class-grid">${data.classes.map((cls, i) => `<article class="class-card"><div class="class-card-top"><span class="class-icon tone-${i % 3}" aria-hidden="true">${esc(cls.name.slice(0, 2))}</span><span class="subtle">${cls.controls.length} contrôle${cls.controls.length > 1 ? 's' : ''}</span></div><h2>${esc(cls.name)}</h2><p>${cls.students.length} élève${cls.students.length > 1 ? 's' : ''}</p><a class="button primary full" href="${path(cls)}">Saisir des résultats <span aria-hidden="true">→</span></a><div class="class-links"><a href="${path(cls, 'summary')}">Synthèse</a><a href="${path(cls, 'manage')}">Gérer la classe</a></div></article>`).join('')}</div>` : `<div class="welcome"><div class="welcome-art" aria-hidden="true"><div class="paper"><span></span><b>Les progrès<br>prennent forme.</b><i></i><i></i><i></i><div>✓</div></div></div><div><p class="eyebrow">BIENVENUE DANS VOTRE CARNET</p><h2>Votre première classe,<br>et c’est parti.</h2><p>Ajoutez une classe, collez la liste de vos élèves, puis créez votre premier devoir.</p>${button('Créer ma première classe →', 'new-class', 'button primary')}</div></div>`}
      <aside class="backup-reminder"><span aria-hidden="true">↥</span><div><strong>Votre carnet reste sur cet appareil.</strong><p>Pensez à télécharger une sauvegarde après une séance de saisie.</p></div><a href="#backup">Sauvegarder</a></aside>`;
  }
  function shell(cls, tab, content) {
    return `<a class="back-link" href="#">← Mes classes</a><div class="class-heading"><div><p class="eyebrow">MON CARNET DE COMPÉTENCES</p><h1>${esc(cls.name)}</h1></div><span class="count-chip">${cls.students.length} élèves</span></div><nav class="class-tabs" aria-label="Dans cette classe">${[['entry', 'Devoirs'], ['summary', 'Compétences'], ['manage', 'Gérer']].map(([key, label]) => `<a href="${path(cls, key)}" ${(key === tab || key === 'entry' && tab === 'results') ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>${content}`;
  }
  const controlDescription = control => `Devoir sur ${fmt(control.maxGrade)} · ${control.items.filter(i => i.type === 'skill').length} compétence(s)`;
  function chooseControl(cls) {
    if (!cls.students.length) return empty('Commençons par les élèves', 'Collez votre liste de classe, un nom par ligne.', `<a class="button primary" href="${path(cls, 'manage')}">Ajouter mes élèves →</a>`);
    return `<div class="section-heading"><div><h2>Mes devoirs</h2><p>Choisissez un devoir, puis prenez votre première copie.</p></div>${button('+ Nouveau devoir', 'new-control', 'button primary')}</div>${cls.controls.length ? `<div class="control-grid">${[...cls.controls].reverse().map(c => {
      const complete = cls.students.filter(s => { const p = M.gradeStatus(c, s.id); return p.state === 'complete'; }).length;
      return `<article class="control-card"><div><span class="eyebrow">${c.date ? esc(new Date(c.date + 'T12:00:00').toLocaleDateString('fr-FR')) : 'DEVOIR'}</span><h3>${esc(c.name)}</h3><p>${controlDescription(c)}</p><p>${complete} / ${cls.students.length} copies complètes</p><progress value="${complete}" max="${cls.students.length}" aria-label="${complete} copies complètes sur ${cls.students.length}"></progress><div class="control-actions"><a class="button primary" href="${path(cls, 'entry', c.id)}">Corriger →</a><a class="button secondary" href="${path(cls, 'results', c.id)}">Résultats</a>${button('Modifier', 'edit-control', 'small-button', `data-id="${c.id}" aria-label="Modifier ${esc(c.name)}"`)}</div></div></article>`;
    }).join('')}</div>` : empty('Votre premier devoir', 'Choisissez les compétences et leurs points possibles.', button('Créer un devoir', 'new-control', 'button primary'))}`;
  }
  function summaryCards(cls, query = '', sort = 'az') {
    const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
    const students = sortedStudents(cls).filter(s => normalize(s.name).includes(normalize(query.trim())));
    if (sort === 'za') students.reverse();
    return `<p class="result-count">${students.length} fiche${students.length > 1 ? 's' : ''} · seules les saisies valides avec au moins un item sont comptées.</p>${students.length ? `<div class="summary-grid">${students.map(student => {
      const totals = M.aggregate(cls, student.id);
      return `<article class="summary-card"><h3>${esc(student.name)}</h3><dl>${cls.skills.map(skill => {
        const t = totals.skills[skill.id];
        return `<div><dt><span class="skill-dot skill-${skill.color}" aria-hidden="true"></span>${esc(skill.name)}<small>${t.count ? `${t.count} évaluation${t.count > 1 ? 's' : ''} · ${fmt(t.max)} pts` : 'Pas encore évaluée'}${t.excluded ? ` · ${t.excluded} saisie(s) à terminer` : ''}</small></dt><dd class="score ${scoreClass(t.score)}">${percent(t.score)}</dd></div>`;
      }).join('')}</dl></article>`;
    }).join('')}</div>` : empty('Aucun élève trouvé', query ? 'Essayez un autre nom.' : 'Ajoutez les élèves dans « Gérer ».')}`;
  }
  function summary(cls, query, sort) {
    return `<div class="section-heading"><div><h2>Les progrès de chaque élève</h2><p>Une moyenne pondérée par les points possibles.</p></div>${button('Imprimer', 'print', 'button secondary no-print')}</div><div class="summary-tools no-print"><div><label for="summary-search">Rechercher un élève</label><input type="search" id="summary-search" placeholder="Un nom, un prénom…" value="${esc(query)}"></div><div><label for="summary-sort">Ordre des fiches</label><select id="summary-sort"><option value="az" ${sort === 'az' ? 'selected' : ''}>Nom A → Z</option><option value="za" ${sort === 'za' ? 'selected' : ''}>Nom Z → A</option></select></div></div><p class="legend"><span class="na">0 à &lt;25 %</span><span class="eca">25 à &lt;50 %</span><span class="pa">50 à &lt;75 %</span><span class="ta">75 à 100 %</span></p><div id="summary-results">${summaryCards(cls, query, sort)}</div>`;
  }
  function manage(cls) {
    return `<div class="section-heading"><div><h2>Ma classe, en ordre</h2><p>Préparez vos élèves et vos prochains contrôles.</p></div>${button('Renommer la classe', 'rename-class', 'button secondary')}</div><div class="manage-grid"><section class="panel"><div class="section-heading"><h2>Mes élèves <span class="subtle">${cls.students.length}</span></h2>${button('+ Ajouter', 'new-students', 'button primary')}</div>${cls.students.length ? `<ul class="item-list">${sortedStudents(cls).map(s => `<li><strong>${esc(s.name)}</strong><div class="item-actions">${button('Modifier', 'rename-student', 'small-button', `data-id="${s.id}" aria-label="Modifier le nom de ${esc(s.name)}"`)}${button('×', 'delete-student', 'small-button danger', `data-id="${s.id}" aria-label="Supprimer ${esc(s.name)}"`)}</div></li>`).join('')}</ul>` : `<p>Collez toute votre liste en une fois : un élève par ligne.</p>${button('Ajouter mes élèves', 'new-students', 'button secondary')}`}</section><section class="panel"><div class="section-heading"><h2>Mes devoirs <span class="subtle">${cls.controls.length}</span></h2>${button('+ Créer', 'new-control', 'button primary')}</div>${cls.controls.length ? `<ul class="item-list controls-list">${[...cls.controls].reverse().map(c => `<li><div><strong>${esc(c.name)}</strong><p>${controlDescription(c)}${c.date ? ' · ' + esc(new Date(c.date + 'T12:00:00').toLocaleDateString('fr-FR')) : ''}</p><a href="${path(cls, 'entry', c.id)}">Saisir les résultats →</a></div><div class="item-actions">${button('Modifier', 'edit-control', 'small-button', `data-id="${c.id}" aria-label="Modifier ${esc(c.name)}"`)}${button('×', 'delete-control', 'small-button danger', `data-id="${c.id}" aria-label="Supprimer ${esc(c.name)}"`)}</div></li>`).join('')}</ul>` : '<p>Créez un devoir, choisissez ses compétences et leurs points possibles.</p>'}</section></div><div class="danger-zone"><p>Supprimer la classe retire également ses élèves, ses contrôles et leurs résultats.</p>${button('Supprimer cette classe', 'delete-class', 'button danger')}</div>`;
  }
  function backup(data, recovery = false) {
    const counts = data ? `${data.classes.length} classe(s) · ${data.classes.reduce((n, c) => n + c.students.length, 0)} élève(s) · ${data.classes.reduce((n, c) => n + c.controls.length, 0)} contrôle(s)` : '';
    return `${recovery ? '' : '<a class="back-link" href="#">← Mes classes</a>'}<div class="page-heading"><div><p class="eyebrow">PRENDRE SOIN DE VOTRE CARNET</p><h1>${recovery ? 'Retrouvons votre carnet' : 'Mes sauvegardes'}</h1><p>${recovery ? 'Les données existantes ont été conservées. Rien n’a été effacé.' : 'Une petite habitude, pour garder l’esprit tranquille.'}</p></div></div><div class="backup-grid">${data ? `<section class="panel backup-panel"><span class="large-icon" aria-hidden="true">↥</span><h2>Garder une copie</h2><p>Téléchargez tout votre carnet : classes, élèves, contrôles et résultats.</p><p class="helper">${counts}</p>${button('Sauvegarder mes données', 'export', 'button primary full')}<p class="helper">Gardez ce fichier dans un endroit sûr, idéalement aussi sur un autre appareil. Il contient les noms et résultats de vos élèves.</p></section>` : ''}<section class="panel backup-panel"><span class="large-icon" aria-hidden="true">↧</span><h2>Retrouver une sauvegarde</h2><p>Choisissez un fichier de sauvegarde. Son contenu sera vérifié avant de vous proposer de remplacer le carnet.</p><label class="button secondary file-button" for="restore-file">Choisir ma sauvegarde<input id="restore-file" type="file" accept=".json,application/json"></label><p id="restore-feedback" role="status"></p></section><section class="panel backup-panel"><h2>Revenir à la copie précédente</h2><p>L’appareil garde une copie avant la dernière modification enregistrée. Vous pourrez la vérifier avant de la rétablir.</p>${button('Examiner la copie précédente', 'previous', 'button secondary')}${recovery ? button('Conserver les données pour obtenir de l’aide', 'raw-export', 'button secondary full') : ''}</section></div><p class="helper">Sur un autre appareil ou dans un autre navigateur, ouvrez le carnet puis restaurez votre sauvegarde. Ouvrez toujours l’application au même emplacement.</p>`;
  }
  function dialogForm(title, fields, submit, extra = '') {
    return `<form id="edit-form"><div class="dialog-heading"><h2 id="dialog-title">${title}</h2>${button('×', 'close-dialog', 'icon-button', 'aria-label="Fermer"')}</div>${fields}<p id="form-error" class="form-error" role="alert"></p>${extra}<div class="dialog-actions">${button('Annuler', 'close-dialog', 'button secondary')}<button class="button primary" type="submit">${submit}</button></div></form>`;
  }
  function questionField(item = { id: M.uid(), label: '', maxPoints: '' }, locked = false) {
    return `<div class="question-config" data-question="${item.id}"><label for="label-${item.id}">Question de cours</label><input id="label-${item.id}" data-question-label type="text" maxlength="120" placeholder="Ex. Définitions" value="${esc(item.label)}" required><div class="question-points"><div><label for="max-${item.id}">Points possibles</label><input id="max-${item.id}" data-question-max type="text" inputmode="decimal" maxlength="12" value="${esc(item.maxPoints === '' ? '' : fmt(item.maxPoints))}" required></div>${button('Retirer', 'remove-question', 'small-button danger', locked ? 'disabled' : '')}</div></div>`;
  }
  function gradedControlFields(cls, control) {
    const locked = control && M.gradingLocked(control);
    return `<label for="control-name">Nom du devoir</label><input id="control-name" name="name" maxlength="120" required value="${esc(control?.name || '')}" placeholder="Ex. Pythagore"><label for="control-date">Date <span class="subtle">facultative</span></label><input id="control-date" name="date" type="date" value="${esc(control?.date || '')}">
      ${locked ? '<p class="locked-notice">La correction a commencé. Le barème et les bonus sont protégés ; seuls le nom et la date peuvent changer.</p>' : ''}
      <div id="rubric-status" class="rubric-status" role="status"></div>
      <fieldset class="graded-config" ${locked ? 'disabled' : ''}><legend>Barème du devoir</legend>
      <div class="max-grade-options" role="group" aria-label="Note maximale">${[5, 10, 20].map(max => `<label><input type="radio" name="maxGrade" value="${max}" ${(control?.maxGrade || 20) === max ? 'checked' : ''}><span>/${max}</span></label>`).join('')}</div>
      <fieldset class="skill-config"><legend>Compétences évaluées</legend>${cls.skills.map(skill => {
        const item = control?.items.find(i => i.type === 'skill' && i.skillId === skill.id);
        return `<div class="skill-config-row skill-${skill.color}"><label class="check-label"><input type="checkbox" name="skill" value="${skill.id}" data-item-id="${item?.id || M.uid()}" ${item ? 'checked' : ''}>${esc(skill.name)}</label><div ${item ? '' : 'hidden'}><label for="max-${skill.id}">Points possibles</label><input id="max-${skill.id}" name="max-${skill.id}" type="text" inputmode="decimal" maxlength="12" placeholder="Ex. 5" value="${item ? fmt(item.maxPoints) : ''}" ${item ? '' : 'disabled'}></div></div>`;
      }).join('')}</fieldset>
      <section class="course-config"><h3>Questions de cours <span class="subtle">facultatives</span></h3><div id="course-questions">${(control?.items || []).filter(i => i.type === 'courseQuestion').map(i => questionField(i, locked)).join('')}</div>${button('+ Ajouter une question de cours', 'add-question', 'button secondary full', locked ? 'disabled' : '')}</section>
      <label class="check-label bonus-option"><input name="bonusEnabled" type="checkbox" ${control?.bonusEnabled ? 'checked' : ''}>Autoriser des points bonus</label><p class="helper">Les bonus s’ajoutent à la note, hors barème.</p></fieldset>`;
  }
  function answerText(item, status) {
    if (item.type === 'skill') {
      if (status.state === 'complete') return `${fmt(status.sum)} item${status.sum > 1 ? 's' : ''} évalué${status.sum > 1 ? 's' : ''}\nMaîtrise : ${percent(status.score)}\nPoints obtenus : ${fmt(status.weighted)} / ${fmt(item.maxPoints)}`;
      if (status.state === 'invalid') return 'Indiquez des nombres entiers positifs ou nuls pour les items.';
      if (status.state === 'partial') return '0 item évalué · ajoutez au moins un item. Hors bilan.';
      return 'Compétence non renseignée · aucun item évalué. Hors bilan.';
    }
    if (status.state === 'empty') return 'Pas encore renseigné';
    if (status.state === 'invalid') return `Indiquez de 0 à ${fmt(item.maxPoints)} points (2 décimales maximum).`;
    return `${fmt(status.weighted)} / ${fmt(item.maxPoints)} pts`;
  }
  function gradeText(control, status) {
    if (status.state === 'complete') return `Note : ${fmt(status.grade)} / ${fmt(control.maxGrade)}`;
    if (status.state === 'invalid') return 'À corriger · vérifiez les valeurs';
    if (status.state === 'empty') return `Note sur ${fmt(control.maxGrade)} · à renseigner`;
    return `Provisoire : ${fmt(status.provisional)} / ${fmt(control.maxGrade)} · à terminer`;
  }
  function gradedItem(cls, control, student, item) {
    const skill = item.type === 'skill' ? cls.skills.find(s => s.id === item.skillId) : null;
    const label = skill?.name || item.label, result = control.results[student.id];
    const answer = result?.answers[item.id], status = M.answerStatus(item, answer);
    return `<section class="skill-entry graded-item" aria-labelledby="title-${item.id}"><div class="skill-entry-heading ${skill ? 'skill-' + skill.color : 'course-heading'}"><h3 id="title-${item.id}">${esc(label)}</h3><span>sur ${fmt(item.maxPoints)} points</span></div>
      ${skill ? `<div class="level-grid">${M.LEVELS.map(level => {
        const raw = answer?.[level] ?? '';
        return `<div class="level-field ${level.toLowerCase()}"><label for="answer-${item.id}-${level}">${level}<small>Items · × ${fmt(M.WEIGHTS[level])}</small></label><input id="answer-${item.id}-${level}" data-distribution="${item.id}" data-level="${level}" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="32" placeholder="—" value="${esc(raw)}" aria-label="${esc(student.name)}, ${esc(label)}, ${level}, nombre d’items" aria-describedby="answer-status-${item.id}" aria-invalid="${M.parseItems(raw).kind === 'invalid'}"></div>`;
      }).join('')}</div><div class="distribution-actions">${button('Effacer les items', 'clear-answer', 'small-button', `data-item="${item.id}" aria-label="Effacer les items de ${esc(label)}"`)}</div>` : `<div class="answer-field"><label for="answer-${item.id}">Points obtenus</label><div class="answer-controls"><input id="answer-${item.id}" data-answer="${item.id}" type="text" inputmode="decimal" autocomplete="off" maxlength="32" placeholder="—" value="${esc(answer?.raw ?? '')}" aria-label="${esc(student.name)}, ${esc(label)}, points obtenus" aria-describedby="answer-status-${item.id}" aria-invalid="${status.state === 'invalid'}"><span>/ ${fmt(item.maxPoints)}</span>${button('Effacer', 'clear-answer', 'small-button', `data-item="${item.id}" aria-label="Effacer ${esc(label)}"`)}</div></div>`}
      <p id="answer-status-${item.id}" class="entry-status ${status.state}" aria-live="polite">${answerText(item, status)}</p></section>`;
  }
  function gradedEntry(cls, control, student) {
    const students = sortedStudents(cls), index = students.findIndex(s => s.id === student.id), status = M.gradeStatus(control, student.id);
    const bonusRaw = control.results[student.id]?.bonusRaw || '', bonusInvalid = M.parsePoints(bonusRaw).kind === 'invalid';
    return `<div class="entry-top"><div><label for="control-select">Devoir</label><select id="control-select">${cls.controls.map(c => `<option value="${c.id}" ${c.id === control.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div><a class="text-link" href="${path(cls, 'results', control.id)}">Résultats de la classe →</a></div>
      <div class="entry-layout"><aside class="student-panel"><p class="eyebrow">UNE COPIE À LA FOIS · SUR ${control.maxGrade}</p><label for="student-select">Élève <span class="subtle">${index + 1} sur ${students.length}</span></label><select id="student-select">${students.map(s => `<option value="${s.id}" ${s.id === student.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select><div class="student-name"><span aria-hidden="true">✎</span><h2>${esc(student.name)}</h2></div><p id="student-progress">${status.complete} / ${status.total} éléments renseignés</p><details class="level-help"><summary>Les niveaux d’acquisition</summary><p>Indiquez le nombre d’items dans chaque colonne. Chaque item a le même poids.<br>NA : non acquis × 0<br>ECA : en cours d’acquisition × 0,5<br>PA : partiellement acquis × 0,75<br>TA : totalement acquis × 1<br>Le total des items est indépendant du barème. Au moins un item est nécessaire ; les cases vides valent zéro.</p></details></aside>
      <div class="skills-stack">${[...control.items.filter(i => i.type === 'skill'), ...control.items.filter(i => i.type === 'courseQuestion')].map(item => gradedItem(cls, control, student, item)).join('')}
      ${control.bonusEnabled ? `<section class="skill-entry"><div class="skill-entry-heading course-heading"><h3>Points bonus</h3><span>facultatifs</span></div><div class="answer-field"><label for="bonus-points">Bonus à ajouter</label><div class="answer-controls"><input id="bonus-points" data-bonus type="text" inputmode="decimal" autocomplete="off" maxlength="32" placeholder="0" value="${esc(bonusRaw)}" aria-describedby="bonus-status" aria-invalid="${bonusInvalid}"><span>pts</span></div><p id="bonus-status" class="helper" aria-live="polite">${bonusInvalid ? 'Indiquez un nombre positif ou zéro (2 décimales maximum).' : 'Vide = 0. La note peut dépasser ' + control.maxGrade + '.'}</p></div></section>` : ''}</div></div>
      <div class="correction-footer"><p id="grade-total" class="grade-total ${status.state}" role="status">${gradeText(control, status)}</p><nav class="student-pager" aria-label="Passer à une autre copie">${index > 0 ? `<a class="button secondary" href="${path(cls, 'entry', control.id, students[index - 1].id)}">← Précédent</a>` : '<button class="button secondary" disabled>← Précédent</button>'}<span>${index + 1} / ${students.length}</span>${index < students.length - 1 ? `<a class="button primary" href="${path(cls, 'entry', control.id, students[index + 1].id)}">Élève suivant →</a>` : `<a class="button primary" href="${path(cls, 'results', control.id)}">Voir les résultats →</a>`}</nav></div>`;
  }
  function results(cls, control) {
    const complete = cls.students.filter(s => M.gradeStatus(control, s.id).state === 'complete').length;
    return `<div class="section-heading"><div><p class="eyebrow">RÉSULTATS DU DEVOIR</p><h2>${esc(control.name)} · sur ${control.maxGrade}</h2><p>${complete} / ${cls.students.length} copies complètes</p></div>${button('Imprimer', 'print', 'button secondary no-print')}</div><div class="panel"><ul class="grade-results">${sortedStudents(cls).map(student => {
      const status = M.gradeStatus(control, student.id);
      return `<li><a href="${path(cls, 'entry', control.id, student.id)}"><strong>${esc(student.name)}</strong><span class="result-grade ${status.state}">${status.grade === null ? (status.state === 'invalid' ? 'À corriger' : 'À terminer') + ` <small>/ ${control.maxGrade}</small>` : `${fmt(status.grade)} / ${control.maxGrade}`}</span><span class="no-print result-open">Ouvrir la copie →</span></a></li>`;
    }).join('')}</ul>${cls.students.length ? '' : '<p>Aucun élève dans cette classe.</p>'}</div><p class="helper no-print">Touchez un nom pour reprendre la correction.</p>`;
  }
  root.CarnetViews = { esc, fmt, percent, scoreClass, sortedStudents, path, button, empty, home, shell, chooseControl, entry: gradedEntry, summary, summaryCards, manage, backup, dialogForm, gradedControlFields, questionField, answerText, gradeText, results };
})(globalThis);
