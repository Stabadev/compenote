/* Domaine : aucune dépendance au navigateur ou au stockage. */
(function (root) {
  'use strict';
  const VERSION = 1;
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
  function resultStatus(result = blank(), max) {
    const values = LEVELS.map(level => parsePoints(result[level]));
    if (values.some(v => v.kind === 'invalid')) return { state: 'invalid', sum: null, score: null, weighted: 0 };
    if (values.every(v => v.kind === 'empty')) return { state: 'empty', sum: 0, score: null, weighted: 0 };
    const sum = values.reduce((a, v) => a + v.value, 0);
    const weighted = values.reduce((a, v, i) => a + v.value * WEIGHTS[LEVELS[i]], 0);
    const state = Math.abs(sum - max) < 1e-7 ? 'complete' : sum > max ? 'excess' : 'partial';
    return { state, sum, weighted, score: state === 'complete' ? weighted / max * 100 : null };
  }
  function aggregate(cls, studentId) {
    const totals = Object.fromEntries(cls.skills.map(s => [s.id, { weighted: 0, max: 0, count: 0, excluded: 0 }]));
    let weighted = 0, max = 0;
    for (const control of cls.controls) for (const skill of control.skills) {
      const status = resultStatus(control.results[studentId]?.[skill.skillId], skill.max);
      const total = totals[skill.skillId];
      if (status.state !== 'complete') { if (status.state !== 'empty') total.excluded++; continue; }
      total.weighted += status.weighted; total.max += skill.max; total.count++;
      weighted += status.weighted; max += skill.max;
    }
    return { skills: Object.fromEntries(Object.entries(totals).map(([id, t]) => [id, { ...t, score: t.max ? t.weighted / t.max * 100 : null }])), global: max ? weighted / max * 100 : null };
  }
  function studentProgress(control, studentId) {
    const states = control.skills.map(s => resultStatus(control.results[studentId]?.[s.skillId], s.max).state);
    return { complete: states.filter(s => s === 'complete').length, total: states.length, started: states.some(s => s !== 'empty') };
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
        array(control.skills, 'Compétences du contrôle');
        if (!control.skills.length || !object(control.results)) fail('Contrôle incomplet.');
        const used = new Set();
        for (const skill of control.skills) {
          if (!object(skill) || !skillIds.has(skill.skillId) || used.has(skill.skillId)) fail('Compétence du contrôle inconnue ou répétée.');
          used.add(skill.skillId);
          if (typeof skill.max !== 'number' || parsePoints(skill.max).kind !== 'valid' || skill.max <= 0) fail('Nombre de points possibles invalide.');
        }
        for (const [studentId, results] of Object.entries(control.results)) {
          if (!studentIds.has(studentId) || !object(results)) fail('Résultat associé à un élève inconnu.');
          for (const [skillId, result] of Object.entries(results)) {
            if (!used.has(skillId) || !object(result) || Object.keys(result).length !== 4) fail('Répartition de points illisible.');
            // Les brouillons invalides restent récupérables, mais jamais comptabilisés.
            for (const level of LEVELS) if (typeof result[level] !== 'string' || result[level].length > 32) fail('Valeur de saisie illisible.');
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
  function migrate(old) {
    if (!old || !Array.isArray(old.students) || !Array.isArray(old.controls)) throw new Error('Ancien carnet illisible.');
    const data = empty(), cls = makeClass('Ma classe'); data.classes.push(cls);
    const students = new Map(), skills = new Map(cls.skills.map(s => [s.name, s.id]));
    for (const s of old.students) {
      if (!s || typeof s.id !== 'string' || students.has(s.id) || typeof s.name !== 'string') throw new Error('Ancienne liste d’élèves illisible.');
      const id = uid(); students.set(s.id, id); cls.students.push({ id, name: s.name });
    }
    for (const c of old.controls) {
      if (!c || !Array.isArray(c.skills) || !c.skills.length || typeof c.name !== 'string') throw new Error('Ancien contrôle illisible.');
      const control = { id: uid(), name: c.name, date: '', skills: [], results: {} };
      for (const s of c.skills) {
        if (!s || typeof s.name !== 'string') throw new Error('Ancienne compétence illisible.');
        if (!skills.has(s.name)) { const skill = { id: uid(), name: s.name, color: 'sky' }; cls.skills.push(skill); skills.set(s.name, skill.id); }
        const max = parsePoints(s.max); if (max.kind !== 'valid' || max.value <= 0) throw new Error('Ancien barème invalide.');
        control.skills.push({ skillId: skills.get(s.name), max: max.value });
      }
      if (c.results != null && (typeof c.results !== 'object' || Array.isArray(c.results))) throw new Error('Anciens résultats illisibles.');
      for (const [oldId, results] of Object.entries(c.results || {})) {
        if (!students.has(oldId) || !results || typeof results !== 'object' || Array.isArray(results)) throw new Error('Anciens résultats sans élève reconnu.');
        const converted = {}; control.results[students.get(oldId)] = converted;
        for (const [name, result] of Object.entries(results)) {
          if (!c.skills.some(s => s.name === name) || !result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Ancienne répartition illisible.');
          if (Object.keys(result).some(k => !LEVELS.includes(k))) throw new Error('Ancienne répartition inconnue.');
          converted[skills.get(name)] = Object.fromEntries(LEVELS.map(level => {
            const value = result[level]; if (value != null && typeof value !== 'string' && typeof value !== 'number') throw new Error('Ancienne valeur illisible.');
            return [level, value == null ? '' : String(value)];
          }));
        }
      }
      cls.controls.push(control);
    }
    return validate(data);
  }
  function addStudents(cls, text) {
    const names = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!names.length) throw new Error('Écrivez au moins un nom.');
    if (names.some(name => name.length > 120)) throw new Error('Un nom dépasse 120 caractères.');
    // Les homonymes sont autorisés : les identifiants, eux, sont uniques.
    cls.students.push(...names.map(name => ({ id: uid(), name })));
    return names.length;
  }
  function setResult(control, studentId, skillId, level, raw) {
    if (!LEVELS.includes(level) || !control.skills.some(s => s.skillId === skillId)) throw new Error('Champ de saisie inconnu.');
    control.results[studentId] ||= {}; control.results[studentId][skillId] ||= blank();
    control.results[studentId][skillId][level] = raw;
  }
  const api = { VERSION, LEVELS, WEIGHTS, COLORS, DEFAULT_SKILLS, uid, clone, blank, empty, makeClass, parsePoints, resultStatus, aggregate, studentProgress, validate, migrate, addStudents, setResult, validDate };
  root.CarnetModel = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
