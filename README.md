# CompéNote — V2

Carnet de compétences et de notes pour corriger une pile de copies sur téléphone, classe par classe.

## Ouvrir l’application

Ouvrir **index.html** dans un navigateur récent. Garder `index.html`, `styles.css` et le dossier `js` ensemble. Aucun paquet à installer, aucune compilation, aucun service externe.

Pour tester sur ordinateur avec une adresse stable :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrir `http://127.0.0.1:8000`. Pour un téléphone sur le même réseau :

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Ouvrir `http://ADRESSE_LOCALE_DE_L_ORDINATEUR:8000` sur le téléphone. Le serveur ne reçoit pas les données du carnet : elles restent dans le navigateur. Pour une distribution régulière, préférer une adresse HTTPS fixe.

**Garder le même navigateur et la même adresse d’accès.** Passer de l’ouverture directe à une adresse HTTP, changer de port ou utiliser un autre appareil donne accès à un autre stockage. Télécharger puis restaurer une sauvegarde pour transférer le carnet.

## Corriger un devoir

1. Créer une classe et coller les élèves dans **Gérer**, un par ligne.
2. Dans **Devoirs**, choisir **Nouveau devoir**.
3. Donner un nom, choisir **/5, /10 ou /20**, puis les compétences et leurs points.
4. Ajouter si nécessaire une ou plusieurs questions de cours avec leurs points ; autoriser éventuellement les bonus.
5. Le compteur indique les points restants ou en trop. **Créer et corriger** n’est disponible que si le barème est exact, avec au moins une compétence et des points strictement positifs pour chaque élément.
6. Pour chaque copie, répartir les points de chaque compétence dans les quatre champs **NA, ECA, PA, TA**. La somme doit correspondre à son barème. L’acquisition et les points obtenus sont calculés et affichés immédiatement quand la répartition est complète. **Effacer la répartition** remet les quatre champs à vide.
7. Saisir directement les points des questions de cours et les bonus éventuels. La note s’affiche en bas, avec **Élève suivant**.
8. Ouvrir **Résultats de la classe** pour consulter ou imprimer les notes et retrouver les copies à terminer. Toucher un nom rouvre sa copie.
9. Consulter **Compétences** pour les bilans pondérés, puis télécharger une sauvegarde en fin de séance.

La sauvegarde sur l’appareil se fait à chaque modification. **Enregistré** décrit la sauvegarde, pas la complétude de la correction.

## Règles des nouveaux devoirs

- `mode: "graded"` ; note maximale 5, 10 ou 20.
- Compétences + questions de cours = note maximale exacte. Le contrôle du total utilise des centièmes entiers. Aucune redistribution automatique.
- Points d’une compétence = NA × 0 + ECA × 0,5 + PA × 0,75 + TA × 1. Acquisition = points obtenus / barème × 100. Seules les quatre valeurs brutes sont enregistrées ; aucun pourcentage n’est saisi.
- Répartition de compétence : somme inférieure au barème = partielle ; supérieure = excessive ; quatre champs vides = non renseignée ; valeur illisible = invalide. Seule une répartition complète contribue à la note et au bilan. Les champs vides valent zéro lorsque la répartition est complète.
- Une compétence /4 avec NA = 4 et les autres colonnes à zéro est complète, à 0 point et 0 %. Points de cours entre 0 et le barème de la question.
- Bonus facultatif, positif ou nul, hors barème ; vide = 0. La note peut dépasser le maximum : **21 / 20** est valide.
- Les champs obligatoires vides ne valent pas zéro. Un zéro explicite est un résultat valide.
- Une note finale exige toutes les compétences et questions renseignées correctement. Avant cela, le total est marqué **Provisoire**, ou **À corriger** si une valeur est invalide. La liste des résultats n’affiche aucune note définitive pour ces copies.
- Saisies avec virgule ou point, deux décimales maximum. La limite technique du parseur reste 100 000, comme en V1 ; aucun plafond pédagogique configurable de bonus.
- Aucun arrondi des points par élément avant la somme. Les points et notes s’affichent avec au plus deux décimales.
- Les acquisitions valides alimentent le bilan même si d’autres éléments de la copie sont incomplets. **Les questions de cours et les bonus n’alimentent jamais les compétences.**
- Dès la première saisie, même ensuite effacée, le barème, les éléments et l’activation des bonus sont verrouillés tant que le devoir conserve des corrections. Le nom et la date restent modifiables.

Exemple : compétence A /5 avec NA 1, ECA 1, PA 2, TA 1 = **3 points, 60 %** ; compétence B /8 avec NA 0, ECA 2, PA 4, TA 2 = **6 points, 75 %** ; cours = 5 / 7 ; bonus = 1. **Note : 15 / 20.**

## Anciens contrôles et bilans

