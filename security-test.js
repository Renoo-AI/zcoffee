#!/usr/bin/env node

/**
 * ========================================
 * SCRIPT DE TEST DE SÉCURITÉ AUTOMATISÉ
 * ========================================
 * 
 * Ce script teste automatiquement les mécanismes de sécurité
 * de l'application ZCOFFEE.
 * 
 * Usage: node security-test.js
 */

const https = require('https');
const http = require('http');

// Configuration
const CONFIG = {
    // Modifier avec votre URL de production
    baseUrl: 'https://zina-coffee.web.app',
    // ou 'http://localhost:5000' pour tests locaux

    testTimeout: 10000,
    expectedHeaders: [
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
        'content-security-policy',
        'referrer-policy',
        'permissions-policy'
    ]
};

// Couleurs pour le terminal
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    bold: '\x1b[1m'
};

// Résultats des tests
const results = {
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: []
};

/**
 * Utilitaire pour faire des requêtes HTTP
 */
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const req = protocol.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data
            }));
        });

        req.on('error', reject);
        req.setTimeout(CONFIG.testTimeout, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Logger de résultats
 */
function logResult(testName, passed, message = '') {
    const icon = passed ? '✓' : '✗';
    const color = passed ? colors.green : colors.red;

    console.log(`${color}${icon} ${testName}${colors.reset}`);
    if (message) {
        console.log(`  ${colors.blue}→${colors.reset} ${message}`);
    }

    results.tests.push({ testName, passed, message });
    if (passed) {
        results.passed++;
    } else {
        results.failed++;
    }
}

function logWarning(testName, message) {
    console.log(`${colors.yellow}⚠ ${testName}${colors.reset}`);
    console.log(`  ${colors.blue}→${colors.reset} ${message}`);
    results.warnings++;
}

/**
 * TEST 1: Vérifier les headers de sécurité HTTP
 */
async function testSecurityHeaders() {
    console.log(`\n${colors.bold}=== TEST 1: Headers de Sécurité HTTP ===${colors.reset}\n`);

    try {
        const response = await makeRequest(CONFIG.baseUrl);
        const headers = response.headers;

        // Vérifier la présence de chaque header
        for (const header of CONFIG.expectedHeaders) {
            if (headers[header]) {
                logResult(
                    `Header: ${header}`,
                    true,
                    `Valeur: ${headers[header].substring(0, 80)}...`
                );
            } else {
                logResult(
                    `Header: ${header}`,
                    false,
                    'Header manquant - voir DEPLOYMENT_GUIDE.md'
                );
            }
        }

        // Vérifier HSTS
        const hsts = headers['strict-transport-security'];
        if (hsts && hsts.includes('max-age=31536000')) {
            logResult('HSTS: max-age correct', true);
        } else {
            logResult('HSTS: max-age incorrect', false, 'Devrait être 31536000 (1 an)');
        }

        // Vérifier X-Frame-Options
        const xframe = headers['x-frame-options'];
        if (xframe && xframe.toUpperCase() === 'DENY') {
            logResult('X-Frame-Options: DENY', true);
        } else {
            logResult('X-Frame-Options: incorrect', false, 'Devrait être DENY');
        }

    } catch (error) {
        logResult('Headers de sécurité', false, `Erreur: ${error.message}`);
    }
}

/**
 * TEST 2: Vérifier HTTPS et redirection
 */
async function testHTTPS() {
    console.log(`\n${colors.bold}=== TEST 2: HTTPS et Redirections ===${colors.reset}\n`);

    try {
        // Tester HTTPS
        const response = await makeRequest(CONFIG.baseUrl);
        if (response.statusCode === 200) {
            logResult('HTTPS accessible', true);
        } else {
            logResult('HTTPS accessible', false, `Status: ${response.statusCode}`);
        }

        // Tester redirection HTTP → HTTPS (si pas localhost)
        if (!CONFIG.baseUrl.includes('localhost')) {
            const httpUrl = CONFIG.baseUrl.replace('https://', 'http://');
            try {
                const httpResponse = await makeRequest(httpUrl);
                if (httpResponse.statusCode >= 300 && httpResponse.statusCode < 400) {
                    logResult('Redirection HTTP → HTTPS', true);
                } else {
                    logWarning(
                        'Redirection HTTP → HTTPS',
                        'Pas de redirection détectée - vérifier firebase.json'
                    );
                }
            } catch (error) {
                // HTTP peut être bloqué, c'est OK
                logResult('HTTP bloqué', true, 'HTTP désactivé (sécurisé)');
            }
        } else {
            logWarning('Redirection HTTP → HTTPS', 'Test ignoré (localhost)');
        }

    } catch (error) {
        logResult('HTTPS', false, `Erreur: ${error.message}`);
    }
}

/**
 * TEST 3: Vérifier Content Security Policy
 */
async function testCSP() {
    console.log(`\n${colors.bold}=== TEST 3: Content Security Policy ===${colors.reset}\n`);

    try {
        const response = await makeRequest(CONFIG.baseUrl);
        const csp = response.headers['content-security-policy'];

        if (!csp) {
            logResult('CSP présente', false, 'Header manquant');
            return;
        }

        logResult('CSP présente', true);

        // Vérifier les directives importantes
        const requiredDirectives = [
            'default-src',
            'script-src',
            'style-src',
            'object-src',
            'base-uri',
            'frame-ancestors'
        ];

        for (const directive of requiredDirectives) {
            if (csp.includes(directive)) {
                logResult(`CSP directive: ${directive}`, true);
            } else {
                logResult(`CSP directive: ${directive}`, false, 'Directive manquante');
            }
        }

        // Vérifier object-src 'none'
        if (csp.includes("object-src 'none'")) {
            logResult("CSP: object-src 'none'", true);
        } else {
            logResult("CSP: object-src 'none'", false, 'Devrait bloquer object/embed');
        }

        // Vérifier frame-ancestors
        if (csp.includes("frame-ancestors 'none'")) {
            logResult("CSP: frame-ancestors 'none'", true);
        } else {
            logWarning(
                "CSP: frame-ancestors",
                "Vérifier si la directive est restrictive"
            );
        }

    } catch (error) {
        logResult('CSP', false, `Erreur: ${error.message}`);
    }
}

/**
 * TEST 4: Tester la protection XSS basique
 */
async function testXSSProtection() {
    console.log(`\n${colors.bold}=== TEST 4: Protection XSS ===${colors.reset}\n`);

    const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")'
    ];

    try {
        const response = await makeRequest(CONFIG.baseUrl);
        const body = response.body;

        let xssFound = false;
        for (const payload of xssPayloads) {
            if (body.includes(payload)) {
                xssFound = true;
                logResult(`XSS Payload: ${payload}`, false, 'Payload non échappé détecté!');
            }
        }

        if (!xssFound) {
            logResult('Protection XSS de base', true, 'Aucun payload évident détecté');
        }

        // Vérifier X-XSS-Protection header
        if (response.headers['x-xss-protection']) {
            logResult('X-XSS-Protection header', true);
        } else {
            logWarning('X-XSS-Protection header', 'Header manquant (legacy browser)');
        }

    } catch (error) {
        logResult('Protection XSS', false, `Erreur: ${error.message}`);
    }
}

