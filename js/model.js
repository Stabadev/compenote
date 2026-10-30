/* Domaine : aucune dépendance au navigateur ou au stockage. */
(function (root) {
  'use strict';
  const VERSION = 'compenote-items-experimental-1';
  const LEVELS = ['NA', 'ECA', 'PA', 'TA'];
  const WEIGHTS = { NA: 0, ECA: .5, PA: .75, TA: 1 };
  const DEFAULT_SKILLS = [
    ['S’approprier', 'pink'], ['Analyser / Raisonner', 'purple'],
    ['Réaliser', 'violet'], ['Valider', 'blue'], ['Communiquer', 'sky']
  ];
  const COLORS = DEFAULT_SKILLS.map(s => s[1]);
  const uid = () => root.crypto?.randomUUID?.() || 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const clone = value => JSON.parse(JSON.stringify(value));
  const blank = () => Object.fromEntries(LEVELS.map(level => [level, '']));
  const empty = () => ({ version: VERSION, revision: uid(), updatedAt: new Date().toISOString(), classes: [] });
  const makeClass = name => ({ id: uid(), name: name.trim(), students: [], skills: DEFAULT_SKILLS.map(([name, color]) => ({ id: uid(), name, color })), controls: [] });
  function parsePoints(raw) {
    if (raw === '' || raw === null || raw === undefined) return { kind: 'empty', value: 0 };
    const text = String(raw).trim();
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return { kind: 'invalid', value: null };
    const value = Number(text.replace(',', '.'));
    return Number.isFinite(value) && value <= 100000 ? { kind: 'valid', value } : { kind: 'invalid', value: null };
  }
  function parseItems(raw) {
    if (raw === '' || raw === null || raw === undefined) return { kind: 'empty', value: 0 };
    const text = String(raw).trim(), value = Number(text);
    // La somme des quatre compteurs doit rester un entier représentable exactement.
    return /^\d+$/.test(text) && Number.isSafeInteger(value) && value <= Math.floor(Number.MAX_SAFE_INTEGER / 4)
      ? { kind: 'valid', value } : { kind: 'invalid', value: null };
  }
  function resultStatus(result = blank(), max) {
    const values = LEVELS.map(level => parseItems(result[level]));
    if (values.some(v => v.kind === 'invalid')) return { state: 'invalid', sum: null, score: null, weighted: 0 };
    const sum = values.reduce((a, v) => a + v.value, 0);
    if (!sum) return { state: values.every(v => v.kind === 'empty') ? 'empty' : 'partial', sum: 0, score: null, weighted: 0 };
    const rate = values.reduce((a, v, i) => a + v.value * WEIGHTS[LEVELS[i]], 0) / sum;
    return { state: 'complete', sum, weighted: max * rate, score: rate * 100 };
  }
  function aggregate(cls, studentId) {
    const totals = Object.fromEntries(cls.skills.map(s => [s.id, { weighted: 0, max: 0, count: 0, excluded: 0 }]));
    let weighted = 0, max = 0;
    for (const control of cls.controls) for (const skill of control.items.filter(i => i.type === 'skill')) {
      const status = answerStatus(skill, control.results[studentId]?.answers[skill.id]);
      const possible = skill.maxPoints;
      const total = totals[skill.skillId];
      if (status.state !== 'complete') { if (status.state !== 'empty') total.excluded++; continue; }
      total.weighted += status.weighted; total.max += possible; total.count++;
      weighted += status.weighted; max += possible;
    }
    return { skills: Object.fromEntries(Object.entries(totals).map(([id, t]) => [id, { ...t, score: t.max ? t.weighted / t.max * 100 : null }])), global: max ? weighted / max * 100 : null };
  }
  const cents = value => Math.round(value * 100);
  function rubricStatus(maxGrade, items) {
    const validPoints = Array.isArray(items) && items.every(i => i && typeof i.maxPoints === 'number' && parsePoints(i.maxPoints).kind === 'valid' && i.maxPoints > 0);
    const sum = Array.isArray(items) ? items.reduce((total, item) => total + (typeof item?.maxPoints === 'number' && parsePoints(item.maxPoints).kind === 'valid' ? cents(item.maxPoints) : 0), 0) : null;
    return { valid: [5, 10, 20].includes(maxGrade) && validPoints && items.some(i => i.type === 'skill') && sum === cents(maxGrade), sum: sum === null ? null : sum / 100, remaining: sum === null ? null : (cents(maxGrade) - sum) / 100 };
  }
  function answerStatus(item, answer) {
    if (item.type === 'skill') return resultStatus(answer, item.maxPoints);
    const parsed = parsePoints(answer?.raw);
    if (parsed.kind === 'empty') return { state: 'empty', weighted: 0, score: null };
    if (parsed.kind === 'invalid' || parsed.value > item.maxPoints) return { state: 'invalid', weighted: 0, score: null };
    return { state: 'complete', weighted: parsed.value, score: null };
  }
  function gradeStatus(control, studentId) {
    const result = control.results[studentId], statuses = control.items.map(item => answerStatus(item, result?.answers[item.id]));
    const bonus = control.bonusEnabled ? parsePoints(result?.bonusRaw) : { kind: 'empty', value: 0 };
    const complete = statuses.filter(s => s.state === 'complete').length;
    const invalid = statuses.some(s => s.state === 'invalid') || bonus.kind === 'invalid';
    const started = statuses.some(s => s.state !== 'empty') || bonus.kind !== 'empty';
    const provisional = statuses.reduce((sum, status) => sum + (status.state === 'complete' ? status.weighted : 0), 0) + (bonus.kind === 'invalid' ? 0 : bonus.value);
    const state = invalid ? 'invalid' : complete === statuses.length ? 'complete' : started ? 'partial' : 'empty';
    return { state, complete, total: statuses.length, started, provisional, grade: state === 'complete' ? provisional : null, bonus: bonus.kind === 'invalid' ? null : bonus.value };
  }
  function setAnswer(control, studentId, itemId, raw) {
    if (!control.items.some(i => i.id === itemId && i.type === 'courseQuestion')) throw new Error('Élément de saisie inconnu.');
    control.results[studentId] ||= { answers: {}, bonusRaw: '' };
    control.results[studentId].answers[itemId] = { raw };
  }
  function setDistribution(control, studentId, itemId, level, raw) {
    if (!LEVELS.includes(level) || !control.items.some(i => i.id === itemId && i.type === 'skill')) throw new Error('Champ d’items inconnu.');
    control.results[studentId] ||= { answers: {}, bonusRaw: '' };
    control.results[studentId].answers[itemId] ||= blank();
    control.results[studentId].answers[itemId][level] = raw;
  }
  function clearAnswer(control, studentId, itemId) {
    const item = control.items.find(i => i.id === itemId);
    if (item?.type === 'skill') for (const level of LEVELS) setDistribution(control, studentId, itemId, level, '');
    else setAnswer(control, studentId, itemId, '');
  }
  function setBonus(control, studentId, raw) {
    if (!control.bonusEnabled) throw new Error('Ce devoir ne prévoit pas de bonus.');
    control.results[studentId] ||= { answers: {}, bonusRaw: '' };
    control.results[studentId].bonusRaw = raw;
  }
  const gradingLocked = control => Object.keys(control.results).length > 0;
  function updateGraded(control, spec) {
    const structure = c => JSON.stringify([c.maxGrade, c.items, c.bonusEnabled]);
    if (gradingLocked(control) && structure(control) !== structure(spec)) throw new Error('La correction a commencé : le barème et les bonus sont verrouillés. Seuls le nom et la date peuvent changer.');
    Object.assign(control, { name: spec.name, date: spec.date, maxGrade: spec.maxGrade, items: clone(spec.items), bonusEnabled: spec.bonusEnabled });
  }
  function validate(data) {
    const fail = message => { throw new Error(message); };
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const str = (value, max = 120) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
    const ids = new Set();
    const id = value => { if (!str(value, 100) || !/^[\w-]+$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value) || ids.has(value)) fail('Un identifiant est absent ou répété.'); ids.add(value); };
    const array = (value, label) => { if (!Array.isArray(value)) fail(label + ' : liste manquante.'); };
    if (!object(data) || data.version !== VERSION) fail('Cette sauvegarde ne correspond pas à une version prise en charge.');
    if (!str(data.revision, 100) || !str(data.updatedAt) || !Number.isFinite(Date.parse(data.updatedAt))) fail('Les informations de sauvegarde sont incomplètes.');
    array(data.classes, 'Classes');
    for (const cls of data.classes) {
      if (!object(cls)) fail('Classe illisible.'); id(cls.id);
      if (!str(cls.name)) fail('Nom de classe invalide.');
      array(cls.students, 'Élèves'); array(cls.skills, 'Compétences'); array(cls.controls, 'Contrôles');
      if (!cls.skills.length) fail('Une classe doit avoir des compétences.');
      for (const student of cls.students) { if (!object(student)) fail('Élève illisible.'); id(student.id); if (!str(student.name)) fail('Nom d’élève invalide.'); }
      for (const skill of cls.skills) { if (!object(skill)) fail('Compétence illisible.'); id(skill.id); if (!str(skill.name) || !COLORS.includes(skill.color)) fail('Compétence invalide.'); }
      const studentIds = new Set(cls.students.map(s => s.id)), skillIds = new Set(cls.skills.map(s => s.id));
      for (const control of cls.controls) {
        if (!object(control)) fail('Contrôle illisible.'); id(control.id);
        if (!str(control.name) || !validDate(control.date)) fail('Nom ou date du contrôle invalide.');
        if (!object(control.results) || typeof control.bonusEnabled !== 'boolean') fail('Devoir incomplet.');
        array(control.items, 'Barème');
        const used = new Set(), itemIds = new Set();
        for (const item of control.items) {
          if (!object(item)) fail('Élément de barème illisible.');
          id(item.id); itemIds.add(item.id);
          if (item.type === 'skill') {
            if (!skillIds.has(item.skillId) || used.has(item.skillId)) fail('Compétence inconnue ou répétée.');
            used.add(item.skillId);
          } else if (item.type !== 'courseQuestion' || !str(item.label) || Object.hasOwn(item, 'skillId')) fail('Question de cours invalide.');
        }
        if (!rubricStatus(control.maxGrade, control.items).valid) fail('Les compétences et questions doivent totaliser exactement la note maximale (5, 10 ou 20), avec au moins une compétence.');
        for (const [studentId, result] of Object.entries(control.results)) {
          if (!studentIds.has(studentId) || !object(result) || !object(result.answers) || typeof result.bonusRaw !== 'string' || result.bonusRaw.length > 32) fail('Correction illisible.');
          if (!control.bonusEnabled && result.bonusRaw !== '') fail('Bonus non autorisé pour ce devoir.');
          for (const [itemId, answer] of Object.entries(result.answers)) {
            if (!itemIds.has(itemId) || !object(answer)) fail('Réponse illisible ou sans élément de barème.');
            const item = control.items.find(i => i.id === itemId);
            if (item.type === 'skill') {
              if (Object.keys(answer).length !== 4 || LEVELS.some(level => typeof answer[level] !== 'string' || answer[level].length > 32)) fail('Nombres d’items illisibles.');
            } else if (Object.keys(answer).length !== 1 || typeof answer.raw !== 'string' || answer.raw.length > 32) fail('Réponse illisible.');
          }
        }
      }
    }
    return data;
  }
  function validDate(value) {
    if (value === '') return true;
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function addStudents(cls, text) {
    const names = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!names.length) throw new Error('Écrivez au moins un nom.');
    if (names.some(name => name.length > 120)) throw new Error('Un nom dépasse 120 caractères.');
    // Les homonymes sont autorisés : les identifiants, eux, sont uniques.
    cls.students.push(...names.map(name => ({ id: uid(), name })));
    return names.length;
  }
  const api = { VERSION, LEVELS, WEIGHTS, COLORS, DEFAULT_SKILLS, uid, clone, blank, empty, makeClass, parsePoints, parseItems, resultStatus, aggregate, validate, addStudents, validDate, rubricStatus, answerStatus, gradeStatus, setAnswer, setDistribution, clearAnswer, setBonus, gradingLocked, updateGraded };
  root.CarnetModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
