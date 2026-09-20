# Mon carnet — V1

Carnet de compétences pour les mathématiques et les sciences, conçu pour reporter les résultats d’une pile de copies sur téléphone.

## Ouvrir l’application

Ouvrir **index.html** dans un navigateur récent. Garder `index.html`, `styles.css` et le dossier `js` ensemble. Aucun paquet à installer, aucune compilation, aucun service externe.

Sur ordinateur, le double-clic fonctionne. Pour tester sur un téléphone, servir ce dossier avec un hébergement statique ou un serveur local accessible au téléphone, par exemple :

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Ouvrir ensuite `http://ADRESSE_LOCALE_DE_L_ORDINATEUR:8000` sur le téléphone connecté au même réseau. L’adresse doit rester stable pour retrouver les données. Pour une distribution régulière, préférer une adresse HTTPS fixe. Le serveur ne reçoit pas les données du carnet : elles restent dans le navigateur.

## Premier usage

1. Créer une classe.
2. Dans **Gérer**, coller les élèves, un par ligne.
3. Créer un contrôle avec ses compétences et ses barèmes.
4. Dans **Saisir**, reporter une copie puis passer à l’élève suivant.
5. Consulter **Synthèse**.
6. En fin de séance, utiliser **Sauvegarder mes données** (bouton en haut à droite).

La sauvegarde est un fichier complet, contenant aussi les brouillons. La restauration vérifie son contenu, présente les classes et demande une confirmation avant remplacement. Les noms et résultats des élèves sont inclus : conserver le fichier dans un emplacement approprié.

## Règles conservées

- NA × 0 ; ECA × 0,5 ; PA × 0,75 ; TA × 1.
- Une répartition est complète si la somme des points correspond au barème.
- Le vide ne vaut pas une note à zéro. Une vraie répartition entièrement NA compte à 0 %.
- Une répartition vide, partielle, invalide ou excessive est exclue de la synthèse.
- La complétude est évaluée par élève, compétence et contrôle : les autres compétences peuvent rester incomplètes.
- La moyenne est pondérée par les barèmes. Aucun arrondi intermédiaire.
- Nombres de 0 à 100 000, avec au plus deux décimales, virgule ou point. Les barèmes doivent être strictement positifs.
- Les cases laissées vides représentent zéro lorsque la répartition est complète.
- Seuils de couleur sur la valeur réelle : <25, <50, <75, puis ≥75 %. Si l’arrondi d’affichage franchirait un seuil, le texte affiche « Moins de … % ».

## Architecture

- `index.html` : structure d’accueil et chargement des scripts classiques, compatible avec l’ouverture directe.
- `styles.css` : présentation mobile puis adaptations pour ordinateur et impression.
- `js/model.js` : modèle, identifiants, validation profonde, migration, calculs et mutations métier élémentaires. Utilisable aussi sous Node.
- `js/storage.js` : lecture, contrôle de version, sauvegarde, copie précédente, détection d’une révision externe, validation des fichiers.
- `js/views.js` : vues échappées, sans modification du modèle.
- `js/app.js` : commandes utilisateur, navigation par liens, transactions et mise à jour ciblée de la saisie.

Le document versionné contient `version`, `revision`, `updatedAt`, `classes`. Une classe contient ses élèves, ses compétences et ses contrôles. Tous disposent d’identifiants stables. Les contrôles référencent les compétences par identifiant et les résultats sont indexés par identifiants d’élève et de compétence. Les niveaux conservent le texte saisi : un brouillon invalide est récupérable, mais ne produit jamais une note.

La saisie ne reconstruit ni ses champs ni la synthèse à chaque frappe. Les données sont sauvegardées à chaque modification. Un échec est annoncé et les changements restent exportables ; un avertissement de fermeture est alors demandé au navigateur.

## Protection et récupération

- Clé principale : `mon_carnet_v1` ; copie précédant la dernière écriture : `mon_carnet_v1_previous`.
- Une corruption ouvre un écran de récupération, jamais un carnet vide silencieux.
- Une modification par une autre fenêtre bloque la poursuite des modifications jusqu’à réouverture de la version enregistrée. La copie courante reste exportable. Le contrôle de révision limite les conflits ; ce n’est pas un moteur d’édition collaborative atomique.
- La suppression et les changements de barème peuvent être annulés **jusqu’à la prochaine modification**, dans la fenêtre actuelle. Ce n’est pas une corbeille permanente. La copie précédente et les sauvegardes externes complètent cette protection.
- L’import remplace l’ensemble des classes, sans fusion automatique, après validation et confirmation. L’état courant est conservé en mémoire jusqu’à la réussite de l’écriture.
- Ne pas utiliser la navigation privée pour conserver le carnet. L’effacement des données du navigateur supprime aussi la copie précédente : télécharger régulièrement une sauvegarde externe.

## Prototype original

`carnet_competences_math_v7_navigation_competences.html` est conservé intact. Quand les anciennes clés `carnet_competences_math_v5` ou `gestion_competences_points_v4` sont accessibles depuis la nouvelle application, leur contenu est migré prudemment dans **Ma classe**. Les anciennes clés ne sont jamais effacées. Une donnée illisible déclenche une récupération explicite.

En ouverture directe `file:`, les navigateurs peuvent isoler le stockage par fichier : la nouvelle page ne peut alors pas lire celui du prototype. Ne pas déplacer, renommer ou supprimer l’ancien fichier avant d’avoir récupéré ses données. Le script `tools/export-prototype.js` peut être exécuté dans la console du prototype par la personne qui accompagne le test ; il télécharge un fichier que la V1 sait restaurer. Cette opération n’écrit rien dans les données du prototype.

## Vérifications

Aucune dépendance de test à installer :

```sh
node tests/model.test.js
node tests/browser.test.cjs
```

Le second script utilise Chrome installé à `/usr/bin/google-chrome`, ou le chemin indiqué par `CHROME_BIN`. Il lance un profil temporaire isolé ; il ne touche pas au profil du navigateur personnel. Des captures sont écrites dans le dossier temporaire du système. Chrome est lancé sans bac à sable pour l’environnement de test isolé ; ne pas utiliser ce mode de lancement pour la navigation courante.

Les tests couvrent les formules, les cas vides/invalides, la pondération, le versionnement, les erreurs de stockage, les migrations, les conflits et les principaux parcours dans le navigateur. Ils vérifient les largeurs 360, 390, 430 et 1 280 px et un carnet de 35 élèves, 50 contrôles, 5 compétences.

## Limites de cette V1

- Données liées au navigateur et à son adresse d’accès ; aucun compte, partage ou transfert automatique entre appareils.
- Interface des compétences par défaut ; le modèle permet leur personnalisation future, sans écran de personnalisation pour cette V1.
- Pas encore de statuts d’absence/dispense, d’archivage annuel ni de corbeille durable.
- Vérification automatisée dans Chrome avec tailles de téléphone ; un essai sur de vrais appareils Android et iPhone reste nécessaire, notamment pour le clavier, les téléchargements et la restauration.
- Avant un usage institutionnel durable : décider du mode de distribution, de la conservation des sauvegardes et des accès sur appareils partagés.
