# CompéNote — Version expérimentale par items

Version de développement et de test. Le calcul des compétences utilise des **nombres d’items**. Les données des versions précédentes ne sont pas reprises et leurs clés de stockage ne sont ni modifiées ni supprimées.

## Ouvrir l’application

Ouvrir `index.html` dans un navigateur récent, en conservant `styles.css` et le dossier `js` à côté. Aucun framework, paquet à installer, compilation, compte ou serveur de données.

Pour une adresse locale stable, on peut aussi lancer :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Puis ouvrir `http://127.0.0.1:8000`. Garder le même navigateur et la même adresse : changer de port, d’origine ou d’appareil donne accès à un autre stockage. L’ouverture directe `file:` dépend des règles de stockage du navigateur.

## Créer un devoir

1. Créer une classe et ajouter les élèves dans **Gérer**, un nom par ligne. Les homonymes sont autorisés.
2. Dans cette classe, ouvrir **Devoirs → Nouveau devoir**.
3. Renseigner le nom et, éventuellement, la date. Choisir **/5, /10 ou /20**.
4. Cocher les compétences et attribuer des points à chacune. Une compétence apparaît une seule fois par devoir.
5. Ajouter éventuellement des questions de cours, avec leur libellé et leurs points, et autoriser les bonus.
6. Vérifier le compteur : **compétences + questions de cours = maximum du devoir**, exactement. Chaque élément a un barème strictement positif ; au moins une compétence est obligatoire.

Le nombre d’items n’est jamais demandé à la création. Aucun lien n’est imposé entre nombre d’items et barème. Le formulaire de création n’est enregistré qu’à sa validation.

Le barème, les éléments et l’autorisation des bonus sont verrouillés dès la première saisie, même ensuite effacée, tant que le devoir conserve des corrections. Le nom et la date restent modifiables.

## Corriger par items

Pour chaque copie, saisir dans **NA / ECA / PA / TA** le **nombre d’items** relevant de chaque niveau. Tous les items d’une même compétence ont le même poids.

| Niveau | Signification | Coefficient |
|---|---|---:|
| NA | Non acquis | 0 |
| ECA | En cours d’acquisition | 0,5 |
| PA | Partiellement acquis | 0,75 |
| TA | Totalement acquis | 1 |

Pour une compétence de barème B :

```text
N = NA + ECA + PA + TA
Taux de maîtrise = (0 × NA + 0,5 × ECA + 0,75 × PA + TA) / N
Points obtenus = B × taux de maîtrise
```

Dès que la saisie est valide et **N > 0**, la compétence est entièrement évaluée. N peut être inférieur, égal ou supérieur à B. L’écran affiche automatiquement le total d’items, la maîtrise et les points obtenus.

Exemples :

| Barème | Items saisis | Maîtrise | Points obtenus |
|---|---|---:|---:|
| /4 | 1 NA et 1 TA | 50 % | 2/4 |
| /5 | 3 TA | 100 % | 5/5 |
| /5 | 2 NA | 0 % | 0/5 |
| /4 | 1 ECA et 1 TA | 75 % | 3/4 |
| /3 | 1 NA, 1 ECA, 1 PA, 1 TA | 56,25 % | 1,6875/3 avant affichage |
| /4 | 2 PA et 1 TA | 83,333… % | 3,333…/4 avant affichage |

Les nombres d’items doivent être des entiers positifs ou nuls. Décimales, valeurs négatives et texte sont refusés dans le calcul. Une limite technique par champ de `floor(Number.MAX_SAFE_INTEGER / 4)` protège la précision de la somme des quatre compteurs ; elle est indépendante du barème.

- Quatre champs vides : compétence non renseignée.
- Quatre zéros explicites : zéro item, compétence encore à renseigner.
- Une case vide vaut zéro si au moins un item est saisi ailleurs et que toutes les valeurs sont valides.
- Une valeur incorrecte invalide la compétence, même si une autre colonne contient un item.
- **Effacer les items** vide les quatre champs.

Les brouillons, y compris incorrects, restent sauvegardés. Une compétence non renseignée, sans item ou invalide ne compte pas dans le bilan.

## Note finale et résultats

Les questions de cours restent saisies directement en points, de zéro à leur maximum. Un champ vide n’est pas un zéro ; un zéro explicite est une réponse complète.

```text
Note finale = points des compétences + points des questions de cours + bonus
```

Le bonus est facultatif, positif ou nul, hors barème. Vide = zéro. La note peut dépasser le maximum, par exemple **21/20**. Les points de cours et bonus acceptent point ou virgule, deux décimales maximum ; la limite technique est 100 000. Aucun plafond pédagogique de bonus n’est configurable.

La note définitive exige toutes les compétences évaluées et toutes les questions correctement renseignées. Avant cela, le total est **Provisoire** ; une saisie invalide donne **À corriger**. Le provisoire inclut uniquement les éléments complets et le bonus valide.

Les calculs utilisent les nombres JavaScript sans arrondi intermédiaire des contributions. Les points et notes s’affichent avec au plus deux décimales, la maîtrise avec au plus une décimale. Les valeurs brutes restent enregistrées ; les résultats sont recalculés. Les petites approximations propres aux nombres flottants restent possibles.

**Résultats de la classe** permet de consulter les notes, retrouver une copie à terminer et imprimer. Les devoirs sont listés du plus récemment ajouté au plus ancien. Les classes, élèves et devoirs restent modifiables ou supprimables ; les suppressions peuvent être annulées jusqu’à la prochaine modification, dans la fenêtre actuelle.