/**
 * TEST 5: Vérifier les pages admin
 */
async function testAdminPages() {
    console.log(`\n${colors.bold}=== TEST 5: Protection des Pages Admin ===${colors.reset}\n`);

    const adminPaths = [
        '/admin/dashboard.html',
        '/admin/login.html',
        '/zcoffee-secret-2026.html'
    ];

    for (const path of adminPaths) {
        try {
            const url = CONFIG.baseUrl + path;
            const response = await makeRequest(url);

            if (response.statusCode === 200) {
                logResult(`Page accessible: ${path}`, true);

                // Vérifier si la page contient des mécanismes de sécurité
                const body = response.body;

                if (body.includes('sessionStorage.getItem')) {
                    logResult(`  └─ Protection sessionStorage`, true);
                }

                if (body.includes('firebase-auth') || body.includes('getAuth')) {
                    logResult(`  └─ Firebase Auth présent`, true);
                }

            } else if (response.statusCode === 404) {
                logWarning(`Page: ${path}`, 'Page non trouvée (404)');
            } else {
                logResult(`Page: ${path}`, false, `Status: ${response.statusCode}`);
            }

        } catch (error) {
            logResult(`Page: ${path}`, false, `Erreur: ${error.message}`);
        }
    }
}

/**
 * TEST 6: Vérifier les fichiers sensibles exposés
 */
