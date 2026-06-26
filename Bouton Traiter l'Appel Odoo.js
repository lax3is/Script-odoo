// ==UserScript==
// @name         Bouton Traiter l'Appel Odoo
// @namespace    http://tampermonkey.net/
// @version      4.0.9
// @description  Traitement d'appel Odoo – full API, timer, étiquettes, badges, RDV, historique et produits clients - Compatible v16-v19
// @author       Alexis.sair
// @match        https://winprovence.odoo.com/*
// @match        http://winprovence.odoo.com/*
// @match        https://*.odoo.com/*
// @match        https://*.dev.odoo.com/*
// @match        http://*.dev.odoo.com/*
// @match        https://winprovence.fr/*
// @match        http://winprovence.fr/*
// @match        https://*.winprovence.fr/*
// @updateURL    https://raw.githubusercontent.com/lax3is/Script-odoo/refs/heads/main/Bouton%20Traiter%20l'Appel%20Odoo.js
// @downloadURL  https://raw.githubusercontent.com/lax3is/Script-odoo/refs/heads/main/Bouton%20Traiter%20l'Appel%20Odoo.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      hotline.sippharma.fr
// @connect      winprovence.odoo.com
// @connect      *.odoo.com
// @connect      *.dev.odoo.com
// @connect      winprovence.fr
// @connect      *.winprovence.fr
// @connect      winprovence.odoo.fr
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================
    // DÉTECTION DE VERSION ODOO ET COMPATIBILITÉ
    // =========================================================
    const OdooVersion = {
        detected: null,
        major: null,

        detect() {
            try {
                const si = (window.odoo && (odoo.session_info || odoo.__session_info__)) || null;
                // Méthode 1: Via les infos de session (v16-v18: session_info, v19: __session_info__)
                if (si && si.server_version_info) {
                    const versionInfo = si.server_version_info;
                    this.major = Array.isArray(versionInfo) ? versionInfo[0] : parseInt(versionInfo);
                    this.detected = `v${this.major}`;
                    return this.major;
                }

                // Méthode 2: Via server_version
                if (si && si.server_version) {
                    const match = si.server_version.match(/^(\d+)\./);
                    if (match) {
                        this.major = parseInt(match[1]);
                        this.detected = `v${this.major}`;
                        return this.major;
                    }
                }

                // Méthode 3: Fallback - analyser le DOM
                const metaGenerator = document.querySelector('meta[name="generator"]');
                if (metaGenerator) {
                    const content = metaGenerator.getAttribute('content');
                    const match = content.match(/Odoo\s+(\d+)/i);
                    if (match) {
                        this.major = parseInt(match[1]);
                        this.detected = `v${this.major}`;
                        return this.major;
                    }
                }

                // Défaut v16
                this.major = 16;
                this.detected = 'v16 (défaut)';
                return this.major;
            } catch (e) {
                this.major = 16;
                this.detected = 'v16 (erreur)';
                return this.major;
            }
        },

        isV19OrHigher() {
            return this.major >= 19;
        },

        isV18OrHigher() {
            return this.major >= 18;
        },

        isV17OrHigher() {
            return this.major >= 17;
        }
    };

    // Détecter la version au chargement
    OdooVersion.detect();

    // =========================================================
    // SYSTÈME DE SÉLECTEURS ADAPTATIFS MULTI-VERSION
    // =========================================================
    const Selectors = {
        // Essaie plusieurs sélecteurs dans l'ordre jusqu'à trouver un élément
        find(selectorsArray, context = document) {
            for (const selector of selectorsArray) {
                try {
                    const element = context.querySelector(selector);
                    if (element) return element;
                } catch (e) {
                    // Sélecteur invalide, continuer
                }
            }
            return null;
        },

        findAll(selectorsArray, context = document) {
            for (const selector of selectorsArray) {
                try {
                    const elements = context.querySelectorAll(selector);
                    if (elements.length > 0) return elements;
                } catch (e) {
                    // Sélecteur invalide, continuer
                }
            }
            return [];
        },

        // Sélecteurs pour les champs de formulaire
        field(fieldName) {
            return [
                // v19
                `.o_field_widget[name="${fieldName}"]`,
                `[data-field="${fieldName}"]`,
                `.o_field[name="${fieldName}"]`,
                // v16-v18
                `.o_field_widget[name="${fieldName}"]`,
                `.o_field_many2one[name="${fieldName}"]`,
                `.o_field_many2many_tags[name="${fieldName}"]`,
                `[name="${fieldName}"]`
            ];
        },

        // Sélecteurs pour les boutons
        button(text) {
            return [
                // v19
                `button:contains("${text}")`,
                `button[title="${text}"]`,
                `button[aria-label="${text}"]`,
                // v16-v18
                `button.o_form_button_save`,
                `button[data-hotkey="s"]`,
                `.o_form_button_save`
            ];
        },

        // Sélecteurs pour la statusbar
        statusbar() {
            return [
                // v19
                '.o_statusbar',
                '.o_form_statusbar',
                '[data-name="statusbar"]',
                // v16-v18
                '.o_statusbar',
                '.o_form_statusbar .o_statusbar_status'
            ];
        },

        // Sélecteurs pour le breadcrumb
        breadcrumb() {
            return [
                // v19
                '.o_breadcrumb',
                '.o_control_panel_breadcrumbs',
                '[data-name="breadcrumb"]',
                // v16-v18
                '.o_breadcrumb',
                '.breadcrumb'
            ];
        },

        // Sélecteurs pour les lignes de liste
        listRows() {
            return [
                // v19
                '.o_data_row',
                '.o_list_row',
                'tr.o_data_row',
                // v16-v18
                '.o_data_row',
                'tbody tr.o_data_row'
            ];
        }
    };

    // =========================================================
    // HELPER POUR TROUVER DES ÉLÉMENTS DE MANIÈRE ROBUSTE
    // =========================================================
    function findElement(selectorsArray, context = document) {
        return Selectors.find(selectorsArray, context);
    }

    function findElements(selectorsArray, context = document) {
        return Selectors.findAll(selectorsArray, context);
    }

    function findField(fieldName, context = document) {
        return Selectors.find(Selectors.field(fieldName), context);
    }

    // =========================================================
    // CONFIGURATION API — obfusquée XOR 0x5A
    // =========================================================
    const _AK = [0x38,0x3E,0x3E,0x3B,0x38,0x6C,0x6B,0x3B,0x63,0x62,0x6C,0x68,0x62,0x68,0x6B,0x6A,0x68,0x39,0x6D,0x6A,0x3E,0x3E,0x6C,0x38,0x63,0x6F,0x3B,0x69,0x3C,0x68,0x62,0x6D,0x6F,0x63,0x63,0x3E,0x62,0x63,0x6B,0x3B];
    const _AL = [0x35,0x3E,0x35,0x35,0x77,0x2D,0x33,0x34,0x2A,0x28,0x35,0x2C,0x3F,0x34,0x39,0x3F,0x77,0x37,0x3B,0x33,0x34,0x77,0x63,0x6D,0x69,0x6C,0x63,0x62,0x62,0x1B,0x0A,0x13,0x1A,0x2D,0x33,0x34,0x2A,0x28,0x35,0x2C,0x3F,0x34,0x39,0x3F,0x74,0x3C,0x28];
    const _AD = [0x2D,0x33,0x34,0x2A,0x28,0x35,0x2C,0x3F,0x34,0x39,0x3F,0x77,0x37,0x3B,0x33,0x34,0x77,0x63,0x6D,0x69,0x6C,0x63,0x62,0x62];
    const _AU = [0x32,0x2E,0x2E,0x2A,0x29,0x60,0x75,0x75,0x2D,0x33,0x34,0x2A,0x28,0x35,0x2C,0x3F,0x34,0x39,0x3F,0x74,0x35,0x3E,0x35,0x35,0x74,0x39,0x35,0x37];
    function _rk() { return _AK.map(b => String.fromCharCode(b ^ 0x5A)).join(''); }
    function _rl() { return _AL.map(b => String.fromCharCode(b ^ 0x5A)).join(''); }
    function _rd() { return _AD.map(b => String.fromCharCode(b ^ 0x5A)).join(''); }
    function _ru() { return _AU.map(b => String.fromCharCode(b ^ 0x5A)).join(''); }

    // =========================================================
    // PORTAIL O2SWITCH — TRAÇABILITÉ SUPPRESSIONS
    // =========================================================
    const PORTAL_DELETE_INGEST_URL = 'https://hotline.sippharma.fr/odoospeek/portal/api/odoo_deleted_ingest.php';
    const PORTAL_MISSED_CALLS_URL = 'https://hotline.sippharma.fr/odoospeek/portal/api/missed_calls.php';
    const PORTAL_API_KEY = 'spk_1_2E6RrG4l2gQ6j1o0vQxV3p9mN8yAqK5lVZ3c4rB1uS7dT9wX0yZ2a';
    const DELETE_AUDIT_STORAGE_KEY = 'tm_delete_audit_pending_v2';
    let _pendingDeleteAudit = null;
    let _pendingDeleteSent = false;

    function saveDeleteAuditToStorage(audit) {
        try {
            sessionStorage.setItem(DELETE_AUDIT_STORAGE_KEY, JSON.stringify(audit || null));
        } catch (_) {}
    }

    function loadDeleteAuditFromStorage() {
        try {
            const raw = sessionStorage.getItem(DELETE_AUDIT_STORAGE_KEY) || '';
            if (!raw) return null;
            const v = JSON.parse(raw);
            return v && typeof v === 'object' ? v : null;
        } catch (_) {
            return null;
        }
    }

    function clearDeleteAuditStorage() {
        try {
            sessionStorage.removeItem(DELETE_AUDIT_STORAGE_KEY);
        } catch (_) {}
    }

    // Header Authorization Basic (login:apikey en base64)
    function _authHeader() {
        return 'Basic ' + btoa(_rl() + ':' + _rk());
    }

    // =========================================================
    // COUCHE API ODOO (JSON-RPC + clé API)
    // =========================================================
    // v19 expose les infos de session sous odoo.__session_info__ (au lieu de odoo.session_info en v16-v18).
    // window.__tmSessionInfo est rempli par warmCurrentUserName() via /web/session/get_session_info (fallback fiable).
    function getSessionInfo() {
        try {
            return (window.odoo && (odoo.session_info || odoo.__session_info__)) || window.__tmSessionInfo || {};
        } catch (e) { return window.__tmSessionInfo || {}; }
    }

    // Heure locale "murale" au format ISO sans fuseau (ex: 2026-06-09T16:01:00).
    // Évite le décalage UTC de toISOString() qui affichait l'heure en retard de 2h.
    function toLocalIsoNoTz(input) {
        let d;
        try { d = input ? new Date(input) : new Date(); } catch (_) { d = new Date(); }
        if (isNaN(d.getTime())) d = new Date();
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }

    function getOdooContext() {
        try { return getSessionInfo().user_context || {}; } catch (e) { return {}; }
    }

    async function odooRpc(model, method, args = [], kwargs = {}) {
        // v16 → v19 : requête sur le MÊME domaine que la page (session = cookie).
        // On n'utilise plus l'URL codée en dur (_ru) car l'instance v19 peut être sur un autre domaine
        // => sinon le fetch part en cross-origin, les cookies ne sont pas envoyés et l'appel échoue.
        try {
            const res = await fetch(window.location.origin + '/web/dataset/call_kw/' + model + '/' + method, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'call', id: Date.now(),
                    params: {
                        model, method, args,
                        kwargs: Object.assign({ context: getOdooContext() }, kwargs)
                    }
                })
            });
            const data = await res.json();
            if (data && data.result !== undefined) return data.result;
            if (data && data.error) console.warn('[OdooAPI] Erreur RPC', model, method, ':', data.error.data?.message || data.error.message);
        } catch (err) { console.warn('[OdooAPI] Fetch échoué:', model, method, err); }
        return null;
    }

    // Appel méthode objet (action sur un enregistrement)
    async function odooCall(model, method, ids, kwargs = {}) {
        return odooRpc(model, method, [ids], kwargs);
    }

    // Write sur un enregistrement
    async function odooWrite(model, id, vals) {
        return odooRpc(model, 'write', [[id], vals]);
    }

    // Read champs d'un enregistrement
    async function odooRead(model, id, fields) {
        const res = await odooRpc(model, 'read', [[id], fields]);
        return Array.isArray(res) && res.length ? res[0] : null;
    }

    // =========================================================
    // ÉTAT GLOBAL
    // =========================================================
    const state = {
        isProcessing: false,   // verrou global actions
        closureRunning: false, // verrou clôture
        timerStopRunning: false, // verrou arrêt timer après clôture
        timerShortcutRunning: false, // verrou raccourcis clavier timer
        timerStoppedForTicket: null, // ticket dont le timer vient d'être arrêté
        timerStoppedAt: 0            // timestamp de l'arrêt
    };

    // =========================================================
    // ÉTAT HISTORIQUE ET PRODUITS CLIENTS
    // =========================================================
    let historyAdded = false;
    let historyButtonAdded = false;
    let productsAdded = false;
    let productsButtonAdded = false;
    let isProcessingNavigation = false;

    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    function dispatchAltShortcut(key, code) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key,
            code,
            altKey: true,
            bubbles: true,
            cancelable: true
        }));
    }

    function simulerRaccourciTimer() {
        if (state.timerShortcutRunning) return;
        state.timerShortcutRunning = true;
        dispatchAltShortcut('z', 'KeyZ');
        setTimeout(() => { state.timerShortcutRunning = false; }, 1000);
    }

    // Alt+W sert de "toggle pause/resume" selon l'état du timer
    function simulerRaccourciPause() {
        if (state.timerShortcutRunning) return;
        state.timerShortcutRunning = true;
        dispatchAltShortcut('w', 'KeyW');
        setTimeout(() => { state.timerShortcutRunning = false; }, 1000);
    }

    function simulerRaccourciStop() {
        if (state.timerShortcutRunning) return;
        state.timerShortcutRunning = true;
        dispatchAltShortcut('q', 'KeyQ');
        setTimeout(() => { state.timerShortcutRunning = false; }, 1000);
    }

    async function waitForDomTimerState(expected, timeoutMs = 8000, pollMs = 250) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const s = domTimerState();
            if (s === expected) return true;
            await wait(pollMs);
        }
        return false;
    }

    // Sauvegarde fiable : attend que le bouton soit dispo, réessaie jusqu'à 3 fois
    async function saveForm() {
        // Attendre que le bouton save soit présent et actif (max 3s)
        let saveBtn = null;
        for (let i = 0; i < 15; i++) {
            saveBtn = document.querySelector('button.o_form_button_save, button[data-hotkey="s"], .o_form_button_save');
            if (saveBtn && !saveBtn.disabled) break;
            await wait(200);
            saveBtn = null;
        }

        if (saveBtn && !saveBtn.disabled) {
            saveBtn.click();
            await wait(400);
            // Vérifier que le bouton a disparu (formulaire sauvegardé) — sinon réessayer
            for (let retry = 0; retry < 3; retry++) {
                const stillDirty = document.querySelector('button.o_form_button_save:not([disabled]), button[data-hotkey="s"]:not([disabled])');
                if (!stillDirty) break; // sauvegardé
                await wait(400);
                stillDirty.click();
            }
        } else {
            // Fallback : simuler Ctrl+S
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true
            }));
            await wait(500);
        }
    }

    // =========================================================
    // HELPERS URL / TICKET ID
    // =========================================================
    // En v19, depuis un ticket on peut ouvrir un sous-enregistrement d'un autre modèle :
    //   /odoo/all-tickets/62667/res.partner/17571/action-...  (active_model=res.partner)
    // Dans ce cas on n'est PLUS sur la fiche ticket : il ne faut pas afficher les boutons.
    function isViewingNonTicketRecord() {
        const h = window.location.href;
        // active_model explicite différent de helpdesk.ticket
        const am = h.match(/[?&]active_model=([^&]+)/);
        if (am) {
            try { if (decodeURIComponent(am[1]) !== 'helpdesk.ticket') return true; } catch (_) {}
        }
        // sous-chemin /<modele>/<id> après l'id du ticket (ex: /res.partner/17571)
        if (/\/odoo\/[^?#]*ticket[s]?\/\d+\/[a-z0-9_.]+\/\d+/i.test(h)) return true;
        return false;
    }

    function isTicketPage() {
        const url = window.location.href;
        if (isViewingNonTicketRecord()) return false;
        // v19: /odoo/all-tickets/, /odoo/tickets/, /odoo/helpdesk/ticket/<id>
        // v16-v18: model=helpdesk.ticket
        return url.includes('model=helpdesk.ticket') ||
               url.includes('/odoo/all-tickets') ||
               url.includes('/odoo/tickets/') ||
               /\/odoo\/[^?#]*ticket[s]?(\/|$|\?)/i.test(url);
    }
    function isTicketForm() {
        const h = window.location.href;
        if (isViewingNonTicketRecord()) return false;
        // v19: URL avec un numéro de ticket à la fin
        //  - /odoo/all-tickets/76073
        //  - /odoo/tickets/76073
        //  - /odoo/helpdesk/ticket/83920   (ticket singulier, créé via API/logiciel externe)
        if (/\/odoo\/[^?#]*ticket[s]?\/\d+/i.test(h)) return true;
        // v16-v18: paramètres classiques
        return h.includes('model=helpdesk.ticket') && (h.includes('view_type=form') || h.includes('id='));
    }
    function isTicketList() {
        const h = window.location.href;
        // v19: URL liste (sans numéro de ticket)
        if (/\/odoo\/[^?#]*ticket[s]?(\/|$|\?)/i.test(h) && !/\/odoo\/[^?#]*ticket[s]?\/\d+/i.test(h)) return true;
        // v16-v18: paramètres classiques
        return h.includes('model=helpdesk.ticket') && h.includes('view_type=list');
    }
    function isPartnerForm() {
        const h = window.location.href;
        // v19: fiche contact /odoo/contacts/4031
        if (/\/odoo\/contacts\/\d+/i.test(h)) return true;
        // v16-v18
        return h.includes('model=res.partner') &&
            (h.includes('view_type=form') || /[#&?]id=\d+/.test(h));
    }
    function isPartnerList() {
        const h = window.location.href;
        // v19: liste contacts (sans id dans le chemin)
        if (/\/odoo\/contacts\/?(?:[?#]|$)/i.test(h) && !/\/odoo\/contacts\/\d+/i.test(h)) return true;
        // v16-v18
        return h.includes('model=res.partner') && h.includes('view_type=list');
    }
    function isCreatingTicket() {
        const h = window.location.href;
        // v19: URL avec /new ou /create
        if (/\/odoo\/[^?#]*ticket[s]?\/new/i.test(h)) return true;
        // v16-v18: paramètres classiques
        return h.includes('model=helpdesk.ticket') && h.includes('view_type=form');
    }

    function getTicketIdFromUrl() {
        // v19: /odoo/all-tickets/76073, /odoo/tickets/76073, /odoo/helpdesk/ticket/83920
        const v19Match = window.location.href.match(/\/odoo\/[^?#]*ticket[s]?\/(\d+)/i);
        if (v19Match) return v19Match[1];

        // v16-v18: ?id=76073 ou #id=76073
        const classicMatch = window.location.href.match(/[#&?]id=(\d+)/);
        return classicMatch ? classicMatch[1] : null;
    }

    function getTicketIdFromPage() {
        // 1. URL
        let id = getTicketIdFromUrl();
        if (id) return id;
        // 2. Titre
        const m = document.title.match(/[#](\d+)/);
        if (m) return m[1];
        // 3. Breadcrumb
        const bc = document.querySelector('.o_breadcrumb');
        if (bc) { const m2 = bc.textContent.match(/[#](\d+)/); if (m2) return m2[1]; }
        return null;
    }

    function isDeleteLikeText(text) {
        const t = (text || '').toLowerCase();
        return t.includes('supprimer') || t.includes('delete');
    }

    function modalLooksLikeDeleteConfirm(modal) {
        if (!modal) return false;
        const txt = (modal.textContent || '').toLowerCase();
        return txt.includes('supprimer') || txt.includes('delete');
    }

    // =========================================================
    // SYSTÈME DE DEBUG ET LOGGING (DÉSACTIVÉ EN PRODUCTION)
    // =========================================================
    // Objet Debug vide pour éviter les erreurs (les appels Debug.log sont ignorés)
    const Debug = {
        log() {},
        error() {}
    };

    function readFirstText(selectors) {
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (!el) continue;
                const v = (el.value || el.textContent || '').trim();
                if (v) return v;
            } catch (e) {
                // Selector invalide, continuer
            }
        }
        return '';
    }

    let _currentUserNameCache = '';

    function getOdooCurrentUserName() {
        // 0) Cache pré-chargé (le plus fiable, alimenté via API au démarrage)
        if (_currentUserNameCache) return _currentUserNameCache;

        // 1) Infos de session (v16-v18: session_info, v19: __session_info__)
        try {
            const si = getSessionInfo();
            const n = (si && (si.name || si.partner_display_name || si.username)) || '';
            if (n) { _currentUserNameCache = String(n).trim(); return _currentUserNameCache; }
        } catch (_) {}

        // 2) Fallback UI: navbar user name (sélecteurs élargis v16 → v19)
        try {
            const navUser = document.querySelector(
                '.o_user_menu .o_menu_brand, ' +
                '.o_user_menu span[class*="name"], ' +
                '.o_main_navbar .o_user_menu > a > span, ' +
                '.o_main_navbar .o_user_menu .o_dropdown_title, ' +
                '.o_user_menu .oi-user + span, ' +
                'header .o_user_menu button span'
            );
            if (navUser) {
                const t = (navUser.textContent || '').trim();
                if (t) return t;
            }
        } catch (_) {}

        return '';
    }

    // Pré-charge le nom de l'utilisateur courant. À appeler au démarrage.
    // Source fiable v19 : endpoint /web/session/get_session_info (indépendant de l'exposition de odoo.*).
    async function warmCurrentUserName() {
        try {
            // Tentative directe (session déjà exposée / navbar)
            const direct = getOdooCurrentUserName();
            if (direct) { _currentUserNameCache = direct; return direct; }
        } catch (_) {}

        // Fallback fiable : interroger la session côté serveur
        try {
            const res = await fetch(window.location.origin + '/web/session/get_session_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'include',
                body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: {} })
            });
            const data = await res.json();
            const si = data && data.result;
            if (si && typeof si === 'object') {
                try { window.__tmSessionInfo = si; } catch (_) {}
                const n = si.name || si.partner_display_name || si.username;
                if (n) { _currentUserNameCache = String(n).trim(); return _currentUserNameCache; }
                // Dernier recours : lire res.users via l'uid
                const uid = si.uid || (si.user_context && si.user_context.uid) || null;
                if (uid) {
                    const u = await odooRead('res.users', Number(uid), ['name']);
                    if (u && u.name) { _currentUserNameCache = String(u.name).trim(); return _currentUserNameCache; }
                }
            }
        } catch (_) {}
        return _currentUserNameCache;
    }

    function getTicketInfoFromDom() {
        // Fallback: extrait ce qui est encore affiché avant suppression.
        // Beaucoup d’écrans Odoo utilisent .o_field_widget[name="..."] avec input/span pour le libellé.
        try {
            const ticket_name = readFirstText([
                '.o_field_widget[name="name"] input',
                '.o_field_widget[name="name"] textarea',
                'input[name="name"]',
                '.o_form_record_title .o_record_name',
                '.o_form_record_title h1'
            ]);

            const assigned_user = readFirstText([
                '.o_field_widget[name="user_id"] .o_form_uri',
                '.o_field_widget[name="user_id"] span',
                '.o_field_widget[name="user_id"] input',
                '.o_field_many2one[name="user_id"] input'
            ]);

            const partner_name = readFirstText([
                '.o_field_widget[name="partner_id"] .o_form_uri',
                '.o_field_widget[name="partner_id"] span',
                '.o_field_widget[name="partner_id"] input',
                '.o_field_many2one[name="partner_id"] input'
            ]);

            const team_name = readFirstText([
                '.o_field_widget[name="team_id"] .o_form_uri',
                '.o_field_widget[name="team_id"] span',
                '.o_field_widget[name="team_id"] input',
                '.o_field_many2one[name="team_id"] input'
            ]);

            // Stage: on lit le statut actif dans la statusbar
            const stage_name = readFirstText([
                '.o_statusbar .o_statusbar_status.o_active span',
                '.o_statusbar_status button[aria-pressed="true"]',
                '.o_statusbar_status .o_active span',
                '.o_statusbar_status.o_active span'
            ]);

            // Note interne = champ request_answer (confirmé sur ton instance)
            const internal_note = readFirstText([
                '.o_field_widget[name="request_answer"] textarea',
                '.o_field_widget[name="request_answer"] div.note-editable',
                '.o_field_widget[name="request_answer"] .note-editable',
                'textarea[name="request_answer"]'
            ]);

            const client_note = readFirstText([
                '.o_field_widget[name="description"] textarea',
                '.o_field_widget[name="description"] div.note-editable',
                '.o_field_widget[name="description"] .note-editable',
                'textarea[name="description"]',
                '.o_field_widget[name="partner_note"] textarea',
                '.o_field_widget[name="partner_note"] div.note-editable',
                '.o_field_widget[name="customer_note"] textarea',
                '.o_field_widget[name="customer_note"] div.note-editable',
                '.o_field_widget[name="client_note"] textarea',
                '.o_field_widget[name="client_note"] div.note-editable',
                'textarea[name="partner_note"]',
                'textarea[name="customer_note"]',
                'textarea[name="client_note"]'
            ]);

            return { ticket_name, assigned_user, partner_name, team_name, stage_name, internal_note, client_note };
        } catch (_) {
            return { ticket_name: '', assigned_user: '', partner_name: '', team_name: '', stage_name: '', internal_note: '', client_note: '' };
        }
    }

    async function prepareDeleteAudit() {
        try {
            const ticketId = getTicketIdFromPage();
            if (!ticketId) return;
            window.__tmDelAuditLast = {
                ts: Date.now(),
                src: 'click',
                ticket_id: Number(ticketId),
                url: window.location.href
            };
            let snap = null;
            try { snap = await apiGetTicketDeleteSnapshot(ticketId); } catch (_) { snap = null; }

            const dom = getTicketInfoFromDom();
            const currentUser = getOdooCurrentUserName() || await warmCurrentUserName();

            const merge = (apiVal, domVal) => {
                const a = (apiVal ?? '');
                const d = (domVal ?? '');
                return String(a || d || '').trim();
            };

            _pendingDeleteAudit = {
                ticket_id: Number(ticketId),
                ticket_name: merge(snap && snap.name, dom.ticket_name),
                assigned_user: merge(
                    snap && Array.isArray(snap.user_id) ? snap.user_id[1] : '',
                    dom.assigned_user
                ),
                partner_name: merge(
                    snap && Array.isArray(snap.partner_id) ? snap.partner_id[1] : '',
                    dom.partner_name
                ),
                team_name: merge(
                    snap && Array.isArray(snap.team_id) ? snap.team_id[1] : '',
                    dom.team_name
                ),
                stage_name: merge(
                    snap && Array.isArray(snap.stage_id) ? snap.stage_id[1] : '',
                    dom.stage_name
                ),
                internal_note: String(dom.internal_note || '').trim(),
                client_note: String(dom.client_note || '').trim(),
                created_at: (snap && snap.create_date) || '',
                updated_at: (snap && snap.write_date) || '',
                deleted_by: currentUser || '',
                deleted_at_local: new Date().toISOString(),
                odoo_url: window.location.href
            };
            _pendingDeleteSent = false;
            saveDeleteAuditToStorage(_pendingDeleteAudit);
        } catch (_) {}
    }

    async function postDeleteAudit(body) {
        // 1) Envoi via Tampermonkey (GM_xmlhttpRequest) => conserve les cookies, évite CORS + challenge o2switch
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                for (let attempt = 0; attempt < 4; attempt++) {
                    const ok = await new Promise((resolve) => {
                        try {
                            GM_xmlhttpRequest({
                                method: 'POST',
                                url: PORTAL_DELETE_INGEST_URL,
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                                data: body,
                                anonymous: false,
                                timeout: 15000,
                                onload: (resp) => {
                                    resolve(!!resp && resp.status === 200);
                                },
                                onerror: () => resolve(false)
                            });
                        } catch (_) {
                            resolve(false);
                        }
                    });
                    if (ok) return true;
                    await new Promise((r) => setTimeout(r, 250 + attempt * 450));
                }
            }
        } catch (_) { /* ignore */ }

        // 2) Dernier fallback: iframe/form (peut être challengé, mais ne bloque pas le reste)
        try {
            try {
                window.__tmDelAuditDebug = Object.assign({}, window.__tmDelAuditDebug, {
                    lastBodyRaw: String(body || ''),
                    via: 'iframe',
                    submittedAt: Date.now()
                });
            } catch (_) {}

            const iframeName = 'tm_delete_audit_sink_' + Date.now();
            const iframe = document.createElement('iframe');
            iframe.name = iframeName;
            iframe.style.display = 'none';
            document.body.appendChild(iframe);

            const form = document.createElement('form');
            form.method = 'POST';
            form.action = PORTAL_DELETE_INGEST_URL;
            form.target = iframeName;
            form.style.display = 'none';

            const params = new URLSearchParams(body);
            params.forEach((value, key) => {
                const input = document.createElement('input');
                input.type = 'hidden';
                input.name = key;
                input.value = value;
                form.appendChild(input);
            });

            document.body.appendChild(form);
            form.submit();
            setTimeout(() => {
                try { form.remove(); } catch (_) {}
                try { iframe.remove(); } catch (_) {}
            }, 5000);
            return true;
        } catch (_) {}

        return false;
    }

    async function sendDeleteAudit() {
        try {
            if (_pendingDeleteSent) return;
            if (!_pendingDeleteAudit) _pendingDeleteAudit = loadDeleteAuditFromStorage();
            if (!_pendingDeleteAudit) return;
            const p = _pendingDeleteAudit;
            try {
                window.__tmDelAuditDebug = Object.assign({}, window.__tmDelAuditDebug, {
                    stage: 'sendDeleteAudit',
                    ticket_id: Number(p.ticket_id || ''),
                    ticket_name: String(p.ticket_name || ''),
                    assigned_user: String(p.assigned_user || ''),
                    partner_name: String(p.partner_name || ''),
                    team_name: String(p.team_name || ''),
                    stage_name: String(p.stage_name || ''),
                    deleted_by: String(p.deleted_by || ''),
                    deleted_at_local: String(p.deleted_at_local || ''),
                    odoo_url: String(p.odoo_url || '')
                });
            } catch (_) {}
            // Filet de sécurité : si le nom est encore vide, le résoudre via l'API avant l'envoi
            let deletedBy = String(p.deleted_by || '').trim();
            if (!deletedBy) {
                try { deletedBy = String((await warmCurrentUserName()) || '').trim(); } catch (_) {}
            }
            const body = new URLSearchParams({
                api_key: PORTAL_API_KEY,
                ticket_id: String(p.ticket_id || ''),
                ticket_name: String(p.ticket_name || ''),
                assigned_user: String(p.assigned_user || ''),
                partner_name: String(p.partner_name || ''),
                team_name: String(p.team_name || ''),
                stage_name: String(p.stage_name || ''),
                internal_note: String(p.internal_note || ''),
                client_note: String(p.client_note || ''),
                created_at: String(p.created_at || ''),
                updated_at: String(p.updated_at || ''),
                deleted_by: deletedBy,
                deleted_at_local: toLocalIsoNoTz(p.deleted_at_local),
                odoo_url: String(p.odoo_url || '')
            });

            const ok = await postDeleteAudit(body.toString());
            try {
                window.__tmDelAuditDebug = Object.assign({}, window.__tmDelAuditDebug, {
                    postReturnedOk: !!ok
                });
            } catch (_) {}
            if (!ok) return;
            _pendingDeleteSent = true;
            _pendingDeleteAudit = null;
            clearDeleteAuditStorage();
        } catch (_) {}
    }

    function openDeleteAuditPopupFromUserGesture() {
        try {
            // Ouvre (ou réutilise) une petite fenêtre top-level pour contourner le challenge cross-site o2switch.
            if (window.__tmDelAuditPopupWin && !window.__tmDelAuditPopupWin.closed) return;
            window.__tmDelAuditPopupWin = window.open(
                'about:blank',
                'tm_del_audit_popup',
                'width=220,height=120,noopener'
            );
            try {
                window.__tmDelAuditDebug = Object.assign({}, window.__tmDelAuditDebug, {
                    popupOpenedAt: Date.now(),
                    popupOpened: !!window.__tmDelAuditPopupWin
                });
            } catch (_) {}
        } catch (_) {}
    }

    function hookDeleteAuditClicks() {
        if (document.body.dataset.deleteAuditHooked === '1') return;
        document.body.dataset.deleteAuditHooked = '1';

        document.addEventListener('click', (ev) => {
            const target = ev.target instanceof Element ? ev.target : null;
            if (!target) return;
            const el = target.closest('button, a, .dropdown-item, .o_menu_item');
            if (!el) return;
            const txt = (el.textContent || '').trim();
            if (!isDeleteLikeText(txt)) return;

            const modal = el.closest('.modal, .o_dialog, .o_technical_modal');
            if (modal) {
                if (!modalLooksLikeDeleteConfirm(modal)) return;

                // IMPORTANT: préparer le payload avant d'envoyer (sinon _pendingDeleteAudit peut être null)
                setTimeout(() => {
                    Promise.resolve(prepareDeleteAudit()).then(() => {
                        try { sendDeleteAudit(); } catch (_) {}
                    }).catch(() => {
                        // En cas d'erreur snapshot, on tente quand même un envoi minimal si l'ID est connu
                        try { sendDeleteAudit(); } catch (_) {}
                    });
                }, 0);
            } else {
                setTimeout(() => { prepareDeleteAudit(); }, 0);
            }
        }, true);
    }

    function getModelMethodFromUrl(url) {
        try {
            if (!url || typeof url !== 'string') return { model: null, method: null };
            // Cas courant: /web/dataset/call_kw/<model>/<method>
            const m = url.match(/\/web\/dataset\/call_kw\/([^\/\?\#]+)\/([^\/\?\#]+)/i);
            if (m) return { model: decodeURIComponent(m[1]), method: decodeURIComponent(m[2]) };
            return { model: null, method: null };
        } catch (_) {
            return { model: null, method: null };
        }
    }

    function extractDeleteLikeTicketIdFromBodyString(bodyText, urlForModelMethod = '') {
        try {
            if (!bodyText || typeof bodyText !== 'string') return null;
            const body = JSON.parse(bodyText);
            const params = body && body.params ? body.params : null;
            if (!params) return null;

            const fromUrl = getModelMethodFromUrl(urlForModelMethod);
            const model = params.model || fromUrl.model;
            if (model !== 'helpdesk.ticket') return null;

            const method = String(params.method || fromUrl.method || '').toLowerCase();
            const args = Array.isArray(params.args) ? params.args : [];

            // Cas suppression réelle
            if (method === 'unlink') {
                const ids = Array.isArray(args[0]) ? args[0] : [];
                if (!ids.length) return null;
                const firstId = Number(ids[0]);
                return Number.isFinite(firstId) && firstId > 0 ? firstId : null;
            }

            // Cas Odoo fréquent: archivage au lieu de suppression
            if (method === 'action_archive' || method === 'toggle_active') {
                const ids = Array.isArray(args[0]) ? args[0] : [];
                if (!ids.length) return null;
                const firstId = Number(ids[0]);
                return Number.isFinite(firstId) && firstId > 0 ? firstId : null;
            }

            // Cas write(active=false) => suppression logique
            if (method === 'write') {
                const ids = Array.isArray(args[0]) ? args[0] : [];
                const vals = (args.length > 1 && args[1] && typeof args[1] === 'object') ? args[1] : null;
                const activeVal = vals && Object.prototype.hasOwnProperty.call(vals, 'active') ? vals.active : undefined;
                if (activeVal !== false) return null;
                if (!ids.length) return null;
                const firstId = Number(ids[0]);
                return Number.isFinite(firstId) && firstId > 0 ? firstId : null;
            }

            return null;
        } catch (_) {
            return null;
        }
    }

    async function extractDeleteLikeTicketIdFromFetch(input, init) {
        try {
            const url = typeof input === 'string' ? input : (input && input.url) ? input.url : '';
            if (!url || !url.includes('/web/dataset/')) return null;

            if (init && typeof init.body === 'string') {
                return extractDeleteLikeTicketIdFromBodyString(init.body, url);
            }
            if (input && typeof input === 'object' && typeof input.clone === 'function') {
                try {
                    const txt = await input.clone().text();
                    return extractDeleteLikeTicketIdFromBodyString(txt, url);
                } catch (_) {}
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    function hookOdooDeleteRpcAudit() {
        if (window.__tmDeleteRpcHooked) return;
        window.__tmDeleteRpcHooked = true;

        const originalFetch = window.fetch.bind(window);
        window.fetch = async function(input, init) {
            const ticketId = await extractDeleteLikeTicketIdFromFetch(input, init);
            if (!ticketId) {
                return originalFetch(input, init);
            }

            const currentUser = getOdooCurrentUserName() || await warmCurrentUserName();
            const dom0 = getTicketInfoFromDom();
            // Base payload immédiat: on enverra au moins l'ID même si le snapshot RPC échoue.
            _pendingDeleteAudit = {
                ticket_id: Number(ticketId),
                ticket_name: dom0.ticket_name || '',
                assigned_user: dom0.assigned_user || '',
                partner_name: dom0.partner_name || '',
                team_name: dom0.team_name || '',
                stage_name: dom0.stage_name || '',
                internal_note: dom0.internal_note || '',
                client_note: dom0.client_note || '',
                created_at: '',
                updated_at: '',
                deleted_by: currentUser || '',
                deleted_at_local: new Date().toISOString(),
                odoo_url: window.location.href
            };
            window.__tmDelAuditLast = {
                ts: Date.now(),
                src: 'rpc(fetch)',
                ticket_id: Number(ticketId),
                url: (typeof input === 'string') ? input : (input && input.url ? input.url : '')
            };
            _pendingDeleteSent = false;
            saveDeleteAuditToStorage(_pendingDeleteAudit);

            try {
                const snap = await apiGetTicketDeleteSnapshot(ticketId);
                const dom = getTicketInfoFromDom();
                _pendingDeleteAudit = {
                    ticket_id: ticketId,
                    ticket_name: String((snap && snap.name) ? snap.name : dom.ticket_name || '').trim(),
                    assigned_user: String((snap && Array.isArray(snap.user_id) ? (snap.user_id[1] || '') : '') || dom.assigned_user || '').trim(),
                    partner_name: String((snap && Array.isArray(snap.partner_id) ? (snap.partner_id[1] || '') : '') || dom.partner_name || '').trim(),
                    team_name: String((snap && Array.isArray(snap.team_id) ? (snap.team_id[1] || '') : '') || dom.team_name || '').trim(),
                    stage_name: String((snap && Array.isArray(snap.stage_id) ? (snap.stage_id[1] || '') : '') || dom.stage_name || '').trim(),
                    internal_note: String(dom.internal_note || '').trim(),
                    client_note: String(dom.client_note || '').trim(),
                    created_at: (snap && snap.create_date) || '',
                    updated_at: (snap && snap.write_date) || '',
                    deleted_by: currentUser || '',
                    deleted_at_local: new Date().toISOString(),
                    odoo_url: window.location.href
                };
                saveDeleteAuditToStorage(_pendingDeleteAudit);
            } catch (_) {}

            const res = await originalFetch(input, init);
            try {
                // Inutile de dépendre de res.ok: la suppression est déjà détectée (unlink/archive/write active=false)
                // et sendDeleteAudit a des fallback réseau robustes.
                setTimeout(() => { sendDeleteAudit(); }, 0);
            } catch (_) {}
            return res;
        };

        if (!window.__tmDeleteXhrHooked) {
            window.__tmDeleteXhrHooked = true;
            const origOpen = XMLHttpRequest.prototype.open;
            const origSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function(method, url) {
                this.__tmUrl = url || '';
                return origOpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function(body) {
                try {
                    const url = this.__tmUrl || '';
                    const ticketId = (url && url.includes('/web/dataset/') && typeof body === 'string')
                        ? extractDeleteLikeTicketIdFromBodyString(body, url)
                        : null;

                    if (ticketId) {
                        const xhr = this;
                        const onLoad = async () => {
                            try {
                                if (xhr.status >= 200 && xhr.status < 400) {
                                    const currentUser = getOdooCurrentUserName();
                                    const dom0 = getTicketInfoFromDom();
                                    _pendingDeleteAudit = {
                                        ticket_id: Number(ticketId),
                                        ticket_name: dom0.ticket_name || '',
                                        assigned_user: dom0.assigned_user || '',
                                        partner_name: dom0.partner_name || '',
                                        team_name: dom0.team_name || '',
                                        stage_name: dom0.stage_name || '',
                                        internal_note: dom0.internal_note || '',
                                        client_note: dom0.client_note || '',
                                        created_at: '',
                                        updated_at: '',
                                        deleted_by: currentUser || '',
                                        deleted_at_local: new Date().toISOString(),
                                        odoo_url: window.location.href
                                    };
                                    saveDeleteAuditToStorage(_pendingDeleteAudit);
                                    window.__tmDelAuditLast = {
                                        ts: Date.now(),
                                        src: 'rpc(xhr)',
                                        ticket_id: Number(ticketId),
                                        url: url || ''
                                    };
                                    _pendingDeleteSent = false;

                                    let snap = null;
                                    const dom = getTicketInfoFromDom();
                                    try { snap = await apiGetTicketDeleteSnapshot(ticketId); } catch (_) { snap = null; }
                                    _pendingDeleteAudit = {
                                        ticket_id: ticketId,
                                        ticket_name: String((snap && snap.name) ? snap.name : dom.ticket_name || '').trim(),
                                        assigned_user: String((snap && Array.isArray(snap.user_id) ? (snap.user_id[1] || '') : '') || dom.assigned_user || '').trim(),
                                        partner_name: String((snap && Array.isArray(snap.partner_id) ? (snap.partner_id[1] || '') : '') || dom.partner_name || '').trim(),
                                        team_name: String((snap && Array.isArray(snap.team_id) ? (snap.team_id[1] || '') : '') || dom.team_name || '').trim(),
                                        stage_name: String((snap && Array.isArray(snap.stage_id) ? (snap.stage_id[1] || '') : '') || dom.stage_name || '').trim(),
                                        internal_note: String(dom.internal_note || '').trim(),
                                        client_note: String(dom.client_note || '').trim(),
                                        created_at: (snap && snap.create_date) || '',
                                        updated_at: (snap && snap.write_date) || '',
                                        deleted_by: currentUser || '',
                                        deleted_at_local: new Date().toISOString(),
                                        odoo_url: window.location.href
                                    };
                                    saveDeleteAuditToStorage(_pendingDeleteAudit);
                                    setTimeout(() => { sendDeleteAudit(); }, 0);
                                }
                            } catch (_) {}
                            xhr.removeEventListener('load', onLoad);
                        };
                        xhr.addEventListener('load', onLoad);
                    }
                } catch (_) {}
                return origSend.apply(this, arguments);
            };
        }
    }

    // =========================================================
    // ÉTAT TRAITEMENT (localStorage)
    // =========================================================
    function saveState(ticketId, val) {
        if (!ticketId) return;
        // val: 'running' | 'paused' | 'stopped'
        localStorage.setItem('etatTraitement_' + ticketId, val);
    }
    function loadState(ticketId) {
        if (!ticketId) return 'stopped';
        return localStorage.getItem('etatTraitement_' + ticketId) || 'stopped';
    }

    // =========================================================
    // ACTIONS API TIMER
    // =========================================================
    async function apiTimerStart(ticketId) {
        return odooCall('helpdesk.ticket', 'action_timer_start', [Number(ticketId)]);
    }
    async function apiTimerPause(ticketId) {
        return odooCall('helpdesk.ticket', 'action_timer_pause', [Number(ticketId)]);
    }
    async function apiTimerResume(ticketId) {
        return odooCall('helpdesk.ticket', 'action_timer_resume', [Number(ticketId)]);
    }
    async function apiTimerStop(ticketId) {
        return odooCall('helpdesk.ticket', 'action_timer_stop', [Number(ticketId)]);
    }

    async function apiTicketStop(ticketId) {
        return odooCall('helpdesk.ticket', 'stop_ticket', [Number(ticketId)]);
    }

    // =========================================================
    // ACTIONS API TICKET
    // =========================================================
    async function apiAssignToSelf(ticketId) {
        return odooCall('helpdesk.ticket', 'assign_ticket_to_self', [Number(ticketId)]);
    }

    async function apiGetTicketInfo(ticketId) {
        return odooRead('helpdesk.ticket', Number(ticketId), [
            'user_id', 'partner_id', 'stage_id', 'timer_start', 'is_timer_running',
            'material_reason_tag_ids', 'software_reason_tag_ids'
        ]);
    }

    async function apiGetTicketDeleteSnapshot(ticketId) {
        return odooRead('helpdesk.ticket', Number(ticketId), [
            'name', 'user_id', 'partner_id', 'team_id', 'stage_id',
            'create_date', 'write_date'
        ]);
    }

    // =========================================================
    // FONCTIONS HISTORIQUE ET PRODUITS CLIENTS
    // =========================================================

    // Fonction pour sauvegarder l'état de l'historique
    function saveHistoryState(isVisible) {
        try {
            localStorage.setItem('ticketHistory_visible', isVisible ? 'true' : 'false');
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la sauvegarde de l\'état:', error);
        }
    }

    // Fonction pour récupérer l'état de l'historique
    function getHistoryState() {
        try {
            const state = localStorage.getItem('ticketHistory_visible');
            return state === 'true';
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la récupération de l\'état:', error);
            return false;
        }
    }

    // Fonction pour sauvegarder l'état d'affichage des produits
    function saveProductsState(isVisible) {
        try {
            localStorage.setItem('productsHistory_visible', isVisible ? 'true' : 'false');
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la sauvegarde de l\'état des produits:', error);
        }
    }

    // Fonction pour récupérer l'état d'affichage des produits
    function getProductsState() {
        try {
            const state = localStorage.getItem('productsHistory_visible');
            return state === 'true';
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la récupération de l\'état des produits:', error);
            return false;
        }
    }

    // Fonction pour obtenir l'ID selon le modèle présent dans l'URL
    async function getIdToProcess() {
        try {

            // Essayer différentes méthodes pour parser l'URL Odoo
            let params, model, id;

            // Méthode 1a: v19 - fiche contact /odoo/contacts/4031
            const contactsMatch = window.location.href.match(/\/odoo\/contacts\/(\d+)/);
            if (contactsMatch) {
                model = 'res.partner';
                id = contactsMatch[1];
            }

            // Méthode 1b: v19 - ticket /odoo/all-tickets/76045
            if (!model || !id) {
                const v19Match = window.location.href.match(/\/odoo\/[^/]*tickets[^/]*\/(\d+)/);
                if (v19Match) {
                    model = 'helpdesk.ticket';
                    id = v19Match[1];
                }
            }

            // Méthode 2: URLSearchParams sur le hash (v16-v18)
            if (!model || !id) {
                if (window.location.hash) {
                    params = new URLSearchParams(window.location.hash.slice(1));
                    model = params.get("model");
                    id = params.get("id");
                }
            }

            // Méthode 3: Parser manuellement l'URL Odoo
            if (!model || !id) {
                const urlMatch = window.location.href.match(/[#&]model=([^&]+).*[#&]id=(\d+)/);
                if (urlMatch) {
                    model = urlMatch[1];
                    id = urlMatch[2];
                }
            }

            // Méthode 4: Utiliser l'API Odoo pour obtenir l'ID actuel
            if (!model || !id) {
                try {
                    if (window.odoo && window.odoo.env && window.odoo.env.services && window.odoo.env.services.action) {
                        const actionService = window.odoo.env.services.action;
                        if (actionService.currentController && actionService.currentController.props) {
                            const props = actionService.currentController.props;
                            model = props.resModel;
                            id = props.resId;
                        }
                    }
                } catch (e) {
                    // Méthode 4 échouée
                }
            }

            if (!model || !id) {
                console.log('[HISTORY] Impossible de déterminer le modèle et l\'ID');
                return null;
            }

            if (model === "res.partner") {
                return id;
            } else if (model === "helpdesk.ticket") {
                const ticketDetails = await odooRead('helpdesk.ticket', Number(id), ['partner_id']);
                if (ticketDetails && ticketDetails.partner_id) {
                    return ticketDetails.partner_id[0];
                }
                return null;
            } else if (model === "sale.order") {
                const orderDetails = await odooRead('sale.order', Number(id), ['partner_id']);
                if (orderDetails && orderDetails.partner_id) {
                    return orderDetails.partner_id[0];
                }
                return null;
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    // Fonction pour vérifier si l'URL correspond aux patterns autorisés
    function isValidUrlForHistory() {
        const h = window.location.href;
        const hash = window.location.hash;

        // v19: URLs avec /odoo/all-tickets/ID ou /odoo/tickets/ID
        if (h.match(/\/odoo\/[^/]*tickets[^/]*\/\d+/)) return true;

        // v16-v18: paramètres classiques dans le hash
        const isTicketPage = hash.includes("model=helpdesk.ticket") && hash.includes("view_type=form");
        const isPartnerPage = isPartnerForm();
        const isSaleOrderPage = hash.includes("model=sale.order") && hash.includes("view_type=form");
        return isTicketPage || isPartnerPage || isSaleOrderPage;
    }

    // Fonction pour récupérer les tickets d'un client
    async function fetchClientTickets(explicitPartnerId) {
        try {
            const partnerId = explicitPartnerId || await getIdToProcess();

            if (!partnerId) {
                return null;
            }

            // v19 : web_search_read exige désormais "specification" et non "fields".
            // On utilise search_read (stable v16 → v19) qui renvoie directement un tableau.
            const tickets = await odooRpc('helpdesk.ticket', 'search_read', [
                [["partner_id", "=", parseInt(partnerId)]],
                [
                    "name", "priority", "create_date", "close_date", "team_id",
                    "user_id", "stage_id", "request_answer", "description"
                ],
                0, 0, "create_date DESC, priority DESC, id ASC"
            ]);

            return tickets;
        } catch (error) {
            console.error('[HISTORY] Erreur lors de la récupération des tickets:', error);
            return null;
        }
    }

    // Fonction pour récupérer les produits d'un client via traçabilité
    // Migré de get_html (parsing HTML fragile) vers get_main_lines (JSON structuré).
    // get_main_lines renvoie un tableau d'objets dont chaque "columns" contient :
    //   [0]=référence, [1]=nom produit "[code] libellé", [2]=date,
    //   [3]=lot, [4]=emplacement source, [5]=emplacement destination, [6]=quantité.
    async function fetchClientProducts() {
        try {
            const partnerId = await getIdToProcess();

            if (!partnerId) {
                return null;
            }

            // Appel de l'API de traçabilité via le helper standard (session par cookie, v16 → v19).
            // get_main_lines attend un unique argument positionnel (objet de paramètres).
            const result = await odooRpc(
                'stock.traceability.report',
                'get_main_lines',
                [{
                    active_id: parseInt(partnerId),
                    auto_unfold: false,
                    model: 'res.partner',
                    lot_name: false,
                    ttype: false,
                    lang: 'fr_FR'
                }]
            );

            if (!Array.isArray(result)) {
                return null;
            }

            // Regrouper les produits par référence
            const groupedProducts = {};
            result.forEach((line) => {
                const cols = Array.isArray(line.columns) ? line.columns : [];

                // Référence : champ dédié sinon première colonne
                const reference = (line.reference || cols[0] || '').trim();
                // Nom produit : "[code] libellé" dans columns[1]
                const productCell = (cols[1] || '').trim();
                const productMatch = productCell.match(/\[(.*?)\]\s*(.*)/);
                const productCode = productMatch ? productMatch[1] : '';
                const productName = productMatch ? productMatch[2] : productCell;
                const date = (cols[2] || '').trim();
                const lot = (line.lot_name || cols[3] || '').trim();
                const locationDest = (line.location_destination || cols[5] || '').trim();
                const quantityRaw = (cols[6] || '').trim();
                // "1,00 Unités" -> 1.00
                const quantity = parseFloat(quantityRaw.replace(/\s/g, '').replace(',', '.')) || 0;

                if (!productCell) {
                    return;
                }

                // On ne retient que les mouvements sortants vers un client.
                const isClientMove =
                    line.usage === 'out' ||
                    /client/i.test(locationDest);

                if (!isClientMove) {
                    return;
                }

                const isExpress = /express/i.test(reference);
                const groupKey = reference || productName;

                if (!groupedProducts[groupKey]) {
                    groupedProducts[groupKey] = {
                        reference: reference,
                        date: date,
                        isExpress: isExpress,
                        products: {}
                    };
                }

                const productKey = `${productCode}-${productName}`;
                if (!groupedProducts[groupKey].products[productKey]) {
                    groupedProducts[groupKey].products[productKey] = {
                        code: productCode,
                        name: productName,
                        lots: [],
                        totalQuantity: 0
                    };
                }

                if (lot && !groupedProducts[groupKey].products[productKey].lots.includes(lot)) {
                    groupedProducts[groupKey].products[productKey].lots.push(lot);
                }
                groupedProducts[groupKey].products[productKey].totalQuantity += quantity;
            });

            // Transformer les données au format attendu par updateProductsList()
            const products = {
                result: {
                    records: Object.values(groupedProducts).flatMap((group) =>
                        Object.values(group.products).map(product => ({
                            name: product.name,
                            default_code: product.code,
                            type: group.isExpress ? 'express' : 'normal',
                            create_date: group.date,
                            description: `Référence: ${group.reference}\nLots: ${product.lots.join(', ')}\nQuantité: ${product.totalQuantity}`,
                            categ_id: [null, 'Produit client']
                        }))
                    )
                }
            };

            return products;
        } catch (error) {
            console.error('[PRODUITS] Erreur fetchClientProducts:', error);
            return null;
        }
    }

    // Fonction pour initialiser le thème
    function initializeTheme() {
        const savedTheme = localStorage.getItem('odoo-history-theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark-theme');
        }
    }

    // Fonction pour ouvrir un ticket dans un nouvel onglet
    function openTicketInNewTab(ticketId) {
        const baseUrl = window.location.origin;
        const ticketUrl = `${baseUrl}/web#id=${ticketId}&model=helpdesk.ticket&view_type=form&action=368`;
        window.open(ticketUrl, '_blank');
    }

    // Vérifie si le timer est en cours via API
    async function apiGetTimerState(ticketId) {
        const info = await odooRead('helpdesk.ticket', Number(ticketId), ['is_timer_running', 'timer_start']);
        if (!info) return 'unknown';
        return info.is_timer_running ? 'running' : 'stopped';
    }

    async function getEffectiveTimerState(ticketId) {
        const domState = domTimerState();
        if (domState === 'running' || domState === 'paused' || domState === 'stopped') {
            return domState;
        }

        const apiState = await apiGetTimerState(ticketId);
        if (apiState === 'running') return 'running';
        if (apiState === 'stopped') {
            return loadState(ticketId) === 'paused' ? 'paused' : 'stopped';
        }

        return loadState(ticketId);
    }

    // =========================================================
    // DÉTECTION ÉTAT DOM (fallback)
    // =========================================================
    function domTimerState() {
        // v19 + v16-v18: Chercher les boutons timer Odoo
        const pauseBtn = document.querySelector('button[name="action_timer_pause"][type="object"], button[name="action_timer_pause"], button[data-method="action_timer_pause"]');
        const resumeBtn = document.querySelector('button[name="action_timer_resume"][type="object"], button[name="action_timer_resume"], button[data-method="action_timer_resume"]');
        const startBtn = document.querySelector('button[name="action_timer_start"][type="object"], button[name="action_timer_start"], button[data-method="action_timer_start"]');

        if (pauseBtn) {
            return 'running';
        }
        if (resumeBtn) {
            return 'paused';
        }
        if (startBtn) {
            return 'stopped';
        }

        return 'unknown';
    }

    function normalizeStageText(text) {
        return (text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function isResolvedStageText(text) {
        const txt = normalizeStageText(text);
        return txt.includes('resolu') || txt.includes('resolved') || txt.includes('ferme') || txt.includes('cloture');
    }

    function isTicketResolved() {
        // On se fie UNIQUEMENT au libellé du stage actif (Résolu/Fermé/Clôturé).
        // (L'ancien test data-value="4" était faux en v19 : data-value = id/position du stage,
        //  pas "résolu" — ce qui ouvrait le panneau des raisons à tort sur des tickets en cours.)
        const currentStageEls = document.querySelectorAll(
            '.o_arrow_button_current, .o_statusbar_status .btn-primary, .o_statusbar_status button[aria-pressed="true"]'
        );

        return Array.from(currentStageEls).some(el => isResolvedStageText(el.textContent || ''));
    }

    function findAssignButton() {
        // v19: Chercher le bouton "Me l'assigner"
        const btn1 = document.querySelector('button[name="assign_ticket_to_self"]');
        if (btn1) return btn1;

        // Chercher par texte
        return Array.from(document.getElementsByTagName('button')).find(b => {
            const s = b.querySelector('span');
            const text = s ? s.textContent.trim().toLowerCase() : b.textContent.trim().toLowerCase();
            return text === "me l'assigner" || text === "assign to me";
        });
    }

    // Clique automatiquement le bouton natif "Me l'assigner" s'il apparaît (UI v19).
    // Attend qu'il soit visible et actif (jusqu'à ~1,5 s), puis clique une seule fois.
    async function clickAssignSelfIfPresent() {
        for (let i = 0; i < 10; i++) {
            const b = findAssignButton();
            if (b && b.offsetParent !== null && !b.disabled) {
                b.click();
                return true;
            }
            await wait(150);
        }
        return false;
    }

    // =========================================================
    // RELOAD PROPRE APRÈS ACTION API
    // =========================================================
    function reloadView() {
        // Déclenche un refresh Odoo sans rechargement complet de page
        try {
            const actionManager = document.querySelector('.o_action_manager');
            if (actionManager) {
                // Simuler F5 Odoo (raccourci interne)
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F5', bubbles: true }));
            }
        } catch (_) {}
        // Fallback: reload léger après 800ms
        setTimeout(() => {
            const saveBtn = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
            if (saveBtn) saveBtn.click();
        }, 400);
    }


    // =========================================================
    // STYLES GLOBAUX
    // =========================================================
    function injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
        /* === BOUTONS STATUSBAR — harmonisés, plus aérés === */
        #btn-traiter-appel, #btn-inserer-initiales {
            height: 32px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 7px !important;
            line-height: 1 !important;
            border-radius: 7px !important;
            font-weight: 600 !important;
            font-size: 12.5px !important;
            letter-spacing: .2px !important;
            padding: 0 15px !important;
            border: none !important;
            cursor: pointer !important;
            transition: transform .1s ease, box-shadow .15s ease, filter .12s ease !important;
            margin-right: 8px !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
            box-shadow: 0 1px 2px rgba(0,0,0,.18) !important;
        }
        #btn-traiter-appel svg, #btn-inserer-initiales svg { flex: 0 0 auto !important; }
        #btn-traiter-appel:hover, #btn-inserer-initiales:hover {
            filter: brightness(1.08) !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 3px 9px rgba(0,0,0,.26) !important;
        }
        #btn-traiter-appel:active, #btn-inserer-initiales:active { transform: translateY(0) !important; }
        #btn-traiter-appel.en-cours {
            background: #f59e0b !important; color: #fff !important;
            animation: pulseWarning 2s infinite;
        }
        #btn-traiter-appel.en-attente {
            background: #2563eb !important; color: #fff !important;
            animation: pulseAttente 2s ease-in-out infinite;
        }
        #btn-traiter-appel.en-pause   { background: #6c757d !important; color: #fff !important; }
        @keyframes pulseWarning {
            0%,100% { box-shadow: 0 0 0 0 rgba(245,158,11,.5); }
            70%      { box-shadow: 0 0 0 6px rgba(245,158,11,0); }
        }
        @keyframes pulseAttente {
            0%,100% { box-shadow: 0 0 0 0 rgba(37,99,235,.5); }
            70%      { box-shadow: 0 0 0 6px rgba(37,99,235,0); }
        }
        #btn-inserer-initiales { background: #17b6b2 !important; color: #fff !important; }

        /* === BOUTONS HISTORIQUE ET PRODUITS === */
        #showHistoryButton, #showProductsButton {
            position: relative;
            display: inline-flex !important;
            align-items: center;
            gap: 8px;
            margin: 10px 10px 10px 0;
            padding: 10px 18px;
            background: linear-gradient(135deg, #00A09D 0%, #008F8C 100%);
            color: white !important;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,160,157,0.25);
            transition: all 0.2s ease;
            text-transform: none;
            letter-spacing: 0.3px;
        }
        #showHistoryButton:hover, #showProductsButton:hover {
            background: linear-gradient(135deg, #008F8C 0%, #007F7D 100%);
            box-shadow: 0 4px 12px rgba(0,160,157,0.35);
            transform: translateY(-1px);
        }
        #showHistoryButton:active, #showProductsButton:active {
            transform: translateY(0px);
            box-shadow: 0 2px 6px rgba(0,160,157,0.25);
        }
        #showHistoryButton i, #showProductsButton i {
            font-size: 15px;
            margin-right: 4px;
        }

        /* === CONTENEURS HISTORIQUE ET PRODUITS === */
        #zone_historique_tickets, #zone_produits_client {
            border: 1px solid #e0e0e0;
            padding: 20px;
            margin: 20px 0;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            height: 70vh;
            min-height: 500px;
            max-height: 800px;
            overflow: hidden;
            display: none;
            flex-direction: column;
            color: #333333;
            position: relative;
            resize: vertical;
        }
        #zone_historique_tickets.visible, #zone_produits_client.visible {
            display: flex !important;
        }

        /* === BOUTON THÈME SOMBRE === */
        .theme-toggle-container {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: 15px;
        }
        .theme-toggle-btn {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid #e0e0e0;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.3s ease;
            background: #ffffff;
            color: #666666;
        }
        .theme-toggle-btn:hover {
            transform: scale(1.1);
            border-color: #00A09D;
            color: #00A09D;
        }
        .theme-toggle-btn.active {
            background: #00A09D;
            color: white;
            border-color: #00A09D;
        }

        /* === THÈME SOMBRE === */
        .dark-theme #zone_historique_tickets,
        .dark-theme #zone_produits_client {
            background-color: #1f2937;
            border-color: #374151;
            color: #e5e7eb;
        }
        .dark-theme .historique-header,
        .dark-theme .produits-header {
            background: #1f2937;
            border-bottom-color: #374151;
            color: #e5e7eb;
        }
        .dark-theme .historique-header-left,
        .dark-theme .produits-header-left {
            color: #60a5fa;
        }
        .dark-theme .ticket-item,
        .dark-theme .product-item {
            background-color: #1f2937;
            border-color: #374151;
            color: #e5e7eb;
        }
        .dark-theme .ticket-item:hover,
        .dark-theme .product-item:hover {
            background-color: #2d3748;
        }
        .dark-theme .ticket-title,
        .dark-theme .product-title {
            color: #f3f4f6 !important;
        }
        .dark-theme .ticket-date,
        .dark-theme .product-date {
            color: #d1d5db !important;
        }
        .dark-theme .ticket-assignee {
            color: #d1d5db !important;
        }
        .dark-theme .ticket-description,
        .dark-theme .product-description {
            color: #e5e7eb !important;
        }
        .dark-theme .filter-input {
            background-color: #374151;
            border-color: #4b5563;
            color: #e5e7eb;
        }
        .dark-theme .filter-input::placeholder {
            color: #9ca3af;
        }
        .dark-theme .no-tickets,
        .dark-theme .no-products {
            color: #9ca3af;
        }

        /* === STATUTS EN THÈME SOMBRE === */
        .dark-theme .ticket-status.nouveau { background: #1e3a8a; color: #93c5fd; }
        .dark-theme .ticket-status.en-cours { background: #92400e; color: #fbbf24; }
        .dark-theme .ticket-status.en-attente { background: #581c87; color: #c084fc; }
        .dark-theme .ticket-status.resolu { background: #14532d; color: #86efac; }
        .dark-theme .ticket-status.ferme { background: #374151; color: #d1d5db; }
        .dark-theme .ticket-status.annule { background: #7f1d1d; color: #fca5a5; }

        /* === ÉQUIPES EN THÈME SOMBRE === */
        .dark-theme .ticket-team[data-team="Logiciel"] {
            background: rgba(76, 175, 80, 0.2);
            color: #81c784;
        }
        .dark-theme .ticket-team[data-team="Materiel"] {
            background: rgba(33, 150, 243, 0.2);
            color: #64b5f6;
        }
        .dark-theme .ticket-team[data-team="RMA"] {
            background: rgba(255, 152, 0, 0.2);
            color: #ffb74d;
        }
        .dark-theme .ticket-team[data-team="MaterielN2"] {
            background: rgba(156, 39, 176, 0.2);
            color: #ba68c8;
        }
        .dark-theme .ticket-team[data-team="MailSAV"] {
            background: rgba(233, 30, 99, 0.2);
            color: #f06292;
        }
        .dark-theme .ticket-team[data-team="Winteam"] {
            background: rgba(0, 188, 212, 0.2);
            color: #4dd0e1;
        }

        /* === EN-TÊTES === */
        .historique-header, .produits-header {
            position: sticky;
            top: 0;
            background: #ffffff;
            z-index: 10;
            padding-bottom: 15px;
            margin-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
            color: #333333;
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
        }
        .historique-header-left, .produits-header-left {
            display: flex;
            align-items: center;
            gap: 15px;
            font-weight: 700;
            font-size: 16px;
            color: #00A09D;
        }
        .historique-header-right, .produits-header-right {
            flex: 1;
            display: flex;
            justify-content: flex-end;
        }

        /* === HISTORIQUE TICKETS — LISTE CLIENTS === */
        .btn-partner-list-history {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            margin-right: 8px;
            padding: 0;
            border: none;
            border-radius: 5px;
            background: linear-gradient(135deg, #00A09D 0%, #008F8C 100%);
            color: #fff !important;
            cursor: pointer;
            vertical-align: middle;
            flex-shrink: 0;
            box-shadow: 0 1px 4px rgba(0,160,157,0.3);
            transition: all 0.2s ease;
        }
        .btn-partner-list-history:hover {
            background: linear-gradient(135deg, #008F8C 0%, #007F7D 100%);
            transform: translateY(-1px);
        }
        .partner-history-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.55);
            z-index: 2147483645;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .partner-history-modal {
            background: #ffffff;
            border-radius: 12px;
            width: min(960px, 95vw);
            max-height: 90vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.35);
        }
        .partner-history-modal-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 14px 18px;
            background: linear-gradient(135deg, #00A09D 0%, #008F8C 100%);
            color: #fff;
            font-weight: 600;
        }
        .partner-history-modal-close {
            border: none;
            background: rgba(255,255,255,0.15);
            color: #fff;
            width: 32px;
            height: 32px;
            border-radius: 6px;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }
        .partner-history-modal-close:hover {
            background: rgba(255,255,255,0.25);
        }
        .partner-history-modal-body {
            display: flex !important;
            height: 70vh;
            min-height: 420px;
            max-height: calc(90vh - 60px);
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            resize: none !important;
        }
        .dark-theme .partner-history-modal {
            background: #1f2937;
        }
        .dark-theme .partner-history-modal-toolbar {
            background: linear-gradient(135deg, #0f766e 0%, #115e59 100%);
        }

        /* === LISTES === */
        #ticketsList, #productsList {
            overflow-y: auto;
            flex: 1;
            padding-right: 10px;
        }
        #ticketsList::-webkit-scrollbar, #productsList::-webkit-scrollbar {
            width: 8px;
        }
        #ticketsList::-webkit-scrollbar-track, #productsList::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 4px;
        }
        #ticketsList::-webkit-scrollbar-thumb, #productsList::-webkit-scrollbar-thumb {
            background: #c1c1c1;
            border-radius: 4px;
        }

        /* === ÉLÉMENTS TICKET AVEC COULEURS PAR ÉQUIPE === */
        .ticket-item {
            padding: 16px;
            background-color: #ffffff;
            margin-bottom: 12px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            transition: all 0.3s ease;
            color: #333333;
            cursor: pointer;
            position: relative;
            overflow: hidden;
        }
        .ticket-item::before {
            content: '';
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 4px;
            background: #6B7280;
        }
        .ticket-item:hover {
            background-color: #f8f9fa;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        /* Couleurs par équipe */
        .ticket-item[data-team="Logiciel"]::before { background: #4CAF50; }
        .ticket-item[data-team="Materiel"]::before { background: #2196F3; }
        .ticket-item[data-team="RMA"]::before { background: #FF9800; }
        .ticket-item[data-team="MaterielN2"]::before { background: #9C27B0; }
        .ticket-item[data-team="MailSAV"]::before { background: #E91E63; }
        .ticket-item[data-team="Winteam"]::before { background: #00BCD4; }

        .ticket-item[data-team="Logiciel"]:hover {
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
        }
        .ticket-item[data-team="Materiel"]:hover {
            box-shadow: 0 4px 12px rgba(33, 150, 243, 0.3);
        }
        .ticket-item[data-team="RMA"]:hover {
            box-shadow: 0 4px 12px rgba(255, 152, 0, 0.3);
        }
        .ticket-item[data-team="MaterielN2"]:hover {
            box-shadow: 0 4px 12px rgba(156, 39, 176, 0.3);
        }
        .ticket-item[data-team="MailSAV"]:hover {
            box-shadow: 0 4px 12px rgba(233, 30, 99, 0.3);
        }
        .ticket-item[data-team="Winteam"]:hover {
            box-shadow: 0 4px 12px rgba(0, 188, 212, 0.3);
        }

        .ticket-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }
        .ticket-title {
            font-weight: 600;
            color: #333333;
            font-size: 15px;
            line-height: 1.4;
            flex: 1;
            margin-right: 15px;
        }
        .ticket-date {
            color: #666666;
            font-size: 12px;
            white-space: nowrap;
        }
        .ticket-info {
            display: flex;
            gap: 15px;
            margin-top: 12px;
            color: #333333;
            font-size: 13px;
            flex-wrap: wrap;
        }

        /* === STATUTS COLORÉS === */
        .ticket-status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .ticket-status.nouveau { background: #E3F2FD; color: #1976D2; }
        .ticket-status.en-cours { background: #FFF3E0; color: #F57C00; }
        .ticket-status.en-attente { background: #F3E5F5; color: #7B1FA2; }
        .ticket-status.resolu { background: #E8F5E8; color: #388E3C; }
        .ticket-status.ferme { background: #FAFAFA; color: #616161; }
        .ticket-status.annule { background: #FFEBEE; color: #D32F2F; }

        /* === ÉQUIPES COLORÉES === */
        .ticket-team {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
        }
        .ticket-team[data-team="Logiciel"] {
            background: rgba(76, 175, 80, 0.1);
            color: #4CAF50;
        }
        .ticket-team[data-team="Materiel"] {
            background: rgba(33, 150, 243, 0.1);
            color: #2196F3;
        }
        .ticket-team[data-team="RMA"] {
            background: rgba(255, 152, 0, 0.1);
            color: #FF9800;
        }
        .ticket-team[data-team="MaterielN2"] {
            background: rgba(156, 39, 176, 0.1);
            color: #9C27B0;
        }
        .ticket-team[data-team="MailSAV"] {
            background: rgba(233, 30, 99, 0.1);
            color: #E91E63;
        }
        .ticket-team[data-team="Winteam"] {
            background: rgba(0, 188, 212, 0.1);
            color: #00BCD4;
        }

        .ticket-assignee {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #666666;
        }

        /* === ÉLÉMENTS PRODUIT === */
        .product-item {
            padding: 16px;
            background-color: #ffffff;
            margin-bottom: 12px;
            border: 1px solid #e0e0e0;
            border-left: 4px solid #6B7280;
            border-radius: 8px;
            transition: all 0.3s ease;
            color: #333333;
        }
        .product-item:hover {
            background-color: #f8f9fa;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(107, 114, 128, 0.2);
        }
        .product-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 12px;
        }
        .product-title {
            font-weight: 600;
            color: #333333;
            font-size: 15px;
            line-height: 1.4;
            flex: 1;
            margin-right: 15px;
        }
        .product-date {
            color: #666666;
            font-size: 12px;
            white-space: nowrap;
        }
        .product-info {
            display: flex;
            gap: 15px;
            margin-top: 12px;
            color: #333333;
            font-size: 13px;
            flex-wrap: wrap;
        }
        .product-type {
            background-color: #6B7280;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* === FILTRES === */
        .ticket-filters, .product-filters {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
            flex-wrap: wrap;
        }
        .filter-input {
            padding: 8px 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 13px;
            background-color: #ffffff;
            color: #333333;
            transition: all 0.3s ease;
            min-width: 150px;
        }
        .filter-input:focus {
            outline: none;
            border-color: #00A09D;
            box-shadow: 0 0 0 3px rgba(0,160,157,0.1);
        }
        .filter-input::placeholder {
            color: #999999;
        }

        /* === MESSAGES VIDES === */
        .no-tickets, .no-products {
            text-align: center;
            padding: 40px 20px;
            color: #666666;
            font-style: italic;
            font-size: 15px;
        }

        /* === CONTENEUR BOUTONS === */
        .buttons-container {
            margin: 20px 0 5px 0;
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
        }

        /* Bouton "ME L'ASSIGNER" natif Odoo — harmonisé avec les autres */
        button[name="assign_ticket_to_self"] {
            height: 32px !important;
            line-height: 1 !important;
            border-radius: 7px !important;
            font-size: 12.5px !important;
            letter-spacing: .2px !important;
            padding: 0 15px !important;
            font-weight: 600 !important;
            vertical-align: middle !important;
            box-sizing: border-box !important;
            color: #fff !important;
            background: #3b4658 !important;
            border: none !important;
            margin-right: 8px !important;
            box-shadow: 0 1px 2px rgba(0,0,0,.18) !important;
            transition: background .12s ease, transform .1s ease, box-shadow .15s ease !important;
        }
        button[name="assign_ticket_to_self"]:hover {
            background: #2c3543 !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 3px 9px rgba(0,0,0,.26) !important;
        }
        button[name="assign_ticket_to_self"]:active { transform: translateY(0) !important; }
        /* Bouton désassignation */
        .clear-assign-button {
            background: none; border: none; color: #dc3545;
            cursor: pointer; font-size: 14px; padding: 0;
            position: absolute; right: 34px; top: 50%;
            transform: translateY(-50%); z-index: 2; line-height: 1;
        }
        /* === INDICATEUR EN COURS — dans le formulaire (texte simple, sans halo) === */
        #texte-clignotant-container {
            display: block;
            margin: 0 0 6px 0;
            color: #7c3aed;
            font-weight: 600;
            background: none !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
        }
        #texte-clignotant-container span {
            color: inherit; font-weight: inherit; font-size: inherit;
        }
        @keyframes letterWave {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-2px); }
        }
        /* === BOUTON CLÔTURER === */
        button[name="close_ticket"][type="object"] {
            background: #dc2626 !important; color: #fff !important;
            border: none !important; border-radius: 4px !important; font-weight: 600 !important;
        }
        /* === MASQUER BOUTONS TIMER NATIFS === */
        button[name="action_timer_start"],
        button[name="action_timer_pause"],
        button[name="action_timer_resume"],
        button[name="action_timer_stop"] {
            visibility: hidden !important; position: absolute !important; left: -9999px !important;
        }
        /* === ANIMATIONS LISTE TICKETS === */
        @keyframes ticketEnTraitement {
            0%,100% { box-shadow: 0 0 0 0 rgba(139,92,246,.35); background-color: rgba(139,92,246,.07); }
            50%      { box-shadow: 0 0 10px 0 rgba(139,92,246,.55); background-color: rgba(139,92,246,.14); }
        }
        .o_list_view .o_data_row.ticket-en-traitement {
            position: relative !important; z-index: 1 !important;
            border: 2px solid rgba(139,92,246,.7) !important; border-radius: 4px !important;
        }
        .o_list_view .o_data_row.ticket-en-traitement::after {
            content: ''; position: absolute; inset: -1px; pointer-events: none;
            border-radius: 3px; animation: ticketEnTraitement 2s ease-in-out infinite; z-index: 1 !important;
        }
        @keyframes ticketBloquant {
            0%,100% { box-shadow: 0 0 0 0 rgba(220,53,69,.4); }
            50%      { box-shadow: 0 0 8px 0 rgba(220,53,69,.6); }
        }
        .o_list_view .o_data_row.ticket-bloquant {
            position: relative !important; z-index: 1 !important;
            border: 2px solid rgba(220,53,69,.8) !important; border-radius: 4px !important;
        }
        .o_list_view .o_data_row.ticket-bloquant::after {
            content: ''; position: absolute; inset: -1px; pointer-events: none;
            border-radius: 3px; animation: ticketBloquant 2s infinite; z-index: 1 !important;
        }
        @keyframes rdvOrangeBg { from { background: rgba(255,152,0,.15); } to { background: rgba(255,152,0,.25); } }
        @keyframes rdvRougeBg  { from { background: rgba(229,57,53,.15); } to { background: rgba(229,57,53,.25); } }
        @keyframes rdvDepasseBg {
            0%   { background: rgba(229,57,53,.25); box-shadow: 0 0 8px rgba(229,57,53,.5); }
            50%  { background: rgba(183,28,28,.35);  box-shadow: 0 0 12px rgba(229,57,53,.6); }
            100% { background: rgba(229,57,53,.25); box-shadow: 0 0 8px rgba(229,57,53,.5); }
        }
        .o_list_view .rdv-clignote-orange::after { animation: rdvOrangeBg 1.5s infinite alternate; }
        .o_list_view .rdv-clignote-rouge::after  { animation: rdvRougeBg 1.2s infinite alternate; }
        .o_list_view .rdv-clignote-depasse::after { animation: rdvDepasseBg 1s infinite alternate; }
        .o_list_view .rdv-clignote-orange::after,
        .o_list_view .rdv-clignote-rouge::after,
        .o_list_view .rdv-clignote-depasse::after {
            content: ''; position: absolute; inset: -1px; pointer-events: none;
            border-radius: 2px; z-index: 1 !important;
        }
        .o_list_view .rdv-clignote-orange,
        .o_list_view .rdv-clignote-rouge,
        .o_list_view .rdv-clignote-depasse { position: relative !important; z-index: 1 !important; }
        /* === CLIGNOTEMENT TAG INTERNET — orange vif très visible === */
        @keyframes internetBlink {
            0%,100% { background-color: rgba(255,140,0,.25); box-shadow: 0 0 0 0 rgba(255,140,0,0); color: #ff8c00; }
            50%      { background-color: rgba(255,140,0,.55); box-shadow: 0 0 10px 2px rgba(255,140,0,.6); color: #fff; }
        }
        .internet-blink {
            animation: internetBlink 1s infinite;
            position: relative; z-index: 1;
            border: 1px solid rgba(255,140,0,.7) !important;
            font-weight: 700 !important;
        }
        /* === BADGE CLIENT PRIORITAIRE === */
        .badge-client-prioritaire {
            display: block;
            background: rgba(220,38,38,.18);
            color: #ef4444;
            border: 1px solid rgba(220,38,38,.7);
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            padding: 1px 6px;
            margin-top: 3px;
            white-space: nowrap;
            letter-spacing: .3px;
            text-transform: uppercase;
            box-shadow: 0 0 6px 2px rgba(220,38,38,.55), 0 0 14px 4px rgba(220,38,38,.25);
            position: relative;
            z-index: 10;
            animation: none !important;
            isolation: isolate;
            opacity: 1 !important;
        }
        .badge-client-new {
            display: inline-block;
            background: rgba(6,182,212,.18);
            color: #22d3ee;
            border: 1px solid rgba(6,182,212,.7);
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            padding: 1px 7px;
            margin-top: 3px;
            white-space: nowrap;
            letter-spacing: .3px;
            text-transform: uppercase;
            box-shadow: 0 0 5px 1px rgba(6,182,212,.4);
            position: relative;
            z-index: 10;
            animation: none !important;
            isolation: isolate;
            opacity: 1 !important;
        }
        .rdv-notif-odoo {
            position: fixed; bottom: 24px; right: 24px;
            background: #1e2330; color: #e8eaf0;
            border-radius: 12px; font-size: 13px; font-weight: 500;
            z-index: 99999; box-shadow: 0 8px 32px rgba(0,0,0,.45);
            min-width: 320px; max-width: 420px;
            border-left: 4px solid #f59e0b;
            overflow: hidden;
        }
        .rdv-notif-odoo.depasse { border-left-color: #ef4444; animation: notifPulse 1.5s infinite alternate; }
        .rdv-notif-odoo.rouge   { border-left-color: #f97316; }
        @keyframes notifPulse {
            0%   { box-shadow: 0 8px 32px rgba(239,68,68,.3); }
            100% { box-shadow: 0 8px 40px rgba(239,68,68,.6); }
        }
        .rdv-notif-inner { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
        .rdv-notif-header { display: flex; align-items: center; gap: 8px; }
        .rdv-notif-icon { font-size: 18px; flex-shrink: 0; }
        .rdv-notif-title { font-weight: 700; font-size: 13px; color: #fff; flex: 1; }
        .rdv-notif-close { background: none; border: none; color: #6b7280; cursor: pointer; font-size: 16px; padding: 0; line-height: 1; }
        .rdv-notif-close:hover { color: #e5e7eb; }
        .rdv-notif-body { display: flex; flex-direction: column; gap: 2px; padding-left: 26px; }
        .rdv-notif-pharma { font-weight: 700; color: #60a5fa; font-size: 13px; }
        .rdv-notif-who   { color: #9ca3af; font-size: 11px; }
        .rdv-notif-time  { color: #fbbf24; font-size: 12px; font-weight: 600; }
        /* === DOUBLON TOAST — même style que les notifs RDV === */
        .doublon-toast {
            position: fixed; bottom: 24px; right: 24px;
            background: #1e2330; color: #e8eaf0;
            border-radius: 12px; font-size: 13px; font-weight: 500;
            z-index: 99998; box-shadow: 0 8px 32px rgba(0,0,0,.45);
            min-width: 280px; max-width: 420px;
            border-left: 4px solid #f59e0b;
            overflow: hidden;
        }
        .doublon-toast .doublon-toast-inner { padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
        .doublon-toast .doublon-toast-icon { font-size: 18px; flex-shrink: 0; }
        .doublon-toast .doublon-toast-text { flex: 1; font-weight: 600; color: #fff; font-size: 13px; }
        .doublon-toast .close { background: none; border: none; color: #6b7280; cursor: pointer; font-size: 16px; padding: 0; line-height: 1; flex-shrink: 0; }
        .doublon-toast .close:hover { color: #e5e7eb; }
        /* === CATÉGORIES COLORÉES === */
        [data-styled-category="1"] { border-radius: 6px; padding: 2px 8px; display: inline-block; font-weight: 600; }
        /* === BADGE VENTES — style stat button Odoo, sans bulle === */
        #badge-devis-client { display:inline-flex; align-items:stretch; vertical-align:middle; margin-left:4px; flex-shrink:0; align-self:stretch; }
        #badge-devis-client .bd-btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            height: 44px; min-width: 80px; padding: 0 12px;
            background: transparent; border: 1px solid #dee2e6;
            border-radius: 6px; cursor: pointer; color: inherit;
            font-size: 12px; font-weight: 500;
            transition: background .1s;
            box-sizing: border-box;
            flex-shrink: 0;
        }
        .o_form_view.o_form_editable #badge-devis-client .bd-btn { border-color: #adb5bd; }
        #badge-devis-client .bd-btn:hover { background: rgba(0,0,0,.04); }
        #badge-devis-client .bd-btn.empty { opacity: .6; }
        #badge-devis-client .bd-inner { display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.2; height:100%; }
        #badge-devis-client .bd-num { font-size: 16px; font-weight: 700; color: #017e84; line-height:1; }
        #badge-devis-client .bd-btn.empty .bd-num { color: #6c757d; }
        #badge-devis-client .bd-lbl { font-size: 10px; color: #6c757d; text-transform: uppercase; letter-spacing: .4px; line-height:1; margin-top:2px; }
        /* Popup ventes — plus compact */
        .popup-devis-odoobtn {
            position:fixed; top:80px; right:24px; background:#1a2030; color:#e0e6f0;
            border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,.4); z-index:6000;
            width:900px; max-height:65vh; overflow:auto;
            border:1px solid rgba(255,255,255,.08);
        }
        .popup-devis-odoobtn header { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:700; font-size:13px; }
        .popup-devis-odoobtn header button { all:unset; cursor:pointer; color:#1DE9B6; font-size:12px; }
        .popup-devis-odoobtn ul { list-style:none; margin:0; padding:4px 0; }
        .popup-devis-odoobtn li { padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.05); display:grid; grid-template-columns:100px 1fr auto auto; gap:12px; align-items:center; font-size:12px; }
        .popup-devis-odoobtn .so-ref { color:#8be9fd; font-weight:700; font-size:13px; }
        .popup-devis-odoobtn .so-title { color:#ffcc80; font-size:11px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .popup-devis-odoobtn .muted { color:#7a8a96; font-size:11px; text-align:right; white-space:nowrap; }
        .popup-devis-odoobtn .so-open-btn {
            all:unset; cursor:pointer; padding:4px 10px; border-radius:4px;
            background:rgba(29,233,182,.15); color:#1DE9B6; font-size:11px; font-weight:600;
            border:1px solid rgba(29,233,182,.3); white-space:nowrap;
        }
        .popup-devis-odoobtn .so-open-btn:hover { background:rgba(29,233,182,.28); }
        /* Bon de commande = vert vif, Envoyé = bleu, Terminé = vert foncé */
        .popup-devis-odoobtn li.state-sale  { background:rgba(0,200,100,.10); border-left:3px solid #00c864; }
        .popup-devis-odoobtn li.state-done  { background:rgba(30,80,50,.20);  border-left:3px solid #1a6640; }
        .popup-devis-odoobtn li.state-sent  { background:rgba(30,100,200,.10); border-left:3px solid #1e64c8; }
        .popup-devis-odoobtn li.state-cancel { background:rgba(229,57,53,.10); border-left:3px solid #e53935; }
        .popup-devis-odoobtn li:hover { background:rgba(255,255,255,.04); }
        .popup-devis-odoobtn li.expanded { display:flex; flex-direction:column; align-items:stretch; }
        .popup-devis-odoobtn .so-lines { width:100%; background:rgba(255,255,255,.03); border-left:2px solid rgba(255,255,255,.08); margin:6px 0 0; padding:6px 10px; border-radius:4px; }
        .popup-devis-odoobtn .so-lines .line { display:grid; grid-template-columns:1fr 60px 90px 100px; gap:8px; align-items:center; padding:3px 0; border-bottom:1px dashed rgba(255,255,255,.05); font-size:11px; }
        .popup-devis-odoobtn .so-lines .line.header { font-weight:700; color:#cfd8dc; border-bottom:1px solid rgba(255,255,255,.10); }
        .popup-devis-odoobtn .so-lines .line:last-child { border-bottom:none; }
        .popup-devis-odoobtn .so-lines .pname { color:#eceff1; }
        .popup-devis-odoobtn .so-lines .qty,.popup-devis-odoobtn .so-lines .price,.popup-devis-odoobtn .so-lines .subtotal { text-align:right; color:#b0bec5; }
        /* === BADGE DOUBLONS — même style stat button Odoo, sans bulle === */
        #badge-tickets-ouverts { display:inline-flex; align-items:stretch; vertical-align:middle; margin-left:4px; flex-shrink:0; align-self:stretch; }
        #badge-tickets-ouverts .to-btn {
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            height: 44px; min-width: 80px; padding: 0 12px;
            background: transparent; border: 1px solid #dee2e6;
            border-radius: 6px; cursor: pointer; color: inherit;
            font-size: 12px; font-weight: 500;
            transition: background .1s;
            box-sizing: border-box;
            flex-shrink: 0;
            box-shadow: none;
        }
        #badge-tickets-ouverts .to-btn:hover { background: rgba(0,0,0,.04); }
        #badge-tickets-ouverts .to-btn.alert {
            border-color: rgba(220,53,69,.7);
            animation: doublonHalo 1.8s ease-in-out infinite;
            will-change: filter;
        }
        @keyframes doublonHalo {
            0%,100% { filter: drop-shadow(0 0 2px rgba(220,53,69,.3)); }
            50%      { filter: drop-shadow(0 0 10px rgba(220,53,69,.9)); }
        }
        #badge-tickets-ouverts .to-inner { display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.2; height:100%; }
        #badge-tickets-ouverts .to-num { font-size: 16px; font-weight: 700; color: #6c757d; line-height:1; }
        #badge-tickets-ouverts .to-btn.alert .to-num { color: #dc3545; }
        #badge-tickets-ouverts .to-lbl { font-size: 10px; color: #6c757d; text-transform: uppercase; letter-spacing: .4px; line-height:1; margin-top:2px; }
        .popup-tickets-ouverts {
            position:fixed; top:80px; right:24px; background:#1a2030; color:#e0e6f0;
            border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,.4); z-index:6100;
            width:580px; max-height:55vh; overflow:hidden; display:flex; flex-direction:column;
            border:1px solid rgba(255,255,255,.08);
        }
        .popup-tickets-ouverts header { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.08); font-weight:700; font-size:13px; }
        .popup-tickets-ouverts header button { all:unset; cursor:pointer; color:#1DE9B6; font-size:12px; }
        .popup-tickets-ouverts .content { display:flex; overflow:auto; }
        .popup-tickets-ouverts ul { list-style:none; margin:0; padding:4px 0; width:100%; }
        .popup-tickets-ouverts li { padding:7px 12px; border-bottom:1px solid rgba(255,255,255,.05); display:grid; grid-template-columns:1fr 130px 120px; gap:10px; align-items:center; cursor:pointer; font-size:12px; }
        .popup-tickets-ouverts li:hover { background:rgba(255,255,255,.04); }
        .popup-tickets-ouverts .muted { color:#7a8a96; font-size:11px; }
        .popup-tickets-ouverts .team { color:#cfd8dc; font-size:11px; }
        `;
        document.head.appendChild(s);
    }

    // =========================================================
    // TEXTE CLIGNOTANT "EN COURS"
    // =========================================================
    function addBlinkText() {
        // Déjà présent ?
        if (document.getElementById('texte-clignotant-container')) return;

        // Champ "Réponse à la demande" (zone éditable)
        const selectors = [
            '.o_field_html[name="request_answer"] .note-editable.odoo-editor-editable',
            '.o_field_html[name="request_answer"] .note-editable',
            '[name="request_answer"] .note-editable',
            '.o_field_widget[name="request_answer"] .odoo-editor-editable',
            'div#request_answer.note-editable',
            'div.note-editable.odoo-editor-editable[contenteditable="true"]'
        ];

        let reponseField = null;
        for (const selector of selectors) {
            reponseField = document.querySelector(selector);
            if (reponseField) break;
        }
        if (!reponseField) return;

        // Indicateur simple et propre — même balise que le marqueur enregistré en base
        const p = document.createElement('p');
        p.id = 'texte-clignotant-container';
        p.setAttribute('data-tm-traitement', '1');
        p.style.cssText = 'margin:0 0 6px 0;color:#7c3aed;font-weight:600;';
        p.textContent = "Traitement de l'appel en cours...";

        if (reponseField.firstChild) reponseField.insertBefore(p, reponseField.firstChild);
        else reponseField.appendChild(p);
    }

    function removeBlinkText() {
        // Retire le marqueur quel que soit son support (id injecté ou attribut persisté)
        document.getElementById('texte-clignotant-container')?.remove();
        document.querySelectorAll('[data-tm-traitement="1"]').forEach(el => el.remove());
        // L'attribut data-* peut avoir été supprimé par Odoo au rechargement : retirer aussi par texte
        const editor = document.querySelector(
            '.o_field_html[name="request_answer"], [name="request_answer"], div#request_answer'
        );
        if (editor) {
            editor.querySelectorAll('p').forEach(p => {
                if (isMarkerText(p.textContent)) p.remove();
            });
        }
    }

    // Normalise un texte pour comparer le marqueur (insensible à la casse, apostrophes, espaces)
    function normalizeMarkerText(t) {
        return (t || '').toLowerCase().replace(/[\u2019']/g, "'").replace(/\s+/g, ' ').trim();
    }
    // Le texte correspond-il au marqueur "Traitement de l'appel en cours..." ?
    function isMarkerText(t) {
        return normalizeMarkerText(t).includes("traitement de l'appel en cours");
    }

    // Le ticket affiché est-il "en traitement" ? (marqueur présent dans l'éditeur de réponse)
    function isTraitementActive() {
        if (document.getElementById('texte-clignotant-container')) return true;
        const editor = document.querySelector(
            '.o_field_html[name="request_answer"], [name="request_answer"], div#request_answer'
        );
        if (editor) {
            // Détection par attribut dédié...
            if (editor.querySelector('[data-tm-traitement="1"]')) return true;
            // ...ou par texte (l'attribut data-* peut être supprimé par le sanitizer Odoo)
            if (isMarkerText(editor.textContent)) return true;
        }
        return false;
    }

    // =========================================================
    // BOUTON TRAITER L'APPEL — LOGIQUE PRINCIPALE
    // =========================================================
    function updateTraiterBtn(btn, isTreating) {
        const phoneIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z"/></svg>';
        const pauseIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>';
        btn.id = 'btn-traiter-appel';
        btn.className = '';            // pas de classe en-cours/en-attente => aucun effet de couleur / clignotement
        if (isTreating) {
            btn.innerHTML = pauseIcon + 'Mettre en attente';
            btn.style.backgroundColor = '#64748b';
        } else {
            btn.innerHTML = phoneIcon + "Traiter l'appel";
            btn.style.backgroundColor = '#0d9488';
        }
    }

    // Marqueur "en traitement" géré directement en base (indépendant de l'éditeur Owl).
    const TM_MARKER_TEXT = "Traitement de l'appel en cours...";
    const TM_MARKER_HTML = '<p data-tm-traitement="1" style="margin:0 0 6px 0;color:#7c3aed;font-weight:600;">' + TM_MARKER_TEXT + '</p>';

    async function setTraitementMarker(ticketId, add) {
        try {
            const rec = await odooRead('helpdesk.ticket', Number(ticketId), ['request_answer']);
            let html = (rec && typeof rec.request_answer === 'string') ? rec.request_answer : '';
            // Toujours retirer tout marqueur existant (évite les doublons empilés)
            html = stripTraitementMarkerHtml(html);
            if (add) html = TM_MARKER_HTML + html;
            await odooWrite('helpdesk.ticket', Number(ticketId), { request_answer: html });
            return true;
        } catch (e) {
            console.warn('[TRAITER] Écriture marqueur échouée:', e);
            return false;
        }
    }

    // Retire de l'HTML tous les marqueurs de traitement, par attribut ET par texte.
    // (Odoo peut supprimer l'attribut data-* : on s'appuie alors sur le texte.)
    function stripTraitementMarkerHtml(html) {
        if (!html) return '';
        try {
            const doc = new DOMParser().parseFromString('<div id="__tm_wrap">' + html + '</div>', 'text/html');
            const wrap = doc.getElementById('__tm_wrap');
            if (!wrap) throw new Error('no wrap');
            wrap.querySelectorAll('p').forEach(p => {
                if (p.getAttribute('data-tm-traitement') === '1' || isMarkerText(p.textContent)) {
                    p.remove();
                }
            });
            return wrap.innerHTML;
        } catch (e) {
            // Fallback regex si DOMParser indisponible
            return html.replace(/<p[^>]*data-tm-traitement="1"[^>]*>[\s\S]*?<\/p>/gi, '');
        }
    }

    // Restaure l'état du bouton de façon fiable en lisant la base (source de vérité).
    // Indépendant du timing de rendu de l'éditeur et du nettoyage des attributs data-*.
    async function restoreTraiterBtnState(btn, ticketId) {
        try {
            const rec = await odooRead('helpdesk.ticket', Number(ticketId), ['request_answer']);
            const html = (rec && typeof rec.request_answer === 'string') ? rec.request_answer : '';
            const active = isMarkerText(html);
            updateTraiterBtn(btn, active);
            saveState(ticketId, active ? 'running' : 'stopped');
        } catch (e) {
            // En cas d'échec API, on garde l'état déduit du DOM/localStorage
        }
    }

    async function handleTraiterClick(btn) {
        if (state.isProcessing) return;
        state.isProcessing = true;
        btn.disabled = true;

        const ticketId = getTicketIdFromPage();
        if (!ticketId) {
            alert("Impossible de trouver l'ID du ticket. Assurez-vous d'être sur un formulaire de ticket.");
            state.isProcessing = false;
            btn.disabled = false;
            return;
        }

        try {
            const textPresent = isTraitementActive();

            if (textPresent) {
                // METTRE EN ATTENTE : retirer le marqueur (DOM + base)
                removeBlinkText();
                saveState(ticketId, 'stopped');
                updateTraiterBtn(btn, false);
                await setTraitementMarker(ticketId, false);
            } else {
                // TRAITER L'APPEL : s'assigner le ticket + poser le marqueur

                // 1) Affichage immédiat dans l'éditeur (visuel) — survit aussi à une sauvegarde manuelle
                addBlinkText();

                // 2) S'assigner le ticket côté serveur (sans déclencher la sauvegarde du formulaire Owl)
                await odooCall('helpdesk.ticket', 'assign_ticket_to_self', [Number(ticketId)]);

                // 2b) Si le bouton natif "Me l'assigner" est affiché (UI v19), le cliquer automatiquement
                //     pour refléter l'assignation dans le formulaire.
                clickAssignSelfIfPresent();

                // 3) Poser le marqueur directement en base (persistant, visible par tous)
                const ok = await setTraitementMarker(ticketId, true);
                if (!ok) {
                    alert("L'enregistrement a échoué. Vérifie que tu es bien connecté.");
                }

                saveState(ticketId, 'running');
                updateTraiterBtn(btn, true);
            }
        } catch (e) {
            console.error('[TRAITER] Erreur:', e);
            alert('Erreur lors du traitement de l\'appel: ' + e.message);
        } finally {
            await wait(200);
            btn.disabled = false;
            state.isProcessing = false;
        }
    }

    // =========================================================
    // BOUTON "TRAITER L'APPEL" — AJOUT
    // =========================================================
    function addTraiterButton() {
        console.log('[BOUTON] Ajout du bouton');
        if (!isTicketForm()) { removeTraiterButton(); return; }

        const statusbarSelectors = [
            '.o_statusbar_buttons',
            '.o_form_statusbar .o_statusbar_buttons',
            '.o_control_panel_actions',
            '.o_cp_action_menus',
            '.o_control_panel .o_cp_buttons'
        ];
        let statusbar = null;
        for (const selector of statusbarSelectors) {
            statusbar = document.querySelector(selector);
            if (statusbar) {
                console.log('[BOUTON] Conteneur trouvé:', selector);
                break;
            }
        }
        if (!statusbar) {
            console.log('[BOUTON] ❌ Pas de conteneur');
            return;
        }
        if (document.getElementById('btn-traiter-appel')) {
            console.log('[BOUTON] Bouton déjà présent');
            return;
        }

        // Vérifier si le ticket est déjà "en traitement" (pour restaurer l'état du bouton)
        // 1) Estimation immédiate via DOM + localStorage (évite le clignotement visuel)
        const ticketIdForState = getTicketIdFromPage();
        const textPresent = isTraitementActive() || (loadState(ticketIdForState) === 'running');
        console.log('[BOUTON] En traitement (estimation) :', textPresent);

        const btn = document.createElement('button');
        btn.id = 'btn-traiter-appel';
        btn.type = 'button';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.padding = '6px 12px';
        btn.style.borderRadius = '3px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = '500';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';

        // Mettre à jour le bouton selon la présence du texte
        updateTraiterBtn(btn, textPresent);

        btn.addEventListener('click', (e) => {
            console.log('[BOUTON] Click event triggered!');
            console.log('[BOUTON] Event:', e);
            console.log('[BOUTON] Button:', btn);
            e.preventDefault();
            e.stopPropagation();
            handleTraiterClick(btn);
        });

        statusbar.insertBefore(btn, statusbar.firstChild);

        // 2) Correction fiable de l'état via lecture de la base (source de vérité).
        //    Gère le cas où l'éditeur n'est pas encore rendu et où Odoo a nettoyé l'attribut data-*.
        if (ticketIdForState) {
            restoreTraiterBtnState(btn, ticketIdForState);
        }
        console.log('[BOUTON] ✅ Bouton inséré');
        console.log('[BOUTON] Bouton dans le DOM:', document.getElementById('btn-traiter-appel'));
    }

    function removeTraiterButton() {
        document.getElementById('btn-traiter-appel')?.remove();
        removeBlinkText();
    }

    // =========================================================
    // DÉTECTION CHANGEMENT DE STAGE POUR "METTRE EN ATTENTE"
    // =========================================================
    let lastStageText = '';

    function watchStageChanges() {
        // Surveiller les changements de stage dans la statusbar
        const statusbarSelectors = [
            '.o_statusbar_status',
            '.o_form_statusbar .o_statusbar_status',
            '.o_statusbar .o_statusbar_status'
        ];

        let statusbar = null;
        for (const selector of statusbarSelectors) {
            statusbar = document.querySelector(selector);
            if (statusbar) break;
        }

        if (!statusbar) return;

        // Trouver le stage actif
        const activeStage = statusbar.querySelector('.o_active, button[aria-pressed="true"], .o_arrow_button_current');
        if (!activeStage) return;

        const currentStageText = (activeStage.textContent || '').trim().toLowerCase();

        // Si le stage a changé et qu'il contient "attente" ou "pending"
        if (currentStageText !== lastStageText) {
            if (currentStageText.includes('attente') || currentStageText.includes('pending')) {
                // Supprimer l'animation avec bulle bleue
                removeBlinkText();

                // Réinitialiser le bouton
                const btn = document.getElementById('btn-traiter-appel');
                if (btn) {
                    updateTraiterBtn(btn, false, true);
                }
                const ticketId = getTicketIdFromPage();
                if (ticketId) saveState(ticketId, 'paused');
            }

            lastStageText = currentStageText;
        }
    }

    // =========================================================
    // CACHER LE BOUTON "CONVERTIR EN OPPORTUNITÉ"
    // =========================================================
    function hideConvertToOpportunityButton() {
        // v19: Chercher dans le bon conteneur
        const containers = [
            '.o_statusbar_buttons',      // v19 + v16-v18
            '.o_control_panel_actions',  // v19 alternative
            '.o_form_statusbar'
        ];

        for (const containerSelector of containers) {
            const container = document.querySelector(containerSelector);
            if (!container) continue;

            const allButtons = container.querySelectorAll('button');
            allButtons.forEach(btn => {
                const text = (btn.textContent || btn.title || btn.getAttribute('aria-label') || '').toLowerCase();
                if (text.includes('convertir') && (text.includes('opportun') || text.includes('opportunity'))) {
                    btn.style.display = 'none';
                }
            });
        }
    }

    function getOdooActionService() {
        try {
            return window.__owl__?.apps?.values?.()?.next?.()?.value?.env?.services?.action || null;
        } catch (_) {
            return null;
        }
    }

    async function waitForTimerStopped(ticketId, timeoutMs = 10000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const info = await odooRead('helpdesk.ticket', Number(ticketId), ['is_timer_running']);
            if (info && !info.is_timer_running) return true;
            await wait(400);
        }
        return false;
    }

    async function autoConfirmTimesheetDialog(timeoutMs = 10000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const modal = Array.from(document.querySelectorAll('.o_timer_dialog, .modal.show, .o_dialog, .o_dialog_container .modal')).find(el => {
                if (!(el instanceof HTMLElement)) return false;
                if (el.offsetParent === null && !el.classList.contains('show')) return false;
                const txt = (el.textContent || '').toLowerCase();
                return /timesheet|feuille de temps|time spent|temps pass[eé]|minutes? spent|heures? pass[eé]es?|timer/.test(txt);
            });

            if (modal) {
                const confirmBtn = Array.from(modal.querySelectorAll('footer button, .modal-footer button, .o_form_button_save, button.btn-primary, button')).find(btn => {
                    if (!(btn instanceof HTMLButtonElement) || btn.disabled) return false;
                    const txt = (btn.textContent || '').trim().toLowerCase();
                    return btn.classList.contains('btn-primary') ||
                        btn.classList.contains('o_form_button_save') ||
                        /^(save|enregistrer|valider|cr[eé]er|create|confirmer|ok|fermer|close)$/.test(txt);
                });
                if (confirmBtn) {
                    confirmBtn.click();
                    await wait(400);
                    return true;
                }
            }
            await wait(150);
        }
        return false;
    }

    async function manualStopTimerFallback(ticketId) {
        dispatchAltShortcut('z', 'KeyZ');
        await wait(200);

        let dialog = null;
        for (let i = 0; i < 8; i++) {
            dialog = document.querySelector('.o_timer_dialog, .modal.show, .o_dialog');
            if (dialog) break;
            await wait(150);
        }

        if (dialog) await wait(400);

        dispatchAltShortcut('q', 'KeyQ');
        await wait(300);

        if (document.querySelector('.o_timer_dialog, .modal.show, .o_dialog')) {
            dispatchAltShortcut('q', 'KeyQ');
            await wait(300);
        }

        const saveBtn = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
        if (saveBtn && !saveBtn.disabled) {
            saveBtn.click();
            await wait(250);
        }

        dispatchAltShortcut('q', 'KeyQ');
        await wait(250);

        return waitForTimerStopped(ticketId, 5000);
    }

    async function executeOdooStopAction(ticketId) {
        const methods = ['stop_ticket', 'action_timer_stop'];
        for (const method of methods) {
            try {
                const action = await odooCall('helpdesk.ticket', method, [Number(ticketId)]);
                if (action && typeof action === 'object' && (action.target === 'new' || action.res_model || action.views)) {
                    const actionService = getOdooActionService();
                    if (actionService?.doAction) {
                        try { await actionService.doAction(action); } catch (_) {}
                    }
                }

                await wait(300);
                await autoConfirmTimesheetDialog(4000);

                const stopped = await waitForTimerStopped(ticketId, 4000);
                if (stopped) return true;
            } catch (e) {
                console.warn('[Clôture] Echec méthode stop', method, e);
            }
        }

        return manualStopTimerFallback(ticketId);
    }

    async function stopTimerUsingOdooFlow(ticketId) {
        return executeOdooStopAction(ticketId);
    }

    async function finalizeTimerAfterClosure(ticketId = null) {
        const targetTicketId = ticketId || sessionStorage.getItem('pendingTimerStopAfterClosure') || getTicketIdFromPage();
        if (!targetTicketId) return false;
        if (state.timerStopRunning) return false;

        const st = await getEffectiveTimerState(targetTicketId);
        if (st !== 'running' && st !== 'paused') {
            sessionStorage.removeItem('pendingTimerStopAfterClosure');
            return false;
        }

        state.timerStopRunning = true;
        try {
            removeBlinkText();
            const btn = document.getElementById('btn-traiter-appel');
            if (btn) updateTraiterBtn(btn, false, false);

            const stopped = await stopTimerUsingOdooFlow(targetTicketId);
            if (stopped) {
                saveState(targetTicketId, 'stopped');
                state.timerStoppedForTicket = String(targetTicketId);
                state.timerStoppedAt = Date.now();
                sessionStorage.removeItem('pendingTimerStopAfterClosure');
                await saveForm();
                if (!_reasonPanelOpen && !_reasonPanelDone && !document.getElementById('odoo-reason-overlay')) {
                    scheduleReasonPanel(250, 40);
                }
                return true;
            }
            return false;
        } finally {
            state.timerStopRunning = false;
        }
    }

    // =========================================================
    // SÉQUENCE DE CLÔTURE — VIA RACCOURCIS (fiable)
    // =========================================================
    async function stopTimerAndTimesheetViaShortcuts(ticketId) {
        const domSt = domTimerState();
        if (domSt === 'stopped' || domSt === 'unknown') return false;

        simulerRaccourciTimer();
        await wait(150);

        let ficheTemps = null;
        let tentatives = 0;
        while (!ficheTemps && tentatives < 4) {
            ficheTemps = document.querySelector('.o_timer_dialog');
            if (!ficheTemps) {
                await wait(150);
                tentatives++;
            }
        }

        if (ficheTemps) await wait(400);

        simulerRaccourciStop();
        await wait(250);

        if (document.querySelector('.o_timer_dialog')) {
            simulerRaccourciStop();
            await wait(250);
        }

        // Sauvegarde si bouton présent
        const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
        if (btnEnregistrer && !btnEnregistrer.disabled) {
            btnEnregistrer.click();
            await wait(200);
        }

        // Dernier Q de sécurité
        simulerRaccourciStop();
        await wait(300);

        const stopped = await waitForDomTimerState('stopped', 6000);
        if (stopped) {
            saveState(ticketId, 'stopped');
            return true;
        }
        return false;
    }

    // Renvoie les éléments de stage "actif" (bouton courant du statusbar). Vide si le
    // formulaire n'est pas encore chargé — ce qui permet de distinguer "pas chargé"
    // de "réellement dans un stage ouvert".
    function getActiveStageEls() {
        return Array.from(document.querySelectorAll(
            '.o_arrow_button_current, .o_statusbar_status .btn-primary, .o_statusbar_status button[aria-pressed="true"]'
        ));
    }

    // Tickets observés dans un stage NON résolu (clé = id ticket). Sert à détecter une
    // vraie transition "ouvert -> résolu" plutôt que la simple consultation d'un ticket déjà clos.
    const _seenOpenTickets = new Set();

    function startClosureWatcher() {
        setInterval(async () => {
            const ticketId = getTicketIdFromPage();
            if (!ticketId) return;
            const idKey = String(ticketId);

            // Lire le stage actif réellement rendu
            const stageEls = getActiveStageEls();
            if (stageEls.length === 0) return; // formulaire pas (encore) chargé : ne rien décider

            const resolved = stageEls.some(el => isResolvedStageText(el.textContent || ''));

            if (!resolved) {
                // Ticket bien chargé et dans un stage ouvert -> mémoriser pour détecter une future clôture
                _seenOpenTickets.add(idKey);
                return;
            }

            if (state.closureRunning) return;

            // Le panneau ne doit s'ouvrir que sur une vraie transition (ouvert -> résolu)
            // ou via une intention de clôture explicite (clic bouton "Clôturer").
            const wasOpenBefore = _seenOpenTickets.has(idKey);
            const hadCloseIntent = sessionStorage.getItem('pendingReasonPanelAfterClosure') === '1'
                || sessionStorage.getItem('pendingReasonPanel') === '1';

            state.closureRunning = true;

            try {
                // Nettoyage du marqueur (sûr quel que soit le cas) : si encore actif sur un ticket résolu
                const wasActive = isTraitementActive() || loadState(ticketId) !== 'stopped';
                removeBlinkText();
                if (wasActive) {
                    saveState(ticketId, 'stopped');
                    setTraitementMarker(ticketId, false);
                    const btn = document.getElementById('btn-traiter-appel');
                    if (btn) updateTraiterBtn(btn, false);
                }

                // Ouvrir le panneau raisons UNIQUEMENT sur transition réelle / clôture explicite
                if (wasOpenBefore || hadCloseIntent) {
                    _seenOpenTickets.delete(idKey);
                    sessionStorage.removeItem('pendingReasonPanelAfterClosure');
                    scheduleReasonPanel(250, 40);
                }
            } catch (e) {
                // Erreur silencieuse
            } finally {
                setTimeout(() => { state.closureRunning = false; }, 1500);
            }
        }, 1000);
    }

    // =========================================================
    // BOUTON CLÔTURER — STYLE + HOOK PANNEAU
    // =========================================================
    function styleCloseButton() {
        const btn = document.querySelector('button[name="close_ticket"][type="object"]');
        if (!btn || btn.dataset.reasonPanelHooked) return;
        btn.dataset.reasonPanelHooked = '1';
        btn.addEventListener('click', () => {
            const ticketId = getTicketIdFromPage();
            if (ticketId) {
                sessionStorage.setItem('pendingReasonPanelAfterClosure', '1');
                sessionStorage.setItem('pendingReasonTicketId', String(ticketId));
                _reasonPanelTicketId = String(ticketId);

                // Protection contre les resets : marquer que le panneau doit rester ouvert
                sessionStorage.setItem('reasonPanelForceOpen', '1');
                sessionStorage.setItem('reasonPanelProtectedTicketId', String(ticketId));

                // Ouvrir immédiatement le panneau des raisons
                setTimeout(() => {
                    if (!_reasonPanelOpen && !document.getElementById('odoo-reason-overlay')) {
                        // Reset temporaire du flag _reasonPanelDone pour permettre l'ouverture
                        const wasReasonPanelDone = _reasonPanelDone;
                        _reasonPanelDone = false;
                        openReasonPanel();
                        // Si l'ouverture a échoué, restaurer l'état précédent
                        if (!document.getElementById('odoo-reason-overlay')) {
                            _reasonPanelDone = wasReasonPanelDone;
                        }
                    }
                }, 50);
            } else {
                sessionStorage.removeItem('pendingReasonPanelAfterClosure');
                sessionStorage.removeItem('reasonPanelForceOpen');
                sessionStorage.removeItem('reasonPanelProtectedTicketId');
            }
            // Conserver aussi le chemin normal (robuste aux rerenders Odoo)
            sessionStorage.setItem('pendingReasonPanel', '1');
            scheduleReasonPanel(250, 40);
        });
    }

    function hookResolvedStageButtons() {
        document.querySelectorAll('.o_statusbar_status button, .o_arrow_button').forEach(btn => {
            if (!(btn instanceof HTMLButtonElement) || btn.dataset.timerClosureHooked === '1') return;
            if (!isResolvedStageText(btn.textContent || '')) return;

            btn.dataset.timerClosureHooked = '1';
            btn.addEventListener('click', () => {
                const ticketId = getTicketIdFromPage();
                if (!ticketId) return;

                sessionStorage.setItem('pendingTimerStopAfterClosure', String(ticketId));
                sessionStorage.setItem('pendingReasonTicketId', String(ticketId));
                _reasonPanelTicketId = String(ticketId);

                setTimeout(() => {
                    if (!document.getElementById('odoo-reason-overlay')) {
                        finalizeTimerAfterClosure(ticketId).catch(e => {
                            console.warn('[Clôture] Stop timer après clic statut échoué:', e);
                        });
                    }
                }, 1800);
            });
        });
    }

    // =========================================================
    // BOUTON INSÉRER INITIALES
    // =========================================================
    function addInitialesButton() {
        if (!isTicketPage()) { document.getElementById('btn-inserer-initiales')?.remove(); return; }
        if (document.getElementById('btn-inserer-initiales')) return;

        const btn = document.createElement('button');
        btn.id = 'btn-inserer-initiales';
        btn.type = 'button';
        btn.textContent = 'Insérer initiales';

        btn.addEventListener('click', () => {
            // Récupérer le nom de l'utilisateur connecté
            let userName = '';

            // Priorité 1 : session Odoo (v16-v18: session_info, v19: __session_info__)
            try { userName = getSessionInfo().name || ''; } catch(_) {}

            // Priorité 2 : navbar haut droite (v19 compatible)
            if (!userName) {
                const navUserSelectors = [
                    '.o_user_menu .o_menu_brand',
                    '.o_user_menu span[class*="name"]',
                    '.o_main_navbar .o_user_menu > a > span',
                    '.o_main_navbar .o_user_menu .o_dropdown_title',
                    '.o_navbar_apps_menu ~ div button span'  // v19
                ];
                for (const selector of navUserSelectors) {
                    const navUser = document.querySelector(selector);
                    if (navUser) {
                        userName = navUser.textContent.trim();
                        if (userName) break;
                    }
                }
            }

            // Priorité 3 : champ assigné DOM (lecture seule) - v19 compatible
            if (!userName) {
                const assignSelectors = [
                    '.o_field_widget[name="user_id"] .o_form_uri',
                    '.o_field_widget[name="user_id"] span',
                    '.o_field[name="user_id"] .o_field_many2one_selection',
                    '[name="user_id"] input'
                ];
                for (const selector of assignSelectors) {
                    const assignField = document.querySelector(selector);
                    if (assignField) {
                        userName = (assignField.value || assignField.textContent || '').trim();
                        if (userName) break;
                    }
                }
            }

            if (!userName) { alert('Impossible de récupérer votre nom. Vérifiez que vous êtes connecté.'); return; }

            // Format demandé : "Prénom.N" (prénom complet en Titre + point + initiale du nom).
            // L'instance affiche le nom au format "NOM PRENOM" (ex: "SAIR ALEXIS") -> 1er mot = nom.
            const titleCase = s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
            const nameParts = userName.trim().split(/\s+|-/g).filter(Boolean);
            let signature;
            if (nameParts.length >= 2) {
                const nom = nameParts[0];                       // "SAIR"
                const prenom = nameParts.slice(1).map(titleCase).join(' '); // "Alexis"
                signature = `${prenom}.${nom.charAt(0).toUpperCase()}`;       // "Alexis.S"
            } else {
                signature = titleCase(nameParts[0] || userName);
            }
            const now = new Date();
            const pad = n => n.toString().padStart(2, '0');
            const texte = `${signature} ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}H${pad(now.getMinutes())} : `;

            // v19: Chercher la zone de réponse avec plusieurs sélecteurs
            const zoneSelectors = [
                'div#request_answer.note-editable',
                '[name="request_answer"] .note-editable',
                '.o_field_widget[name="request_answer"] .note-editable',
                '.o_field[name="request_answer"] .note-editable'
            ];

            let zone = null;
            for (const selector of zoneSelectors) {
                zone = document.querySelector(selector);
                if (zone) {
                    break;
                }
            }

            if (!zone) { alert('Zone de réponse non trouvée !'); return; }

            // Supprimer les BR et espaces vides en fin de zone
            while (zone.lastChild && (
                zone.lastChild.nodeName === 'BR' ||
                (zone.lastChild.nodeType === 3 && !zone.lastChild.textContent.trim()) ||
                (zone.lastChild.nodeName === 'P' && !zone.lastChild.textContent.trim())
            )) zone.removeChild(zone.lastChild);
            // Insérer directement un <p> avec le texte, sans BR supplémentaire
            const bloc = document.createElement('p');
            bloc.style.margin = '0';
            bloc.textContent = texte;
            zone.appendChild(bloc);
            try { zone.scrollTop = zone.scrollHeight; } catch (_) {}
        });

        // Stratégie 1 : Insérer au-dessus de la zone "Réponse à la demande"
        const zoneSelectors = [
            'div#request_answer.note-editable',
            '[name="request_answer"] .note-editable',
            '.o_field_widget[name="request_answer"] .note-editable',
            '.o_field[name="request_answer"] .note-editable'
        ];

        let zone = null;
        for (const selector of zoneSelectors) {
            zone = document.querySelector(selector);
            if (zone) {
                break;
            }
        }

        if (zone) {
            // Insérer le bouton juste au-dessus de la zone éditable
            const container = zone.closest('.o_field_widget, .o_field, [name="request_answer"]');
            if (container && container.parentNode) {
                // Créer un conteneur pour le bouton si nécessaire
                let btnContainer = container.querySelector('.tm-initiales-btn-container');
                if (!btnContainer) {
                    btnContainer = document.createElement('div');
                    btnContainer.className = 'tm-initiales-btn-container';
                    btnContainer.style.marginBottom = '8px';
                    // Insérer AVANT le container du champ, pas avant la zone
                    container.parentNode.insertBefore(btnContainer, container);
                }
                // Vider et ajouter le bouton
                btnContainer.innerHTML = '';
                btnContainer.appendChild(btn);
                return;
            }
        }

        // Stratégie 2 : Chercher le bouton message du chatter
        const btnMsgSelectors = [
            '.o-mail-Chatter button',  // v19
            '.o_mail_chatter_container button',
            'button.o_chatter_button_new_message',
            'button[accesskey="m"]',
            '.o_chatter button[title*="message"]',
            '.o_chatter_topbar button'
        ];

        let btnMsg = null;
        for (const selector of btnMsgSelectors) {
            btnMsg = document.querySelector(selector);
            if (btnMsg) {
                break;
            }
        }

        if (btnMsg?.parentNode) {
            btnMsg.parentNode.insertBefore(btn, btnMsg);
        }
    }

    // =========================================================
    // BOUTON DÉSASSIGNATION (croix)
    // =========================================================
    // BOUTON DÉSASSIGNATION (croix)
    // =========================================================
    function addClearAssignButton() {
        // Uniquement sur le formulaire d'un ticket (pas dans la liste où "Assigné à" apparaît aussi)
        if (!isTicketForm()) { document.querySelectorAll('.clear-assign-button').forEach(b => b.remove()); return; }
        const field = document.querySelector('.o_field_many2one[name="user_id"], .o_field_widget[name="user_id"]');
        if (!field) return;
        const input = field.querySelector('input');
        const assignedTxt = (
            (field.querySelector('.o_form_uri')?.textContent || '') ||
            (field.querySelector('span')?.textContent || '') ||
            (input?.value || '')
        ).trim();
        const existing = field.querySelector('.clear-assign-button');
        if (existing) { if (!assignedTxt) existing.remove(); return; }
        if (!assignedTxt) return;

        const btn = document.createElement('button');
        btn.className = 'clear-assign-button';
        btn.type = 'button';
        btn.innerHTML = '❌';
        btn.title = 'Désassigner';

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const ticketId = getTicketIdFromPage();
            if (ticketId) {
                // Via API directement
                await odooWrite('helpdesk.ticket', Number(ticketId), { user_id: false });
                await wait(300);
            }
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            await wait(200);
            const saveBtn = document.querySelector('.o_form_button_save, button[data-hotkey="s"]');
            if (saveBtn) saveBtn.click();
        });

        field.style.position = 'relative';
        field.appendChild(btn);
    }


    // =========================================================
    // PANNEAU ÉTIQUETTES MATÉRIEL / LOGICIEL
    // =========================================================
    let _reasonPanelOpen = false;
    let _reasonPanelDone = false; // une seule ouverture par clôture
    let _reasonPanelTicketId = null;

    function scheduleReasonPanel(retryMs = 400, maxTries = 15) {
        if (_reasonPanelOpen || _reasonPanelDone) return;
        if (document.getElementById('odoo-reason-overlay')) return;

        // Vérifier si le panneau a déjà été complété pour ce ticket
        const currentTicketId = getTicketIdFromPage();
        if (currentTicketId && sessionStorage.getItem(`reasonPanelCompleted_${currentTicketId}`) === '1') {
            return;
        }

        // Si le panneau est protégé (ouvert immédiatement au clic), ne pas le programmer
        if (sessionStorage.getItem('reasonPanelForceOpen') === '1') return;

        _reasonPanelTicketId = getTicketIdFromPage() || sessionStorage.getItem('pendingReasonTicketId') || sessionStorage.getItem('pendingTimerStopAfterClosure') || _reasonPanelTicketId;
        if (_reasonPanelTicketId) sessionStorage.setItem('pendingReasonTicketId', String(_reasonPanelTicketId));
        sessionStorage.setItem('pendingReasonPanel', '1');
        let tries = 0;
        const attempt = () => {
            if (_reasonPanelOpen || _reasonPanelDone) return;
            if (document.getElementById('odoo-reason-overlay')) {
                sessionStorage.removeItem('pendingReasonPanel');
                return;
            }
            if (sessionStorage.getItem('pendingReasonPanel') !== '1') return;
            // Vérifier à nouveau si le panneau est protégé ou déjà complété
            if (sessionStorage.getItem('reasonPanelForceOpen') === '1') {
                sessionStorage.removeItem('pendingReasonPanel');
                return;
            }
            const ticketId = getTicketIdFromPage();
            if (ticketId && sessionStorage.getItem(`reasonPanelCompleted_${ticketId}`) === '1') {
                sessionStorage.removeItem('pendingReasonPanel');
                return;
            }
            tries++;
            openReasonPanel();
            if (!document.getElementById('odoo-reason-overlay')) {
                if (tries < maxTries) setTimeout(attempt, retryMs);
                else sessionStorage.removeItem('pendingReasonPanel');
            } else {
                sessionStorage.removeItem('pendingReasonPanel');
            }
        };
        setTimeout(attempt, 100);
    }

    let _reasonListsCache = null;

    async function fetchReasonLists() {
        if (_reasonListsCache) return _reasonListsCache;
        // Retourne { HARDWARE: [{id, name}], SOFTWARE: [{id, name}], hwRel, swRel }
        // Fallback noms si l'API échoue
        const HW_FALLBACK = ['TMH/TMJ','Imprimante A4','SSV','TPE','Serveur','Scanner Documents','Terminal D\'inventaire','Etiquettes électronique','Lecteur code barre','Ecran','Caméras','Imprimante etiquettes','Poste Client','FAX','Reseau','Borne file d\'attente','BAD','Robot','Antivirus','Borne de prix','Monnayeur','PAX','Onduleur'];
        const SW_FALLBACK = ['Commandes','Télétransmisson / Rejets','Caisse / Synthese','Facturation','Droits Opérateurs / Options','Stocks / Inventaires','Clients','Robot','Etiquettes','Modules','Produits','Autres','Paramètres','Winperformance','WAP','Statistiques'];
        let HARDWARE = HW_FALLBACK.map(n => ({ id: null, name: n }));
        let SOFTWARE = SW_FALLBACK.map(n => ({ id: null, name: n }));
        let hwRel = null, swRel = null;
        try {
            const fields = await odooRpc('helpdesk.ticket', 'fields_get', [['material_reason_tag_ids','software_reason_tag_ids'], ['relation','string']]) || {};
            hwRel = fields.material_reason_tag_ids?.relation || null;
            swRel = fields.software_reason_tag_ids?.relation || null;
            if (hwRel) {
                const recs = await odooRpc(hwRel, 'search_read', [[], ['id','name'], 0, 2000, 'name asc']) || [];
                if (recs.length) HARDWARE = recs.map(r => ({ id: r.id, name: String(r.name||'').trim() })).filter(r => r.name);
            }
            if (swRel) {
                const recs = await odooRpc(swRel, 'search_read', [[], ['id','name'], 0, 2000, 'name asc']) || [];
                if (recs.length) SOFTWARE = recs.map(r => ({ id: r.id, name: String(r.name||'').trim() })).filter(r => r.name);
            }
        } catch (_) {}
        _reasonListsCache = { HARDWARE, SOFTWARE, hwRel, swRel };
        return _reasonListsCache;
    }

    function normalizeReasonName(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[\u2019']/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async function openReasonPanel() {
        if (_reasonPanelOpen || document.getElementById('odoo-reason-overlay')) return;

        // Vérifier si le panneau a déjà été complété pour ce ticket
        const currentTicketId = getTicketIdFromPage();
        if (currentTicketId && sessionStorage.getItem(`reasonPanelCompleted_${currentTicketId}`) === '1') {
            return;
        }

        // Vérifier si le panneau est protégé contre les resets
        const isProtected = sessionStorage.getItem('reasonPanelForceOpen') === '1';
        const protectedTicketId = sessionStorage.getItem('reasonPanelProtectedTicketId');

        // Si le panneau est protégé et on est sur le bon ticket, ignorer _reasonPanelDone
        if (!isProtected && _reasonPanelDone) return;

        // Si on est sur un ticket différent de celui protégé, respecter _reasonPanelDone
        if (isProtected && protectedTicketId && currentTicketId && protectedTicketId !== currentTicketId && _reasonPanelDone) return;

        _reasonPanelOpen = true;

        let styleEl = null;
        let overlay = null;
        try {
            const { HARDWARE, SOFTWARE } = await fetchReasonLists();
            const themeKey = 'reasonPanelTheme';
            const savedTheme = localStorage.getItem(themeKey) || 'dark';

            // Styles du panneau
            styleEl = document.createElement('style');
            styleEl.id = 'odoo-reason-style';
            styleEl.textContent = `
        #odoo-reason-panel {
            --bg:#0e1016; --elev:#171a24; --card:#1b1f2b; --text:#eef1f8; --muted:#9aa3b8;
            --accent:#5b8cff; --accent-soft:rgba(91,140,255,.16); --hw:#5b8cff; --sw:#22c79a;
            --hw-soft:rgba(91,140,255,.16); --sw-soft:rgba(34,199,154,.16);
            --danger:#ef5350; --border:#272c3a; --chip:#1f2431;
        }
        #odoo-reason-panel.theme-light {
            --bg:#f4f6fb; --elev:#ffffff; --card:#ffffff; --text:#15203a; --muted:#5c6780;
            --accent:#2563eb; --accent-soft:rgba(37,99,235,.12); --hw:#2563eb; --sw:#0ea36f;
            --hw-soft:rgba(37,99,235,.10); --sw-soft:rgba(14,163,111,.12);
            --danger:#dc2626; --border:#e3e8f2; --chip:#f3f5fa;
        }
        #odoo-reason-overlay { backdrop-filter:blur(3px); }
        #odoo-reason-panel { width:min(880px,94vw); max-height:88vh; border-radius:18px; overflow:hidden;
            box-shadow:0 24px 70px rgba(0,0,0,.45); display:flex; flex-direction:column;
            font-family:Inter,system-ui,-apple-system,sans-serif; border:1px solid var(--border); background:var(--bg); }

        /* Header */
        #odoo-reason-panel .hdr { background:var(--elev); padding:14px 18px; display:flex; align-items:center; gap:12px;
            color:var(--text); border-bottom:1px solid var(--border); flex-wrap:wrap; }
        #odoo-reason-panel .title { font-size:15px; font-weight:700; letter-spacing:.2px; display:flex; align-items:center; gap:8px; margin-right:auto; }
        #odoo-reason-panel .title::before { content:'🏷️'; font-size:16px; }
        #odoo-reason-panel .search { flex:1 1 220px; min-width:180px; max-width:340px; position:relative; order:3; }
        #odoo-reason-panel .search input { width:100%; box-sizing:border-box; padding:8px 12px 8px 32px; border-radius:10px;
            border:1px solid var(--border); background:var(--chip); color:var(--text); font-size:13px; outline:none; }
        #odoo-reason-panel .search input:focus { border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-soft); }
        #odoo-reason-panel .search::before { content:'🔍'; position:absolute; left:10px; top:50%; transform:translateY(-50%); font-size:12px; opacity:.7; }
        #odoo-reason-panel .theme-toggle { border:1px solid var(--border); background:var(--chip); color:var(--text);
            border-radius:10px; padding:7px 12px; cursor:pointer; font-size:12px; font-weight:600; }
        #odoo-reason-panel .theme-toggle:hover { border-color:var(--accent); }
        #odoo-reason-panel .close-btn { border:1px solid var(--border); background:transparent; color:var(--danger);
            border-radius:10px; width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; }
        #odoo-reason-panel .close-btn:hover { background:var(--danger); color:#fff; border-color:var(--danger); }

        /* Body */
        #odoo-reason-panel .body { background:var(--bg); color:var(--text); display:grid; grid-template-columns:1fr 1fr;
            gap:14px; padding:16px; min-height:0; overflow:auto; }
        #odoo-reason-panel .col { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:14px 14px 8px; }
        #odoo-reason-panel .col-title { font-weight:700; margin-bottom:12px; font-size:13px; display:flex; align-items:center; gap:8px; }
        #odoo-reason-panel .col-title .count { margin-left:auto; font-size:11px; font-weight:700; padding:2px 9px; border-radius:999px;
            background:var(--hw-soft); color:var(--hw); }
        #odoo-reason-panel .col--sw .col-title .count { background:var(--sw-soft); color:var(--sw); }
        #odoo-reason-panel .list { display:grid; grid-template-columns:repeat(auto-fill,minmax(150px,1fr)); gap:7px; }

        /* Chips */
        #odoo-reason-panel .chip { border:1px solid var(--border); background:var(--chip); color:var(--text);
            padding:9px 11px; border-radius:11px; display:flex; align-items:center; gap:9px; cursor:pointer; user-select:none;
            font-size:13px; line-height:1.2; transition:border-color .12s, background .12s, transform .06s; }
        #odoo-reason-panel .chip:hover { transform:translateY(-1px); border-color:var(--hw); }
        #odoo-reason-panel .col--sw .chip:hover { border-color:var(--sw); }
        #odoo-reason-panel .chip input { width:16px; height:16px; flex:0 0 auto; accent-color:var(--hw); cursor:pointer; margin:0; }
        #odoo-reason-panel .chip--software input { accent-color:var(--sw); }
        #odoo-reason-panel .chip span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        #odoo-reason-panel .chip.selected { border-color:var(--hw); background:var(--hw-soft); font-weight:600; }
        #odoo-reason-panel .chip--software.selected { border-color:var(--sw); background:var(--sw-soft); }
        #odoo-reason-panel .col-empty { color:var(--muted); font-size:12px; padding:8px 2px; font-style:italic; display:none; }

        /* Footer */
        #odoo-reason-panel .ftr { background:var(--elev); padding:12px 16px; display:flex; align-items:center; gap:10px;
            border-top:1px solid var(--border); }
        #odoo-reason-panel .sel-count { font-size:12px; color:var(--muted); margin-right:auto; font-weight:600; }
        #odoo-reason-panel .sel-count b { color:var(--accent); }
        #odoo-reason-panel .btn { padding:9px 18px; border-radius:11px; font-weight:700; font-size:13px; border:1px solid transparent; cursor:pointer; }
        #odoo-reason-panel .btn.primary { background:var(--accent); color:#fff; }
        #odoo-reason-panel .btn.primary:hover { filter:brightness(1.08); }
        #odoo-reason-panel .btn.primary:disabled { opacity:.5; cursor:not-allowed; filter:none; }
        #odoo-reason-panel .btn.ghost { background:transparent; border-color:var(--border); color:var(--muted); }
        #odoo-reason-panel .btn.ghost:hover { color:var(--text); border-color:var(--accent); }

        /* Scrollbar */
        #odoo-reason-panel .body::-webkit-scrollbar { width:10px; }
        #odoo-reason-panel .body::-webkit-scrollbar-thumb { background:var(--border); border-radius:999px; }

        @media(max-width:768px) {
            #odoo-reason-panel .body { grid-template-columns:1fr; }
            #odoo-reason-panel .search { max-width:none; order:3; flex-basis:100%; }
        }
            `;
            document.head.appendChild(styleEl);

            overlay = document.createElement('div');
            overlay.id = 'odoo-reason-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(0,0,0,.45);';

            const panel = document.createElement('div');
            panel.id = 'odoo-reason-panel';
            if (savedTheme === 'light') panel.classList.add('theme-light');

            // Header
            const hdr = document.createElement('div'); hdr.className = 'hdr';
            const title = document.createElement('div'); title.className = 'title'; title.textContent = 'Sélection des raisons';
            const search = document.createElement('div'); search.className = 'search';
            const searchInput = document.createElement('input'); searchInput.type = 'text'; searchInput.placeholder = 'Rechercher une raison…'; searchInput.setAttribute('autocomplete', 'off');
            search.appendChild(searchInput);
            const themeBtn = document.createElement('button'); themeBtn.className = 'theme-toggle'; themeBtn.textContent = savedTheme === 'dark' ? '☀️ Clair' : '🌙 Sombre';
            const closeBtn = document.createElement('button'); closeBtn.className = 'close-btn'; closeBtn.textContent = '×';
            hdr.appendChild(title); hdr.appendChild(search); hdr.appendChild(themeBtn); hdr.appendChild(closeBtn);

            // Body
            const body = document.createElement('div'); body.className = 'body';

            function buildCol(titleText, items, prefix, type) {
                const col = document.createElement('div'); col.className = 'col' + (type === 'software' ? ' col--sw' : '');
                const ttl = document.createElement('div'); ttl.className = 'col-title'; ttl.textContent = titleText;
                const count = document.createElement('span'); count.className = 'count'; count.textContent = String(items.length);
                ttl.appendChild(count);
                const list = document.createElement('div'); list.className = 'list';
                items.slice().sort((a,b) => a.name.localeCompare(b.name,'fr',{sensitivity:'base',ignorePunctuation:true})).forEach((item, idx) => {
                    const chip = document.createElement('label');
                    chip.className = 'chip' + (type === 'software' ? ' chip--software' : '');
                    chip.dataset.search = normalizeReasonName(item.name);
                    const cb = document.createElement('input'); cb.type = 'checkbox';
                    // Stocker l'ID si disponible, sinon le nom (fallback)
                    cb.value = item.id ? String(item.id) : item.name;
                    cb.dataset.tagName = item.name;
                    cb.dataset.tagId = item.id ? String(item.id) : '';
                    cb.id = `${prefix}-${idx}`;
                    const span = document.createElement('span'); span.textContent = item.name; span.title = item.name;
                    chip.appendChild(cb); chip.appendChild(span);
                    list.appendChild(chip);
                });
                const empty = document.createElement('div'); empty.className = 'col-empty'; empty.textContent = 'Aucune raison ne correspond.';
                col.appendChild(ttl); col.appendChild(list); col.appendChild(empty);
                return col;
            }

            body.appendChild(buildCol('🔧 Matériel', HARDWARE, 'hw', 'hardware'));
            body.appendChild(buildCol('💻 Logiciel', SOFTWARE, 'sw', 'software'));

            // Footer
            const ftr = document.createElement('div'); ftr.className = 'ftr';
            const selCount = document.createElement('div'); selCount.className = 'sel-count'; selCount.innerHTML = '<b>0</b> sélectionnée(s)';
            const skipBtn = document.createElement('button'); skipBtn.type = 'button'; skipBtn.className = 'btn ghost'; skipBtn.textContent = "Pas d'étiquette";
            const submitBtn = document.createElement('button'); submitBtn.type = 'button'; submitBtn.className = 'btn primary'; submitBtn.textContent = 'Valider'; submitBtn.disabled = true; submitBtn.style.display = 'none';
            ftr.appendChild(selCount); ftr.appendChild(skipBtn); ftr.appendChild(submitBtn);

            panel.appendChild(hdr); panel.appendChild(body); panel.appendChild(ftr);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);
            _reasonPanelDone = true;

            // Interactions
            const allChips = panel.querySelectorAll('.chip');
            const updateSubmit = () => {
                const n = panel.querySelectorAll('.chip input:checked').length;
                submitBtn.disabled = n === 0; submitBtn.style.display = n === 0 ? 'none' : 'inline-block';
                allChips.forEach(c => c.classList.toggle('selected', c.querySelector('input').checked));
                selCount.innerHTML = '<b>' + n + '</b> sélectionnée(s)';
            };
            allChips.forEach(chip => {
                chip.addEventListener('click', e => {
                    if (!(e.target instanceof HTMLInputElement)) { e.preventDefault(); const cb = chip.querySelector('input'); cb.checked = !cb.checked; }
                    updateSubmit();
                });
                chip.querySelector('input').addEventListener('change', updateSubmit);
            });
            updateSubmit();

            // Recherche live : filtre les chips des deux colonnes + message "aucun résultat"
            const filterChips = () => {
                const q = normalizeReasonName(searchInput.value);
                panel.querySelectorAll('.col').forEach(col => {
                    let visible = 0;
                    col.querySelectorAll('.chip').forEach(chip => {
                        const match = !q || (chip.dataset.search || '').includes(q);
                        chip.style.display = match ? '' : 'none';
                        if (match) visible++;
                    });
                    const empty = col.querySelector('.col-empty');
                    if (empty) empty.style.display = visible === 0 ? 'block' : 'none';
                });
            };
            searchInput.addEventListener('input', filterChips);

            themeBtn.addEventListener('click', () => {
                const isLight = panel.classList.toggle('theme-light');
                localStorage.setItem(themeKey, isLight ? 'light' : 'dark');
                themeBtn.textContent = isLight ? '🌙 Sombre' : '☀️ Clair';
            });

            const closePanel = () => {
                _reasonPanelOpen = false;
                sessionStorage.removeItem('pendingReasonPanel');
                sessionStorage.removeItem('pendingReasonTicketId');
                // Nettoyer les flags de protection
                sessionStorage.removeItem('reasonPanelForceOpen');
                sessionStorage.removeItem('reasonPanelProtectedTicketId');
                _reasonPanelTicketId = null;
                overlay.remove();
                styleEl.remove();
            };
            closeBtn.addEventListener('click', () => { closePanel(); });
            skipBtn.addEventListener('click', () => { closePanel(); });

            let submitLocked = false;
            submitBtn.addEventListener('click', async () => {
                if (submitLocked) return;
                submitLocked = true; submitBtn.disabled = true;

                // Marquer définitivement que le panneau a été traité pour ce ticket
                const currentTicketId = _reasonPanelTicketId || sessionStorage.getItem('pendingReasonTicketId') || getTicketIdFromPage();
                if (currentTicketId) {
                    sessionStorage.setItem(`reasonPanelCompleted_${currentTicketId}`, '1');
                }

                sessionStorage.removeItem('pendingReasonPanel');
                // Récupérer les IDs (ou noms si pas d'ID) des cases cochées
                const cols = Array.from(panel.querySelectorAll('.col'));
                const hwChecked = Array.from((cols[0] || panel).querySelectorAll('.chip input:checked'));
                const swChecked = Array.from((cols[1] || panel).querySelectorAll('.chip input:checked'));
                const hwIds = hwChecked.filter(i => i.dataset.tagId).map(i => Number(i.dataset.tagId));
                const swIds = swChecked.filter(i => i.dataset.tagId).map(i => Number(i.dataset.tagId));
                const hwNames = hwChecked.filter(i => !i.dataset.tagId).map(i => i.dataset.tagName);
                const swNames = swChecked.filter(i => !i.dataset.tagId).map(i => i.dataset.tagName);
                try {
                    const targetTicketId = _reasonPanelTicketId || sessionStorage.getItem('pendingReasonTicketId') || getTicketIdFromPage();
                    const ok = await applyTagsToTicket(hwIds, swIds, hwNames, swNames, targetTicketId);
                    if (!ok) {
                        submitLocked = false;
                        submitBtn.disabled = false;
                        alert("Aucune étiquette n'a pu être appliquée. Vérifiez vos droits Odoo ou la configuration des raisons.");
                        return;
                    }
                    // Nettoyer les flags de protection après validation réussie
                    sessionStorage.removeItem('reasonPanelForceOpen');
                    sessionStorage.removeItem('reasonPanelProtectedTicketId');
                    // Empêcher définitivement la réouverture pour ce ticket
                    _reasonPanelDone = true;
                    closePanel();
                } catch (e) {
                    console.warn('[Tags] Erreur:', e);
                    submitLocked = false;
                    submitBtn.disabled = false;
                    alert("Erreur lors de la validation des raisons. Réessayez.");
                }
            });
        } catch (e) {
            console.warn('[ReasonPanel] Erreur ouverture:', e);
            _reasonPanelDone = false;
            if (overlay) overlay.remove();
            if (styleEl) styleEl.remove();
        } finally {
            _reasonPanelOpen = false;
        }
    }

    // Applique les étiquettes via API Odoo — utilise les IDs directement (pas de création)
    async function resolveTagIdsByName(relModel, names = []) {
        if (!relModel || !Array.isArray(names) || !names.length) return [];

        const wantedRaw = names.map(n => String(n || '').trim()).filter(Boolean);
        const wanted = new Set(wantedRaw.map(normalizeReasonName));
        const ids = new Set();

        // Tentative 1: lecture globale (rapide)
        const all = await odooRpc(relModel, 'search_read', [[], ['id', 'name'], 0, 5000]) || [];
        all.forEach(r => {
            if (wanted.has(normalizeReasonName(r.name))) {
                const n = Number(r.id);
                if (Number.isFinite(n)) ids.add(n);
            }
        });
        if (ids.size) return Array.from(ids);

        // Tentative 2: name_search unitaire (souvent autorise meme si search_read est limite)
        for (const name of wantedRaw) {
            try {
                const exact = await odooRpc(relModel, 'name_search', [name, [], 'ilike', 20]) || [];
                const match = exact.find(r => wanted.has(normalizeReasonName(Array.isArray(r) ? r[1] : '')));
                if (match && Array.isArray(match) && Number.isFinite(Number(match[0]))) {
                    ids.add(Number(match[0]));
                    continue;
                }
                const first = exact[0];
                if (first && Array.isArray(first) && Number.isFinite(Number(first[0]))) {
                    ids.add(Number(first[0]));
                }
            } catch (_) {}
        }

        return Array.from(ids);
    }

    function uniqNormNames(names = []) {
        const out = [];
        const seen = new Set();
        for (const n of names) {
            const raw = String(n || '').trim();
            if (!raw) continue;
            const key = normalizeReasonName(raw);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(raw);
        }
        return out;
    }

    async function addMany2ManyTagsViaDom(fieldName, names = []) {
        console.log('[REASON] addMany2ManyTagsViaDom - Field:', fieldName, 'Names:', names);

        const wanted = uniqNormNames(names);
        if (!wanted.length) {
            console.log('[REASON] Aucun nom à ajouter après normalisation');
            return false;
        }

        const root = document.querySelector(`.o_field_many2many_tags[name="${fieldName}"], .o_field_widget[name="${fieldName}"]`);
        console.log('[REASON] Root element trouvé:', !!root);

        if (!root) {
            console.error('[REASON] Impossible de trouver le champ:', fieldName);
            return false;
        }

        const existing = new Set(
            Array.from(root.querySelectorAll('.o_tag, .badge, .o_tag_badge_text'))
                .map(el => normalizeReasonName(el.textContent || ''))
                .filter(Boolean)
        );
        console.log('[REASON] Étiquettes existantes:', Array.from(existing));

        const input = root.querySelector('input');
        console.log('[REASON] Input trouvé:', !!input, input instanceof HTMLInputElement);

        if (!(input instanceof HTMLInputElement)) {
            console.error('[REASON] Impossible de trouver l\'input pour le champ:', fieldName);
            return false;
        }

        let added = false;
        for (const name of wanted) {
            console.log('[REASON] Tentative d\'ajout de:', name);

            if (existing.has(normalizeReasonName(name))) {
                console.log('[REASON] Étiquette déjà présente:', name);
                continue;
            }

            console.log('[REASON] Saisie de l\'étiquette:', name);
            input.focus();
            input.value = name;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(180);

            console.log('[REASON] Envoi de la touche Entrée');
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
            await wait(220);

            // Marquer "ajouté" si le tag apparait ou si la saisie a été consommée par le widget.
            const now = new Set(
                Array.from(root.querySelectorAll('.o_tag, .badge, .o_tag_badge_text'))
                    .map(el => normalizeReasonName(el.textContent || ''))
                    .filter(Boolean)
            );

            const wasAdded = now.has(normalizeReasonName(name)) || String(input.value || '').trim() === '';
            console.log('[REASON] Étiquette ajoutée:', name, '- Succès:', wasAdded);

            if (wasAdded) {
                added = true;
                existing.add(normalizeReasonName(name));
            }
        }

        console.log('[REASON] Résultat final addMany2ManyTagsViaDom:', added);
        return added;
    }

    async function applyTagsViaDom(hwNames = [], swNames = []) {
        console.log('[REASON] applyTagsViaDom - HW Names:', hwNames, 'SW Names:', swNames);

        let hwOk = true;
        let swOk = true;

        if (hwNames.length > 0) {
            console.log('[REASON] Application des étiquettes matériel via DOM...');
            hwOk = await addMany2ManyTagsViaDom('material_reason_tag_ids', hwNames);
            console.log('[REASON] Résultat étiquettes matériel:', hwOk);
        }

        if (swNames.length > 0) {
            console.log('[REASON] Application des étiquettes logiciel via DOM...');
            swOk = await addMany2ManyTagsViaDom('software_reason_tag_ids', swNames);
            console.log('[REASON] Résultat étiquettes logiciel:', swOk);
        }

        if (!hwOk && !swOk) {
            console.error('[REASON] Échec de l\'application des étiquettes via DOM');
            return false;
        }

        console.log('[REASON] Sauvegarde du formulaire...');
        await wait(150);
        await saveForm();

        console.log('[REASON] Application des étiquettes via DOM terminée');
        return true;
    }

    async function applyTagsToTicket(hwIds = [], swIds = [], hwNamesFallback = [], swNamesFallback = [], targetTicketId = null) {
        const ticketId = targetTicketId || sessionStorage.getItem('pendingReasonTicketId') || getTicketIdFromPage();
        console.log('[REASON] applyTagsToTicket - Ticket ID:', ticketId);
        console.log('[REASON] applyTagsToTicket - HW IDs:', hwIds, 'SW IDs:', swIds);
        console.log('[REASON] applyTagsToTicket - HW Names:', hwNamesFallback, 'SW Names:', swNamesFallback);

        if (!ticketId) {
            console.error('[REASON] Aucun ticket ID trouvé');
            return false;
        }

        // Si on n'a pas d'IDs (fallback noms), on cherche par nom sans créer
        if (!hwIds.length && hwNamesFallback.length) {
            console.log('[REASON] Résolution des IDs matériel par nom...');
            try {
                const fields = await odooRpc('helpdesk.ticket', 'fields_get', [['material_reason_tag_ids'], ['relation']]) || {};
                const rel = fields.material_reason_tag_ids?.relation;
                console.log('[REASON] Relation matériel:', rel);
                if (rel) {
                    hwIds = await resolveTagIdsByName(rel, hwNamesFallback);
                    console.log('[REASON] IDs matériel résolus:', hwIds);
                }
            } catch (error) {
                console.error('[REASON] Erreur résolution IDs matériel:', error);
            }
        }

        if (!swIds.length && swNamesFallback.length) {
            console.log('[REASON] Résolution des IDs logiciel par nom...');
            try {
                const fields = await odooRpc('helpdesk.ticket', 'fields_get', [['software_reason_tag_ids'], ['relation']]) || {};
                const rel = fields.software_reason_tag_ids?.relation;
                console.log('[REASON] Relation logiciel:', rel);
                if (rel) {
                    swIds = await resolveTagIdsByName(rel, swNamesFallback);
                    console.log('[REASON] IDs logiciel résolus:', swIds);
                }
            } catch (error) {
                console.error('[REASON] Erreur résolution IDs logiciel:', error);
            }
        }

        const vals = {};
        // [4, id] = lier sans créer (many2many link)
        if (hwIds.length) vals.material_reason_tag_ids = hwIds.map(id => [4, id]);
        if (swIds.length) vals.software_reason_tag_ids = swIds.map(id => [4, id]);

        console.log('[REASON] Valeurs à écrire:', vals);

        if (!Object.keys(vals).length) {
            console.log('[REASON] Aucune valeur à écrire, fallback vers DOM');
            // Fallback non-admin : tenter via l'UI Odoo (many2many tags)
            return applyTagsViaDom(hwNamesFallback, swNamesFallback);
        }

        console.log('[REASON] Tentative d\'écriture via API...');
        try {
            const writeOk = await odooWrite('helpdesk.ticket', Number(ticketId), vals);
            console.log('[REASON] Résultat écriture API:', writeOk);

            if (!writeOk) {
                console.log('[REASON] Écriture API échouée, fallback vers DOM');
                // Fallback non-admin : certains profils ne peuvent pas write via API mais peuvent via le widget UI.
                return applyTagsViaDom(hwNamesFallback, swNamesFallback);
            }

            console.log('[REASON] Écriture API réussie, sauvegarde...');
            await wait(300);
            const saveBtn = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
            if (saveBtn) {
                console.log('[REASON] Clic sur le bouton sauvegarder');
                saveBtn.click();
            }

            // Forcer le rechargement du formulaire pour afficher les tags sans F5
            await wait(600);
            try {
                console.log('[REASON] Rechargement de la vue...');
                // Méthode 1 : bouton discard puis reload (Odoo SPA)
                const discardBtn = document.querySelector('button.o_form_button_discard, button[data-hotkey="j"]');
                if (discardBtn) {
                    console.log('[REASON] Clic sur discard');
                    discardBtn.click();
                    await wait(200);
                }

                // Méthode 2 : déclencher un reload via l'action manager Odoo
                if (window.__owl__) {
                    const env = window.__owl__?.apps?.values?.()?.next?.()?.value?.env;
                    if (env?.services?.action) {
                        console.log('[REASON] Restore via action manager');
                        env.services.action.restore();
                    }
                }
            } catch (reloadError) {
                console.error('[REASON] Erreur lors du rechargement:', reloadError);
            }

            // Méthode 3 : reload de la vue courante via hashchange
            const currentHash = window.location.hash;
            window.location.hash = currentHash + '&_r=' + Date.now();
            await wait(100);
            window.history.replaceState(null, '', window.location.pathname + window.location.search + currentHash);

            console.log('[REASON] Application des étiquettes terminée avec succès');
            return true;

        } catch (error) {
            console.error('[REASON] Erreur lors de l\'écriture API:', error);
            console.log('[REASON] Fallback vers DOM après erreur API');
            return applyTagsViaDom(hwNamesFallback, swNamesFallback);
        }
    }


    // =========================================================
    // BADGE DEVIS / VENTES
    // =========================================================
    let saleOrderTitleField = undefined;
    async function detectSaleOrderTitleField() {
        if (saleOrderTitleField !== undefined) return saleOrderTitleField;
        const fields = await odooRpc('sale.order', 'fields_get', [[], ['string']]) || {};
        for (const [fname, def] of Object.entries(fields)) {
            if ((def.string||'').toLowerCase().includes('titre')) { saleOrderTitleField = fname; return fname; }
        }
        for (const c of ['x_studio_titre','x_studio_title','title','x_title','x_titre','client_order_ref']) {
            if (fields[c]) { saleOrderTitleField = c; return c; }
        }
        saleOrderTitleField = null; return null;
    }

    function findStatsContainer() {
        // v19: Nouveaux sélecteurs
        const selectors = [
            '.o_form_button_box',
            '.o_form_buttonbox',
            '.oe_button_box',
            '.o_button_box',
            '.o_form_sheet .o_button_box',  // v19
            '.o_form_renderer .o_button_box'  // v19
        ];

        console.log('[findStatsContainer] Recherche du conteneur de badges...');

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                return el;
            }
        }

        // v19: Si le conteneur n'existe pas, le créer
        const formSheet = document.querySelector('.o_form_renderer .o_form_sheet, .o_form_sheet');
        if (formSheet) {
            const buttonBox = document.createElement('div');
            buttonBox.className = 'o_button_box';
            buttonBox.style.display = 'flex';
            buttonBox.style.flexWrap = 'wrap';
            buttonBox.style.gap = '8px';
            buttonBox.style.marginBottom = '16px';
            // Insérer au début du form sheet
            formSheet.insertBefore(buttonBox, formSheet.firstChild);
            return buttonBox;
        }

        return null;
    }

    function placeAfterStats(container, badge) {
        if (!container || !badge) {
            return;
        }
        // Ne déplacer que si le badge n'est pas encore dans le container
        if (badge.parentNode === container) {
            return;
        }
        // Trouver le dernier bouton stat natif Odoo (exclure nos propres badges)
        const btns = Array.from(container.querySelectorAll('.o_stat_button,.oe_stat_button'))
            .filter(el => el.id !== 'badge-devis-client' && el.id !== 'badge-tickets-ouverts');
        const last = btns.length ? btns[btns.length-1] : null;
        if (last) {
            last.insertAdjacentElement('afterend', badge);
        } else {
            container.appendChild(badge);
        }
    }

    function ensureBadgeOrder(container) {
        // Garantit l'ordre fixe : DOUBLONS puis VENTES, après les stats natifs
        if (!container) return;
        const doublons = document.getElementById('badge-tickets-ouverts');
        const ventes = document.getElementById('badge-devis-client');
        if (!doublons || !ventes) return;
        if (doublons.parentNode !== container || ventes.parentNode !== container) return;
        // Vérifier si l'ordre est déjà correct (doublons avant ventes)
        if (doublons.nextSibling === ventes) return;
        // Réordonner : doublons d'abord, ventes ensuite
        container.appendChild(doublons);
        container.appendChild(ventes);
    }

    let devisTimer = null;
    async function updateDevisBadge() {
        console.log('[updateDevisBadge] Début de la mise à jour du badge VENTES');
        console.log('[updateDevisBadge] isTicketPage():', isTicketPage());

        if (!isTicketPage()) {
            console.log('[updateDevisBadge] Pas sur une page ticket, suppression du badge');
            document.getElementById('badge-devis-client')?.remove();
            return;
        }
        const ticketId = getTicketIdFromPage();
        console.log('[updateDevisBadge] Ticket ID:', ticketId);
        if (!ticketId) {
            console.log('[updateDevisBadge] Pas de ticket ID, abandon');
            return;
        }

        const stats = findStatsContainer();
        console.log('[updateDevisBadge] Conteneur stats:', stats ? '✅ trouvé' : '❌ absent');

        let badge = document.getElementById('badge-devis-client');
        if (!badge) {
            console.log('[updateDevisBadge] Badge VENTES absent, création...');
            badge = document.createElement('span');
            badge.id = 'badge-devis-client';
            if (stats) {
                placeAfterStats(stats, badge);
                console.log('[updateDevisBadge] ✅ Badge VENTES créé et placé dans le conteneur');
            } else {
                console.log('[updateDevisBadge] ❌ Pas de conteneur stats, abandon');
                return;
            }
        } else {
            console.log('[updateDevisBadge] Badge VENTES existe déjà, repositionnement...');
            if (stats) placeAfterStats(stats, badge);
        }

        // Lire partner_id via API
        const ticket = await odooRead('helpdesk.ticket', Number(ticketId), ['partner_id']);
        const partnerId = Array.isArray(ticket?.partner_id) ? ticket.partner_id[0] : null;
        if (!partnerId) { badge.innerHTML = ''; return; }

        // Partenaire commercial
        const pr = await odooRead('res.partner', partnerId, ['commercial_partner_id']);
        const commercialId = Array.isArray(pr?.commercial_partner_id) ? pr.commercial_partner_id[0] : partnerId;

        // Tous les contacts de l'entreprise
        const partnerIds = await odooRpc('res.partner', 'search', [[['commercial_partner_id','=',commercialId]]]) || [commercialId];

        // Compter les ventes
        const count = await odooRpc('sale.order', 'search_count', [[['partner_id','in',partnerIds]]]) || 0;
        const n = Number(count);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = n > 0 ? `${n} ventes trouvées` : 'Aucune vente';
        btn.className = 'bd-btn' + (n > 0 ? '' : ' empty');

        btn.onclick = async () => {
            if (n <= 0) return;
            document.getElementById('popup-devis-odoobtn')?.remove();
            const pop = document.createElement('div');
            pop.id = 'popup-devis-odoobtn'; pop.className = 'popup-devis-odoobtn';
            const hdr = document.createElement('header');
            hdr.innerHTML = `<span>Ventes (${n})</span>`;
            const closeBtn = document.createElement('button'); closeBtn.textContent = 'Fermer'; closeBtn.onclick = () => pop.remove();
            hdr.appendChild(closeBtn);
            const ul = document.createElement('ul');
            ul.innerHTML = '<li style="opacity:.85;padding:12px;">Chargement des ventes...</li>';
            pop.appendChild(hdr); pop.appendChild(ul);
            document.body.appendChild(pop);

            const titleField = await detectSaleOrderTitleField();
            const baseFields = ['name','state','date_order','amount_total','currency_id'];
            if (titleField) baseFields.push(titleField);
            const records = await odooRpc('sale.order', 'search_read', [
                [['partner_id','in',partnerIds]], baseFields, 0, 20, 'date_order desc'
            ]) || [];
            ul.innerHTML = '';
            const stateMap = { draft:'Brouillon', sent:'Envoyé', sale:'Bon de commande', done:'Terminé', cancel:'Annulé' };
            records.forEach(r => {
                const li = document.createElement('li');
                const st = String(r.state||'').toLowerCase();
                if (st==='sale')   li.classList.add('state-sale');
                if (st==='done')   li.classList.add('state-done');
                if (st==='sent')   li.classList.add('state-sent');
                if (st==='cancel') li.classList.add('state-cancel');

                // Colonne 1 : référence
                const ref = document.createElement('span'); ref.className = 'so-ref'; ref.textContent = r.name;

                // Colonne 2 : titre + infos
                const info = document.createElement('div'); info.style.cssText = 'overflow:hidden;';
                const dt = r.date_order ? new Date(r.date_order) : null;
                const fmt = dt ? dt.toLocaleDateString('fr-FR')+' '+dt.toLocaleTimeString('fr-FR').slice(0,5) : '';
                const cur = Array.isArray(r.currency_id) ? r.currency_id[1] : '';
                const stateLabel = stateMap[st] || r.state;
                const amount = Math.round((r.amount_total||0)*100)/100;
                if (saleOrderTitleField && r[saleOrderTitleField]) {
                    const t = document.createElement('div'); t.className = 'so-title'; t.textContent = r[saleOrderTitleField];
                    info.appendChild(t);
                }
                const m = document.createElement('div'); m.className = 'muted'; m.style.textAlign = 'left';
                m.textContent = `${fmt} • ${stateLabel} • ${amount} ${cur}`;
                info.appendChild(m);

                // Colonne 3 : montant (vide, déjà dans info)
                const spacer = document.createElement('span');

                // Colonne 4 : bouton Ouvrir
                const openBtn = document.createElement('button'); openBtn.className = 'so-open-btn';
                openBtn.textContent = '↗ Ouvrir';
                openBtn.onclick = (e) => {
                    e.stopPropagation();
                    window.open(`/web#id=${r.id}&model=sale.order&view_type=form`, '_blank');
                };

                li.appendChild(ref); li.appendChild(info); li.appendChild(spacer); li.appendChild(openBtn);

                // Clic sur la ligne = expand lignes de commande
                li.style.cursor = 'pointer';
                li.addEventListener('click', async e => {
                    if (e.target?.classList.contains('so-open-btn')) return;
                    const existing = li.querySelector('.so-lines');
                    if (existing) { existing.remove(); li.classList.remove('expanded'); return; }
                    const lines = await odooRpc('sale.order.line', 'search_read', [
                        [['order_id','=',r.id]], ['name','product_uom_qty','price_unit','price_subtotal','currency_id'], 0, 100, 'sequence asc'
                    ]) || [];
                    const box = document.createElement('div'); box.className = 'so-lines';
                    const hdrRow = document.createElement('div'); hdrRow.className = 'line header';
                    hdrRow.innerHTML = '<div>Produit</div><div>Qté</div><div>Prix</div><div>Sous-total</div>';
                    box.appendChild(hdrRow);
                    lines.forEach(l => {
                        const row = document.createElement('div'); row.className = 'line';
                        const cur2 = Array.isArray(l.currency_id) ? l.currency_id[1] : '';
                        row.innerHTML = `<div class="pname">${(l.name||'').replace(/\n/g,' ')}</div><div class="qty">${Number(l.product_uom_qty||0)}</div><div class="price">${Math.round((l.price_unit||0)*100)/100} ${cur2}</div><div class="subtotal">${Math.round((l.price_subtotal||0)*100)/100} ${cur2}</div>`;
                        box.appendChild(row);
                    });
                    li.classList.add('expanded'); li.appendChild(box);
                });
                ul.appendChild(li);
            });
            if (!records.length) ul.innerHTML = '<li style="opacity:.8;padding:12px;">Aucune vente à afficher</li>';
        };

        const inner = document.createElement('div'); inner.className = 'bd-inner';
        const num = document.createElement('div'); num.className = 'bd-num'; num.textContent = n > 0 ? String(Math.min(n, 999)) : '0';
        const lbl = document.createElement('div'); lbl.className = 'bd-lbl'; lbl.textContent = 'Ventes';
        inner.appendChild(num); inner.appendChild(lbl);
        btn.appendChild(inner);
        badge.innerHTML = ''; badge.style.marginRight = '4px'; badge.appendChild(btn);
        ensureBadgeOrder(findStatsContainer());
    }

    function scheduleDevisUpdate(delay = 400) {
        clearTimeout(devisTimer);
        devisTimer = setTimeout(updateDevisBadge, delay);
    }

    // =========================================================
    // BADGE TICKETS OUVERTS (DOUBLONS)
    // =========================================================
    let openTicketsTimer = null;
    let autoPopupLastCode = '';
    let lastToastKey = '';
    let _closeStageIdsCache = { ids: [], at: 0 };

    function formatDateFr(str) {
        if (!str) return '';
        const d = new Date(str);
        return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR').slice(0,5);
    }

    function findPartnerCode() {
        const wrap = document.querySelector('.o_field_widget[name="partner_code"]');
        if (wrap) { const t = (wrap.textContent||'').trim(); if (t) return t; }
        return null;
    }

    async function getCloseStageIds() {
        if (_closeStageIdsCache.ids.length && Date.now() - _closeStageIdsCache.at < 5 * 60 * 1000) {
            return _closeStageIdsCache.ids;
        }
        const stages = await odooRpc('helpdesk.stage', 'search_read', [
            [['fold','=',true]], ['id'], 0, 100
        ]) || [];
        _closeStageIdsCache = { ids: stages.map(s => s.id), at: Date.now() };
        return _closeStageIdsCache.ids;
    }

    function odooUtcNowMinusMinutes(min) {
        const d = new Date(Date.now() - min * 60000);
        return d.toISOString().replace('T',' ').slice(0,19);
    }

    async function updateOpenTicketsBadge() {
        console.log('[updateOpenTicketsBadge] Début de la mise à jour du badge DOUBLONS');
        console.log('[updateOpenTicketsBadge] isTicketForm():', isTicketForm());

        if (!isTicketForm()) {
            console.log('[updateOpenTicketsBadge] Pas sur un formulaire de ticket, suppression du badge');
            document.getElementById('badge-tickets-ouverts')?.remove();
            return;
        }
        const stats = findStatsContainer();
        console.log('[updateOpenTicketsBadge] Conteneur stats:', stats ? '✅ trouvé' : '❌ absent');
        if (!stats) {
            console.log('[updateOpenTicketsBadge] ❌ Pas de conteneur stats, abandon');
            return;
        }

        let badge = document.getElementById('badge-tickets-ouverts');
        if (!badge) {
            console.log('[updateOpenTicketsBadge] Badge DOUBLONS absent, création...');
            badge = document.createElement('span');
            badge.id = 'badge-tickets-ouverts';
            placeAfterStats(stats, badge);
            console.log('[updateOpenTicketsBadge] ✅ Badge DOUBLONS créé et placé dans le conteneur');
        } else {
            console.log('[updateOpenTicketsBadge] Badge DOUBLONS existe déjà, repositionnement...');
            placeAfterStats(stats, badge);
        }
        badge.style.marginRight = '8px';

        const code = findPartnerCode();
        console.log('[updateOpenTicketsBadge] Code client:', code);
        if (!code) {
            console.log('[updateOpenTicketsBadge] Pas de code client, badge vide');
            badge.innerHTML = '';
            return;
        }

        const closeIds = await getCloseStageIds();
        const domain = [['partner_code','=',code]];
        if (closeIds.length) domain.push(['stage_id','not in',closeIds]);
        const currentId = getTicketIdFromPage();
        if (currentId && !isNaN(Number(currentId))) domain.push(['id','!=',Number(currentId)]);
        domain.push(['create_date','<',odooUtcNowMinusMinutes(0.5)]);

        const count = await odooRpc('helpdesk.ticket','search_count',[domain]) || 0;
        const n = Number(count);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'to-btn' + (n > 0 ? ' alert' : '');
        btn.title = n > 0 ? `${n} ticket(s) ouvert(s)` : 'Aucun doublon';
        btn.onclick = () => { if (n > 0) showOpenTicketsPopup(code, domain); };

        const inner = document.createElement('div'); inner.className = 'to-inner';
        const num = document.createElement('div'); num.className = 'to-num'; num.textContent = String(Math.min(n, 999));
        const lbl = document.createElement('div'); lbl.className = 'to-lbl'; lbl.textContent = 'Doublons';
        inner.appendChild(num); inner.appendChild(lbl);
        btn.appendChild(inner);

        if (n > 0) {
            showDoublonToast(code, n);
            if (autoPopupLastCode !== code) { autoPopupLastCode = code; showOpenTicketsPopup(code, domain); }
        }
        badge.innerHTML = ''; badge.appendChild(btn);
        ensureBadgeOrder(stats);
    }

    async function showOpenTicketsPopup(codeClient, domain) {
        document.getElementById('popup-tickets-ouverts')?.remove();
        const pop = document.createElement('div'); pop.id = 'popup-tickets-ouverts'; pop.className = 'popup-tickets-ouverts';
        const hdr = document.createElement('header');
        hdr.innerHTML = `<span>⚠️ Risque de doublon — Code client ${codeClient}</span>`;
        const closeBtn = document.createElement('button'); closeBtn.textContent = 'Fermer'; closeBtn.onclick = () => pop.remove();
        hdr.appendChild(closeBtn);
        const content = document.createElement('div'); content.className = 'content';
        const ul = document.createElement('ul');
        content.appendChild(ul); pop.appendChild(hdr); pop.appendChild(content);
        document.body.appendChild(pop);

        const recs = await odooRpc('helpdesk.ticket','search_read',[domain,['name','stage_id','user_id','create_date','team_id'],0,30,'create_date desc']) || [];
        recs.forEach(r => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `/web#id=${r.id}&model=helpdesk.ticket&view_type=form`;
            a.textContent = r.name || ('Ticket #'+r.id); a.style.color = '#8be9fd';
            a.onclick = e => { e.preventDefault(); window.location.href = a.href; pop.remove(); };
            const team = document.createElement('span'); team.className = 'team'; team.textContent = Array.isArray(r.team_id) ? r.team_id[1] : '';
            const muted = document.createElement('span'); muted.className = 'muted';
            muted.textContent = `${formatDateFr(r.create_date)}${Array.isArray(r.user_id) ? ' • '+r.user_id[1] : ''}`;
            li.appendChild(a); li.appendChild(team); li.appendChild(muted);
            li.addEventListener('click', e => { if (e.target?.tagName==='A') return; window.location.href = a.href; pop.remove(); });
            ul.appendChild(li);
        });
        if (!recs.length) ul.innerHTML = '<li style="opacity:.8;padding:12px;">Aucun ticket à afficher</li>';
    }

    function showDoublonToast(code, n) {
        const key = `${code}_${n}`;
        if (lastToastKey === key) return;
        lastToastKey = key;
        document.getElementById('doublon-toast')?.remove();
        const el = document.createElement('div'); el.id = 'doublon-toast'; el.className = 'doublon-toast';
        const inner = document.createElement('div'); inner.className = 'doublon-toast-inner';
        const icon = document.createElement('span'); icon.className = 'doublon-toast-icon'; icon.textContent = '⚠️';
        const text = document.createElement('span'); text.className = 'doublon-toast-text';
        text.textContent = `Attention : risque de doublon (${n} ouvert${n>1?'s':''})`;
        const close = document.createElement('button'); close.className = 'close'; close.textContent = '✕'; close.onclick = () => el.remove();
        inner.appendChild(icon); inner.appendChild(text); inner.appendChild(close);
        el.appendChild(inner); document.body.appendChild(el);
        setTimeout(() => { try { el.remove(); } catch(_){} }, 9000);
    }

    function scheduleOpenTicketsUpdate(delay = 400) {
        clearTimeout(openTicketsTimer);
        openTicketsTimer = setTimeout(updateOpenTicketsBadge, delay);
    }


    // =========================================================
    // ANIMATIONS LISTE TICKETS
    // =========================================================
    let _alertSoundPlayed = false;

    function updateTicketListAnimations() {
        if (!isTicketList()) return;

        // v19: Essayer plusieurs sélecteurs pour les lignes
        const rowSelectors = [
            '.o_list_view .o_data_row',
            '.o_list_view tr.o_data_row',
            '.o_list_renderer .o_data_row',
            'tr.o_data_row',
            '.o_data_row'
        ];

        let rows = [];
        for (const selector of rowSelectors) {
            rows = document.querySelectorAll(selector);
            if (rows.length > 0) {
                break;
            }
        }

        if (rows.length === 0) {
            return;
        }

        rows.forEach(row => {
            // Reconstruire le texte complet en ignorant les spans wave-letter (qui fragmentent le texte)
            const txt = (row.innerText || row.textContent || '').toLowerCase().replace(/\s+/g, ' ');
            // Vérifier aussi via localStorage (état stocké par le script)
            const rowId = row.getAttribute('data-id') || (row.dataset ? row.dataset.id : null);
            const storedState = rowId ? loadState(rowId) : 'stopped';
            // En traitement — détecter aussi via le container spécifique
            const hasEnCours = txt.includes("traitement de l'appel en cours") ||
                               txt.includes("traitement de l appel en cours") ||
                               txt.includes("traitement de l\u2019appel en cours") ||
                               !!row.querySelector('#texte-clignotant-container, [id*="clignotant"]') ||
                               storedState === 'running';
            if (hasEnCours) {
                if (!row.classList.contains('ticket-en-traitement')) {
                    row.classList.add('ticket-en-traitement');
                    row.style.border = '2px solid rgba(139,92,246,.7)';
                    row.style.borderRadius = '4px';
                }
            } else {
                row.classList.remove('ticket-en-traitement');
                row.removeAttribute('data-animation-applied');
                row.style.border = '';
                row.style.borderRadius = '';
            }
            // Bloquant (texte rouge)
            if (row.classList.contains('text-danger')) {
                if (!row.classList.contains('ticket-bloquant')) {
                    row.classList.add('ticket-bloquant');
                    row.style.border = '2px solid rgba(220,53,69,.8)';
                    row.style.borderRadius = '4px';
                    // Marquer comme alerté (sans son)
                    _alertSoundPlayed = true;
                }
            } else {
                row.classList.remove('ticket-bloquant');
            }
        });
    }

    // =========================================================
    // CLIGNOTEMENT TAG INTERNET
    // =========================================================
    function applyInternetBlink() {
        document.querySelectorAll('.o_tag,.badge,.o_tag_badge_text,.o_badge').forEach(el => {
            if ((el.textContent||'').trim().toLowerCase().includes('internet')) {
                const target = el.classList.contains('o_tag') || el.classList.contains('badge') ? el : (el.closest('.o_tag,.badge') || el);
                if (target && !target.classList.contains('internet-blink')) target.classList.add('internet-blink');
            }
        });
    }

    // =========================================================
    // BADGE CLIENT PRIORITAIRE (ASSISTANCE MATERIEL) — via API
    // =========================================================
    function normTagText(t) {
        return (t || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
    }

    const _assistanceCache = new Map();
    let _assistanceTagIds = null;   // tags "ASSISTANCE MATERIEL"
    let _newTagIds = null;          // tags "NEW", "NEW 2025", "NEW 2026"...

    async function getAssistanceTagIds() {
        if (_assistanceTagIds !== null) return _assistanceTagIds;
        try {
            const recs = await odooRpc('winpharma.tags', 'search_read',
                [[['name', 'ilike', 'assistance mat']], ['id', 'name'], 0, 50]) || [];
            _assistanceTagIds = recs.map(r => r.id);
        } catch (e) {
            console.warn('[PrioritaireBadge] Erreur getAssistanceTagIds:', e);
            _assistanceTagIds = [];
        }
        return _assistanceTagIds;
    }

    async function getNewTagIds() {
        if (_newTagIds !== null) return _newTagIds;
        try {
            // Couvre "NEW", "NEW 2025", "NEW 2026", etc. On filtre ensuite sur un nom commençant par "NEW".
            const recs = await odooRpc('winpharma.tags', 'search_read',
                [[['name', 'ilike', 'new']], ['id', 'name'], 0, 50]) || [];
            _newTagIds = recs
                .filter(r => /^new\b/i.test(String(r.name || '').trim()))
                .map(r => r.id);
        } catch (e) {
            console.warn('[NewBadge] Erreur getNewTagIds:', e);
            _newTagIds = [];
        }
        return _newTagIds;
    }

    // Extraction robuste de l'ID partenaire depuis un href (v16-v18: ?id=123 ; v19: /odoo/.../123)
    function extractPartnerIdFromHref(href) {
        if (!href) return null;
        let m = href.match(/[#&?]id=(\d+)/);
        if (m) return Number(m[1]);
        // v19 : dernier segment numérique du chemin (/odoo/contacts/17571)
        const all = [...href.matchAll(/\/(\d+)(?=[/?#]|$)/g)];
        if (all.length) return Number(all[all.length - 1][1]);
        return null;
    }

    async function applyPrioritaireBadges() {
            if (!isTicketList()) return;
            const table = document.querySelector('.o_list_view table, table.o_list_table, .o_list_renderer table');
            if (!table) return;

            // Repérer les colonnes via les en-têtes (robuste aux changements d'attributs v19)
            const ths = Array.from(table.querySelectorAll('thead th'));
            let idxClient = -1, idxName = -1;
            ths.forEach((th, i) => {
                const t = th.textContent.trim().toLowerCase();
                if (idxClient === -1 && (t.includes('client') || t.includes('pharmacie'))) idxClient = i;
                if (idxName === -1 && (t === 'nom' || t === 'sujet' || t.includes('sujet'))) idxName = i;
            });
            if (idxClient === -1) return;

            const [matIds, newIds] = await Promise.all([getAssistanceTagIds(), getNewTagIds()]);
            if (!matIds.length && !newIds.length) return;

            const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
            if (!rows.length) return;

            const rowInfos = rows.map(row => {
                const cells = row.querySelectorAll('td');
                const partnerCell = cells[idxClient] || null;
                const nameCell = (idxName >= 0 ? cells[idxName] : null);
                const ticketName = nameCell ? nameCell.textContent.trim() : '';
                return { row, partnerCell, ticketName };
            }).filter(r => r.partnerCell && r.ticketName);

            if (!rowInfos.length) return;

            // Clé de cache = nom du ticket
            const toFetch = rowInfos.filter(r => !_assistanceCache.has(r.ticketName));
            const names = [...new Set(toFetch.map(r => r.ticketName))];

            if (names.length) {
                try {
                    const recs = await odooRpc('helpdesk.ticket', 'search_read', [
                        [['name', 'in', names]],
                        ['id', 'name', 'partner_id', 'etiquette_winpharma'], 0, 2000
                    ]) || [];

                    if (window.__tmBadgeDebug !== false) {
                        console.log('[Badge] tags matériel:', matIds, '| tags NEW:', newIds,
                                    '| tickets interrogés:', names.length, '| reçus:', recs.length,
                                    '| ex. etiquette:', recs[0] && recs[0].etiquette_winpharma);
                    }

                    recs.forEach(rec => {
                        const tags = rec.etiquette_winpharma || [];
                        const tagIdList = tags.map(t => Array.isArray(t) ? t[0] : t);
                        const hasMat = matIds.some(id => tagIdList.includes(id));
                        const hasNew = newIds.some(id => tagIdList.includes(id));
                        const key = (rec.name || '').trim();
                        const prev = _assistanceCache.get(key) || { mat: false, new: false };
                        _assistanceCache.set(key, { mat: prev.mat || hasMat, new: prev.new || hasNew });
                    });

                    toFetch.forEach(r => {
                        if (!_assistanceCache.has(r.ticketName)) _assistanceCache.set(r.ticketName, { mat: false, new: false });
                    });
                } catch (e) {
                    console.warn('[Badge] Erreur API (vérifier le champ etiquette_winpharma):', e);
                    toFetch.forEach(r => _assistanceCache.set(r.ticketName, { mat: false, new: false }));
                }
            }

            rowInfos.forEach(({ partnerCell, ticketName }) => {
                const info = _assistanceCache.get(ticketName) || { mat: false, new: false };

                // Badge "contrat matériel" (rouge)
                const exMat = partnerCell.querySelector('.badge-client-prioritaire');
                if (info.mat && !exMat) {
                    const badge = document.createElement('div');
                    badge.className = 'badge-client-prioritaire';
                    badge.textContent = '⚠ Client prioritaire — contrat matériel';
                    partnerCell.appendChild(badge);
                } else if (!info.mat && exMat) {
                    exMat.remove();
                }

                // Badge "contrat NEW" (vert)
                const exNew = partnerCell.querySelector('.badge-client-new');
                if (info.new && !exNew) {
                    const badge = document.createElement('div');
                    badge.className = 'badge-client-new';
                    badge.textContent = '🆕 NEW';
                    partnerCell.appendChild(badge);
                } else if (!info.new && exNew) {
                    exNew.remove();
                }
            });
        }

    // =========================================================
    // RAPPELS RDV
    // =========================================================
    // Parse la date/heure d'un RDV depuis le texte de la cellule.
    // Gère l'ancien format "JJ/MM/AAAA HH:MM" ET le format v19 français "9 juin, 14:00"
    // (mois en toutes lettres, année omise si année courante), + "aujourd'hui/demain/hier".
    function parseRdvDateTime(text) {
        if (!text) return null;
        const t = text.replace(/\u00a0/g, ' ').trim();

        // 1) Format classique JJ/MM/AAAA HH:MM
        let m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
        if (m) {
            const [, jj, mm, aaaa, hh, min] = m;
            const d = new Date(Number(aaaa), Number(mm) - 1, Number(jj), Number(hh), Number(min), 0);
            return isNaN(d.getTime()) ? null : { date: d, hh: String(hh).padStart(2, '0'), min };
        }

        // Résout un mois français (accents/abréviations) vers 0-11
        const resolveFrMonth = (s) => {
            const n = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.$/, '');
            if (n.startsWith('juil')) return 6;
            if (n.startsWith('juin')) return 5;
            const map = { jan: 0, fev: 1, mar: 2, avr: 3, mai: 4, aou: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
            const v = map[n.substring(0, 3)];
            return (v === undefined) ? null : v;
        };

        // 2) Heure du jour relative : "aujourd'hui 14:00", "demain 14:00", "hier 14:00"
        const heure = t.match(/(\d{1,2}):(\d{2})/);
        const lower = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (heure && /(aujourd|demain|hier)/.test(lower)) {
            const hh = heure[1], min = heure[2];
            const d = new Date();
            if (lower.includes('demain')) d.setDate(d.getDate() + 1);
            else if (lower.includes('hier')) d.setDate(d.getDate() - 1);
            d.setHours(Number(hh), Number(min), 0, 0);
            return { date: d, hh: String(hh).padStart(2, '0'), min };
        }

        // 3) Format v19 : "9 juin, 14:00" ou "9 juin 2026, 14:00"
        m = t.match(/(\d{1,2})\s+([a-zà-ÿ]+\.?)(?:\s+(\d{4}))?,?\s+(\d{1,2}):(\d{2})/i);
        if (m) {
            const jj = parseInt(m[1], 10);
            const mois = resolveFrMonth(m[2]);
            const aaaa = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
            const hh = m[4], min = m[5];
            if (mois === null) return null;
            const d = new Date(aaaa, mois, jj, Number(hh), Number(min), 0);
            return isNaN(d.getTime()) ? null : { date: d, hh: String(hh).padStart(2, '0'), min };
        }

        return null;
    }

    function scanRdvRappels() {
        const ths = document.querySelectorAll('table thead th');
        let idxRdv = -1, idxPharma = -1, idxAssigne = -1;
        ths.forEach((th, i) => {
            const t = th.textContent.toLowerCase();
            if (t.includes('nouveau rendez-vous')) idxRdv = i;
            if (t.includes('client') || t.includes('pharmacie')) idxPharma = i;
            if (t.includes('assigné') || t.includes('assigne') || t.includes('responsable')) idxAssigne = i;
        });
        if (idxRdv === -1) return;

        document.querySelectorAll('tr.o_data_row').forEach(row => {
            const cells = row.querySelectorAll('td');
            const cellRdv = cells[idxRdv];
            if (!cellRdv) return;

            // Chercher la pharmacie : colonne dédiée ou fallback regex
            let pharmaName = '';
            if (idxPharma >= 0 && cells[idxPharma]) {
                pharmaName = cells[idxPharma].textContent.trim();
            } else {
                cells.forEach(c => { if (/pharmacie|pharma/i.test(c.textContent) && !pharmaName) pharmaName = c.textContent.trim(); });
            }

            // Chercher qui a mis le RDV (colonne assigné)
            let assigneName = '';
            if (idxAssigne >= 0 && cells[idxAssigne]) {
                assigneName = cells[idxAssigne].textContent.trim();
            }

            const parsed = parseRdvDateTime(cellRdv.textContent);
            if (!parsed) { cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-rouge','rdv-clignote-depasse'); return; }
            const { date: dateRdv, hh, min } = parsed;
            const now = new Date();
            const diff = (dateRdv - now) / 60000;

            if (dateRdv.toDateString() !== now.toDateString()) {
                cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-rouge','rdv-clignote-depasse'); return;
            }
            if (diff < 0) {
                cellRdv.classList.add('rdv-clignote-depasse'); cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-rouge');
                const key = `depasse_${cellRdv.textContent.trim()}_${pharmaName}`;
                if (!localStorage.getItem('notifFermee_'+key)) {
                    showRdvNotif({ type: 'depasse', pharma: pharmaName, assigne: assigneName, heure: `${hh}:${min}` }, key);
                }
            } else if (diff <= 10) {
                cellRdv.classList.add('rdv-clignote-rouge'); cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-depasse');
                const key = `rouge_${cellRdv.textContent.trim()}_${pharmaName}`;
                if (!localStorage.getItem('notifFermee_'+key)) {
                    showRdvNotif({ type: 'rouge', pharma: pharmaName, assigne: assigneName, heure: `${hh}:${min}`, diff: Math.round(diff) }, key);
                }
            } else {
                cellRdv.classList.add('rdv-clignote-orange'); cellRdv.classList.remove('rdv-clignote-rouge','rdv-clignote-depasse');
            }
        });
    }

    function showRdvNotif({ type, pharma, assigne, heure, diff }, key) {
        if (localStorage.getItem('notifFermee_'+key)) return;
        if (document.getElementById('rdv-notif-odoo')) return;

        const notif = document.createElement('div');
        notif.id = 'rdv-notif-odoo';
        notif.className = 'rdv-notif-odoo' + (type === 'depasse' ? ' depasse' : type === 'rouge' ? ' rouge' : '');

        const inner = document.createElement('div'); inner.className = 'rdv-notif-inner';

        // Header
        const hdr = document.createElement('div'); hdr.className = 'rdv-notif-header';
        const icon = document.createElement('span'); icon.className = 'rdv-notif-icon';
        icon.textContent = type === 'depasse' ? '🔴' : '🟠';
        const title = document.createElement('span'); title.className = 'rdv-notif-title';
        title.textContent = type === 'depasse' ? 'RDV dépassé' : `RDV dans ${diff} min`;
        const closeBtn = document.createElement('button'); closeBtn.className = 'rdv-notif-close'; closeBtn.textContent = '✕';
        closeBtn.onclick = () => { notif.remove(); if (key) localStorage.setItem('notifFermee_'+key,'1'); };
        hdr.appendChild(icon); hdr.appendChild(title); hdr.appendChild(closeBtn);

        // Body
        const body = document.createElement('div'); body.className = 'rdv-notif-body';
        if (pharma) {
            const p = document.createElement('div'); p.className = 'rdv-notif-pharma'; p.textContent = pharma;
            body.appendChild(p);
        }
        const t = document.createElement('div'); t.className = 'rdv-notif-time'; t.textContent = `🕐 ${heure}`;
        body.appendChild(t);
        if (assigne) {
            const w = document.createElement('div'); w.className = 'rdv-notif-who'; w.textContent = `Posé par : ${assigne}`;
            body.appendChild(w);
        }

        inner.appendChild(hdr); inner.appendChild(body);
        notif.appendChild(inner);
        document.body.appendChild(notif);

        // Auto-fermeture après 30s pour les non-dépassés
        if (type !== 'depasse') setTimeout(() => { try { notif.remove(); } catch(_){} }, 30000);
    }

    // =========================================================
    // STYLES CATÉGORIES / ÉQUIPES — en-têtes de groupe de la liste des tickets
    // =========================================================
    // accent = couleur principale ; le fond est dérivé automatiquement (transparence).
    const CATEGORY_STYLES = {
        'LOGICIEL':              { accent:'#10b981', emoji:'💻' },
        'MATERIEL':              { accent:'#8b5cf6', emoji:'🛠️' },
        'MATERIEL N2':           { accent:'#ef4444', emoji:'🧰' },
        'RMA/SAV TECH EN COURS': { accent:'#f59e0b', emoji:'📦' },
        'RMA':                   { accent:'#f59e0b', emoji:'📦' },
        'MSAV':                  { accent:'#ec4899', emoji:'✉️' },
        'MAIL SAV':              { accent:'#ec4899', emoji:'✉️' },
        'WINTEAM':               { accent:'#0ea5e9', emoji:'⭐' }
    };

    function normLabel(text) {
        return (text||'').replace(/\s*\(\d+\)\s*$/,'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    }

    function hexToRgba(hex, a) {
        const m = hex.replace('#','');
        const r = parseInt(m.substring(0,2),16), g = parseInt(m.substring(2,4),16), b = parseInt(m.substring(4,6),16);
        return `rgba(${r},${g},${b},${a})`;
    }

    // Détermine la catégorie d'un libellé d'en-tête de groupe (gère les variantes)
    function resolveCategoryKey(raw) {
        const base = normLabel(raw);
        if (CATEGORY_STYLES[base]) return base;
        if (base.startsWith('MATERIEL')) return /\bN2\b/i.test(raw) ? 'MATERIEL N2' : 'MATERIEL';
        if (base.startsWith('RMA')) return 'RMA/SAV TECH EN COURS';
        if (base.startsWith('MAIL SAV') || base.startsWith('MAILSAV')) return 'MAIL SAV';
        return null;
    }

    // Lit le libellé d'un en-tête de groupe SANS l'emoji injecté (.cat-emoji), où qu'il soit.
    // Indispensable pour que le garde-fou soit stable et n'entre pas en boucle.
    function groupLabelText(el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('.cat-emoji').forEach(n => n.remove());
        return (clone.textContent || '').trim();
    }

    // Applique (ou réinitialise) le style sur l'élément "nom de groupe" d'un en-tête.
    function styleGroupName(el) {
        if (!el || el.nodeType !== 1) return;
        const raw = groupLabelText(el);
        if (!raw || raw.length > 64) return;
        const key = resolveCategoryKey(raw);

        // Déjà traité avec la même catégorie => ne rien faire (évite toute boucle d'observer)
        if (el.dataset.styledCategory === (key || 'none')) return;

        // Réinitialiser un éventuel style précédent (changement de groupe / re-render)
        el.style.background = '';
        el.style.backgroundImage = '';
        el.style.borderLeft = '';
        el.style.boxShadow = '';
        el.style.color = '';
        el.style.fontWeight = '';
        el.style.borderRadius = '';
        el.style.padding = '';
        el.style.paddingLeft = '';
        el.querySelectorAll('.cat-emoji').forEach(n => n.remove());

        if (!key) { el.dataset.styledCategory = 'none'; return; }

        const cfg = CATEGORY_STYLES[key];
        // Style épuré : dégradé qui s'estompe depuis la gauche + fin liseré d'accent.
        el.style.backgroundImage = `linear-gradient(90deg, ${hexToRgba(cfg.accent, 0.20)} 0%, ${hexToRgba(cfg.accent, 0.05)} 40%, transparent 72%)`;
        el.style.boxShadow = `inset 3px 0 0 0 ${cfg.accent}`;
        el.style.color = cfg.accent;
        el.style.fontWeight = '600';
        el.style.paddingLeft = '10px';

        // Emoji inséré JUSTE AVANT le texte du libellé => reste sur la même ligne (pas de retour à la ligne).
        const tag = document.createElement('span');
        tag.className = 'cat-emoji';
        tag.textContent = cfg.emoji + ' ';
        tag.style.cssText = 'display:inline;vertical-align:middle;';
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        let textNode = null, n;
        while ((n = walker.nextNode())) { if (n.nodeValue && n.nodeValue.trim()) { textNode = n; break; } }
        if (textNode && textNode.parentNode) textNode.parentNode.insertBefore(tag, textNode);
        else if (el.firstChild) el.insertBefore(tag, el.firstChild);
        else el.appendChild(tag);

        el.dataset.styledCategory = key;
    }

    function scanCategoryStyles() {
        // Coloration réservée aux EN-TÊTES DE GROUPE de la liste des tickets uniquement.
        // (Évite de colorer des éléments sans rapport dans le formulaire ou les cellules.)
        if (!isTicketList()) return;
        document.querySelectorAll('tr.o_group_header').forEach(row => {
            const nameEl = row.querySelector('.o_group_name') || row.querySelector('th, td');
            if (nameEl) styleGroupName(nameEl);
        });
    }

    // =========================================================
    // FONCTIONS HISTORIQUE ET PRODUITS CLIENTS - INTERFACE
    // =========================================================

    // Fonction pour formater la date
    function formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    // Fonction pour obtenir les infos de l'équipe
    function getTeamInfo(teamData) {
        const teamId = Array.isArray(teamData) ? teamData[0] : teamData;
        const rawTeamName = Array.isArray(teamData) ? (teamData[1] || '') : '';
        const normalizedTeamName = rawTeamName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        console.log('[HISTORY] Team data:', { teamId, rawTeamName, normalizedTeamName });

        // Correspondances basées sur les noms exacts d'Odoo
        if (normalizedTeamName.includes('materiel n2')) {
            return { icon: 'fa-wrench', class: 'MaterielN2', name: 'MaterielN2', label: 'Matériel N2' };
        }
        if (normalizedTeamName.includes('logiciel')) {
            return { icon: 'fa-laptop', class: 'Logiciel', name: 'Logiciel', label: 'Logiciel' };
        }
        if (normalizedTeamName.includes('materiel') && !normalizedTeamName.includes('n2')) {
            return { icon: 'fa-wrench', class: 'Materiel', name: 'Materiel', label: 'Matériel' };
        }
        if (normalizedTeamName.includes('rma') || normalizedTeamName.includes('sav')) {
            return { icon: 'fa-exchange', class: 'RMA', name: 'RMA', label: 'RMA/SAV' };
        }
        if (normalizedTeamName.includes('mail sav')) {
            return { icon: 'fa-envelope', class: 'MailSAV', name: 'MailSAV', label: 'Mail SAV' };
        }
        if (normalizedTeamName.includes('winteam')) {
            return { icon: 'fa-star', class: 'Winteam', name: 'Winteam', label: 'Winteam' };
        }

        // Correspondances par ID (fallback)
        switch(teamId) {
            case 8:
                return { icon: 'fa-laptop', class: 'Logiciel', name: 'Logiciel', label: 'Logiciel' };
            case 1:
                return { icon: 'fa-wrench', class: 'Materiel', name: 'Materiel', label: 'Matériel' };
            case 9:
                return { icon: 'fa-exchange', class: 'RMA', name: 'RMA', label: 'RMA/SAV' };
            case 10:
                return { icon: 'fa-wrench', class: 'MaterielN2', name: 'MaterielN2', label: 'Matériel N2' };
            default:
                // Utiliser le nom brut comme fallback
                const cleanName = rawTeamName.replace(/[^a-zA-Z0-9]/g, '');
                return {
                    icon: 'fa-question',
                    class: cleanName || 'Unknown',
                    name: cleanName || 'Unknown',
                    label: rawTeamName || 'Inconnu'
                };
        }
    }

    // Fonction pour traduire les stages et ajouter les classes CSS
    function translateStage(stageName) {
        const stageTranslations = {
            'New': { text: 'Nouveau', class: 'nouveau' },
            'In Progress': { text: 'En cours', class: 'en-cours' },
            'Pending': { text: 'En attente', class: 'en-attente' },
            'Solved': { text: 'Résolu', class: 'resolu' },
            'Canceled': { text: 'Annulé', class: 'annule' },
            'Cancelled': { text: 'Annulé', class: 'annule' },
            'Closed': { text: 'Fermé', class: 'ferme' },
            'Nouveau': { text: 'Nouveau', class: 'nouveau' },
            'En cours': { text: 'En cours', class: 'en-cours' },
            'En attente': { text: 'En attente', class: 'en-attente' },
            'Résolu': { text: 'Résolu', class: 'resolu' },
            'Annulé': { text: 'Annulé', class: 'annule' },
            'Fermé': { text: 'Fermé', class: 'ferme' }
        };

        const result = stageTranslations[stageName];
        if (result) {
            return result;
        }

        // Fallback pour les statuts non reconnus
        return { text: stageName, class: 'autre' };
    }

    // Fonction pour mettre à jour la liste des tickets
    function updateTicketsList(tickets) {
        const ticketsList = document.getElementById('ticketsList');
        if (!ticketsList) {
            console.log('[HISTORY] Element ticketsList non trouvé');
            return;
        }

        console.log('[HISTORY] updateTicketsList appelée avec:', tickets);

        // Gérer différents formats de réponse
        let records = [];
        if (tickets && tickets.records) {
            records = tickets.records;
        } else if (tickets && tickets.result && tickets.result.records) {
            records = tickets.result.records;
        } else if (Array.isArray(tickets)) {
            records = tickets;
        }

        console.log('[HISTORY] Records extraits:', records);

        if (!records || records.length === 0) {
            ticketsList.innerHTML = '<div class="no-tickets">Aucun ticket trouvé</div>';
            return;
        }

        const html = records.map(ticket => {
            const teamInfo = getTeamInfo(ticket.team_id);
            const stageInfo = translateStage(ticket.stage_id ? ticket.stage_id[1] : 'Inconnu');
            const userName = ticket.user_id ? ticket.user_id[1] : 'Non assigné';

            return `
                <div class="ticket-item" data-team="${teamInfo.name}" data-ticket-id="${ticket.id}">
                    <div class="ticket-header">
                        <span class="ticket-title">${ticket.name || 'Sans titre'}</span>
                        <span class="ticket-date">
                            <i class="fa fa-calendar"></i> ${formatDate(ticket.create_date)}
                            ${ticket.close_date ? `
                                <i class="fa fa-arrow-right mx-1"></i>
                                <i class="fa fa-calendar-check-o"></i> ${formatDate(ticket.close_date)}
                            ` : ''}
                        </span>
                    </div>
                    <div class="ticket-info">
                        <div class="ticket-team" data-team="${teamInfo.name}">
                            <i class="fa ${teamInfo.icon}"></i>
                            ${teamInfo.label || teamInfo.name}
                        </div>
                        <div class="ticket-assignee">
                            <i class="fa fa-user"></i>
                            ${userName}
                        </div>
                        <span class="ticket-status ${stageInfo.class}">${stageInfo.text}</span>
                    </div>
                    ${ticket.description ? `
                        <div class="ticket-description">
                            <strong>Description:</strong><br>
                            ${ticket.description}
                        </div>
                    ` : ''}
                    ${ticket.request_answer ? `
                        <div class="ticket-response">
                            <div class="ticket-response-header">
                                <i class="fa fa-comment"></i>
                                <span>Note interne</span>
                            </div>
                            <div class="ticket-response-content">
                                ${ticket.request_answer}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        ticketsList.innerHTML = html;

        // Ajouter les événements de clic pour ouvrir les tickets
        ticketsList.querySelectorAll('.ticket-item').forEach(item => {
            item.addEventListener('click', () => {
                const ticketId = item.dataset.ticketId;
                if (ticketId) {
                    console.log('[HISTORY] Ouverture du ticket:', ticketId);
                    openTicketInNewTab(ticketId);
                }
            });
        });

        // Ajouter un compteur de tickets
        const headerElement = document.querySelector('.historique-header span');
        if (headerElement) {
            headerElement.textContent = `Historique des tickets (${records.length})`;
        }

        console.log('[HISTORY] Liste des tickets mise à jour avec', records.length, 'tickets');
    }

    // Fonction pour configurer les filtres de tickets
    function setupTicketFilters() {
        const searchInput = document.getElementById('ticketSearch');
        const teamFilter = document.getElementById('teamFilter');

        if (searchInput && teamFilter) {
            const filterTickets = () => {
                const searchTerm = searchInput.value.toLowerCase();
                const selectedTeam = teamFilter.value;
                const tickets = document.querySelectorAll('.ticket-item');

                tickets.forEach(ticket => {
                    // Rechercher dans le titre
                    const title = ticket.querySelector('.ticket-title').textContent.toLowerCase();

                    // Rechercher dans la description
                    const descriptionElement = ticket.querySelector('.ticket-description');
                    const description = descriptionElement ? descriptionElement.textContent.toLowerCase() : '';

                    // Rechercher dans la note interne
                    const responseElement = ticket.querySelector('.ticket-response-content');
                    const response = responseElement ? responseElement.textContent.toLowerCase() : '';

                    // Rechercher dans les informations du ticket (utilisateur, etc.)
                    const assigneeElement = ticket.querySelector('.ticket-assignee');
                    const assignee = assigneeElement ? assigneeElement.textContent.toLowerCase() : '';

                    const team = ticket.dataset.team;

                    // Vérifier si le terme de recherche est présent dans n'importe quel champ
                    const matchesSearch = !searchTerm ||
                        title.includes(searchTerm) ||
                        description.includes(searchTerm) ||
                        response.includes(searchTerm) ||
                        assignee.includes(searchTerm);

                    const matchesTeam = !selectedTeam || team === selectedTeam;

                    ticket.style.display = matchesSearch && matchesTeam ? '' : 'none';
                });

                // Compter les tickets visibles
                const visibleTickets = document.querySelectorAll('.ticket-item:not([style*="display: none"])');
                const headerElement = document.querySelector('.historique-header span');
                if (headerElement) {
                    const totalTickets = document.querySelectorAll('.ticket-item').length;
                    if (searchTerm || selectedTeam) {
                        headerElement.textContent = `Historique des tickets (${visibleTickets.length}/${totalTickets})`;
                    } else {
                        headerElement.textContent = `Historique des tickets (${totalTickets})`;
                    }
                }
            };

            searchInput.addEventListener('input', filterTickets);
            teamFilter.addEventListener('change', filterTickets);
        }
    }

    // Fonction pour mettre à jour la liste des produits
    function updateProductsList(products) {
        const productsList = document.getElementById('productsList');
        if (!productsList) return;

        if (!products || !products.result || !products.result.records || products.result.records.length === 0) {
            productsList.innerHTML = '<div class="no-products">Aucun produit trouvé</div>';
            return;
        }

        const html = products.result.records.map(product => {
            const type = product.type === 'express' ? 'Express' : 'Normal';
            const typeClass = product.type === 'express' ? 'express-product' : 'normal-product';
            const categName = product.categ_id ? product.categ_id[1] : 'Non catégorisé';

            return `
                <div class="product-item ${typeClass}" data-type="${product.type}">
                    <div class="product-header">
                        <span class="product-title">${product.name}</span>
                        <span class="product-date">
                            <i class="fa fa-calendar"></i> ${formatDate(product.create_date)}
                        </span>
                    </div>
                    <div class="product-info">
                        ${product.default_code ? `
                            <div class="product-ref">
                                <i class="fa fa-barcode"></i>
                                Réf: ${product.default_code}
                            </div>
                        ` : ''}
                        <div class="product-category">
                            <i class="fa fa-tag"></i>
                            ${categName}
                        </div>
                        <span class="product-type">${type}</span>
                    </div>
                    ${product.description ? `
                        <div class="product-description">
                            <strong>Description:</strong><br>
                            ${product.description}
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        productsList.innerHTML = html;

        // Ajouter un compteur de produits
        const headerElement = document.querySelector('.produits-header span');
        if (headerElement) {
            headerElement.textContent = `Produits du client (${products.result.records.length})`;
        }
    }

    // Fonction pour configurer les filtres de produits
    function setupProductFilters() {
        const searchInput = document.getElementById('productSearch');
        const typeFilter = document.getElementById('typeFilter');

        if (searchInput && typeFilter) {
            const filterProducts = () => {
                const searchTerm = searchInput.value.toLowerCase();
                const selectedType = typeFilter.value;
                const products = document.querySelectorAll('.product-item');

                products.forEach(product => {
                    // Rechercher dans le titre
                    const title = product.querySelector('.product-title').textContent.toLowerCase();

                    // Rechercher dans la description
                    const descriptionElement = product.querySelector('.product-description');
                    const description = descriptionElement ? descriptionElement.textContent.toLowerCase() : '';

                    // Rechercher dans les informations du produit (référence, etc.)
                    const infoElements = product.querySelectorAll('.product-info div');
                    let allInfo = '';
                    infoElements.forEach(info => {
                        allInfo += info.textContent.toLowerCase() + ' ';
                    });

                    const type = product.dataset.type;

                    // Vérifier si le terme de recherche est présent dans n'importe quel champ
                    const matchesSearch = !searchTerm ||
                        title.includes(searchTerm) ||
                        description.includes(searchTerm) ||
                        allInfo.includes(searchTerm);

                    const matchesType = !selectedType || type === selectedType;

                    product.style.display = matchesSearch && matchesType ? '' : 'none';
                });

                // Compter les produits visibles
                const visibleProducts = document.querySelectorAll('.product-item:not([style*="display: none"])');
                const headerElement = document.querySelector('.produits-header span');
                if (headerElement) {
                    const totalProducts = document.querySelectorAll('.product-item').length;
                    if (searchTerm || selectedType) {
                        headerElement.textContent = `Produits du client (${visibleProducts.length}/${totalProducts})`;
                    } else {
                        headerElement.textContent = `Produits du client (${totalProducts})`;
                    }
                }
            };

            searchInput.addEventListener('input', filterProducts);
            typeFilter.addEventListener('change', filterProducts);
        }
    }

    // Fonction pour ajouter l'historique des tickets
    function buildHistoryPanelHTML() {
        return `
            <div class="historique-header">
                <div class="historique-header-left">
                    <span>Historique des tickets</span>
                    <div class="theme-toggle-container">
                        <button class="theme-toggle-btn" id="theme-toggle" title="Basculer le thème sombre">
                            <i class="fa fa-moon-o"></i>
                        </button>
                    </div>
                </div>
                <div class="historique-header-right">
                    <div class="ticket-filters">
                        <input type="text" class="filter-input" placeholder="Rechercher (titre, description, notes, utilisateur)..." id="ticketSearch">
                        <select class="filter-input" id="teamFilter">
                            <option value="">Toutes les équipes</option>
                            <option value="Logiciel">Logiciel</option>
                            <option value="Materiel">Matériel</option>
                            <option value="MaterielN2">Matériel N2</option>
                            <option value="RMA">RMA/SAV</option>
                            <option value="MailSAV">Mail SAV</option>
                            <option value="Winteam">Winteam</option>
                        </select>
                    </div>
                </div>
            </div>
            <div id="ticketsList">
                <div class="no-tickets">Chargement des tickets...</div>
            </div>
        `;
    }

    function setupHistoryThemeToggle(scopeEl) {
        const root = scopeEl || document;
        const themeToggle = root.querySelector('#theme-toggle');
        if (!themeToggle || themeToggle.dataset.bound) return;
        themeToggle.dataset.bound = '1';

        const isDark = localStorage.getItem('odoo-history-theme') === 'dark';
        if (isDark) {
            document.body.classList.add('dark-theme');
            themeToggle.classList.add('active');
            themeToggle.innerHTML = '<i class="fa fa-sun-o"></i>';
        }

        themeToggle.addEventListener('click', () => {
            const isCurrentlyDark = document.body.classList.contains('dark-theme');
            if (isCurrentlyDark) {
                document.body.classList.remove('dark-theme');
                themeToggle.classList.remove('active');
                themeToggle.innerHTML = '<i class="fa fa-moon-o"></i>';
                localStorage.setItem('odoo-history-theme', 'light');
            } else {
                document.body.classList.add('dark-theme');
                themeToggle.classList.add('active');
                themeToggle.innerHTML = '<i class="fa fa-sun-o"></i>';
                localStorage.setItem('odoo-history-theme', 'dark');
            }
        });
    }

    function extractPartnerIdFromRow(row) {
        const rowId = row.getAttribute('data-id') || (row.dataset ? row.dataset.id : null);
        if (rowId && /^\d+$/.test(String(rowId))) return Number(rowId);
        const link = row.querySelector('a[href*="contacts/"], a[href*="res.partner"], a[href*="model=res.partner"]');
        if (link) {
            const id = extractPartnerIdFromHref(link.getAttribute('href') || link.href);
            if (id) return id;
        }
        return null;
    }

    function extractPartnerNameFromRow(row) {
        const firstCell = row.querySelector('td');
        if (!firstCell) return '';
        const clone = firstCell.cloneNode(true);
        clone.querySelectorAll('.btn-partner-list-history').forEach(el => el.remove());
        return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    async function openPartnerHistoryModal(partnerId, partnerName) {
        document.getElementById('partner-history-modal')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'partner-history-modal';
        overlay.className = 'partner-history-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'partner-history-modal';

        const title = document.createElement('div');
        title.className = 'partner-history-modal-toolbar';
        title.innerHTML = `<span>${partnerName || ('Client #' + partnerId)} — Historique des tickets</span>`;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'partner-history-modal-close';
        closeBtn.title = 'Fermer';
        closeBtn.innerHTML = '<i class="fa fa-times"></i>';
        closeBtn.addEventListener('click', () => overlay.remove());
        title.appendChild(closeBtn);

        const historyContainer = document.createElement('div');
        historyContainer.id = 'zone_historique_tickets';
        historyContainer.className = 'history-container visible partner-history-modal-body';
        historyContainer.innerHTML = buildHistoryPanelHTML();

        modal.appendChild(title);
        modal.appendChild(historyContainer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        setupHistoryThemeToggle(historyContainer);

        const tickets = await fetchClientTickets(partnerId);
        if (tickets) {
            updateTicketsList(tickets);
        } else {
            const ticketsList = historyContainer.querySelector('#ticketsList');
            if (ticketsList) ticketsList.innerHTML = '<div class="no-tickets">Aucun ticket trouvé</div>';
        }
        setupTicketFilters();
    }

    function ensurePartnerListHistoryButtons() {
        if (!isPartnerList()) return;

        const table = document.querySelector('.o_list_view table, table.o_list_table, .o_list_renderer table');
        if (!table) return;

        table.querySelectorAll('tbody tr.o_data_row').forEach(row => {
            if (row.querySelector('.btn-partner-list-history')) return;

            const partnerId = extractPartnerIdFromRow(row);
            if (!partnerId) return;

            const firstCell = row.querySelector('td');
            if (!firstCell) return;

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-partner-list-history';
            btn.title = 'Historique des tickets';
            btn.innerHTML = '<i class="fa fa-history"></i>';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                openPartnerHistoryModal(partnerId, extractPartnerNameFromRow(row));
            });

            firstCell.insertBefore(btn, firstCell.firstChild);
        });
    }

    async function addTicketHistory() {
        if (historyAdded) return;

        const formSheet = document.querySelector('.o_form_sheet');
        if (!formSheet) return;

        const buttonContainer = document.querySelector('.buttons-container');
        if (!buttonContainer) return;

        // Créer la zone d'historique
        const historyContainer = document.createElement('div');
        historyContainer.id = 'zone_historique_tickets';
        historyContainer.className = 'history-container';

        historyContainer.innerHTML = buildHistoryPanelHTML();

        buttonContainer.insertAdjacentElement('afterend', historyContainer);

        setupHistoryThemeToggle(historyContainer);

        // Charger les tickets
        const tickets = await fetchClientTickets();
        if (tickets) {
            updateTicketsList(tickets);
        }

        // Ajouter les gestionnaires d'événements pour les filtres
        setupTicketFilters();

        // Afficher selon l'état sauvegardé
        const shouldBeVisible = getHistoryState();
        if (shouldBeVisible) {
            historyContainer.classList.add('visible');
            const button = document.getElementById('showHistoryButton');
            if (button) {
                button.innerHTML = '<i class="fa fa-times"></i> Masquer l\'historique';
            }
        }

        historyAdded = true;
        return historyContainer;
    }

    // Fonction pour ajouter la section produits du client
    async function addClientProducts() {
        if (productsAdded) return;

        const formSheet = document.querySelector('.o_form_sheet');
        if (!formSheet) return;

        const buttonContainer = document.querySelector('.buttons-container');
        if (!buttonContainer) return;

        // Créer la zone de produits
        const productsContainer = document.createElement('div');
        productsContainer.id = 'zone_produits_client';
        productsContainer.className = 'products-container';

        productsContainer.innerHTML = `
            <div class="produits-header">
                <div class="produits-header-left">
                    <span>Produits du client</span>
                </div>
                <div class="produits-header-right">
                    <div class="product-filters">
                        <input type="text" class="filter-input" placeholder="Rechercher (nom, description, référence, SN)..." id="productSearch">
                        <select class="filter-input" id="typeFilter">
                            <option value="">Tous les types</option>
                            <option value="normal">Normal</option>
                            <option value="express">Express</option>
                        </select>
                    </div>
                </div>
            </div>
            <div id="productsList">
                <div class="no-products">Chargement des produits...</div>
            </div>
        `;

        buttonContainer.insertAdjacentElement('afterend', productsContainer);

        // Charger les produits
        const products = await fetchClientProducts();
        if (products) {
            updateProductsList(products);
        }

        // Ajouter les gestionnaires d'événements pour les filtres
        setupProductFilters();

        // Afficher selon l'état sauvegardé
        const shouldBeVisible = getProductsState();
        if (shouldBeVisible) {
            productsContainer.classList.add('visible');
            const button = document.getElementById('showProductsButton');
            if (button) {
                button.innerHTML = '<i class="fa fa-times"></i> Masquer les produits';
            }
        }

        productsAdded = true;
        return productsContainer;
    }

    // Fonction pour ajouter les boutons d'historique et de produits
    function addHistoryAndProductsButtons() {
        console.log('[addHistoryAndProductsButtons] Début de la fonction');
        console.log('[addHistoryAndProductsButtons] isValidUrlForHistory():', isValidUrlForHistory());
        console.log('[addHistoryAndProductsButtons] historyButtonAdded:', historyButtonAdded);
        console.log('[addHistoryAndProductsButtons] productsButtonAdded:', productsButtonAdded);

        if (!isValidUrlForHistory()) {
            console.log('[addHistoryAndProductsButtons] URL non valide, abandon');
            return;
        }
        if (historyButtonAdded && productsButtonAdded) {
            console.log('[addHistoryAndProductsButtons] Boutons déjà ajoutés, abandon');
            return;
        }

        // v19: Chercher le formulaire avec plusieurs sélecteurs
        const formSheetSelectors = [
            '.o_form_renderer .o_form_sheet',  // v19 - PRIORITAIRE
            '.o_form_sheet',
            '.o_form_view .o_form_sheet',
            '.o_content .o_form_sheet',
            '.o_form_renderer',  // v19 fallback
            'form .o_form_sheet'
        ];

        let formSheet = null;
        for (const selector of formSheetSelectors) {
            formSheet = document.querySelector(selector);
            if (formSheet) {
                break;
            }
        }

        if (!formSheet) {
            return;
        }

        // Vérifier si le conteneur de boutons existe déjà
        let buttonContainer = document.querySelector('.buttons-container');

        // Créer le conteneur pour les boutons s'il n'existe pas
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'buttons-container';
            formSheet.appendChild(buttonContainer);
        }

        // Ajouter le bouton d'historique
        if (!historyButtonAdded && !document.getElementById('showHistoryButton')) {
            const historyButton = document.createElement('button');
            historyButton.id = 'showHistoryButton';
            historyButton.innerHTML = '<i class="fa fa-history"></i> Historique des tickets';
            historyButton.title = 'Afficher/masquer l\'historique des tickets';

            historyButton.addEventListener('click', function() {
                let historyContainer = document.getElementById('zone_historique_tickets');

                if (historyContainer) {
                    historyContainer.classList.toggle('visible');
                    const isVisible = historyContainer.classList.contains('visible');
                    saveHistoryState(isVisible);

                    if (isVisible) {
                        historyButton.innerHTML = '<i class="fa fa-times"></i> Masquer l\'historique';
                    } else {
                        historyButton.innerHTML = '<i class="fa fa-history"></i> Historique des tickets';
                    }
                } else {
                    addTicketHistory().then((newContainer) => {
                        if (newContainer) {
                            newContainer.classList.add('visible');
                            saveHistoryState(true);
                            historyButton.innerHTML = '<i class="fa fa-times"></i> Masquer l\'historique';
                        }
                    });
                }
            });

            buttonContainer.appendChild(historyButton);
            historyButtonAdded = true;
        }

        // Ajouter le bouton des produits
        if (!productsButtonAdded && !document.getElementById('showProductsButton')) {
            console.log('[addHistoryAndProductsButtons] Création du bouton Produits...');
            const productsButton = document.createElement('button');
            productsButton.id = 'showProductsButton';
            productsButton.innerHTML = '<i class="fa fa-cubes"></i> Produits du client';
            productsButton.title = 'Afficher/masquer les produits du client';

            productsButton.addEventListener('click', function() {
                let productsContainer = document.getElementById('zone_produits_client');

                if (productsContainer) {
                    const wasVisible = productsContainer.classList.contains('visible');

                    if (wasVisible) {
                        productsContainer.classList.remove('visible');
                        productsButton.innerHTML = '<i class="fa fa-cubes"></i> Produits du client';
                        saveProductsState(false);
                    } else {
                        productsContainer.classList.add('visible');
                        productsButton.innerHTML = '<i class="fa fa-times"></i> Masquer les produits';
                        saveProductsState(true);
                    }
                } else {
                    addClientProducts().then((newContainer) => {
                        if (newContainer) {
                            newContainer.classList.add('visible');
                            saveProductsState(true);
                            productsButton.innerHTML = '<i class="fa fa-times"></i> Masquer les produits';
                        }
                    });
                }
            });

            buttonContainer.appendChild(productsButton);
            productsButtonAdded = true;
            console.log('[addHistoryAndProductsButtons] ✅ Bouton Produits créé et ajouté');
        } else {
            console.log('[addHistoryAndProductsButtons] Bouton Produits déjà existant, skip');
        }
    }

    // Fonction pour gérer la navigation et réinitialiser les états
    function handleHistoryNavigation() {
        if (isProcessingNavigation) return;

        try {
            isProcessingNavigation = true;

            // Réinitialiser les états pour s'assurer que tout est bien recréé
            historyAdded = false;
            historyButtonAdded = false;
            productsAdded = false;
            productsButtonAdded = false;

            // Supprimer les conteneurs existants pour éviter les doublons
            const existingHistory = document.getElementById('zone_historique_tickets');
            if (existingHistory) {
                existingHistory.remove();
            }

            const existingProducts = document.getElementById('zone_produits_client');
            if (existingProducts) {
                existingProducts.remove();
            }

            // Supprimer les boutons existants
            const existingHistoryButton = document.getElementById('showHistoryButton');
            if (existingHistoryButton) {
                existingHistoryButton.remove();
            }

            const existingProductsButton = document.getElementById('showProductsButton');
            if (existingProductsButton) {
                existingProductsButton.remove();
            }

            document.getElementById('partner-history-modal')?.remove();

            // Ajouter les boutons immédiatement
            setTimeout(() => {
                addHistoryAndProductsButtons();
                ensurePartnerListHistoryButtons();

                // Si l'état est sauvegardé comme visible, créer immédiatement l'historique et les produits
                if (getHistoryState()) {
                    const historyButton = document.getElementById('showHistoryButton');
                    if (historyButton) {
                        historyButton.click();
                    }
                }

                if (getProductsState()) {
                    const productsButton = document.getElementById('showProductsButton');
                    if (productsButton) {
                        productsButton.click();
                    }
                }
            }, 500);

        } finally {
            setTimeout(() => {
                isProcessingNavigation = false;
            }, 1000);
        }
    }

    // =========================================================
    // RECHERCHE CLIENT PAR TÉLÉPHONE (intégré depuis recherchetel.js, adapté v16→v19)
    // =========================================================
    const TMTEL_MIN_DIGITS = 3;     // chiffres min pour lancer une recherche
    const TMTEL_MIN_SUGGEST = 5;    // chiffres min pour suggestions à la frappe
    let _tmTelStylesInjected = false;

    function tmTelInjectStyles() {
        if (_tmTelStylesInjected) return; _tmTelStylesInjected = true;
        const st = document.createElement('style');
        st.textContent = `
        #tm-tel-wrap { display:flex; align-items:center; gap:6px; margin-top:6px; position:relative; flex-wrap:wrap; }
        #tm-tel-wrap .tm-tel-input { box-sizing:border-box; border-radius:7px; padding:5px 9px; min-width:170px; height:30px;
            background:rgba(128,128,128,.10); border:1px solid rgba(128,128,128,.35); color:inherit; font-size:12px; outline:none; }
        #tm-tel-wrap .tm-tel-input:focus { border-color:#0d9488; box-shadow:0 0 0 2px rgba(13,148,136,.25); }
        #tm-tel-wrap .tm-tel-btn { border:none; border-radius:7px; padding:5px 12px; height:30px; cursor:pointer;
            background:#0d9488; color:#fff; font-size:12px; font-weight:600; white-space:nowrap; display:inline-flex; align-items:center; gap:6px; }
        #tm-tel-wrap .tm-tel-btn:hover { filter:brightness(1.08); }
        #tm-tel-suggest { position:absolute; left:0; top:calc(100% + 4px); z-index:2147483646; min-width:260px; max-height:280px; overflow:auto;
            background:#1e2330; color:#e8eaf0; border:1px solid rgba(255,255,255,.12); border-radius:8px; box-shadow:0 8px 28px rgba(0,0,0,.45); display:none; }
        #tm-tel-suggest .tm-it { padding:8px 10px; cursor:pointer; display:flex; flex-direction:column; gap:2px; border-bottom:1px solid rgba(255,255,255,.06); }
        #tm-tel-suggest .tm-it:last-child { border-bottom:none; }
        #tm-tel-suggest .tm-it:hover { background:rgba(13,148,136,.20); }
        #tm-tel-suggest .tm-it .tm-nm { font-weight:600; font-size:13px; color:#fff; }
        #tm-tel-suggest .tm-it .tm-ph { opacity:.8; font-size:11px; }
        `;
        document.head.appendChild(st);
    }

    function tmTelDigits(s) { return (s || '').replace(/[^\d+]/g, '').replace(/\D/g, ''); }

    // Variantes de recherche FR : 0494... <-> +33494..., groupé/non groupé
    // Variantes de recherche : couvre les formats stockés (points/espaces/tirets, +33, etc.)
    function tmTelVariants(raw) {
        const d = (raw || '').replace(/\D/g, '');     // chiffres purs
        const out = [];
        const push = x => { if (x && !out.includes(x)) out.push(x); };
        if (!d) return out;

        const grp = (s, sep) => s.replace(/(\d{2})(?=\d)/g, '$1' + sep);
        push(d);                       // 0494660097
        push((raw || '').trim());      // tel que saisi
        ['.', ' ', '-'].forEach(sep => push(grp(d, sep)));   // 04.94.66.00.97 / 04 94 66 00 97 / 04-94-66-00-97

        // Formes internationales +33 (si commence par 0)
        if (/^0\d{8,}$/.test(d)) {
            const nat = d.slice(1);                 // 494660097
            push('+33' + nat);
            push('0033' + nat);
            push('33' + nat);
            const natGrp = (sep) => nat.charAt(0) + (nat.length > 1 ? sep + grp(nat.slice(1), sep) : '');
            ['.', ' ', '-'].forEach(sep => { push('+33 ' + natGrp(sep)); push('+33' + sep + natGrp(sep)); });
        }
        // Si saisi en 33... / +33..., ajouter la forme 0...
        if (/^33\d{8,}$/.test(d)) {
            const nat = d.slice(2);
            push('0' + nat);
            ['.', ' ', '-'].forEach(sep => push(grp('0' + nat, sep)));
        }
        return out;
    }

    // Requête partenaires : reproduit fidèlement recherchetel.js (web_search_read + fields),
    // avec repli search_read. Renvoie un tableau d'enregistrements.
    async function tmTelRpc(domain, limit = 20) {
        const fields = ['id', 'display_name', 'phone', 'email', 'city']; // pas de 'mobile' (inexistant en v19)
        const ctx = getOdooContext();
        // 1) web_search_read avec "fields" (comme l'ancien script qui fonctionnait)
        try {
            const res = await fetch(window.location.origin + '/web/dataset/call_kw/res.partner/web_search_read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'call', id: Date.now(),
                    params: {
                        model: 'res.partner', method: 'web_search_read', args: [],
                        kwargs: { limit, offset: 0, order: '', context: ctx, count_limit: 10001, domain, fields }
                    }
                })
            });
            const j = await res.json();
            if (j && j.result && Array.isArray(j.result.records)) return j.result.records;
        } catch (_) {}
        // 2) Repli : search_read (v19)
        const recs = await odooRpc('res.partner', 'search_read', [domain, fields, 0, limit]);
        return Array.isArray(recs) ? recs : [];
    }

    // name_search : exactement ce que fait le champ Client natif en v19 (sans 'args').
    async function tmTelNameSearch(q, limit = 20) {
        const ctx = Object.assign({}, getOdooContext(), { res_partner_search_mode: 'customer' });
        const r = await odooRpc('res.partner', 'name_search', [], { name: q, operator: 'ilike', limit, context: ctx });
        return Array.isArray(r) ? r.map(x => ({ id: Array.isArray(x) ? x[0] : x, display_name: Array.isArray(x) ? x[1] : '' })) : [];
    }

    // Recherche partenaire par téléphone.
    // A) name_search (comportement natif du champ Client) ; B) phone_mobile_search / phone.
    async function tmTelSearchPartner(raw, limit = 20) {
        const variants = tmTelVariants(raw);
        console.log('[TEL] Recherche, variantes:', variants);

        // A) name_search (le plus fiable : identique au champ Client)
        for (const q of variants) {
            if (tmTelDigits(q).length < TMTEL_MIN_DIGITS) continue;
            const pairs = await tmTelNameSearch(q, limit);
            console.log('[TEL] name_search', JSON.stringify(q), '=>', pairs.length);
            if (pairs.length) {
                const ids = pairs.map(p => p.id);
                const details = await odooRpc('res.partner', 'read', [ids, ['id', 'display_name', 'phone', 'city']]) || [];
                const byId = {}; details.forEach(d => { byId[d.id] = d; });
                return pairs.map(p => byId[p.id] || p);
            }
        }

        // B) Repli : phone_mobile_search puis phone
        for (const q of variants) {
            if (tmTelDigits(q).length < TMTEL_MIN_DIGITS) continue;
            const recs = await tmTelRpc([['phone_mobile_search', 'ilike', q]], limit);
            console.log('[TEL] B phone_mobile_search', JSON.stringify(q), '=>', recs.length);
            if (recs.length) return recs;
        }
        for (const q of variants) {
            if (tmTelDigits(q).length < TMTEL_MIN_DIGITS) continue;
            const recs = await tmTelRpc([['phone', 'ilike', q]], limit);
            console.log('[TEL] C phone', JSON.stringify(q), '=>', recs.length);
            if (recs.length) return recs;
        }
        return [];
    }

    function tmTelVisibleMenus() {
        const sels = ['.o-autocomplete--dropdown-menu', '.o-dropdown--menu', 'ul.ui-autocomplete', '.ui-menu'];
        const nodes = sels.flatMap(s => Array.from(document.querySelectorAll(s)));
        return nodes.filter(el => !!(el.offsetParent || el.getClientRects().length));
    }

    // Définit la valeur d'un input en notifiant Owl/React (setter natif)
    function tmTelSetInputValue(input, value) {
        try {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, value);
        } catch (_) { input.value = value; }
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Sélectionne le partenaire dans le many2one Client en s'appuyant sur l'autocomplete Odoo.
    async function tmTelSelectPartner(input, partner) {
        input.focus();
        tmTelSetInputValue(input, partner.display_name || '');
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', code: 'ArrowDown' }));

        const isOption = t => /(recherche avanc|search more|cr[ée]er|create|modifier|edit)/i.test((t || '').toLowerCase());
        for (let i = 0; i < 25; i++) {
            const menus = tmTelVisibleMenus();
            let item = null;
            for (const ul of menus) {
                const items = Array.from(ul.querySelectorAll('li, .o-autocomplete--dropdown-item, .dropdown-item, .o_m2o_dropdown_option'));
                item = items.find(li => {
                    const t = (li.textContent || '').trim();
                    return t && !isOption(t) && t.includes(partner.display_name || '\u0000');
                }) || items.find(li => {
                    const t = (li.textContent || '').trim();
                    return t && !isOption(t);
                });
                if (item) break;
            }
            if (item) {
                const tgt = item.querySelector('a,button,span,div') || item;
                ['mousedown', 'mouseup', 'click'].forEach(ev => tgt.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true })));
                return true;
            }
            await wait(120);
        }
        return false;
    }

    function tmTelHideSuggest(wrap) {
        const dd = wrap.querySelector('#tm-tel-suggest');
        if (dd) dd.style.display = 'none';
    }

    function tmTelRenderSuggest(wrap, records, clientInput, emptyMsg) {
        let dd = wrap.querySelector('#tm-tel-suggest');
        if (!dd) {
            dd = document.createElement('div'); dd.id = 'tm-tel-suggest';
            wrap.appendChild(dd);
        }
        dd.innerHTML = '';
        if (!records || !records.length) {
            if (emptyMsg) {
                const it = document.createElement('div'); it.className = 'tm-it';
                it.style.cursor = 'default';
                const nm = document.createElement('div'); nm.className = 'tm-ph'; nm.textContent = emptyMsg;
                it.appendChild(nm); dd.appendChild(it); dd.style.display = 'block';
            } else {
                dd.style.display = 'none';
            }
            return;
        }
        records.slice(0, 20).forEach(r => {
            const it = document.createElement('div'); it.className = 'tm-it';
            const nm = document.createElement('div'); nm.className = 'tm-nm'; nm.textContent = r.display_name || 'Client';
            const ph = document.createElement('div'); ph.className = 'tm-ph';
            const parts = [];
            if (r.phone || r.mobile) parts.push(r.phone || r.mobile);
            if (r.city) parts.push(String(r.city));
            ph.textContent = parts.join(' • ');
            it.appendChild(nm); it.appendChild(ph);
            it.addEventListener('click', async () => {
                await tmTelSelectPartner(clientInput, r);
                tmTelHideSuggest(wrap);
            });
            dd.appendChild(it);
        });
        dd.style.display = 'block';
    }

    function tmTelFindClientWidget() {
        return document.querySelector(
            '.o_field_widget[name="partner_id"], .o_field_many2one[name="partner_id"], .o_field_res_partner_many2one[name="partner_id"]'
        );
    }

    // Ajoute le mini-champ "Rech. tél" sous le champ Client (formulaire ticket uniquement).
    function ensurePhoneSearchUI() {
        if (!isTicketForm() && !isCreatingTicket()) {
            document.getElementById('tm-tel-wrap')?.remove();
            return;
        }
        const widget = tmTelFindClientWidget();
        if (!widget) return;
        const clientInput = widget.querySelector('input');
        if (!clientInput) return;

        const cell = widget.closest('.o_cell') || widget.parentElement;
        if (!cell || cell.querySelector('#tm-tel-wrap')) return;

        tmTelInjectStyles();

        const wrap = document.createElement('div'); wrap.id = 'tm-tel-wrap';
        const telInput = document.createElement('input');
        telInput.type = 'text'; telInput.className = 'tm-tel-input';
        telInput.placeholder = 'n° téléphone…';
        telInput.title = 'Rechercher le client par téléphone (+33, espaces et points acceptés)';
        telInput.autocomplete = 'off';

        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'tm-tel-btn';
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z"/></svg>Rech. tél';

        const doSearch = async () => {
            const q = (telInput.value || '').trim();
            if (tmTelDigits(q).length < TMTEL_MIN_DIGITS) return;
            tmTelRenderSuggest(wrap, [], clientInput, 'Recherche…');
            try {
                const records = await tmTelSearchPartner(q, 20);
                if (!records.length) { tmTelRenderSuggest(wrap, [], clientInput, 'Aucun client trouvé pour ce numéro'); return; }
                // Toujours afficher la liste (clic = sélection) — plus fiable que la sélection auto
                tmTelRenderSuggest(wrap, records, clientInput);
            } catch (e) { console.warn('[TEL] Erreur recherche:', e); tmTelRenderSuggest(wrap, [], clientInput, 'Erreur de recherche'); }
        };

        btn.addEventListener('click', doSearch);

        let deb;
        telInput.addEventListener('input', () => {
            if (tmTelDigits(telInput.value).length >= TMTEL_MIN_SUGGEST) {
                clearTimeout(deb);
                deb = setTimeout(async () => {
                    try { tmTelRenderSuggest(wrap, await tmTelSearchPartner(telInput.value, 20), clientInput); }
                    catch (_) { tmTelHideSuggest(wrap); }
                }, 220);
            } else {
                tmTelHideSuggest(wrap);
            }
        });
        telInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const first = wrap.querySelector('#tm-tel-suggest .tm-it');
                if (first) first.click(); else doSearch();
            } else if (e.key === 'Escape') {
                tmTelHideSuggest(wrap);
            }
        });
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) tmTelHideSuggest(wrap);
        });

        wrap.appendChild(telInput);
        wrap.appendChild(btn);
        cell.appendChild(wrap);
    }

    // =========================================================
    // APPELS MANQUÉS (portail Winlink) — bouton flottant sur la LISTE des tickets
    // =========================================================
    let _tmMissedData = null;
    let _tmMissedLoading = false;
    let _tmMissedLastFetch = 0;
    const _tmMissedNameCache = {};
    let _tmMissedStylesInjected = false;

    function tmMissedEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function tmMissedFmtTime(s) {
        if (!s) return '';
        const m = String(s).match(/(\d{2}):(\d{2})/);
        return m ? `${m[1]}h${m[2]}` : String(s);
    }

    function tmMissedInjectStyles() {
        if (_tmMissedStylesInjected) return; _tmMissedStylesInjected = true;
        const st = document.createElement('style');
        st.textContent = `
        #tm-missed-fab {
            position: relative;
            display: inline-flex; align-items: center; justify-content: center;
            flex: 0 0 auto; align-self: center;
            width: 28px; height: 28px; padding: 0; margin: 0 8px;
            border: none; border-radius: 50%;
            background: linear-gradient(135deg,#e11d48,#9f1239); color: #fff;
            cursor: pointer; vertical-align: middle; box-sizing: border-box;
            box-shadow: 0 1px 4px rgba(225,29,72,.4);
            transition: filter .12s ease, box-shadow .15s ease;
        }
        #tm-missed-fab:hover { filter: brightness(1.08); box-shadow: 0 2px 8px rgba(225,29,72,.55); }
        #tm-missed-fab svg { width: 14px; height: 14px; flex: 0 0 auto; }
        .tm-missed-count {
            position: absolute; top: -6px; right: -6px;
            min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
            background: #fff; color: #9f1239; font-weight: 800; font-size: 10px; line-height: 16px;
            display: inline-flex; align-items: center; justify-content: center;
            box-shadow: 0 0 0 1.5px #9f1239;
        }
        .tm-missed-count.tm-missed-zero { background: #94a3b8; color: #fff; box-shadow: none; }
        #tm-missed-panel {
            position: fixed; top: 52px; right: 16px; z-index: 99999;
            width: 360px; max-height: 70vh; display: flex; flex-direction: column;
            background: #0f172a; color: #e2e8f0; border: 1px solid #1e293b;
            border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.45); overflow: hidden;
        }
        .tm-missed-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 10px 12px; font-weight: 700; font-size: 13px;
            background: linear-gradient(135deg,#e11d48,#9f1239); color: #fff;
        }
        .tm-missed-head button {
            background: rgba(255,255,255,.15); border: none; color: #fff; cursor: pointer;
            width: 24px; height: 24px; border-radius: 6px; font-size: 13px; margin-left: 6px;
        }
        .tm-missed-head button:hover { background: rgba(255,255,255,.3); }
        .tm-missed-body { overflow-y: auto; padding: 6px; }
        .tm-missed-empty { padding: 22px 12px; text-align: center; color: #94a3b8; font-size: 13px; }
        .tm-missed-row {
            display: grid; grid-template-columns: 1fr auto; gap: 2px 8px;
            padding: 8px 10px; border-radius: 8px; margin-bottom: 4px; background: #1e293b;
        }
        .tm-missed-row-main { display: flex; align-items: center; gap: 8px; }
        .tm-missed-phone { font-weight: 700; font-size: 14px; color: #fff; }
        .tm-missed-badge { background: #e11d48; color: #fff; font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }
        .tm-missed-time { grid-column: 2; grid-row: 1 / span 2; align-self: center; font-size: 12px; color: #94a3b8; white-space: nowrap; }
        .tm-missed-name { grid-column: 1; font-size: 12.5px; color: #38bdf8; }
        .tm-missed-resolving { color: #64748b; font-style: italic; }
        .tm-missed-unknown { color: #64748b; }
        .tm-missed-section { padding: 8px 6px 4px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .4px; }
        .tm-missed-row.tm-missed-done { opacity: .55; }
        .tm-missed-row.tm-missed-done .tm-missed-phone { text-decoration: line-through; }
        .tm-missed-ok { background: #16a34a; color: #fff; font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }
        `;
        document.head.appendChild(st);
    }

    function tmMissedFetch() {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            // Clé API envoyée en en-tête X-Api-Key (pas dans l'URL => pas de fuite dans les logs/historique).
            // GM_xmlhttpRequest contourne CORS pour les domaines @connect, donc pas de preflight bloquant.
            const url = PORTAL_MISSED_CALLS_URL + '?scope=today';
            try {
                GM_xmlhttpRequest({
                    method: 'GET', url, timeout: 15000, anonymous: false,
                    headers: { 'X-Api-Key': PORTAL_API_KEY },
                    onload: (resp) => {
                        try {
                            if (resp && resp.status === 200) { resolve(JSON.parse(resp.responseText)); return; }
                        } catch (_) {}
                        resolve(null);
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            } catch (_) { resolve(null); }
        });
    }

    function tmMissedUpdateBadge() {
        const el = document.getElementById('tm-missed-count');
        if (!el) return;
        const c = _tmMissedData ? Number(_tmMissedData.count || 0) : 0;
        el.textContent = String(c);
        el.classList.toggle('tm-missed-zero', c === 0);
    }

    async function tmMissedRefresh(force) {
        const now = Date.now();
        if (!force && _tmMissedData && (now - _tmMissedLastFetch) < 60000) { tmMissedUpdateBadge(); return; }
        if (_tmMissedLoading) return;
        _tmMissedLoading = true;
        const data = await tmMissedFetch();
        _tmMissedLoading = false;
        if (data && data.ok) { _tmMissedData = data; _tmMissedLastFetch = now; }
        tmMissedUpdateBadge();
        if (document.getElementById('tm-missed-panel')) tmMissedRenderPanel();
    }

    async function tmMissedResolveNames(panel, entries) {
        for (const g of entries) {
            if (g.partner_name) continue;
            const digits = (g.phone || '').replace(/\D/g, '');
            if (!digits) continue;
            let name = _tmMissedNameCache[digits];
            if (name === undefined) {
                try {
                    const recs = await tmTelSearchPartner(g.phone, 1);
                    name = recs && recs.length ? (recs[0].display_name || '') : '';
                } catch (_) { name = ''; }
                _tmMissedNameCache[digits] = name;
            }
            if (!panel.isConnected) return;
            panel.querySelectorAll(`.tm-missed-row[data-digits="${digits}"] [data-name]`).forEach(cell => {
                cell.innerHTML = name ? tmMissedEsc(name) : '<span class="tm-missed-unknown">Numéro inconnu</span>';
            });
        }
    }

    function tmMissedRowHtml(g, resolved) {
        const digits = (g.phone || '').replace(/\D/g, '');
        const att = Number(g.attempts || 1);
        const nameHtml = g.partner_name
            ? tmMissedEsc(g.partner_name)
            : '<span class="tm-missed-resolving">Recherche client…</span>';
        return `<div class="tm-missed-row${resolved ? ' tm-missed-done' : ''}" data-digits="${digits}">`
            + `<div class="tm-missed-row-main"><span class="tm-missed-phone">${tmMissedEsc(g.phone || '')}</span>`
            + (att > 1 ? `<span class="tm-missed-badge">${att} manqués</span>` : '')
            + (resolved ? '<span class="tm-missed-ok">✓ rappelé</span>' : '') + `</div>`
            + `<div class="tm-missed-name" data-name>${nameHtml}</div>`
            + `<div class="tm-missed-time">${tmMissedFmtTime(g.last_time)}</div>`
            + `</div>`;
    }

    function tmMissedRenderPanel() {
        let panel = document.getElementById('tm-missed-panel');
        if (!panel) { panel = document.createElement('div'); panel.id = 'tm-missed-panel'; document.body.appendChild(panel); }

        const data = _tmMissedData;
        const pending = data && Array.isArray(data.pending) ? data.pending : [];
        const resolved = data && Array.isArray(data.resolved) ? data.resolved : [];
        const head = `<div class="tm-missed-head"><span>📞 À rappeler aujourd'hui</span>`
            + `<div><button id="tm-missed-reload" title="Rafraîchir">⟳</button>`
            + `<button id="tm-missed-close" title="Fermer">✕</button></div></div>`;

        let body;
        if (!data) body = `<div class="tm-missed-empty">Chargement…</div>`;
        else if (!pending.length && !resolved.length) body = `<div class="tm-missed-empty">Aucun appel manqué aujourd'hui 🎉</div>`;
        else if (!pending.length) body = `<div class="tm-missed-empty">Tous les appels manqués ont été rappelés 👍</div>`
            + `<div class="tm-missed-section">Déjà rappelés (${resolved.length})</div>`
            + resolved.map(g => tmMissedRowHtml(g, true)).join('');
        else {
            body = pending.map(g => tmMissedRowHtml(g, false)).join('');
            if (resolved.length) {
                body += `<div class="tm-missed-section">Déjà rappelés (${resolved.length})</div>`
                    + resolved.map(g => tmMissedRowHtml(g, true)).join('');
            }
        }

        panel.innerHTML = head + `<div class="tm-missed-body">${body}</div>`;
        panel.querySelector('#tm-missed-close')?.addEventListener('click', () => panel.remove());
        panel.querySelector('#tm-missed-reload')?.addEventListener('click', () => tmMissedRefresh(true));
        const toResolve = pending.concat(resolved);
        if (toResolve.length) tmMissedResolveNames(panel, toResolve);
    }

    function tmMissedTogglePanel() {
        const existing = document.getElementById('tm-missed-panel');
        if (existing) { existing.remove(); return; }
        tmMissedRenderPanel();
        tmMissedRefresh(true);
    }

    function tmMissedFindAnchor() {
        // Conteneur de navigation de la barre de contrôle (PAS le groupe de boutons de vue,
        // qui est un .btn-group et applique un style de groupe à ses voisins).
        const nav = document.querySelector('.o_control_panel_navigation');
        if (nav) return { el: nav, mode: 'prepend' };
        const pager = document.querySelector('.o_pager');
        if (pager) return { el: pager, mode: 'before' };
        return null;
    }

    function ensureMissedCallsButton() {
        if (!isTicketList()) {
            document.getElementById('tm-missed-fab')?.remove();
            document.getElementById('tm-missed-panel')?.remove();
            return;
        }
        if (document.getElementById('tm-missed-fab')) return;
        const anchor = tmMissedFindAnchor();
        if (!anchor) return; // barre pas encore prête : on retentera au prochain runAll
        tmMissedInjectStyles();

        const fab = document.createElement('button');
        fab.id = 'tm-missed-fab';
        fab.type = 'button';
        fab.title = "Appels manqués non rappelés (aujourd'hui)";
        fab.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
            + '<path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z"/>'
            + '<path d="M16 2l6 6M22 2l-6 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>'
            + '<span class="tm-missed-count" id="tm-missed-count">…</span>';
        fab.addEventListener('click', tmMissedTogglePanel);

        if (anchor.mode === 'prepend') anchor.el.insertBefore(fab, anchor.el.firstChild);
        else anchor.el.parentNode.insertBefore(fab, anchor.el);
        tmMissedRefresh(true);
    }

    // =========================================================
    // OBSERVER PRINCIPAL + INITIALISATION
    // =========================================================
    let lastUrl = window.location.href;

    function runAll() {
        addTraiterButton();
        styleCloseButton();
        addInitialesButton();
        addClearAssignButton();
        ensurePhoneSearchUI(); // Recherche client par téléphone (champ Client)
        ensureMissedCallsButton(); // Bouton flottant "Appels manqués" (liste tickets uniquement)
        addHistoryAndProductsButtons(); // Historique et produits (fiche client / ticket)
        ensurePartnerListHistoryButtons(); // Historique tickets dans la liste clients
        hideConvertToOpportunityButton(); // Cacher le bouton "Convertir en opportunité"
        hookDeleteAuditClicks();
        hookOdooDeleteRpcAudit();
        warmCurrentUserName(); // Pré-charge le nom de l'utilisateur (pour "Supprimé par")
        scheduleDevisUpdate(100);
        scheduleOpenTicketsUpdate(100);
        applyInternetBlink();
        scanCategoryStyles();
        initializeTheme(); // Initialiser le thème
        // Précharger les listes raisons dès qu'on est sur un ticket
        if (isTicketPage() && !_reasonListsCache) fetchReasonLists().catch(() => {});
    }

    // Observer DOM mutations — relance runAll quand le DOM change significativement
    let _runAllDebounce = null;
    const mainObserver = new MutationObserver(() => {
        clearTimeout(_runAllDebounce);
        _runAllDebounce = setTimeout(runAll, 400);
    });
    mainObserver.observe(document.body, { childList: true, subtree: true });

    // Observer dédié aux couleurs catégories — réagit immédiatement, sans debounce
    const categoryObserver = new MutationObserver(() => {
        scanCategoryStyles();
        applyInternetBlink();
    });
    categoryObserver.observe(document.body, { childList: true, subtree: true });

    // Observer dédié badges Ventes/Doublons — se déclenche dès que le button_box Odoo apparaît
    let _badgeDebounce = null;
    let _badgeUpdating = false;
    const badgeObserver = new MutationObserver(() => {
        // Réagir uniquement si le stats container vient d'apparaître et qu'on est sur un ticket
        if (!isTicketPage() || _badgeUpdating) return;
        const stats = findStatsContainer();
        if (!stats) return;
        // Déclencher uniquement si les badges ne sont pas encore dans le container
        const hasDevis = !!document.getElementById('badge-devis-client') && document.getElementById('badge-devis-client')?.parentNode === stats;
        const hasDoublons = !!document.getElementById('badge-tickets-ouverts') && document.getElementById('badge-tickets-ouverts')?.parentNode === stats;

        console.log('[badgeObserver] Vérification badges - VENTES:', hasDevis ? '✅' : '❌', 'DOUBLONS:', hasDoublons ? '✅' : '❌');

        if (!hasDevis || !hasDoublons) {
            console.log('[badgeObserver] 🔄 Déclenchement mise à jour badges dans 80ms...');
            clearTimeout(_badgeDebounce);
            _badgeDebounce = setTimeout(async () => {
                console.log('[badgeObserver] ▶️ Début mise à jour badges');
                _badgeUpdating = true;
                await updateDevisBadge();
                await updateOpenTicketsBadge();
                _badgeUpdating = false;
                console.log('[badgeObserver] ✅ Mise à jour badges terminée');
            }, 80);
        }
    });
    badgeObserver.observe(document.body, { childList: true, subtree: true });

    // Observer spécifique liste tickets
    let _listBadgeDebounce = null;
    const listObserver = new MutationObserver(() => {
        if (!isTicketList()) return;
        setTimeout(() => { updateTicketListAnimations(); }, 500);
        // Relancer les badges immédiatement si des lignes ont été recréées
        clearTimeout(_listBadgeDebounce);
        _listBadgeDebounce = setTimeout(() => {
            // Vider le cache pour forcer un re-fetch sur les lignes visibles
            _assistanceCache.clear();
            applyPrioritaireBadges();
        }, 150);
    });
    listObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Détection changement d'URL (SPA Odoo)
    setInterval(() => {
        const cur = window.location.href;
        if (cur !== lastUrl) {
            lastUrl = cur;
            _reasonPanelDone = false;
            _reasonPanelOpen = false;
            _reasonPanelTicketId = null;
            // Nettoyer tous les flags de session liés au panneau des raisons
            sessionStorage.removeItem('pendingReasonPanel');
            sessionStorage.removeItem('pendingReasonTicketId');
            sessionStorage.removeItem('reasonPanelForceOpen');
            sessionStorage.removeItem('reasonPanelProtectedTicketId');

            // Nettoyer les anciens flags de completion (garder seulement les 10 plus récents)
            const completionKeys = Object.keys(sessionStorage).filter(key => key.startsWith('reasonPanelCompleted_'));
            if (completionKeys.length > 10) {
                completionKeys.slice(0, completionKeys.length - 10).forEach(key => {
                    sessionStorage.removeItem(key);
                });
            }
            _assistanceCache.clear();
            _assistanceTagIds = null;
            _newTagIds = null;

            // Gérer la navigation pour l'historique et les produits
            handleHistoryNavigation();

            // Plusieurs tentatives pour s'assurer que le DOM Odoo est prêt
            setTimeout(runAll, 400);
            setTimeout(runAll, 900);
            setTimeout(runAll, 1800);
            setTimeout(updateTicketListAnimations, 600);
            setTimeout(applyPrioritaireBadges, 1500);
        }
    }, 300);

    // Intervalles périodiques
    setInterval(updateTicketListAnimations, 1200);
    setInterval(applyInternetBlink, 3000);
    setInterval(() => { applyPrioritaireBadges(); }, 2000);
    setInterval(scanCategoryStyles, 4000);
    setInterval(addClearAssignButton, 5000);
    setInterval(styleCloseButton, 3000);
    setInterval(scanRdvRappels, 2000);
    setInterval(scheduleDevisUpdate, 5000);
    setInterval(scheduleOpenTicketsUpdate, 3000);
    setInterval(watchStageChanges, 500); // Surveiller les changements de stage

    // Démarrage
    sessionStorage.removeItem('pendingReasonPanel'); // éviter ouverture fantôme au reload
    injectStyles();
    startClosureWatcher();
    // Rafraîchir le compteur d'appels manqués toutes les 60s (uniquement sur la liste tickets)
    setInterval(() => { if (isTicketList() && document.getElementById('tm-missed-fab')) tmMissedRefresh(); }, 60000);
    // Appliquer les couleurs immédiatement sans attendre le DOM complet
    scanCategoryStyles();
    applyInternetBlink();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scanCategoryStyles();
            applyInternetBlink();
            setTimeout(runAll, 800);
        });
    } else {
        setTimeout(runAll, 800);
    }

    window.addEventListener('load', () => {
        setTimeout(runAll, 1500);
        scheduleDevisUpdate(800);
        scheduleOpenTicketsUpdate(800);
        setTimeout(applyPrioritaireBadges, 2000);
    });

    window.addEventListener('hashchange', () => {
        setTimeout(runAll, 800);
        scheduleDevisUpdate(800);
        scheduleOpenTicketsUpdate(800);
        setTimeout(applyPrioritaireBadges, 1200);
    });

})(); // Fermeture de la fonction principale
