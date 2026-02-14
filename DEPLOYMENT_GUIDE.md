# 🚀 GUIDE DE DÉPLOIEMENT RAPIDE - SÉCURITÉ ZCOFFEE

## 📋 PRÉREQUIS

- [ ] Compte Firebase (plan Blaze recommandé)
- [ ] Node.js 18+ installé
- [ ] Firebase CLI installé (`npm install -g firebase-tools`)
- [ ] Git installé

---

## ⚡ DÉPLOIEMENT EN 5 ÉTAPES

### ÉTAPE 1 : Installation et Configuration Initiale (5 min)

```bash
# 1. Se connecter à Firebase
firebase login

# 2. Initialiser Firebase dans le projet
cd C:\Users\Youssef\Desktop\public
firebase init

# Sélectionner:
# - Firestore
# - Functions
# - Hosting

# 3. Installer les dépendances des fonctions
cd functions
npm install
cd ..
```

### ÉTAPE 2 : Configurer les Secrets (10 min)

```bash
# Générer des clés sécurisées
# PowerShell:
$csrf = [Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))
$admin = [Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))

# Afficher les clés (COPIER CES VALEURS)
Write-Host "CSRF Secret: $csrf"
Write-Host "Admin Secret: $admin"

# Configurer Firebase Functions
firebase functions:config:set security.csrf_secret="$csrf"
firebase functions:config:set security.admin_secret="$admin"

# Vérifier
firebase functions:config:get
```

### ÉTAPE 3 : Sécuriser les Clés API (5 min)

**IMPORTANT: NE PAS COMMITER firebase-config.js avec les vraies clés !**

```bash
# 1. Créer .env pour le développement local
New-Item -Path ".env" -ItemType File

# 2. Ajouter au .gitignore
Add-Content -Path ".gitignore" -Value "`n# Secrets`n.env`nfirebase-config.json`nfull_config.json`nlatest_config*.json"

# 3. Dans Firebase Console:
# https://console.firebase.google.com/project/zina-coffee/settings/general
# Copier les clés et les stocker dans .env
```

**Contenu du .env :**
```env
FIREBASE_API_KEY=AIzaSyC0QuEDhruGrmf14nb__tE2L75BDrMRwPQ
FIREBASE_AUTH_DOMAIN=zina-coffee.firebaseapp.com
FIREBASE_PROJECT_ID=zina-coffee
```

### ÉTAPE 4 : Restreindre les Accès (10 min)

#### A. Domaines Autorisés

```bash
# Firebase Console → Authentication → Settings → Authorized domains
# Garder UNIQUEMENT:
# - zina-coffee.web.app
# - localhost (dev seulement)
# SUPPRIMER tous les autres
```

#### B. Restreindre la Clé API

```bash
# Google Cloud Console:
# https://console.cloud.google.com/apis/credentials

# Sélectionner la clé "Browser key (auto created by Firebase)"
# Application restrictions → HTTP referrers
# Ajouter:
- https://zina-coffee.web.app/*
- http://localhost:5000/*

# Enregistrer
```

#### C. Emails Autorisés

Vérifier dans `firestore.rules` et `functions/index.js` que seuls ces emails sont autorisés :
- belhajyoussefbelhaj@gmail.com
- awatifnefzi@gmail.com
- mina.zina.coffee@gmail.com
- admin.zina@gmail.com

### ÉTAPE 5 : Déployer (15 min)

```bash
# 1. Déployer les règles Firestore
firebase deploy --only firestore:rules

# 2. Déployer les Cloud Functions
firebase deploy --only functions

# 3. Déployer le Hosting avec headers de sécurité
firebase deploy --only hosting

# OU déployer tout en une fois:
firebase deploy

# 4. Vérifier le déploiement
firebase open hosting:site
```

---

## ✅ VÉRIFICATIONS POST-DÉPLOIEMENT

### Test 1 : Headers de Sécurité

```bash
# PowerShell:
Invoke-WebRequest -Uri "https://zina-coffee.web.app" -Method GET | Select-Object -ExpandProperty Headers

# Vérifier la présence de:
# - Content-Security-Policy
# - Strict-Transport-Security
# - X-Frame-Options
# - X-Content-Type-Options
```

**OU utiliser un outil en ligne:**
- https://securityheaders.com
- Entrer: `https://zina-coffee.web.app`
- **Target: Grade A**

### Test 2 : Authentification

```bash
# 1. Ouvrir https://zina-coffee.web.app/zcoffee-secret-2026.html
# 2. Entrer la clé: 16122010
# 3. Se connecter avec un email AUTORISÉ
# 4. Vérifier l'accès au dashboard
# 5. Essayer avec un email NON autorisé → Doit être refusé
```

### Test 3 : CSRF Protection

