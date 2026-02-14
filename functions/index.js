/**
 * ========================================
 * ZCOFFEE - MIDDLEWARE DE SÉCURITÉ
 * Firebase Cloud Functions
 * ========================================
 * 
 * Ce fichier implémente les mécanismes de sécurité critiques :
 * - Rate Limiting (protection anti-brute force)
 * - Audit Logging (traçabilité des actions)
 * - CSRF Token Validation
 * - Input Sanitization
 * - Session Management
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { validateMenuItem, sanitizeInput } = require('./validators');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

// ===== CONSTANTES DE SÉCURITÉ =====

const ALLOWED_EMAILS = [
    'belhajyoussefbelhaj@gmail.com',
    'awatifnefzi@gmail.com',
    'mina.zina.coffee@gmail.com',
    'admin.zina@gmail.com'
];

const RATE_LIMITS = {
    LOGIN_ATTEMPTS: { max: 5, window: 3600000 }, // 5 tentatives/heure
    API_CALLS: { max: 100, window: 60000 },      // 100 calls/minute
    MENU_UPDATES: { max: 20, window: 3600000 }   // 20 updates/heure
};

// ===== UTILITAIRES DE SÉCURITÉ =====

/**
 * Génère un token CSRF sécurisé
 */
function generateCSRFToken(userId) {
    const secret = functions.config().security?.csrf_secret || 'CHANGE_ME_IN_PRODUCTION';
    const timestamp = Date.now();
    const data = `${userId}:${timestamp}`;
    const hash = crypto.createHmac('sha256', secret).update(data).digest('hex');
    return `${timestamp}.${hash}`;
}

/**
 * Valide un token CSRF
 */
function validateCSRFToken(token, userId) {
    if (!token) return false;

    const [timestamp, hash] = token.split('.');
    const age = Date.now() - parseInt(timestamp);

    // Token expire après 1 heure
    if (age > 3600000) return false;

    const secret = functions.config().security?.csrf_secret || 'CHANGE_ME_IN_PRODUCTION';
    const data = `${userId}:${timestamp}`;
    const expectedHash = crypto.createHmac('sha256', secret).update(data).digest('hex');

    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expectedHash));
}

/**
 * Vérifie les limitations de débit (rate limiting)
 */
async function checkRateLimit(identifier, limitType) {
    const limit = RATE_LIMITS[limitType];
    if (!limit) return { allowed: true };

    const now = Date.now();
    const windowStart = now - limit.window;

    const rateLimitRef = db.collection('rate_limits').doc(identifier);
    const doc = await rateLimitRef.get();

    if (!doc.exists) {
        await rateLimitRef.set({
            attempts: [now],
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { allowed: true, remaining: limit.max - 1 };
    }

    const data = doc.data();
    const recentAttempts = data.attempts.filter(t => t > windowStart);

    if (recentAttempts.length >= limit.max) {
        return {
            allowed: false,
            retryAfter: Math.ceil((recentAttempts[0] + limit.window - now) / 1000)
        };
    }

    recentAttempts.push(now);
    await rateLimitRef.update({ attempts: recentAttempts });

    return { allowed: true, remaining: limit.max - recentAttempts.length };
}

/**
 * Logger d'audit pour traçabilité
 */
async function logAudit(action, userId, email, details = {}, ipAddress = null) {
    await db.collection('audit_logs').add({
        action,
        userId,
        email,
        ipAddress,
        details,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userAgent: details.userAgent || null
    });
}

/**
 * Vérifie si l'utilisateur est un admin autorisé
 */
function isAuthorizedAdmin(email) {
    return ALLOWED_EMAILS.includes(email);
}

// ===== CLOUD FUNCTIONS =====

/**
 * Génère un token CSRF après connexion
 */
exports.generateCSRF = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentification requise');
    }

    const { uid, token } = context.auth;
    const email = token.email;

    if (!isAuthorizedAdmin(email)) {
        await logAudit('CSRF_GENERATION_DENIED', uid, email, {}, context.rawRequest.ip);
        throw new functions.https.HttpsError('permission-denied', 'Accès non autorisé');
    }

    const csrfToken = generateCSRFToken(uid);

    await logAudit('CSRF_GENERATED', uid, email, {}, context.rawRequest.ip);

    return { csrfToken, expiresIn: 3600 };
});

/**
 * Sécurise les tentatives de connexion
 */
exports.beforeSignIn = functions.auth.user().beforeSignIn(async (user, context) => {
    const email = user.email;
    const ipAddress = context.ipAddress;

    // Rate limiting par IP
    const rateLimitCheck = await checkRateLimit(ipAddress, 'LOGIN_ATTEMPTS');

    if (!rateLimitCheck.allowed) {
        await logAudit('LOGIN_RATE_LIMITED', null, email, { ipAddress }, ipAddress);
        throw new functions.auth.HttpsError('resource-exhausted',
            `Trop de tentatives. Réessayez dans ${rateLimitCheck.retryAfter} secondes.`
        );
    }

    // Vérification email autorisé
    if (!isAuthorizedAdmin(email)) {
        await logAudit('LOGIN_UNAUTHORIZED', user.uid, email, { ipAddress }, ipAddress);
        throw new functions.auth.HttpsError('permission-denied', 'Accès refusé');
    }

    await logAudit('LOGIN_SUCCESS', user.uid, email, {
        provider: user.providerData[0]?.providerId
    }, ipAddress);
});

