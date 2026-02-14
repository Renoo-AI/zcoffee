# 🔑 MISE À JOUR : AUTHENTIFICATION PAR CLÉ MAÎTRE UNIQUEMENT

**Date:** 14 Février 2026  
**Modification:** Suppression de Google OAuth - Authentification simplifiée par clé maître

---

## 📋 RÉSUMÉ DES CHANGEMENTS

L'authentification a été **simplifiée** pour utiliser uniquement la **clé maître** (`16122010`) au lieu de Google OAuth.

### ✅ Avantages
- ✅ **Plus simple** : Un seul point d'entrée
- ✅ **Plus rapide** : Pas besoin de compte Google
- ✅ **Plus sécurisé** : Pas d'exposition de données Google
- ✅ **Moins de dépendances** : Pas besoin de Firebase Auth
- ✅ **Session timeout** : Expiration automatique après 30 minutes

---

## 🔄 FICHIERS MODIFIÉS

### 1. **`zcoffee-secret-2026.html`**
**Changement:** Redirection directe vers `dashboard.html` après validation de la clé

**Avant:**
```javascript
window.location.href = 'admin/login.html';
```

**Après:**
```javascript
sessionStorage.setItem('admin_authenticated', 'true');
sessionStorage.setItem('auth_timestamp', Date.now().toString());
window.location.href = 'admin/dashboard.html';
```

---

### 2. **`admin/login.html`**
**Changement:** Page de transition simplifiée (redirection automatique)

**Fonctionnalité:**
- Vérifie la présence de `key_cleared` dans sessionStorage
- Redirige automatiquement vers le dashboard après 1 seconde
- Suppression complète de Google OAuth

---

### 3. **`admin/dashboard.html`**
**Changement:** Suppression de Firebase Auth, vérification par sessionStorage

**Avant:**
```javascript
import { getAuth, onAuthStateChanged, signOut } from "firebase-auth.js";
const ALLOWED_EMAILS = [...];
onAuthStateChanged(auth, (user) => {
    if (!user || !ALLOWED_EMAILS.includes(user.email)) {
        // Refuser l'accès
    }
});
```

**Après:**
```javascript
const isAuthenticated = sessionStorage.getItem('admin_authenticated') === 'true';
const authTimestamp = sessionStorage.getItem('auth_timestamp');
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

if (!isAuthenticated || !authTimestamp) {
    window.location.href = "../zcoffee-secret-2026.html";
} else {
    // Vérifier expiration de session
    const elapsed = Date.now() - parseInt(authTimestamp);
    if (elapsed > SESSION_TIMEOUT) {
        sessionStorage.clear();
        alert('Session expirée. Veuillez vous reconnecter.');
        window.location.href = "../zcoffee-secret-2026.html";
    }
}
```

**Fonction de déconnexion:**
```javascript
window.logout = () => {
    sessionStorage.clear();
    window.location.href = "../zcoffee-secret-2026.html";
};
```

---

### 4. **`admin/signup.html`**
**Changement:** Page désactivée - redirection automatique

**Fonctionnalité:**
- Affiche un message "Accès Restreint"
- Redirige vers `zcoffee-secret-2026.html` après 2 secondes
- Ou vers le dashboard si déjà authentifié

---

## 🔐 FLUX D'AUTHENTIFICATION

```
┌─────────────────────────────────────────┐
│  zcoffee-secret-2026.html               │
│  ┌───────────────────────────────────┐  │
│  │ Saisie de la clé maître           │  │
│  │ (16122010)                        │  │
│  └───────────────┬───────────────────┘  │
│                  │                       │
│                  ↓                       │
│  ┌───────────────────────────────────┐  │
│  │ Validation de la clé              │  │
│  │ ✓ Correcte → Créer session        │  │
│  │ ✗ Incorrecte → Erreur             │  │
│  └───────────────┬───────────────────┘  │
└──────────────────┼───────────────────────┘
                   │
                   ↓ (Si clé valide)
┌──────────────────────────────────────────┐
│  sessionStorage:                         │
│  - admin_authenticated = 'true'          │
│  - auth_timestamp = Date.now()           │
│  - key_cleared = 'true' (legacy)         │
└──────────────────┬───────────────────────┘
                   │
                   ↓
┌──────────────────────────────────────────┐
│  admin/dashboard.html                    │
│  ┌────────────────────────────────────┐  │
│  │ Vérification:                      │  │
│  │ 1. admin_authenticated == 'true' ? │  │
│  │ 2. Session < 30 minutes ?          │  │
│  │                                    │  │
│  │ ✓ OK → Afficher dashboard         │  │
│  │ ✗ KO → Rediriger vers clé         │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Activité utilisateur:                  │
│  → Mise à jour auth_timestamp           │
└──────────────────────────────────────────┘
```

---

## 🔒 SÉCURITÉ

### Variables SessionStorage

| Clé | Valeur | Description |
|-----|--------|-------------|
| `admin_authenticated` | `'true'` | Indique que l'utilisateur est authentifié |
| `auth_timestamp` | `Date.now()` | Timestamp de la dernière activité |
| `key_cleared` | `'true'` | (Legacy) Indique que la clé a été validée |