Les contrôles existants portent `mode: "legacyDistribution"` et l’indication **Ancien format**. Ils restent consultables et modifiables avec leurs quatre cases NA/ECA/PA/TA. Aucune note finale n’est inventée et aucune répartition n’est convertie en pourcentage arrondi.

Les règles historiques restent inchangées :

- NA × 0 ; ECA × 0,5 ; PA × 0,75 ; TA × 1.
- La répartition est complète quand la somme correspond au barème.
- Vide, partiel, invalide ou excessif : exclu du bilan. Une répartition complète tout NA compte à 0 %.
- Les cases vides valent zéro seulement si la répartition est complète.
- La complétude s’évalue par élève, compétence et contrôle.

Le bilan mélange les deux formats : somme des points obtenus pour une compétence / somme de ses barèmes retenus × 100. La pondération reste donc celle des points possibles, sans normalisation des devoirs /5 ou /10 vers /20.

Les seuils de couleur restent <25, <50, <75, puis ≥75 %. Les couleurs du bilan sont des tranches de pourcentages calculés ; elles ne désignent pas une colonne unique de la répartition. L’affichage historique « Moins de … % » est conservé lorsqu’un arrondi masquerait un seuil non atteint.

## Architecture et schéma

- `index.html` : accueil et scripts classiques, compatible avec l’ouverture directe.
- `styles.css` : présentation mobile, bureau et impression.
- `js/model.js` : validation des schémas 1/2/3, migration, calculs et mutations métier, utilisable sous Node.
- `js/storage.js` : sauvegarde, lecture multiversion, copie précédente et détection des conflits.
- `js/views.js` : vues échappées sans mutation du carnet.
- `js/app.js` : navigation, commandes et mise à jour ciblée de la correction, sans reconstruction des champs à chaque frappe.

La V2 corrigée utilise le **schéma de stockage 3**, distinct du schéma 2 expérimental à pourcentages. Le document conserve `version`, `revision`, `updatedAt`, `classes`. Chaque classe conserve ses élèves, compétences et contrôles à identifiants stables.

Un devoir `graded` contient `id`, `mode`, `name`, `date`, `maxGrade`, `items`, `bonusEnabled`, `results`. Chaque élément possède `id`, `type`, `maxPoints` et soit `skillId` (`skill`), soit `label` (`courseQuestion`). Une compétence ne figure qu’une fois dans un devoir.

Une correction `results[studentId]` contient `answers` et `bonusRaw`. Pour une compétence, `answers[itemId] = { NA, ECA, PA, TA }`, avec les quatre textes bruts, comme dans le modèle historique. Pour une question de cours, `answers[itemId] = { raw }`. Les brouillons invalides restent sauvegardés. Le même moteur `resultStatus` calcule les répartitions des anciens contrôles et des nouveaux devoirs. Acquisition, points obtenus, note finale et complétude ne sont pas stockés en double.

Un contrôle historique conserve exactement ses `skills` et `results`, avec le seul ajout du mode. Le validateur V1 reste disponible pour contrôler les anciennes sauvegardes avant migration.

## Migration, protection et récupération

Avant la première ouverture de la V2, télécharger une sauvegarde depuis l’application précédente si possible.

- Clé courante : `mon_carnet_v3` ; copie précédant la dernière écriture : `mon_carnet_v3_previous`. Le nom V2 reste celui de la fonctionnalité métier ; 3 désigne le schéma de stockage corrigé.
- Sans schéma 3 existant, lecture prioritaire de `mon_carnet_v2` (expérimental), puis de `mon_carnet_v1`, puis du prototype. Validation du format source, migration en mémoire, validation du schéma 3, puis écriture dans la **nouvelle clé**. La valeur écrite est relue et comparée avant d’annoncer la réussite.
- `mon_carnet_v2`, `mon_carnet_v2_previous`, `mon_carnet_v1` et `mon_carnet_v1_previous` ne sont jamais écrasées ou supprimées par l’application corrigée. Classes, identifiants, résultats et brouillons V1 sont conservés ; seule la version du document et le mode des contrôles changent.
- **Examiner le carnet d’origine** permet aussi de restaurer explicitement la source expérimentale, V1 ou prototype, même si la première copie au nouveau format est devenue illisible. Cette source ne contient pas les corrections ultérieures.
- Un carnet au schéma 3 présent est prioritaire. Une corruption ouvre la récupération, jamais un carnet vide ou un retour silencieux à V1.
- **Copie précédente** propose la copie au schéma 3 ; à défaut, la copie précédente expérimentale puis V1 peut être examinée et restaurée après migration. Une copie présente mais corrompue n’est jamais masquée par une copie plus ancienne.
- L’import accepte les sauvegardes aux schémas 3, 2 expérimental, 1 et prototype. Il vérifie leur contenu puis demande confirmation du remplacement de tout le carnet. Aucune fusion automatique. La mémoire courante n’est remplacée qu’après écriture réussie.
- Un échec d’écriture est affiché ; les modifications restent exportables et un avertissement de fermeture est demandé au navigateur.
- Une modification externe de la V2 bloque la poursuite des modifications. Pendant la session de migration, une modification de la source historique est également détectée. Le contrôle avant écriture limite les conflits, sans constituer une transaction collaborative atomique.
- Utiliser ensuite uniquement la V2 : les anciennes applications continueraient à écrire dans leurs propres clés, sans synchronisation avec la V2.
- Les suppressions, restaurations et modifications d’un contrôle peuvent être annulées **jusqu’à la prochaine modification**, dans la fenêtre actuelle. Aucune corbeille permanente.
- Les sauvegardes JSON contiennent aussi les brouillons et les données historiques. Les noms et résultats des élèves sont inclus : choisir un emplacement approprié.
- La copie locale précédente et les anciennes clés ne protègent pas contre l’effacement des données du navigateur. Télécharger régulièrement une sauvegarde externe ; éviter la navigation privée.

