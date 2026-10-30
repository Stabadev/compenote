/* Persistance : contrôle de révision, copie précédente et récupération explicite. */
(function (root) {
  'use strict';
  const M = root.CarnetModel || require('./model.js');
  const KEY = 'compenote_items_experimental_v1', PREVIOUS = KEY + '_previous';
  class StorageError extends Error { constructor(message, kind) { super(message); this.kind = kind; } }
  function createStore(storage) {
    let baseline = null, loaded = false;
    function load() {
      let raw;
      try { raw = storage.getItem(KEY); baseline = raw; loaded = true; }
      catch { throw new StorageError('Votre navigateur ne permet pas d’ouvrir les données enregistrées. Elles n’ont pas été remplacées.', 'read'); }
      if (raw !== null) {
        try { return { data: M.validate(JSON.parse(raw)) }; }
        catch { throw new StorageError('Votre carnet enregistré ne peut pas être lu. Il est conservé : restaurez une sauvegarde ou essayez la copie précédente.', 'corrupt'); }
      }
      return { data: M.empty() };
    }
    function write(data, { recovery = false } = {}) {
      M.validate(data);
      if (!loaded) throw new StorageError('Rouvrez le carnet avant d’enregistrer.', 'read');
      try {
        const current = storage.getItem(KEY);
        if (current !== baseline) throw new StorageError('Ce carnet a été modifié dans une autre fenêtre. Conservez votre copie avant de rouvrir la version enregistrée.', 'conflict');
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
        const raw = storage.getItem(PREVIOUS);
        if (raw !== null) return M.validate(JSON.parse(raw));
        return null;
      }
      catch { throw new StorageError('La copie précédente ne peut pas être lue.', 'corrupt'); }
    }
    function rawCopies() {
      const copies = {};
      for (const key of [KEY, PREVIOUS]) { try { const raw = storage.getItem(key); if (raw !== null) copies[key] = raw; } catch {} }
      return copies;
    }
    function changedExternally() { try { return storage.getItem(KEY) !== baseline; } catch { return true; } }
    return { load, write, previous, rawCopies, changedExternally };
  }
  function parseBackup(text) {
    if (text.length > 20 * 1024 * 1024) throw new Error('Ce fichier est trop volumineux pour être une sauvegarde du carnet.');
    let value; try { value = JSON.parse(text); } catch { throw new Error('Ce fichier n’est pas une sauvegarde lisible du carnet.'); }
    return M.clone(M.validate(value));
  }
  const api = { KEY, PREVIOUS, StorageError, createStore, parseBackup };
  root.CarnetStorage = api; if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
