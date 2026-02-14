# 🛡️ GUIDE DE CONFIGURATION INFRASTRUCTURE DE SÉCURITÉ

## 📋 TABLE DES MATIÈRES

1. [Configuration Firebase](#1-configuration-firebase)
2. [Google Cloud Armor (WAF)](#2-google-cloud-armor-waf)
3. [Variables d'Environnement](#3-variables-denvironnement)
4. [Firebase App Check](#4-firebase-app-check)
5. [Monitoring et Alertes](#5-monitoring-et-alertes)
6. [Certificats SSL/TLS](#6-certificats-ssltls)

---

## 1. CONFIGURATION FIREBASE

### 1.1 Firebase Console - Paramètres de Sécurité

#### Étapes à suivre :

1. **Accéder à Firebase Console** : https://console.firebase.google.com
2. **Sélectionner le projet** : `zina-coffee`

#### A. Domaines Autorisés (OAuth)

```
Project Settings → Authentication → Settings → Authorized domains
```

**Ajouter uniquement :**
- `zina-coffee.web.app` (ou votre domaine personnalisé)
- `localhost` (développement uniquement)

**⚠️ SUPPRIMER tous les autres domaines**

#### B. Restriction de Clés API

```bash
# Aller dans Google Cloud Console
# https://console.cloud.google.com/apis/credentials

# Pour la clé API "Browser key (auto created by Firebase)"
# Cliquer sur Edit → Application restrictions

# Sélectionner: HTTP referrers (web sites)
# Ajouter:
https://zina-coffee.web.app/*
https://votre-domaine-personnalise.com/*
http://localhost:5000/* # Développement uniquement
```

#### C. Firebase Authentication

```
Authentication → Sign-in method → Google
```

**Configurer :**
- ✅ Activer Google Sign-In
- ✅ Support email : `support@votredomaine.com`
- ✅ Domaines autorisés : voir section A

**Activer MFA (Multi-Factor Auth) :**
```bash
# Dans Firebase Console
Authentication → Settings → Multi-factor authentication

# Activer pour tous les providers
- ✅ TOTP (Time-based One-Time Password)
- ✅ SMS (optionnel, coût supplémentaire)
```

---

## 2. GOOGLE CLOUD ARMOR (WAF)

### 2.1 Prérequis

- Projet Firebase doit être sur **Blaze Plan** (pay-as-you-go)
- Accès à Google Cloud Console

### 2.2 Configuration du Web Application Firewall

#### Étape 1 : Créer une Politique de Sécurité

```bash
# Via gcloud CLI (recommandé)
gcloud compute security-policies create zcoffee-waf-policy \
    --description "Politique de sécurité pour ZCOFFEE Admin"

# Ou via Console :
# https://console.cloud.google.com/net-security/securitypolicies
```

#### Étape 2 : Configurer les Règles de Base

```bash
# Bloquer les pays à risque (exemple)
gcloud compute security-policies rules create 1000 \
    --security-policy zcoffee-waf-policy \
    --expression "origin.region_code in ['CN', 'RU', 'KP']" \
    --action "deny-403" \
    --description "Bloquer les régions à haut risque"

# Rate limiting global
gcloud compute security-policies rules create 2000 \
    --security-policy zcoffee-waf-policy \
    --expression "true" \
    --action "rate-based-ban" \
    --rate-limit-threshold-count 100 \
    --rate-limit-threshold-interval-sec 60 \
    --ban-duration-sec 600 \
    --description "100 requêtes/minute max"

# Protection SQL Injection
gcloud compute security-policies rules create 3000 \
    --security-policy zcoffee-waf-policy \
    --expression "evaluatePreconfiguredExpr('sqli-stable')" \
    --action "deny-403" \
    --description "Bloquer les tentatives d'injection SQL"

# Protection XSS
gcloud compute security-policies rules create 4000 \
    --security-policy zcoffee-waf-policy \
    --expression "evaluatePreconfiguredExpr('xss-stable')" \
    --action "deny-403" \
    --description "Bloquer les tentatives XSS"

# Protection LFI (Local File Inclusion)
gcloud compute security-policies rules create 5000 \
    --security-policy zcoffee-waf-policy \
    --expression "evaluatePreconfiguredExpr('lfi-stable')" \
    --action "deny-403" \
    --description "Bloquer LFI"

# Protection RCE (Remote Code Execution)
gcloud compute security-policies rules create 6000 \
    --security-policy zcoffee-waf-policy \
    --expression "evaluatePreconfiguredExpr('rce-stable')" \
    --action "deny-403" \
    --description "Bloquer RCE"
```

#### Étape 3 : IP Whitelisting pour Admin (Optionnel)

```bash
# Si vos admins ont des IPs fixes
gcloud compute security-policies rules create 100 \
    --security-policy zcoffee-waf-policy \
    --expression "request.path.matches('/admin/.*') && !inIpRange(origin.ip, '203.0.113.0/24')" \
    --action "deny-403" \
    --description "Admin: Autoriser uniquement les IPs de confiance"

# Remplacer 203.0.113.0/24 par vos IPs réelles
# Pour plusieurs IPs:
# "!inIpRange(origin.ip, '203.0.113.0/24') && !inIpRange(origin.ip, '198.51.100.0/24')"
```

#### Étape 4 : Appliquer au Backend Firebase Hosting

```bash
# Cette étape nécessite Firebase sur Cloud Run ou App Engine
# Firebase Hosting seul ne supporte pas Cloud Armor directement

# Alternative : Utiliser un Load Balancer devant Firebase Hosting
# Configuration avancée - voir documentation:
# https://cloud.google.com/armor/docs/configure-security-policies
```

### 2.3 Configuration Alternative : Cloud Functions avec Cloud Armor

Si vous utilisez Cloud Functions pour le backend :

```bash
# Créer un Load Balancer HTTPS
gcloud compute backend-services create zcoffee-backend \
    --global \
    --protocol=HTTPS

# Attacher la politique de sécurité
gcloud compute backend-services update zcoffee-backend \
    --global \
    --security-policy=zcoffee-waf-policy
```

---

## 3. VARIABLES D'ENVIRONNEMENT

### 3.1 Configuration des Secrets Firebase Functions

```bash
# Se connecter à Firebase CLI
firebase login

# Définir les secrets
firebase functions:config:set \
  security.csrf_secret="GENERER_UNE_CLE_ALEATOIRE_SECURISEE_64_CHARS" \
  security.admin_secret="AUTRE_CLE_ALEATOIRE_SECURISEE" \
  security.encryption_key="CLE_AES_256_32_BYTES"

# Vérifier
firebase functions:config:get

# Déployer
firebase deploy --only functions
```

### 3.2 Générer des Clés Sécurisées

```bash
# Sur Linux/Mac
openssl rand -hex 32

# Sur Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Via Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3.3 Variables d'Environnement pour .env (Développement Local)

Créer `.env` à la racine (⚠️ **NE JAMAIS COMMIT CE FICHIER**) :

```bash
# .env
FIREBASE_API_KEY=votre_clé_api
FIREBASE_AUTH_DOMAIN=zina-coffee.firebaseapp.com
FIREBASE_PROJECT_ID=zina-coffee
FIREBASE_STORAGE_BUCKET=zina-coffee.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=831057835426
FIREBASE_APP_ID=1:831057835426:web:a1da12b127a9ddb2d5aefb

CSRF_SECRET=votre_secret_csrf
ADMIN_SECRET=votre_secret_admin
ENCRYPTION_KEY=votre_clé_encryption
```

Ajouter à `.gitignore` :

```gitignore
# Secrets
.env
.env.local
.env.production
firebase-config.json
full_config.json
latest_config*.json

# Firebase
.firebase/
functions/node_modules/
```

---

## 4. FIREBASE APP CHECK

### 4.1 Activer App Check (Protection Anti-Bot)

```bash
# Firebase Console
# https://console.firebase.google.com/project/zina-coffee/appcheck

# 1. Activer App Check
# 2. Choisir reCAPTCHA v3 pour web
# 3. Récupérer les clés de site
```

### 4.2 Intégration dans l'Application

```javascript
// À ajouter dans firebase-config.js

import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const app = initializeApp(firebaseConfig);

// Activer App Check
if (typeof window !== 'undefined') {
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider('VOTRE_CLE_SITE_RECAPTCHA'),
    isTokenAutoRefreshEnabled: true
  });
}
```

### 4.3 Appliquer App Check aux Services

```bash
# Dans Firebase Console → App Check → Apps
# Activer l'application pour:
- ✅ Authentication
- ✅ Firestore
- ✅ Cloud Functions
- ✅ Storage (si utilisé)

# Mode: Enforced (bloquer les requêtes sans App Check)
```

---

## 5. MONITORING ET ALERTES

### 5.1 Google Cloud Monitoring

```bash
# Créer une alerte pour tentatives de connexion suspectes
gcloud alpha monitoring policies create \
    --notification-channels=CHANNEL_ID \
    --display-name="ZCOFFEE - Tentatives de connexion échouées" \
    --condition-display-name="Plus de 10 échecs/heure" \
    --condition-threshold-value=10 \
    --condition-threshold-duration=3600s
```

### 5.2 Alertes Email Firebase

Exemple de Cloud Function pour alertes :

```javascript
// Dans functions/index.js

exports.securityAlert = functions.firestore
  .document('audit_logs/{logId}')
  .onCreate(async (snap, context) => {
    const log = snap.data();
    
    // Envoyer email pour actions critiques
    if (['LOGIN_UNAUTHORIZED', 'MENU_UPDATE_DENIED'].includes(log.action)) {
      await sendEmailAlert({
        to: 'admin@votredomaine.com',
        subject: `🚨 Alerte Sécurité ZCOFFEE`,
        body: `Action suspecte détectée:\n\n${JSON.stringify(log, null, 2)}`
      });
    }
  });
```

### 5.3 Dashboard de Sécurité

Accéder aux logs :

```bash
# Via gcloud CLI
gcloud logging read "resource.type=cloud_function" --limit 50

# Via Console
# https://console.cloud.google.com/logs
```

---

## 6. CERTIFICATS SSL/TLS

### 6.1 Firebase Hosting (Certificat Automatique)

Firebase Hosting fournit automatiquement un certificat SSL/TLS Let's Encrypt.

**Vérifier :**
- ✅ HTTPS automatiquement activé sur `.web.app`
- ✅ Redirection HTTP → HTTPS active

### 6.2 Domaine Personnalisé

```bash
# Via Firebase Console
# Hosting → Add custom domain

# Suivre les instructions pour:
1. Ajouter votre domaine (ex: zcoffee.com)
2. Vérifier la propriété
3. Configurer les DNS (A ou CNAME records)
4. Firebase provisionne automatiquement le certificat SSL
```

### 6.3 Forcer HTTPS Strict

Déjà configuré dans `firebase.json` :

```json
{
  "headers": [{
    "key": "Strict-Transport-Security",
    "value": "max-age=31536000; includeSubDomains; preload"
  }]
}
```

---

## 📊 RÉSUMÉ DES COÛTS

| Service | Coût Estimé |
|---------|-------------|
| Firebase Hosting | Gratuit (jusqu'à 10GB/mois) |
| Firestore | Gratuit (petite échelle) |
| Cloud Functions | ~5-10€/mois |
| **Cloud Armor** | **~7€/mois + 0,75€/1M requêtes** |
| Cloud Monitoring | Gratuit (logs basiques) |
| **TOTAL** | **~12-20€/mois** |

---

## ✅ CHECKLIST DE DÉPLOIEMENT

- [ ] Domaines autorisés configurés
- [ ] Clés API restreintes
- [ ] MFA activé pour tous les admins
- [ ] App Check configuré et appliqué
- [ ] Cloud Functions déployées avec secrets
- [ ] Règles Firestore déployées
- [ ] Headers de sécurité vérifiés
- [ ] Cloud Armor configuré (si budget disponible)
- [ ] Monitoring actif
- [ ] Tests de pénétration effectués
- [ ] Documentation à jour
- [ ] Équipe formée sur les procédures de sécurité

---

## 🆘 CONTACT SUPPORT

**Google Cloud Support :** https://cloud.google.com/support  
**Firebase Support :** https://firebase.google.com/support  
**Documentation Sécurité :** https://cloud.google.com/security/best-practices
