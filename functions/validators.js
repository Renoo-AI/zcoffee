/**
 * ========================================
 * VALIDATEURS ET SANITIZERS
 * ========================================
 * 
 * Fonctions pour valider et assainir les entrées utilisateur
 */

// XSS Protection - Encode HTML entities
function escapeHtml(text) {
    if (typeof text !== 'string') return text;

    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };

    return text.replace(/[&<>"'/]/g, (char) => map[char]);
}

// NoSQL Injection Protection
function sanitizeMongoQuery(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        // Bloquer les opérateurs MongoDB/Firestore
        if (key.startsWith('$') || key.startsWith('.')) {
            continue;
        }

        if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeMongoQuery(value);
        } else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}

// Validation d'email
function isValidEmail(email) {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(email) && email.length <= 254;
}

// Validation d'URL
function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
        return false;
    }
}

/**
 * Sanitize les entrées utilisateur
 */
function sanitizeInput(data) {
    if (typeof data !== 'object' || data === null) return data;

    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
        // Sanitize clés
        const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '');

        if (typeof value === 'string') {
            // Encoder HTML et limiter la taille
            sanitized[cleanKey] = escapeHtml(value.trim()).substring(0, 10000);
        }
        else if (typeof value === 'number') {
            // Vérifier que c'est un nombre valide
            sanitized[cleanKey] = isFinite(value) ? value : 0;
        }
        else if (typeof value === 'boolean') {
            sanitized[cleanKey] = value;
        }
        else if (Array.isArray(value)) {
            // Limiter la taille des tableaux
            sanitized[cleanKey] = value.slice(0, 100).map(item =>
                typeof item === 'string' ? escapeHtml(item) : item
            );
        }
        else if (typeof value === 'object' && value !== null) {
            // Récursion pour les objets imbriqués
            sanitized[cleanKey] = sanitizeInput(value);
        }
    }

    return sanitizeMongoQuery(sanitized);
}

/**
 * Valide les données d'un item de menu
 */
function validateMenuItem(item) {
    const errors = [];

    // Validation du nom
    if (!item.name || typeof item.name !== 'string') {
        errors.push('Le nom est requis');
    } else if (item.name.length < 2 || item.name.length > 100) {
        errors.push('Le nom doit contenir entre 2 et 100 caractères');
    }

    // Validation du prix
    if (item.price === undefined || item.price === null) {
        errors.push('Le prix est requis');
    } else if (typeof item.price !== 'number' || !isFinite(item.price)) {
        errors.push('Le prix doit être un nombre valide');
    } else if (item.price < 0 || item.price > 1000) {
        errors.push('Le prix doit être entre 0 et 1000');
    }

    // Validation de la catégorie
    const validCategories = ['café', 'thé', 'pâtisserie', 'snack', 'boisson'];
    if (!item.category || !validCategories.includes(item.category.toLowerCase())) {
        errors.push(`La catégorie doit être: ${validCategories.join(', ')}`);
    }

    // Validation de la description
    if (!item.description || typeof item.description !== 'string') {
        errors.push('La description est requise');
    } else if (item.description.length > 500) {
        errors.push('La description ne peut pas dépasser 500 caractères');
    }

    // Validation de l'image (optionnelle)
    if (item.image && typeof item.image === 'string') {
        if (item.image.length > 2000) {
            errors.push("L'URL de l'image est trop longue");
        }
        // Vérifier que c'est une URL valide ou un data URI
        if (!isValidUrl(item.image) && !item.image.startsWith('data:image/')) {
            errors.push("L'image doit être une URL valide ou un data URI");
        }
    }

    // Validation du statut de disponibilité (optionnel)
    if (item.available !== undefined && typeof item.available !== 'boolean') {
        errors.push('Le statut de disponibilité doit être un booléen');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Valide un token d'authentification
 */
function validateAuthToken(token) {
    if (!token || typeof token !== 'string') {
        return { valid: false, error: 'Token manquant' };
    }

    // Format basique JWT: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { valid: false, error: 'Format de token invalide' };
    }

    return { valid: true };
}

/**
 * Validation de longueur sécurisée
 */
function validateLength(value, min, max, fieldName = 'Champ') {
    if (typeof value !== 'string') {
        return { valid: false, error: `${fieldName} doit être une chaîne` };
    }

    if (value.length < min) {
        return { valid: false, error: `${fieldName} trop court (min: ${min})` };
    }

    if (value.length > max) {
        return { valid: false, error: `${fieldName} trop long (max: ${max})` };
    }

    return { valid: true };
}

/**
 * Détecte les tentatives d'injection SQL
 */
function detectSQLInjection(input) {
    if (typeof input !== 'string') return false;

    const sqlPatterns = [
        /(\bor\b|\band\b).*?=/i,
        /union.*select/i,
        /insert.*into/i,
        /delete.*from/i,
        /drop.*table/i,
        /update.*set/i,
        /--/,
        /;.*(\bor\b|\band\b)/i,
        /'.*or.*'/i,
        /".*or.*"/i
    ];

    return sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * Détecte les tentatives XSS
 */
function detectXSS(input) {
    if (typeof input !== 'string') return false;

    const xssPatterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi, // onclick, onerror, etc.
        /<iframe/gi,
        /<object/gi,
        /<embed/gi,
        /eval\(/gi,
        /expression\(/gi
    ];

    return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Valide et sanitize combiné avec détection d'attaques
 */
function secureValidation(data) {
    const sanitized = sanitizeInput(data);
    const threats = [];

    // Vérifier chaque valeur string pour les attaques
    function checkThreats(obj, path = '') {
        for (const [key, value] of Object.entries(obj)) {
            const currentPath = path ? `${path}.${key}` : key;

            if (typeof value === 'string') {
                if (detectSQLInjection(value)) {
                    threats.push({ type: 'SQL_INJECTION', field: currentPath, value });
                }
                if (detectXSS(value)) {
                    threats.push({ type: 'XSS', field: currentPath, value });
                }
            } else if (typeof value === 'object' && value !== null) {
                checkThreats(value, currentPath);
            }
        }
    }

    checkThreats(sanitized);

    return {
        sanitized,
        threats,
        isSafe: threats.length === 0
    };
}

module.exports = {
    sanitizeInput,
    validateMenuItem,
    validateAuthToken,
    validateLength,
    isValidEmail,
    isValidUrl,
    detectSQLInjection,
    detectXSS,
    secureValidation,
    escapeHtml
};
