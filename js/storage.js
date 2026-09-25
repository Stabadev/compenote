/* Persistance : contrôle de révision, copie précédente et récupération explicite. */
(function (root) {
  'use strict';
  const M = root.CarnetModel || require('./model.js');
  const KEY = 'mon_carnet_v3', PREVIOUS = KEY + '_previous';
  const V2 = 'mon_carnet_v2', V2_PREVIOUS = V2 + '_previous';
  const V1 = 'mon_carnet_v1', V1_PREVIOUS = V1 + '_previous';
  const LEGACY = ['carnet_competences_math_v5', 'gestion_competences_points_v4'];
  class StorageError extends Error { constructor(message, kind) { super(message); this.kind = kind; } }
  function createStore(storage) {
    let baseline = null, loaded = false, source = null;
    function load() {
      let raw;
      try { raw = storage.getItem(KEY); baseline = raw; loaded = true; }
      catch { throw new StorageError('Votre navigateur ne permet pas d’ouvrir les données enregistrées. Elles n’ont pas été remplacées.', 'read'); }
      if (raw !== null) {
        try { return { data: M.validate(JSON.parse(raw)), migrated: false }; }
        catch { throw new StorageError('Votre carnet enregistré ne peut pas être lu. Il est conservé : restaurez une sauvegarde ou essayez la copie précédente.', 'corrupt'); }
      }
      for (const key of [V2, V1, ...LEGACY]) {
        let legacy;
        try { legacy = storage.getItem(key); }
        catch { throw new StorageError('Impossible de vérifier votre ancien carnet. Aucune donnée n’a été remplacée.', 'read'); }
        if (legacy !== null) {
          try {
            const data = M.upgrade(JSON.parse(legacy));
            source = { key, raw: legacy };
            return { data, migrated: true };
          }
          catch { throw new StorageError('Un ancien carnet a été trouvé, mais il nécessite une récupération. L’original a été conservé.', 'legacy'); }
        }
      }
      return { data: M.empty(), migrated: false };
    }
    function write(data, { recovery = false } = {}) {
      M.validate(data);
      if (!loaded) throw new StorageError('Rouvrez le carnet avant d’enregistrer.', 'read');
      try {
        const current = storage.getItem(KEY);
        if (current !== baseline) throw new StorageError('Ce carnet a été modifié dans une autre fenêtre. Conservez votre copie avant de rouvrir la version enregistrée.', 'conflict');
        if (source && storage.getItem(source.key) !== source.raw) throw new StorageError('L’ancien carnet a changé dans une autre fenêtre. Conservez votre copie et rouvrez le carnet avant de poursuivre.', 'conflict');
        if (baseline && !recovery) storage.setItem(PREVIOUS, baseline);
        const raw = JSON.stringify(data);
        storage.setItem(KEY, raw);
        if (storage.getItem(KEY) !== raw) throw new StorageError('La vérification de l’enregistrement a échoué. Téléchargez votre copie avant de rouvrir le carnet.', 'conflict');
        baseline = raw;
      } catch (error) {
        if (error instanceof StorageError) throw error;
        throw new StorageError('L’enregistrement sur cet appareil a échoué. Vos modifications restent à l’écran : téléchargez une sauvegarde pour les conserver.', 'write');
      }
    }
    function previous() {
      try {
        // Une copie courante présente mais corrompue ne doit pas déclencher un retour silencieux à V1.
        const raw = storage.getItem(PREVIOUS);
        if (raw !== null) return M.validate(JSON.parse(raw));
        for (const key of [V2_PREVIOUS, V1_PREVIOUS]) {
          const old = storage.getItem(key);
          if (old !== null) return M.upgrade(JSON.parse(old));
        }
        return null;
      }
      catch { throw new StorageError('La copie précédente ne peut pas être lue.', 'corrupt'); }
    }
    function original() {
      try {
        for (const key of [V2, V1, ...LEGACY]) {
          const raw = storage.getItem(key);
          if (raw !== null) return M.upgrade(JSON.parse(raw));
        }
        return null;
      } catch { throw new StorageError('Le carnet d’origine ne peut pas être lu. Ses données restent conservées.', 'corrupt'); }
    }
    function rawCopies() {
      const copies = {};
      for (const key of [KEY, PREVIOUS, V2, V2_PREVIOUS, V1, V1_PREVIOUS, ...LEGACY]) { try { const raw = storage.getItem(key); if (raw !== null) copies[key] = raw; } catch {} }
      return copies;
    }
    function changedExternally() { try { return storage.getItem(KEY) !== baseline || !!(source && storage.getItem(source.key) !== source.raw); } catch { return true; } }
    return { load, write, previous, original, rawCopies, changedExternally };
  }
  function parseBackup(text) {
    if (text.length > 20 * 1024 * 1024) throw new Error('Ce fichier est trop volumineux pour être une sauvegarde du carnet.');
    let value; try { value = JSON.parse(text); } catch { throw new Error('Ce fichier n’est pas une sauvegarde lisible du carnet.'); }
    return M.upgrade(value);
  }
  const api = { KEY, PREVIOUS, V2, V2_PREVIOUS, V1, V1_PREVIOUS, LEGACY, StorageError, createStore, parseBackup };
  root.CarnetStorage = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