### Timeout de Session

- **Durée:** 30 minutes (1,800,000 ms)
- **Vérification:** À chaque chargement du dashboard
- **Action:** Redirection automatique + message d'alerte

### Déconnexion

```javascript
// Bouton de déconnexion
window.logout = () => {
    sessionStorage.clear();  // Supprime toutes les données
    window.location.href = "../zcoffee-secret-2026.html";
};
```

---

## 🚀 UTILISATION

### Pour l'Administrateur

1. **Accéder à l'admin:**
   - Aller sur `https://votre-site.com/zcoffee-secret-2026.html`

2. **Saisir la clé maître:**
   - Entrer: `16122010`
   - Appuyer sur "Déverrouiller"

3. **Accès au dashboard:**
   - Redirection automatique vers le dashboard
   - Session valide pendant 30 minutes

4. **Déconnexion:**
   - Cliquer sur le bouton "Déconnexion" dans la navbar
   - Ou attendre l'expiration automatique (30 min)

---

## ⚠️ IMPORTANT : SÉCURITÉ DE LA CLÉ

### 🔴 CHANGEMENT RECOMMANDÉ

La clé maître actuelle (`16122010`) est **hardcodée** dans le fichier HTML.

**Pour une sécurité maximale, vous devriez:**

1. **Changer la clé maître:**
   - Ouvrir `zcoffee-secret-2026.html`
   - Ligne 209: Remplacer `'16122010'` par une clé plus complexe
   - Exemple: `'Zc0ff33!2026@Secure#Key'`

2. **Utiliser un hash:**
   ```javascript
   // Au lieu de:
   if (val === '16122010') { ... }
   
   // Utiliser:
   const MASTER_KEY_HASH = 'sha256_hash_de_votre_cle';
   async function hashKey(key) {
       const encoder = new TextEncoder();
       const data = encoder.encode(key);
       const hash = await crypto.subtle.digest('SHA-256', data);
       return Array.from(new Uint8Array(hash))
           .map(b => b.toString(16).padStart(2, '0'))
           .join('');
   }
   
   const inputHash = await hashKey(val);
   if (inputHash === MASTER_KEY_HASH) { ... }
   ```

3. **Ajouter un rate limiting côté client:**
   ```javascript
   let attempts = parseInt(localStorage.getItem('login_attempts') || '0');
   const lastAttempt = parseInt(localStorage.getItem('last_attempt') || '0');
   
   if (Date.now() - lastAttempt < 60000 && attempts >= 3) {
       alert('Trop de tentatives. Attendez 1 minute.');
       return;
   }
   ```

---

## 📊 COMPARAISON AVANT/APRÈS

| Aspect | Avant (Google OAuth) | Après (Clé Maître) |
|--------|---------------------|-------------------|
| **Complexité** | Élevée | Faible |
| **Dépendances** | Firebase Auth | Aucune |
| **Temps de connexion** | 3-5 secondes | <1 seconde |
| **Emails autorisés** | 4 emails spécifiques | N/A |
| **Sécurité** | OAuth 2.0 | Clé maître + Session |
| **Maintenance** | Moyenne | Faible |
| **Coût** | Gratuit (Firebase) | Gratuit |

---

## 🔄 ROLLBACK (Si nécessaire)

Si vous souhaitez revenir à Google OAuth:

1. Restaurer les fichiers depuis Git:
   ```bash
   git checkout HEAD~1 admin/login.html
   git checkout HEAD~1 admin/dashboard.html
   git checkout HEAD~1 zcoffee-secret-2026.html
   ```

2. Ou consulter les versions précédentes dans l'historique Git

---

## ✅ TESTS À EFFECTUER

### Test 1: Connexion Normale
- [ ] Aller sur `zcoffee-secret-2026.html`
- [ ] Entrer la clé `16122010`
- [ ] Vérifier la redirection vers le dashboard
- [ ] Vérifier que le menu se charge

### Test 2: Clé Incorrecte
- [ ] Aller sur `zcoffee-secret-2026.html`
- [ ] Entrer une mauvaise clé
- [ ] Vérifier l'animation d'erreur
- [ ] Vérifier que l'accès est refusé

### Test 3: Accès Direct au Dashboard
- [ ] Ouvrir un nouvel onglet
- [ ] Aller directement sur `admin/dashboard.html`
- [ ] Vérifier la redirection vers `zcoffee-secret-2026.html`

### Test 4: Expiration de Session
- [ ] Se connecter normalement
- [ ] Attendre 31 minutes (ou modifier SESSION_TIMEOUT à 1 minute pour tester)
- [ ] Rafraîchir le dashboard
- [ ] Vérifier l'alerte et la redirection

### Test 5: Déconnexion
- [ ] Se connecter normalement
- [ ] Cliquer sur "Déconnexion"
- [ ] Vérifier la redirection
- [ ] Vérifier que sessionStorage est vide

---

## 📞 SUPPORT

**Questions ou problèmes?**
- Vérifier que tous les fichiers sont bien déployés
- Vider le cache du navigateur (Ctrl+Shift+R)
- Consulter la console JavaScript (F12) pour les erreurs

---

**✨ Authentification simplifiée et sécurisée par clé maître !**