## Bilan de compétences

L’onglet **Compétences** présente un bilan individuel sur tous les devoirs de la classe :

```text
Maîtrise cumulée = somme des points obtenus / somme des barèmes retenus × 100
```

Le poids dépend du **barème**, jamais du nombre d’items. Exemple : 50 % sur 4 points, puis 100 % sur 6 points donnent `(2 + 6) / (4 + 6) = 80 %`, quel que soit le nombre d’items de chaque devoir.

Seules les compétences valides avec au moins un item sont retenues, même si le reste de la copie est encore incomplet. Les questions de cours et les bonus sont exclus du bilan. Les fiches peuvent être recherchées, triées par nom et imprimées.

Les couleurs correspondent aux tranches `<25`, `<50`, `<75` et `≥75 %`, et non à la sélection d’un niveau unique. Si l’arrondi annoncerait un seuil non atteint, l’affichage indique « Moins de … % ».

## Stockage, sauvegarde et récupération

- Nouvelle clé : **`compenote_items_experimental_v1`**.
- Copie précédant la dernière écriture : `compenote_items_experimental_v1_previous`.
- Format JSON : `version: "compenote-items-experimental-1"`.
- Aucune lecture automatique, migration, suppression ou réécriture des anciennes clés.
- Import exclusivement du nouveau format ; les anciens exports sont refusés.
- Export JSON de tout le carnet, avec noms, résultats et brouillons.
- Restauration après validation et confirmation : remplacement de tout le carnet, sans fusion. La mémoire n’est remplacée qu’après écriture réussie.
- Enregistrement local à chaque modification. **Enregistré** décrit la sauvegarde, pas la complétude de la copie.
- Un échec d’écriture laisse les modifications en mémoire, affiche **Non enregistré**, permet l’export et la nouvelle tentative, et demande au navigateur un avertissement à la fermeture.
- Une corruption ouvre la récupération ; elle ne déclenche pas de carnet vide silencieux. La copie précédente peut être examinée puis restaurée.
- Les modifications d’une autre fenêtre sont détectées et bloquent la poursuite de la saisie. Cette protection n’est pas une transaction collaborative atomique.

Télécharger régulièrement une sauvegarde externe. Le stockage local et sa copie précédente ne protègent pas contre l’effacement des données du navigateur. Aucun partage ni synchronisation entre appareils. Éviter la navigation privée.

## Structure et responsabilités

- `index.html` : structure, scripts et mention expérimentale.
- `styles.css` : mobile, bureau, impression.
- `js/model.js` : moteur unique, validation, élèves, verrouillage.
- `js/storage.js` : stockage isolé, conflits, copie précédente et import.
- `js/views.js` : formulaires, correction, résultats, bilans et formatage.
- `js/app.js` : navigation, événements, commandes et sauvegarde.

Le document contient `version`, `revision`, `updatedAt`, `classes`. Chaque classe conserve `students`, `skills`, `controls`. Un devoir conserve `id`, `name`, `date`, `maxGrade`, `items`, `bonusEnabled`, `results` ; aucun mode de notation alternatif.

Un élément de barème contient `id`, `type`, `maxPoints` et soit `skillId` (`skill`), soit `label` (`courseQuestion`). Une correction `results[studentId]` contient `answers` et `bonusRaw`. `answers[itemId]` contient les textes `{ NA, ECA, PA, TA }` pour les compteurs d’items ou `{ raw }` pour les points de cours. Notes et pourcentages ne sont pas stockés en double.

Les fonctions de calcul principales sont `parseItems()`, `resultStatus()`, `answerStatus()`, `gradeStatus()`, `rubricStatus()` et `aggregate()`. Les anciens modes, migrations et références aux pourcentages expérimentaux ont été retirés.

## Tests

```sh
node --test tests/model.test.js tests/grading.test.js
node tests/browser.test.cjs
git diff --check
```

Les tests métier couvrent les trois maxima, les totaux de barème, N inférieur/égal/supérieur au barème, les exemples de référence, vide/zéros/invalides, précision, cours, bonus, bilan pondéré, verrouillage, classes indépendantes, validation, persistance, import/export, corruption, conflits et quota.

Le test navigateur utilise Chrome à `/usr/bin/google-chrome`, ou le binaire Chromium compatible indiqué dans `CHROME_BIN` :

```sh
CHROME_BIN=/chemin/vers/navigateur node tests/browser.test.cjs
```

Il utilise un profil temporaire isolé et écrit ses téléchargements et captures dans le répertoire temporaire système. Il vérifie création, correction, résultats, PDF, import/export, erreurs, sauvegarde, recherche, tri, annulation, charge multi-classes, focus, champs accessibles et largeurs 360/390/430/1280 px. Le lancement sans bac à sable est limité à ce profil automatisé de test.

## Limites de cette version

Cette version reste expérimentale. Les tests sous navigateur Chromium ne remplacent pas les essais sur de vrais appareils Android et iPhone : clavier numérique, navigation, téléchargement, restauration et impression.

Le référentiel initial reste fixe dans l’interface. Aucun statut absent/dispensé, participant propre à un devoir, archivage ou moyenne générale des notes. Les participants suivent la liste actuelle de la classe.

Chaque saisie clone, valide et sauvegarde le carnet entier : le coût augmente avec son volume. La copie précédente correspond à la dernière écriture, pas à une séance complète.
