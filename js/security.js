/**
 * ========================================
 * ZCOFFEE - SECURITY CLIENT MODULE
 * ========================================
 * 
 * Module client pour gérer l'authentification sécurisée
 * avec CSRF, rate limiting, et audit logging
 */

import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

class SecurityManager {
    constructor(app) {
        this.functions = getFunctions(app);
        this.auth = getAuth(app);
        this.csrfToken = null;
        this.csrfExpiry = null;
        this.isInitialized = false;

        // Initialiser automatiquement
        this.init();
    }

    /**
     * Initialise le gestionnaire de sécurité
     */
    async init() {
        return new Promise((resolve, reject) => {
            onAuthStateChanged(this.auth, async (user) => {
                if (user) {
                    try {
                        await this.generateCSRFToken();
                        this.isInitialized = true;
                        resolve(true);
                    } catch (error) {
                        console.error('Erreur d\'initialisation de sécurité:', error);
                        reject(error);
                    }
                } else {
                    this.csrfToken = null;
                    this.csrfExpiry = null;
                    this.isInitialized = false;
                    resolve(false);
                }
            });
        });
    }

    /**
     * Génère un nouveau token CSRF
     */
    async generateCSRFToken() {
        try {
            const generateCSRF = httpsCallable(this.functions, 'generateCSRF');
            const result = await generateCSRF();

            this.csrfToken = result.data.csrfToken;
            this.csrfExpiry = Date.now() + (result.data.expiresIn * 1000);

            return this.csrfToken;
        } catch (error) {
            console.error('Erreur génération CSRF:', error);
            throw new Error('Impossible de générer le token de sécurité');
        }
    }

    /**
     * Récupère le token CSRF actuel (régénère si expiré)
     */
    async getCSRFToken() {
        if (!this.csrfToken || Date.now() >= this.csrfExpiry) {
            await this.generateCSRFToken();
        }
        return this.csrfToken;
    }

    /**
     * Crée un nouvel item de menu de manière sécurisée
     */
    async createMenuItem(itemData) {
        if (!this.isInitialized) {
            throw new Error('Gestionnaire de sécurité non initialisé');
        }

        const csrfToken = await this.getCSRFToken();

        const secureMenuUpdate = httpsCallable(this.functions, 'secureMenuUpdate');

        try {
            const result = await secureMenuUpdate({
                csrfToken,
                action: 'create',
                itemData
            });

            return result.data;
        } catch (error) {
            this.handleSecurityError(error);
        }
    }

    /**
     * Met à jour un item de menu de manière sécurisée
     */
    async updateMenuItem(itemId, itemData) {
        if (!this.isInitialized) {
            throw new Error('Gestionnaire de sécurité non initialisé');
        }

        const csrfToken = await this.getCSRFToken();

        const secureMenuUpdate = httpsCallable(this.functions, 'secureMenuUpdate');

        try {
            const result = await secureMenuUpdate({
                csrfToken,
                action: 'update',
                itemId,
                itemData
            });

            return result.data;
        } catch (error) {
            this.handleSecurityError(error);
        }
    }

    /**
     * Supprime un item de menu de manière sécurisée
     */
    async deleteMenuItem(itemId) {
        if (!this.isInitialized) {
            throw new Error('Gestionnaire de sécurité non initialisé');
        }

        const csrfToken = await this.getCSRFToken();

        const secureMenuUpdate = httpsCallable(this.functions, 'secureMenuUpdate');

        try {
            const result = await secureMenuUpdate({
                csrfToken,
                action: 'delete',
                itemId
            });

            return result.data;
        } catch (error) {
            this.handleSecurityError(error);
        }
    }

    /**
     * Récupère les logs d'audit
     */
    async getAuditLogs(limit = 50, startAfter = null) {
        if (!this.isInitialized) {
            throw new Error('Gestionnaire de sécurité non initialisé');
        }

        const getAuditLogs = httpsCallable(this.functions, 'getAuditLogs');

        try {
            const result = await getAuditLogs({ limit, startAfter });
            return result.data.logs;
        } catch (error) {
            this.handleSecurityError(error);
        }
    }