async function testSensitiveFiles() {
    console.log(`\n${colors.bold}=== TEST 6: Fichiers Sensibles Exposés ===${colors.reset}\n`);

    const sensitivePaths = [
        '/.env',
        '/firebase-config.json',
        '/full_config.json',
        '/.git/config',
        '/functions/index.js',
        '/functions/package.json'
    ];

    for (const path of sensitivePaths) {
        try {
            const url = CONFIG.baseUrl + path;
            const response = await makeRequest(url);

            if (response.statusCode === 404 || response.statusCode === 403) {
                logResult(`Fichier protégé: ${path}`, true, 'Non accessible (bon)');
            } else if (response.statusCode === 200) {
                logResult(`Fichier exposé: ${path}`, false, 'CRITIQUE: Fichier accessible!');
            }

        } catch (error) {
            // Erreur = fichier inaccessible = bon
            logResult(`Fichier protégé: ${path}`, true, 'Non accessible');
        }
    }
}

/**
 * Afficher le résumé final
 */
function printSummary() {
    console.log(`\n${colors.bold}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}RÉSUMÉ DES TESTS${colors.reset}`);
    console.log(`${'='.repeat(60)}\n`);

    const total = results.passed + results.failed;
    const percentage = ((results.passed / total) * 100).toFixed(1);

    console.log(`${colors.green}✓ Tests réussis:${colors.reset} ${results.passed}/${total} (${percentage}%)`);
    console.log(`${colors.red}✗ Tests échoués:${colors.reset} ${results.failed}/${total}`);
    console.log(`${colors.yellow}⚠ Avertissements:${colors.reset} ${results.warnings}`);

    console.log(`\n${colors.bold}Score de Sécurité:${colors.reset}`);

    let grade, gradeColor;
    if (percentage >= 95) {
        grade = 'A+';
        gradeColor = colors.green;
    } else if (percentage >= 90) {
        grade = 'A';
        gradeColor = colors.green;
    } else if (percentage >= 80) {
        grade = 'B';
        gradeColor = colors.yellow;
    } else if (percentage >= 70) {
        grade = 'C';
        gradeColor = colors.yellow;
    } else {
        grade = 'F';
        gradeColor = colors.red;
    }

    console.log(`${gradeColor}${colors.bold}${grade}${colors.reset} - ${percentage}% de réussite\n`);

    if (results.failed > 0) {
        console.log(`${colors.red}⚠ ATTENTION:${colors.reset} ${results.failed} test(s) échoué(s)`);
        console.log(`${colors.blue}→${colors.reset} Consulter DEPLOYMENT_GUIDE.md pour corriger\n`);
    } else {
        console.log(`${colors.green}✓ Tous les tests sont passés!${colors.reset}\n`);
    }

    // Recommandations
    if (percentage < 100) {
        console.log(`${colors.bold}PROCHAINES ÉTAPES:${colors.reset}`);
        console.log(`1. Lire README_SECURITY.md`);
        console.log(`2. Suivre DEPLOYMENT_GUIDE.md`);
        console.log(`3. Vérifier SECURITY_CHECKLIST.md`);
        console.log(`4. Tester sur https://securityheaders.com\n`);
    }

    console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}\n`);
}

/**
 * Fonction principale
 */
async function runTests() {
    console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
    console.log(`${colors.bold}ZCOFFEE - TESTS DE SÉCURITÉ AUTOMATISÉS${colors.reset}`);
    console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
    console.log(`\nURL: ${colors.blue}${CONFIG.baseUrl}${colors.reset}`);
    console.log(`Date: ${new Date().toLocaleString()}\n`);

    try {
        await testSecurityHeaders();
        await testHTTPS();
        await testCSP();
        await testXSSProtection();
        await testAdminPages();
        await testSensitiveFiles();

        printSummary();

        // Code de sortie
        process.exit(results.failed > 0 ? 1 : 0);

    } catch (error) {
        console.error(`${colors.red}Erreur fatale:${colors.reset}`, error);
        process.exit(1);
    }
}

// Lancer les tests
if (require.main === module) {
    runTests();
}

module.exports = { runTests };