/**
 * Logger les déconnexions
 */
exports.onUserSignOut = functions.https.onCall(async (data, context) => {
    if (!context.auth) return;

    const { uid, token } = context.auth;
    await logAudit('LOGOUT', uid, token.email, {}, context.rawRequest.ip);

    // Invalider les sessions actives
    const sessions = await db.collection('active_sessions')
        .where('userId', '==', uid)
        .get();

    const batch = db.batch();
    sessions.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    return { success: true };
});

/**
 * Validation sécurisée pour la création/mise à jour d'items de menu
 */
exports.secureMenuUpdate = functions.https.onCall(async (data, context) => {
    const { masterKey, action, itemId, itemData } = data;
    const ipAddress = context.rawRequest.ip;

    // Authentification par Clé Maître (Priorité car c'est le nouveau mode)
    if (masterKey !== '16122010') {
        // Fallback pour compatibilité Firebase Auth (optionnel mais on privilégie la master key)
        if (!context.auth || !isAuthorizedAdmin(context.auth.token.email)) {
            await logAudit('MENU_UPDATE_DENIED', 'ANONYMOUS', 'none', { action }, ipAddress);
            throw new functions.https.HttpsError('permission-denied', 'Clé maître ou authentification requise');
        }
    }

    const uid = context.auth ? context.auth.uid : 'MASTER_KEY_USER';
    const email = context.auth ? context.auth.token.email : 'none';

    // Rate Limiting
    const rateLimitCheck = await checkRateLimit(ipAddress, 'MENU_UPDATES');
    if (!rateLimitCheck.allowed) {
        await logAudit('MENU_UPDATE_RATE_LIMITED', uid, email, {}, ipAddress);
        throw new functions.https.HttpsError('resource-exhausted',
            `Limite atteinte. Réessayez dans ${rateLimitCheck.retryAfter} secondes.`
        );
    }

    // Sanitization des entrées
    const sanitizedData = sanitizeInput(itemData);

    // Validation du schéma
    const validation = validateMenuItem(sanitizedData);
    if (!validation.valid) {
        await logAudit('MENU_VALIDATION_FAILED', uid, email, { errors: validation.errors }, ipAddress);
        throw new functions.https.HttpsError('invalid-argument',
            `Données invalides: ${validation.errors.join(', ')}`
        );
    }

    // Exécution de l'action
    try {
        let result;
        const menuRef = db.collection('menu');

        if (action === 'create') {
            result = await menuRef.add({
                ...sanitizedData,
                createdBy: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await logAudit('MENU_ITEM_CREATED', uid, email, { itemId: result.id, data: sanitizedData }, ipAddress);
        }
        else if (action === 'update') {
            await menuRef.doc(itemId).update({
                ...sanitizedData,
                updatedBy: uid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await logAudit('MENU_ITEM_UPDATED', uid, email, { itemId, data: sanitizedData }, ipAddress);
            result = { id: itemId };
        }
        else if (action === 'delete') {
            await menuRef.doc(itemId).delete();
            await logAudit('MENU_ITEM_DELETED', uid, email, { itemId }, ipAddress);
            result = { id: itemId };
        }
        else {
            throw new functions.https.HttpsError('invalid-argument', 'Action invalide');
        }

        return { success: true, ...result };

    } catch (error) {
        await logAudit('MENU_UPDATE_ERROR', uid, email, { error: error.message }, ipAddress);
        throw new functions.https.HttpsError('internal', 'Erreur lors de la mise à jour');
    }
});

/**
 * Récupère les logs d'audit (admins uniquement)
 */
exports.getAuditLogs = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentification requise');
    }

    const { token } = context.auth;
    if (!isAuthorizedAdmin(token.email)) {
        throw new functions.https.HttpsError('permission-denied', 'Accès non autorisé');
    }

    const { limit = 50, startAfter } = data;

    let query = db.collection('audit_logs')
        .orderBy('timestamp', 'desc')
        .limit(limit);

    if (startAfter) {
        query = query.startAfter(startAfter);
    }

    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
    }));

    return { logs };
});

/**
 * Nettoyage automatique des données expirées
 */
exports.cleanupExpiredData = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const oneDayAgo = new admin.firestore.Timestamp(now.seconds - 86400, now.nanoseconds);
    const thirtyDaysAgo = new admin.firestore.Timestamp(now.seconds - 2592000, now.nanoseconds);

    // Nettoyer les rate limits anciens
    const oldRateLimits = await db.collection('rate_limits')
        .where('createdAt', '<', oneDayAgo)
        .get();

    const batch1 = db.batch();
    oldRateLimits.forEach(doc => batch1.delete(doc.ref));
    await batch1.commit();

    // Archiver les logs de plus de 30 jours
    const oldLogs = await db.collection('audit_logs')
        .where('timestamp', '<', thirtyDaysAgo)
        .get();

    const batch2 = db.batch();
    oldLogs.forEach(doc => {
        batch2.set(db.collection('audit_logs_archive').doc(doc.id), doc.data());
        batch2.delete(doc.ref);
    });
    await batch2.commit();

    console.log(`Nettoyage: ${oldRateLimits.size} rate limits, ${oldLogs.size} logs archivés`);
});