    /**
     * Déconnexion sécurisée avec nettoyage
     */
    async secureSignOut() {
        try {
            const onUserSignOut = httpsCallable(this.functions, 'onUserSignOut');
            await onUserSignOut();

            // Nettoyer les données locales
            this.csrfToken = null;
            this.csrfExpiry = null;
            this.isInitialized = false;
            sessionStorage.clear();
            localStorage.removeItem('lastActivity');

            await this.auth.signOut();

            return true;
        } catch (error) {
            console.error('Erreur déconnexion:', error);
            throw error;
        }
    }

    /**
     * Gère les erreurs de sécurité
     */
    handleSecurityError(error) {
        console.error('Erreur de sécurité:', error);

        if (error.code === 'unauthenticated') {
            alert('Session expirée. Veuillez vous reconnecter.');
            window.location.href = 'login.html';
        }
        else if (error.code === 'permission-denied') {
            alert('Accès non autorisé.');
            window.location.href = 'login.html';
        }
        else if (error.code === 'resource-exhausted') {
            alert('Trop de requêtes. Veuillez patienter quelques instants.');
        }
        else if (error.code === 'invalid-argument') {
            alert('Données invalides: ' + error.message);
        }
        else {
            alert('Une erreur est survenue. Veuillez réessayer.');
        }

        throw error;
    }
}

/**
 * Détecte l'inactivité et déconnecte automatiquement
 */
class SessionGuard {
    constructor(securityManager, timeoutMinutes = 30) {
        this.securityManager = securityManager;
        this.timeout = timeoutMinutes * 60 * 1000;
        this.warningTime = 5 * 60 * 1000; // Warning 5 min avant
        this.lastActivity = Date.now();
        this.warningShown = false;

        this.setupListeners();
        this.startMonitoring();
    }

    setupListeners() {
        const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];

        events.forEach(event => {
            document.addEventListener(event, () => {
                this.resetActivity();
            }, true);
        });
    }

    resetActivity() {
        this.lastActivity = Date.now();
        this.warningShown = false;
        localStorage.setItem('lastActivity', this.lastActivity.toString());
    }

    startMonitoring() {
        setInterval(() => {
            const inactive = Date.now() - this.lastActivity;

            // Warning avant déconnexion
            if (inactive >= (this.timeout - this.warningTime) && !this.warningShown) {
                this.warningShown = true;
                const remaining = Math.ceil((this.timeout - inactive) / 60000);

                if (confirm(`Vous serez déconnecté dans ${remaining} minutes d'inactivité. Voulez-vous rester connecté ?`)) {
                    this.resetActivity();
                }
            }

            // Déconnexion automatique
            if (inactive >= this.timeout) {
                alert('Session expirée par inactivité');
                this.securityManager.secureSignOut()
                    .then(() => window.location.href = 'login.html')
                    .catch(() => window.location.href = 'login.html');
            }
        }, 60000); // Vérifier chaque minute
    }
}

/**
 * Protection contre le clickjacking
 */
function preventClickjacking() {
    if (window.top !== window.self) {
        // Page chargée dans une iframe
        console.error('Tentative de clickjacking détectée');
        document.body.innerHTML = '<h1>Erreur de sécurité</h1>';
        window.top.location = window.self.location;
    }
}

/**
 * Validation côté client (ne remplace pas la validation serveur!)
 */
function validateClientInput(data) {
    const errors = [];

    // Détecter les patterns suspects
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /\bor\b.*?=/i,
        /union.*select/i
    ];

    function checkValue(value, path = '') {
        if (typeof value === 'string') {
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(value)) {
                    errors.push(`Contenu suspect détecté dans ${path || 'un champ'}`);
                    break;
                }
            }
        } else if (typeof value === 'object' && value !== null) {
            for (const [key, val] of Object.entries(value)) {
                checkValue(val, path ? `${path}.${key}` : key);
            }
        }
    }

    checkValue(data);

    return {
        isValid: errors.length === 0,
        errors
    };
}

// Initialiser la protection clickjacking immédiatement
preventClickjacking();

export {
    SecurityManager,
    SessionGuard,
    validateClientInput,
    preventClickjacking
};