## Données expérimentales à pourcentages

Un pourcentage seul ne permet pas de retrouver les quatre colonnes de la copie. La migration du schéma 2 n’invente donc aucune répartition.

Pour chaque réponse de compétence expérimentale, le texte d’origine (même vide ou invalide) est conservé dans `results[studentId].experimentalPercentages[itemId]`. La répartition reste non renseignée. Les cours, bonus, barèmes, identifiants et contrôles historiques restent inchangés. La clé source complète reste également intacte.

Un message dans la liste des devoirs signale les copies à reprendre. Dans chaque compétence concernée, l’ancienne valeur est visible comme référence, explicitement sans effet sur les calculs. **Il faut ressaisir la répartition depuis la copie** pour retrouver une note finale et une contribution au bilan. Cela concerne uniquement les essais de la première V2, pas les résultats historiques à quatre colonnes.

Ces références restent conservées après ressaisie, dans les sauvegardes et à la restauration. Les validateurs distinguent les formats : une réponse `{ raw: "50" }` ne peut pas être interprétée comme une répartition dans le schéma 3.

## Prototype original

`carnet_competences_math_v7_navigation_competences.html` reste intact. Si aucun carnet aux schémas 3, 2 ou 1 n’existe et que les clés `carnet_competences_math_v5` ou `gestion_competences_points_v4` sont accessibles, elles sont migrées dans **Ma classe**, avec les règles de reprise du prototype déjà utilisées en V1. Ces clés ne sont jamais effacées.

En ouverture directe `file:`, le navigateur peut isoler le stockage par fichier. Ne pas déplacer, renommer ou supprimer le prototype avant d’avoir récupéré ses données. `tools/export-prototype.js`, exécuté dans sa console par la personne accompagnant le test, télécharge une sauvegarde que la V2 sait importer. Il ne modifie pas les données du prototype.

## Vérifications

Aucune dépendance npm à installer :

```sh
node tests/model.test.js
node tests/grading.test.js
node tests/browser.test.cjs
```

Les tests métier couvrent les formules historiques et V2, les trois maxima, les quatre cas de répartition demandés, les états vides/partiels/excessifs/invalides, les bonus, les décimales, le verrouillage, les bilans mixtes, la migration sans perte et les protections de stockage.

Le test navigateur utilise Chrome à `/usr/bin/google-chrome`, ou `CHROME_BIN`. Il lance un profil temporaire isolé sans toucher au profil personnel. Les captures sont écrites dans le dossier temporaire du système. Chrome est lancé sans bac à sable pour cet environnement de test isolé ; ne pas utiliser ce mode pour la navigation courante.

Les parcours vérifient création et correction V2, résultats et reprise d’une copie, ancien format, migration V1, prototype et pourcentages expérimentaux, import/export, quota, conflits, rechargement, focus et largeurs 360/390/430/1 280 px. Le scénario de charge utilise 35 élèves × 50 contrôles historiques et un carnet V2 multi-classes.

## Limites et vérifications manuelles

- Aucun compte, serveur de données, partage ou synchronisation entre appareils.
- Aucun statut absent/dispensé, archivage, participant spécifique par devoir ou statistique avancée.
- Référentiel de compétences inchangé ; pas de nouvel écran de personnalisation.
- Le barème de création n’est enregistré qu’à la création du devoir ; les corrections, elles, sont sauvegardées à chaque modification.
- Tester sur de vrais appareils Android et iPhone : clavier décimal, navigation avec clavier ouvert, téléchargements, restauration et impression. L’émulation Chrome ne remplace pas cet essai.