```bash
# 1. Ouvrir le dashboard sécurisé
# 2. Ouvrir Console DevTools (F12)
# 3. Taper:
securityManager.getCSRFToken().then(console.log)

# Doit afficher un token comme:
# "1234567890.a1b2c3d4e5f6..."
```

### Test 4 : Rate Limiting

```bash
# Tester en faisant 6+ tentatives de connexion rapides
# → Doit bloquer après 5 tentatives
```

### Test 5 : Audit Logs

```bash
# 1. Se connecter au dashboard
# 2. Effectuer quelques actions (créer/modifier items)
# 3. Vérifier que les logs apparaissent dans la section "Logs d'Audit"
```

---

## 🔧 CONFIGURATION AVANCÉE (OPTIONNEL)

### Activer Firebase App Check (20 min)

```bash
# 1. Firebase Console → App Check
# 2. Cliquer "Get Started"
# 3. Sélectionner "reCAPTCHA v3"
# 4. Suivre les instructions pour obtenir les clés de site
# 5. Copier la clé de site

# 6. Ajouter à firebase-config.js:
```

```javascript
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('VOTRE_CLE_SITE_RECAPTCHA'),
  isTokenAutoRefreshEnabled: true
});
```

```bash
# 7. Dans Firebase Console → App Check → Apps
# 8. Activer "Enforcement" pour:
#    - Authentication
#    - Firestore
#    - Cloud Functions

# 9. Redéployer
firebase deploy
```

### Configurer Google Cloud Armor (Budget > 50€/mois)

Voir le guide détaillé: `INFRASTRUCTURE_SECURITY.md` section 2

### Activer le MFA pour les Admins

```bash
# 1. Firebase Console → Authentication → Settings
# 2. Multi-factor authentication → Enable
# 3. Activer TOTP

# 4. Chaque admin doit ensuite:
#    - Se connecter
#    - Aller dans Paramètres du compte
#    - Activer l'authentification à 2 facteurs
#    - Scanner le QR code avec Google Authenticator
```

---

## 🐛 DÉPANNAGE

### Erreur: "CORS policy blocked"

**Solution:**
```bash
# Vérifier que le domaine est autorisé:
# Firebase Console → Authentication → Settings → Authorized domains
```

### Erreur: "Function not found"

**Solution:**
```bash
# Redéployer les fonctions:
firebase deploy --only functions

# Vérifier les logs:
firebase functions:log
```

### Erreur: "Token CSRF invalide"

**Solution:**
```bash
# Régénérer le token:
# 1. Se déconnecter
# 2. Se reconnecter
# 3. Le token sera automatiquement régénéré
```

### Les règles Firestore ne fonctionnent pas

**Solution:**
```bash
# Vérifier la syntaxe:
firebase firestore:rules:validate

# Déployer à nouveau:
firebase deploy --only firestore:rules

# Voir les logs d'erreur:
# Firebase Console → Firestore → Rules → Logs
```

---

## 📱 SURVEILLANCE CONTINUE

### Logs en Temps Réel

```bash
# Terminal 1: Logs Functions
firebase functions:log --only secureMenuUpdate

# Terminal 2: Logs Auth
firebase auth:emulator:export
```

### Monitoring dans la Console

1. **Firestore:** https://console.firebase.google.com/project/zina-coffee/firestore
2. **Functions:** https://console.firebase.google.com/project/zina-coffee/functions
3. **Authentication:** https://console.firebase.google.com/project/zina-coffee/authentication
4. **Logs:** https://console.cloud.google.com/logs

---

## 📊 MÉTRIQUES DE SUCCÈS

| Métrique | Objectif | Comment Vérifier |
|----------|----------|------------------|
| Security Headers | Grade A | securityheaders.com |
| HTTPS | 100% | Toutes les pages en HTTPS |
| Auth Rate Limiting | Actif | Tester 6+ connexions |
| CSRF Protection | Actif | Token présent dans chaque requête |
| Audit Logs | Complets | Vérifier dans dashboard |
| Email Verification | Actif | Seuls emails autorisés |

---

## 🎉 FÉLICITATIONS !

Votre application ZCOFFEE est maintenant sécurisée selon les standards OWASP Top 10 !

**Prochaines étapes recommandées:**
1. ✅ Tester en environnement de staging
2. ✅ Former l'équipe sur les procédures de sécurité
3. ✅ Mettre en place un calendrier de revue de sécurité (mensuel)
4. ✅ Configurer des alertes automatiques
5. ✅ Planifier des tests de pénétration (trimestriels)

---

## 📞 SUPPORT

**Problème urgent?**
- Documentation: `SECURITY_CHECKLIST.md`
- Infrastructure: `INFRASTRUCTURE_SECURITY.md`
- Code Examples: `admin/dashboard-secure-example.html`

**Besoin d'aide?**
- Firebase Support: https://firebase.google.com/support
- Community: https://stackoverflow.com/questions/tagged/firebase