/**
 * Restaure le menu par défaut (Clé maître requise)
 */
exports.restoreMenu = functions.https.onCall(async (data, context) => {
    const { masterKey } = data;
    const ipAddress = context.rawRequest.ip;

    // Validation Clé Maître
    if (masterKey !== '16122010') {
        await logAudit('RESTORE_DENIED', 'ANONYMOUS', 'none', { reason: 'Invalid Master Key' }, ipAddress);
        throw new functions.https.HttpsError('permission-denied', 'Clé maître invalide');
    }

    try {
        const defaults = [
            { category: "Cafés", categoryAr: "القهوة", nameFr: "Express / Demi / Allongé", nameAr: "إكسبريسو / دمي / ألونجي", price: "2.5" },
            { category: "Cafés", categoryAr: "القهوة", nameFr: "Cappuccino / Americano", nameAr: "كابوتشينو / أمريكانو", price: "2.8" },
            { category: "Cafés", categoryAr: "القهوة", nameFr: "Direct", nameAr: "قهوة ديريكت", price: "3.2" },
            { category: "Cafés", categoryAr: "القهوة", nameFr: "Spécial", nameAr: "قهوة خاصة (سبسيال)", price: "3.5" },
            { category: "Boissons Fraîches", categoryAr: "مشروبات باردة", nameFr: "Jus Frais", nameAr: "عصير طازج", price: "4" },
            { category: "Boissons Fraîches", categoryAr: "مشروبات باردة", nameFr: "Citronnade", nameAr: "ليموناضة", price: "3" },
            { category: "Boissons Fraîches", categoryAr: "مشروبات باردة", nameFr: "Citronnade Amande", nameAr: "ليموناضة باللوز", price: "5" },
            { category: "Boissons Fraîches", categoryAr: "مشروبات باردة", nameFr: "Mojito", nameAr: "موهيتو", price: "6" },
            { category: "Viennoiseries", categoryAr: "مخبوزات", nameFr: "Snoopy / Croissant", nameAr: "سنوبي / كرواسون", price: "2.5" },
            { category: "Viennoiseries", categoryAr: "مخبوزات", nameFr: "Pâté", nameAr: "باتي", price: "2" },
            { category: "Thé", categoryAr: "الشاي", nameFr: "Thé", nameAr: "شاي", price: "2" },
            { category: "Thé", categoryAr: "الشاي", nameFr: "Thé Amande", nameAr: "شاي باللوز", price: "4" },
            { category: "Chicha & Girac", categoryAr: "شيشة وجيراك", nameFr: "Chicha Menthe", nameAr: "شيشة نعناع", price: "4" },
            { category: "Chicha & Girac", categoryAr: "شيشة وجيراك", nameFr: "Chicha Cocktail", nameAr: "شيشة كوكتيل", price: "4.5" },
            { category: "Chicha & Girac", categoryAr: "شيشة وجيراك", nameFr: "Chicha Vide", nameAr: "شيشة فارغة", price: "3" },
            { category: "Chicha & Girac", categoryAr: "شيشة وجيراك", nameFr: "Girac (M)", nameAr: "جيراك (M)", price: "3.5" },
            { category: "Chicha & Girac", categoryAr: "شيشة وجيراك", nameFr: "Girac (XL)", nameAr: "جيراك (XL)", price: "4.5" },
            { category: "Chicha & Girac", categoryAr: "شيشة وجيراك", nameFr: "Girac (XXL)", nameAr: "جيراك (XXL)", price: "5.5" },
            { category: "Eaux & Soft", categoryAr: "مياه ومشروبات غازية", nameFr: "Eau 1.5 L", nameAr: "ماء 1.5 ل", price: "2" },
            { category: "Eaux & Soft", categoryAr: "مياه ومشروبات غازية", nameFr: "Eau 0.5 L", nameAr: "ماء 0.5 ل", price: "1" },
            { category: "Eaux & Soft", categoryAr: "مياه ومشروبات غازية", nameFr: "Canette", nameAr: "كانات", price: "2.5" }
        ];

        const batch = db.batch();
        const menuRef = db.collection('menu');

        for (const item of defaults) {
            const newDocRef = menuRef.doc();
            batch.set(newDocRef, {
                ...item,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        await batch.commit();
        await logAudit('RESTORE_SUCCESS', 'MASTER_KEY_USER', 'none', { count: defaults.length }, ipAddress);

        return { success: true, count: defaults.length };

    } catch (error) {
        console.error('Erreur restauration:', error);
        throw new functions.https.HttpsError('internal', 'Erreur lors de la restauration du menu');
    }
});

