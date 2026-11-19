// ==UserScript==
// @name         Bouton Traiter l'Appel Odoo
// @namespace    http://tampermonkey.net/
// @version      4.4.2
// @description  Outils hotline Odoo – badges clients, doublons, ventes, RDV, historique tickets + appels Winlink, produits clients - Compatible v16-v19
// @author       Alexis.sair
// @match        https://winprovence.odoo.com/*
// @match        http://winprovence.odoo.com/*
// @match        https://*.odoo.com/*
// @match        https://*.dev.odoo.com/*
// @match        http://*.dev.odoo.com/*
// @match        https://winprovence.fr/*
// @match        http://winprovence.fr/*
// @match        https://*.winprovence.fr/*
// @updateURL    https://hotline.sippharma.fr/odoospeek/odoo/traiter.meta.js
// @downloadURL  https://hotline.sippharma.fr/odoospeek/odoo/traiter.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
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
    // Jauge de performance : le portail calcule tout (objectifs, score, série).
    // Aucun seuil ne doit figurer dans ce script, qui est lisible par les hotliners.
    const PORTAL_HOTLINER_SCORE_URL = 'https://hotline.sippharma.fr/odoospeek/portal/api/hotliner_score.php';
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

    async function odooRpc(model, method, args = [], kwargs = {}, requestOptions = {}) {
        // v16 → v19 : requête sur le MÊME domaine que la page (session = cookie).
        // On n'utilise plus l'URL codée en dur (_ru) car l'instance v19 peut être sur un autre domaine
        // => sinon le fetch part en cross-origin, les cookies ne sont pas envoyés et l'appel échoue.
        try {
            const res = await fetch(window.location.origin + '/web/dataset/call_kw/' + model + '/' + method, {
                method: 'POST',
                signal: requestOptions.signal,
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
    // ÉTAT HISTORIQUE ET PRODUITS CLIENTS
    // =========================================================
    let historyAdded = false;
    let historyButtonAdded = false;
    let productsAdded = false;
    let productsButtonAdded = false;
    let isProcessingNavigation = false;

    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

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
        // Jamais une liste si on est en création (/new) ou sur un formulaire (id numérique, view_type=form)
        if (isCreatingTicket() || isTicketForm()) return false;
        // v19: URL liste (sans numéro de ticket ni /new/.../create)
        if (/\/odoo\/[^?#]*ticket[s]?(\/|$|\?)/i.test(h) && !/\/odoo\/[^?#]*ticket[s]?\/(\d+|new|create)/i.test(h)) return true;
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
    // ACTIONS API TICKET
    // =========================================================
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
    // Le thème suit Odoo (clair / sombre) : on lit la couleur de fond réelle de la page.
    // L'ancien bouton « thème sombre » de l'historique n'existe plus.
    function tmSyncTheme() {
        try {
            let bg = '';
            for (let n = document.querySelector('.o_action_manager') || document.querySelector('.o_web_client') || document.body; n; n = n.parentElement) {
                const c = getComputedStyle(n).backgroundColor;
                if (c && c !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(c)) { bg = c; break; }
            }
            const m = bg.match(/[\d.]+/g);
            if (!m || m.length < 3) return;
            const [r, g, b] = m.map(Number);
            const theme = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45 ? 'dark' : 'light';
            if (document.documentElement.dataset.tmTheme !== theme) document.documentElement.dataset.tmTheme = theme;
        } catch (_) {}
    }

    function initializeTheme() {
        document.body.classList.remove('dark-theme');
        tmSyncTheme();
    }

    // Fonction pour ouvrir un ticket dans un nouvel onglet
    function openTicketInNewTab(ticketId) {
        const baseUrl = window.location.origin;
        const ticketUrl = `${baseUrl}/web#id=${ticketId}&model=helpdesk.ticket&view_type=form&action=368`;
        window.open(ticketUrl, '_blank');
    }


    // =========================================================
    // STYLES GLOBAUX
    // =========================================================
    function injectStyles() {
        if (document.getElementById('tm-main-styles')) return;
        const s = document.createElement('style');
        s.id = 'tm-main-styles';
        s.textContent = `
        /* =====================================================================
           DESIGN — calqué sur Odoo : mêmes couleurs, même typo, mêmes composants.
           Le thème (clair / sombre) suit Odoo : html[data-tm-theme] est posé par
           tmSyncTheme() d'après la couleur de fond réelle de la page. Les couleurs
           reprennent les variables Bootstrap d'Odoo quand elles existent.
           Règles : pas de cartes à liseré coloré, pas de dégradé, pas d'emoji,
           pas de majuscules forcées ; la couleur ne sert qu'à porter un sens.
           ===================================================================== */
        :root {
            --tm-bg: var(--bs-body-bg, #ffffff);
            --tm-bg-elevated: var(--bs-body-bg, #ffffff);
            --tm-bg-subtle: var(--bs-tertiary-bg, #f6f7f9);
            --tm-bg-hover: rgba(0,0,0,.035);
            --tm-border: var(--bs-border-color, #dee2e6);
            --tm-text: #2b3340;
            --tm-strong: #111827;
            --tm-muted: #5b6472;
            --tm-link: var(--bs-link-color, #017e84);
            --tm-danger: #d23f3a;  --tm-danger-bg: rgba(210,63,58,.10);
            --tm-warning: #b7791f; --tm-warning-bg: rgba(233,157,0,.13);
            --tm-success: #1f8a4c; --tm-success-bg: rgba(40,167,69,.11);
            --tm-info: #2f6fb7;    --tm-info-bg: rgba(47,111,183,.10);
            --tm-live: #22a052;
            --tm-radius: 6px;
            --tm-shadow: 0 6px 24px rgba(0,0,0,.14), 0 1px 3px rgba(0,0,0,.08);
        }
        html[data-tm-theme="dark"] {
            --tm-bg: var(--bs-body-bg, #262a36);
            --tm-bg-elevated: #2f3441;
            --tm-bg-subtle: rgba(255,255,255,.04);
            --tm-bg-hover: rgba(255,255,255,.05);
            --tm-border: var(--bs-border-color, #3d4250);
            --tm-text: #e4e6ea;
            --tm-strong: #ffffff;
            --tm-muted: #b4b9c2;
            --tm-link: var(--bs-link-color, #4fb8bd);
            --tm-danger: #f06a64;  --tm-danger-bg: rgba(240,106,100,.14);
            --tm-warning: #e3b04b; --tm-warning-bg: rgba(227,176,75,.14);
            --tm-success: #5cc685; --tm-success-bg: rgba(92,198,133,.13);
            --tm-info: #78a9e6;    --tm-info-bg: rgba(120,169,230,.14);
            --tm-live: #4cc777;
            --tm-shadow: 0 8px 28px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.3);
        }
        @media (prefers-reduced-motion: reduce) {
            .internet-blink, .rdv-clignote-orange::after, .rdv-clignote-rouge::after, .rdv-clignote-depasse::after { animation: none !important; }
        }

        /* === FORMULAIRE TICKET : boutons natifs, ajustements minimes === */
        button[name="close_ticket"][type="object"] { background: var(--tm-danger) !important; border-color: var(--tm-danger) !important; color: #fff !important; }
        /* « Me l'assigner » : le violet plein d'Odoo jurait à côté de « Clôturer » */
        button[name="assign_ticket_to_self"] {
            background: transparent !important; color: var(--tm-link) !important;
            border: 1px solid var(--tm-link) !important; box-shadow: none !important;
        }
        button[name="assign_ticket_to_self"]::before { content: '\\f234'; font-family: FontAwesome; margin-right: 6px; }
        button[name="assign_ticket_to_self"]:hover { background: var(--tm-link) !important; color: #fff !important; }
        .tm-initiales-btn-container { margin-bottom: 6px; }
        .clear-assign-button {
            position: absolute; right: 34px; top: 50%; transform: translateY(-50%); z-index: 2;
            width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: transparent;
            color: var(--tm-muted); font-size: 12px; line-height: 20px; cursor: pointer;
        }
        .clear-assign-button:hover { color: var(--tm-danger); background: var(--tm-danger-bg); }
        /* Boutons timer natifs masqués (comportement inchangé) */
        button[name="action_timer_start"], button[name="action_timer_pause"],
        button[name="action_timer_resume"], button[name="action_timer_stop"] {
            visibility: hidden !important; position: absolute !important; left: -9999px !important;
        }

        /* === BOUTONS DU SCRIPT : contour fin, fond transparent, icône en couleur === */
        .tm-btn {
            display: inline-flex !important; align-items: center; gap: 7px; height: 30px; padding: 0 12px; box-sizing: border-box;
            border: 1px solid var(--tm-border) !important; border-radius: 6px !important; background: transparent !important;
            color: var(--tm-text) !important; font-size: 13px; font-weight: 500; line-height: 1; white-space: nowrap; cursor: pointer;
            box-shadow: none !important; transition: border-color .12s ease, color .12s ease, background-color .12s ease;
        }
        .tm-btn .fa { color: var(--tm-link); font-size: 13px; }
        .tm-btn:hover { border-color: var(--tm-link) !important; color: var(--tm-strong) !important; background: var(--tm-bg-hover) !important; }
        .tm-btn:focus-visible { outline: 2px solid var(--tm-link); outline-offset: 1px; }
        .tm-btn.is-active { border-color: var(--tm-link) !important; color: var(--tm-link) !important; }
        .tm-btn-icon { width: 30px; padding: 0; justify-content: center; }

        /* === BOUTONS STATISTIQUES (Ventes, Doublons) — gabarit des stat buttons Odoo === */
        #badge-devis-client, #badge-tickets-ouverts { display: flex; align-items: stretch; flex-shrink: 0; }
        .tm-stat.oe_stat_button {
            display: flex; align-items: center; gap: 8px; height: 100%; min-height: 44px; padding: 0 16px;
            background: transparent; border: 0; border-left: 1px solid var(--tm-border); border-radius: 0;
            color: var(--tm-text); text-align: left; cursor: pointer;
        }
        .tm-stat.oe_stat_button:hover { background: var(--tm-bg-hover); }
        .tm-stat .o_button_icon { font-size: 18px; color: var(--tm-muted); width: 20px; text-align: center; }
        .tm-stat .o_stat_info { display: flex; flex-direction: column; line-height: 1.2; }
        .tm-stat .o_stat_value { font-weight: 600; color: var(--tm-strong); font-variant-numeric: tabular-nums; }
        .tm-stat .o_stat_text { font-size: 12px; color: var(--tm-muted); }
        .tm-stat.tm-stat-empty { cursor: default; }
        #badge-devis-client .tm-stat:not(.tm-stat-empty) .o_stat_value,
        #badge-devis-client .tm-stat:not(.tm-stat-empty) .o_button_icon { color: var(--tm-link); }
        .tm-stat.tm-stat-empty .o_stat_value { color: var(--tm-muted); font-weight: 500; }
        .tm-stat.tm-stat-alert .o_button_icon, .tm-stat.tm-stat-alert .o_stat_value { color: var(--tm-danger); }

        /* === PANNEAUX FLOTTANTS (ventes, doublons, appels manqués, journée) === */
        .tm-pop {
            position: fixed; top: 76px; right: 16px; z-index: 6000;
            display: flex; flex-direction: column; overflow: hidden;
            background: var(--tm-bg-elevated); color: var(--tm-text);
            border: 1px solid var(--tm-border); border-radius: var(--tm-radius); box-shadow: var(--tm-shadow);
            font-size: 13px; line-height: 1.45;
        }
        .tm-pop-head {
            display: flex; align-items: center; gap: 8px; flex-shrink: 0;
            padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--tm-border);
        }
        .tm-pop-title { font-weight: 600; color: var(--tm-strong); }
        .tm-pop-count { color: var(--tm-muted); font-variant-numeric: tabular-nums; }
        .tm-pop-head .tm-pop-actions { margin-left: auto; display: flex; gap: 2px; }
        .tm-icon-btn {
            width: 28px; height: 28px; padding: 0; border: 0; border-radius: 4px; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center;
            background: transparent; color: var(--tm-muted); font-size: 14px;
        }
        .tm-icon-btn:hover { background: var(--tm-bg-hover); color: var(--tm-strong); }
        .tm-pop-body { overflow-y: auto; min-height: 0; }
        .tm-pop-empty { padding: 20px 16px; color: var(--tm-muted); text-align: center; }
        .tm-pop-section { padding: 10px 16px 4px; font-size: 12px; font-weight: 500; color: var(--tm-muted); }

        /* Ventes */
        .popup-devis-odoobtn { width: min(860px, calc(100vw - 32px)); max-height: 70vh; }
        .tm-so { border-bottom: 1px solid var(--tm-border); border-left: 3px solid transparent; }
        .tm-so.st-sale   { border-left-color: #00c864; }
        .tm-so.st-done   { border-left-color: #1a6640; }
        .tm-so.st-sent   { border-left-color: #1e64c8; }
        .tm-so.st-cancel { border-left-color: #e53935; }
        .tm-so:last-child { border-bottom: 0; }
        .tm-so-row {
            display: grid; grid-template-columns: 76px minmax(0,1fr) 150px 96px 28px; align-items: center; gap: 12px;
            padding: 9px 12px 9px 16px; cursor: pointer;
        }
        .tm-so-row:hover { background: var(--tm-bg-hover); }
        .tm-so-ref { color: var(--tm-link); font-weight: 500; font-variant-numeric: tabular-nums; }
        .tm-so-main { min-width: 0; }
        .tm-so-title { color: var(--tm-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tm-so-date { font-size: 12px; color: var(--tm-muted); }
        .tm-so-amount { text-align: right; font-variant-numeric: tabular-nums; color: var(--tm-strong); }
        .tm-so.is-cancel .tm-so-title, .tm-so.is-cancel .tm-so-amount { color: var(--tm-muted); text-decoration: line-through; }
        .tm-so.is-open .tm-so-row { background: var(--tm-bg-subtle); }
        .tm-so-lines { padding: 4px 16px 12px 104px; background: var(--tm-bg-subtle); }
        .tm-so-lines table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .tm-so-lines th { text-align: left; font-weight: 500; color: var(--tm-muted); padding: 6px 8px 6px 0; border-bottom: 1px solid var(--tm-border); }
        .tm-so-lines td { padding: 6px 8px 6px 0; border-bottom: 1px solid var(--tm-border); vertical-align: top; }
        .tm-so-lines tr:last-child td { border-bottom: 0; }
        .tm-so-lines .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }

        /* Statut : point coloré + libellé, sans pastille */
        .tm-state {
            display: inline-flex; align-items: center; justify-self: start; padding: 2px 9px; border-radius: 10px;
            font-size: 12px; font-weight: 600; white-space: nowrap; background: var(--tm-bg-subtle); color: var(--tm-muted);
        }
        .tm-state.is-success { background: rgba(0,200,100,.15); color: #138a4a; }
        .tm-state.is-info    { background: rgba(30,100,200,.14); color: #1e5bb8; }
        .tm-state.is-warning { background: rgba(255,152,0,.16);  color: #b26a00; }
        .tm-state.is-danger  { background: rgba(229,57,53,.14);  color: #c62828; }
        html[data-tm-theme="dark"] .tm-state.is-success { color: #5ee0a0; }
        html[data-tm-theme="dark"] .tm-state.is-info    { color: #8fb8f5; }
        html[data-tm-theme="dark"] .tm-state.is-warning { color: #ffb74d; }
        html[data-tm-theme="dark"] .tm-state.is-danger  { color: #ff8a80; }

        /* Doublons */
        .popup-tickets-ouverts { width: min(560px, calc(100vw - 32px)); max-height: 60vh; z-index: 6100; }
        .popup-tickets-ouverts .tm-pop-title i { color: var(--tm-warning); margin-right: 6px; }
        .tm-dup {
            display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 12px; align-items: baseline;
            padding: 9px 16px; border-bottom: 1px solid var(--tm-border); cursor: pointer;
        }
        .tm-dup:last-child { border-bottom: 0; }
        .tm-dup:hover { background: var(--tm-bg-hover); }
        .tm-dup-name { color: var(--tm-link); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tm-dup-date { font-size: 12px; color: var(--tm-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .tm-dup-meta { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--tm-text); }
        .tm-dup-meta .ticket-team { font-size: 11.5px; padding: 1px 8px; }

        /* === HISTORIQUE / PRODUITS DU CLIENT === */
        .buttons-container { margin: 16px 0 4px; display: flex; gap: 8px; flex-wrap: wrap; }
        #zone_historique_tickets, #zone_produits_client {
            display: none; flex-direction: column; position: relative;
            margin: 12px 0; height: 70vh; min-height: 460px; max-height: 820px; overflow: hidden; resize: vertical;
            background: var(--tm-bg); color: var(--tm-text);
            border: 1px solid var(--tm-border); border-radius: var(--tm-radius);
        }
        #zone_historique_tickets.visible, #zone_produits_client.visible { display: flex !important; }
        .historique-header, .produits-header {
            display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; justify-content: space-between;
            padding: 12px 16px; border-bottom: 1px solid var(--tm-border); background: var(--tm-bg);
        }
        .historique-header-left, .produits-header-left { font-weight: 600; font-size: 14px; color: var(--tm-strong); }
        .historique-header-right, .produits-header-right { flex: 1; display: flex; justify-content: flex-end; }
        .ticket-filters, .product-filters { display: flex; gap: 8px; flex-wrap: wrap; }
        .ticket-filters .form-control, .product-filters .form-control { width: 280px; max-width: 100%; }
        .ticket-filters .form-select, .product-filters .form-select { width: auto; min-width: 170px; }
        #ticketsList, #productsList { flex: 1; overflow-y: auto; padding: 0 16px; }
        .no-tickets, .no-products { padding: 32px 0; text-align: center; color: var(--tm-muted); }

        /* Couleurs d'équipe d'origine (v4.2.1) : liseré gauche, pastille d'équipe, survol teinté */
        .ticket-item {
            --team: #6b7280; --team-bg: rgba(107,114,128,.12); --team-text: #4b5563;
        }
        .ticket-item[data-team="Hotline"],    .ticket-team[data-team="Hotline"]    { --team: #4CAF50; --team-bg: rgba(76,175,80,.14);  --team-text: #2e7d32; }
        .ticket-item[data-team="LogicielN2"], .ticket-team[data-team="LogicielN2"] { --team: #2196F3; --team-bg: rgba(33,150,243,.14); --team-text: #1565c0; }
        .ticket-item[data-team="RMA"],        .ticket-team[data-team="RMA"]        { --team: #FF9800; --team-bg: rgba(255,152,0,.16);  --team-text: #b26a00; }
        .ticket-item[data-team="MaterielN2"], .ticket-team[data-team="MaterielN2"] { --team: #9C27B0; --team-bg: rgba(156,39,176,.13); --team-text: #7b1fa2; }
        .ticket-item[data-team="MailSAV"],    .ticket-team[data-team="MailSAV"]    { --team: #E91E63; --team-bg: rgba(233,30,99,.13);  --team-text: #c2185b; }
        .ticket-item[data-team="Winteam"],    .ticket-team[data-team="Winteam"]    { --team: #00BCD4; --team-bg: rgba(0,188,212,.15);  --team-text: #00838f; }
        .ticket-item[data-team="Logiciel"],   .ticket-team[data-team="Logiciel"]   { --team: #64748B; --team-bg: rgba(100,116,139,.14); --team-text: #475569; }
        .ticket-item[data-team="Materiel"],   .ticket-team[data-team="Materiel"]   { --team: #94A3B8; --team-bg: rgba(148,163,184,.16); --team-text: #64748b; }
        html[data-tm-theme="dark"] .ticket-item[data-team="Hotline"],    html[data-tm-theme="dark"] .ticket-team[data-team="Hotline"]    { --team-bg: rgba(76,175,80,.2);   --team-text: #81c784; }
        html[data-tm-theme="dark"] .ticket-item[data-team="LogicielN2"], html[data-tm-theme="dark"] .ticket-team[data-team="LogicielN2"] { --team-bg: rgba(33,150,243,.2);  --team-text: #64b5f6; }
        html[data-tm-theme="dark"] .ticket-item[data-team="RMA"],        html[data-tm-theme="dark"] .ticket-team[data-team="RMA"]        { --team-bg: rgba(255,152,0,.2);   --team-text: #ffb74d; }
        html[data-tm-theme="dark"] .ticket-item[data-team="MaterielN2"], html[data-tm-theme="dark"] .ticket-team[data-team="MaterielN2"] { --team-bg: rgba(156,39,176,.24); --team-text: #ce93d8; }
        html[data-tm-theme="dark"] .ticket-item[data-team="MailSAV"],    html[data-tm-theme="dark"] .ticket-team[data-team="MailSAV"]    { --team-bg: rgba(233,30,99,.2);   --team-text: #f48fb1; }
        html[data-tm-theme="dark"] .ticket-item[data-team="Winteam"],    html[data-tm-theme="dark"] .ticket-team[data-team="Winteam"]    { --team-bg: rgba(0,188,212,.2);   --team-text: #4dd0e1; }
        html[data-tm-theme="dark"] .ticket-item[data-team="Logiciel"],   html[data-tm-theme="dark"] .ticket-team[data-team="Logiciel"],
        html[data-tm-theme="dark"] .ticket-item[data-team="Materiel"],   html[data-tm-theme="dark"] .ticket-team[data-team="Materiel"]   { --team-bg: rgba(148,163,184,.18); --team-text: #cbd5e1; }

        .ticket-item, .product-item {
            margin: 8px 0; padding: 12px 14px 12px 14px; color: var(--tm-text);
            background: var(--tm-bg); border: 1px solid var(--tm-border); border-radius: 4px;
        }
        .ticket-item { border-left: 4px solid var(--team); cursor: pointer; transition: background .12s ease; }
        .ticket-item:hover { background: var(--team-bg); }
        .product-item { border-left: 4px solid var(--tm-muted); }
        .product-item.express-product { border-left-color: #FF9800; }
        .ticket-header, .product-header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
        .ticket-title, .product-title { flex: 1; min-width: 0; font-weight: 600; color: var(--tm-strong); line-height: 1.4; }
        .ticket-date, .product-date { font-size: 12px; color: var(--tm-muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .ticket-date .fa, .product-date .fa { margin-right: 3px; }
        .ticket-date .fa-arrow-right { font-size: 10px; margin: 0 5px; }
        .ticket-info, .product-info {
            display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin-top: 6px; font-size: 12.5px; color: var(--tm-text);
        }
        .ticket-team {
            display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 10px;
            background: var(--team-bg); color: var(--team-text); font-weight: 600;
        }
        .ticket-assignee { display: inline-flex; align-items: center; gap: 6px; color: var(--tm-text); }
        .ticket-assignee .fa { font-size: 11px; color: var(--tm-muted); }
        .ticket-status {
            display: inline-flex; align-items: center; padding: 2px 9px; border-radius: 10px; font-weight: 600;
            background: var(--tm-bg-subtle); color: var(--tm-muted);
        }
        .ticket-status.nouveau    { background: rgba(25,118,210,.14); color: #1565c0; }
        .ticket-status.en-cours   { background: rgba(245,124,0,.16);  color: #c25e00; }
        .ticket-status.en-attente { background: rgba(123,31,162,.13); color: #7b1fa2; }
        .ticket-status.resolu     { background: rgba(56,142,60,.15);  color: #2e7d32; }
        .ticket-status.ferme      { background: rgba(97,97,97,.13);   color: #555; }
        .ticket-status.annule     { background: rgba(211,47,47,.13);  color: #c62828; }
        html[data-tm-theme="dark"] .ticket-status.nouveau    { background: rgba(59,130,246,.22);  color: #93c5fd; }
        html[data-tm-theme="dark"] .ticket-status.en-cours   { background: rgba(249,115,22,.22);  color: #fdba74; }
        html[data-tm-theme="dark"] .ticket-status.en-attente { background: rgba(168,85,247,.22);  color: #d8b4fe; }
        html[data-tm-theme="dark"] .ticket-status.resolu     { background: rgba(34,197,94,.2);    color: #86efac; }
        html[data-tm-theme="dark"] .ticket-status.ferme      { background: rgba(148,163,184,.2);  color: #d1d5db; }
        html[data-tm-theme="dark"] .ticket-status.annule     { background: rgba(239,68,68,.22);   color: #fca5a5; }
        .ticket-description, .product-description {
            margin-top: 8px; font-size: 13px; line-height: 1.5; color: var(--tm-text); overflow-wrap: anywhere;
        }
        .ticket-description > strong, .product-description > strong { font-weight: 600; font-size: 12px; color: var(--tm-muted); }
        .ticket-response { margin-top: 8px; padding: 8px 12px; border-radius: 4px; background: var(--tm-bg-subtle); border: 1px solid var(--tm-border); }
        .ticket-response-header { font-size: 12px; font-weight: 500; color: var(--tm-muted); margin-bottom: 2px; }
        .ticket-response-header .fa { margin-right: 4px; }
        .ticket-response-content { font-size: 13px; line-height: 1.5; color: var(--tm-text); overflow-wrap: anywhere; }
        .ticket-response-content p { margin: 0; }
        .ticket-response-content p:empty, .ticket-response-content p:has(> br:only-child) { display: none; }

        /* Appels Winlink rattachés au ticket */
        .tk-talk { display: inline-flex; align-items: center; gap: 6px; color: var(--tm-link); cursor: pointer; }
        .tk-talk:hover { text-decoration: underline; }
        .tk-talk b { font-weight: 500; }
        .tk-talk-ico { display: none; }
        .tk-talk::before { content: '\\f095'; font-family: FontAwesome; font-size: 12px; }
        .tk-talk.is-open::after { content: '\\f106'; font-family: FontAwesome; font-size: 12px; }
        .tk-talk:not(.is-open)[role="button"]::after { content: '\\f107'; font-family: FontAwesome; font-size: 12px; }
        .tk-talk:focus-visible { outline: 2px solid var(--tm-link); outline-offset: 2px; border-radius: 2px; }
        .tk-talk.is-empty { display: none; }
        .tk-talk.is-loading, .tk-talk.is-error { color: var(--tm-muted); cursor: default; text-decoration: none; }
        .tk-talk.is-loading::before, .tk-talk.is-error::before { content: none; }
        .tk-calls { margin-top: 8px; border-top: 1px solid var(--tm-border); cursor: default; }
        .tk-calls[hidden] { display: none; }
        .tk-call {
            display: grid; grid-template-columns: 18px 130px minmax(0,1fr) 72px auto; align-items: center; gap: 2px 12px;
            padding: 6px 0; border-bottom: 1px solid var(--tm-border); font-size: 12.5px;
        }
        .tk-call:last-child { border-bottom: 0; }
        .tk-call-dir { display: inline-flex; color: var(--tm-muted); }
        .tk-call-dir.in { color: var(--tm-success); }
        .tk-call-dir.out { color: var(--tm-info); }
        .tk-call-when { color: var(--tm-text); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .tk-call-who { color: var(--tm-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tk-call-dur { text-align: right; color: var(--tm-strong); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .tk-play {
            display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border: 1px solid var(--tm-border);
            border-radius: 4px; background: transparent; color: var(--tm-text); font-size: 12px; cursor: pointer; white-space: nowrap;
        }
        .tk-play::before { content: '\\f04b'; font-family: FontAwesome; font-size: 9px; color: var(--tm-link); }
        .tk-play:hover { background: var(--tm-bg-hover); border-color: var(--tm-muted); }
        .tk-play:disabled { cursor: progress; opacity: .75; }
        .tk-play.is-error { border-color: transparent; color: var(--tm-danger); cursor: default; }
        .tk-play.is-error::before { content: none; }
        .tk-norec { font-size: 12px; color: var(--tm-muted); white-space: nowrap; }
        .tk-audio-slot { grid-column: 2 / -1; }
        .tk-audio-slot:empty { display: none; }
        .tk-audio { width: 100%; height: 32px; margin: 2px 0; }

        /* Produits */
        .product-type { color: var(--tm-muted); }
        .product-type { padding: 2px 9px; border-radius: 10px; background: var(--tm-bg-subtle); font-weight: 600; }
        .express-product .product-type { background: rgba(255,152,0,.16); color: #c25e00; }
        html[data-tm-theme="dark"] .express-product .product-type { color: #ffb74d; }
        .product-ref, .product-category { display: inline-flex; align-items: center; gap: 6px; }
        .product-ref .fa, .product-category .fa { font-size: 11px; opacity: .8; }

        /* Historique depuis la liste des clients */
        .btn-partner-list-history {
            width: 24px; height: 24px; margin-right: 6px; padding: 0; border: 0; border-radius: 4px; vertical-align: middle;
            display: inline-flex; align-items: center; justify-content: center; background: transparent;
            color: var(--tm-muted); cursor: pointer;
        }
        .btn-partner-list-history:hover { background: var(--tm-bg-hover); color: var(--tm-link); }
        .partner-history-modal-overlay {
            position: fixed; inset: 0; z-index: 2147483645; padding: 24px;
            display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.5);
        }
        .partner-history-modal {
            width: min(980px, 96vw); max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;
            background: var(--tm-bg); border: 1px solid var(--tm-border); border-radius: var(--tm-radius); box-shadow: var(--tm-shadow);
        }
        .partner-history-modal-toolbar {
            display: flex; justify-content: space-between; align-items: center; gap: 12px;
            padding: 12px 12px 12px 16px; border-bottom: 1px solid var(--tm-border);
            font-size: 15px; font-weight: 600; color: var(--tm-strong);
        }
        .partner-history-modal-body {
            display: flex !important; height: 70vh; min-height: 420px; max-height: calc(90vh - 54px);
            margin: 0 !important; border: 0 !important; border-radius: 0 !important; resize: none !important;
        }

        /* === LISTE DES TICKETS === */
        .o_list_view .o_data_row.ticket-bloquant > td { background-color: rgba(220,53,69,.12) !important; }
        .o_list_view .o_data_row.ticket-bloquant { outline: 2px solid rgba(220,53,69,.8); outline-offset: -2px; }
        /* Cellule « Nouveau rendez-vous » : orange (aujourd'hui), orange vif (< 10 min), rouge (dépassé) */
        @keyframes rdvOrange { from { background: rgba(255,152,0,.15); } to { background: rgba(255,152,0,.28); } }
        @keyframes rdvRouge  { from { background: rgba(229,57,53,.16); } to { background: rgba(229,57,53,.30); } }
        @keyframes rdvLate   { from { background: rgba(229,57,53,.24); } to { background: rgba(183,28,28,.42); } }
        .o_list_view .rdv-clignote-orange, .o_list_view .rdv-clignote-rouge, .o_list_view .rdv-clignote-depasse {
            position: relative !important; z-index: 1 !important; font-weight: 600;
        }
        .o_list_view .rdv-clignote-orange::after, .o_list_view .rdv-clignote-rouge::after, .o_list_view .rdv-clignote-depasse::after {
            content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -1 !important;
        }
        .o_list_view .rdv-clignote-orange::after  { animation: rdvOrange 1.5s ease-in-out infinite alternate; box-shadow: inset 3px 0 0 #ff9800; }
        .o_list_view .rdv-clignote-rouge::after   { animation: rdvRouge 1.1s ease-in-out infinite alternate; box-shadow: inset 3px 0 0 #f4511e; }
        .o_list_view .rdv-clignote-depasse::after { animation: rdvLate .9s ease-in-out infinite alternate; box-shadow: inset 3px 0 0 #e53935; }
        .o_list_view .rdv-clignote-depasse { color: #e53935 !important; }

        @keyframes internetBlink {
            0%,100% { background-color: rgba(255,140,0,.25); color: #ff8c00; }
            50%     { background-color: rgba(255,140,0,.6);  color: #fff; }
        }
        .internet-blink {
            animation: internetBlink 1s ease-in-out infinite; font-weight: 700 !important;
            border: 1px solid rgba(255,140,0,.75) !important;
        }

        /* Étiquettes client. Les lignes de la liste Odoo imposent leur couleur de texte
           (décorations de ligne) : couleurs et fond sont donc forcés. */
        .tm-client-badges { display: flex !important; flex-wrap: wrap; gap: 4px; margin-top: 3px; }
        .tm-client-badges .tm-tag, .o_list_renderer .o_data_row td .tm-client-badges .tm-tag.tm-tag {
            display: inline-flex !important; align-items: center; padding: 0 8px !important; border-radius: 10px !important;
            font-size: 11.5px !important; font-weight: 600 !important; line-height: 18px !important; white-space: nowrap;
            color: #fff !important; text-decoration: none !important;
        }
        .tm-client-badges .tm-tag-prio, .o_list_renderer .o_data_row td .tm-client-badges .tm-tag.tm-tag-prio { background: #dc2626 !important; }
        .tm-client-badges .tm-tag-new, .o_list_renderer .o_data_row td .tm-client-badges .tm-tag.tm-tag-new { background: #0891b2 !important; }

        /* En-têtes de groupe par équipe : simple point de couleur */
        .tm-cat-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }

        /* === OPÉRATEUR EN LIGNE AVEC LE CLIENT === */
        .o_list_view .o_data_row.tm-live-row > td:first-child { box-shadow: inset 3px 0 0 var(--tm-live); }
        .o_list_renderer .o_data_row > td.tm-live-cell,
        .o_list_view .o_data_row > td.tm-live-cell {
            background-image: linear-gradient(110deg, rgba(34, 197, 94, .11), rgba(34, 197, 94, .025)) !important;
            box-shadow: inset 0 0 0 1px rgba(34, 197, 94, .30), inset 0 0 18px rgba(34, 197, 94, .08), 0 0 9px rgba(34, 197, 94, .08);
            border-radius: 8px;
        }
        .o_list_view img.tm-live-ring,
        .o_list_renderer img.tm-live-ring {
            box-shadow: 0 0 0 1.5px var(--tm-bg), 0 0 0 3px var(--tm-live), 0 0 10px rgba(34, 197, 94, .30);
        }
        .tm-live-chip {
            display: flex; align-items: center; gap: 6px; margin-top: 3px;
            width: max-content; max-width: 100%; padding: 2px 7px;
            border: 1px solid rgba(34, 197, 94, .22); border-radius: 999px;
            background: rgba(34, 197, 94, .08); box-shadow: 0 0 8px rgba(34, 197, 94, .10);
            font-size: 12px; line-height: 16px; color: var(--tm-live); font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .tm-live-dot {
            display: inline-block; flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--tm-live);
            box-shadow: 0 0 0 3px rgba(34, 197, 94, .10), 0 0 7px rgba(34, 197, 94, .35);
        }
        .tm-live-op {
            position: relative; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
            width: 18px; height: 18px; border-radius: 50%; background: var(--tm-bg-subtle); border: 1px solid var(--tm-border);
            color: var(--tm-text); font-size: 9px; font-weight: 600; letter-spacing: .2px;
        }
        .tm-live-op .tm-live-dot { position: absolute; right: -2px; bottom: -2px; width: 8px; height: 8px; box-shadow: 0 0 0 2px var(--tm-bg); }

        /* === NOTIFICATIONS DE SECOURS (si le service de notification Odoo est introuvable) === */
        #tm-toast-stack {
            position: fixed; right: 16px; top: 64px; z-index: 99999;
            display: flex; flex-direction: column; gap: 8px; width: min(340px, calc(100vw - 32px)); pointer-events: none;
        }
        .tm-toast {
            pointer-events: auto; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px;
            padding: 10px 10px 10px 14px; border-radius: var(--tm-radius);
            background: var(--tm-bg-elevated); color: var(--tm-text); border: 1px solid var(--tm-border);
            box-shadow: var(--tm-shadow); font-size: 13px; line-height: 1.45;
        }
        .tm-toast-icon { display: none; }
        .tm-toast-title { font-weight: 600; color: var(--tm-strong); }
        .tm-toast.tone-danger .tm-toast-title { color: var(--tm-danger); }
        .tm-toast.tone-urgent .tm-toast-title, .tm-toast.tone-warn .tm-toast-title { color: var(--tm-warning); }
        .tm-toast-close { grid-column: 2; grid-row: 1; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 4px;
            background: transparent; color: var(--tm-muted); cursor: pointer; }
        .tm-toast-close:hover { background: var(--tm-bg-hover); color: var(--tm-strong); }
        .tm-toast-body { grid-column: 1 / -1; display: flex; flex-direction: column; }
        .tm-toast-line { color: var(--tm-muted); font-size: 12.5px; }
        .tm-toast-line.strong { color: var(--tm-text); font-weight: 500; }
        .tm-toast-line.time { color: var(--tm-text); }
        `;
        document.head.appendChild(s);
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

    // =========================================================
    // BOUTON INSÉRER INITIALES
    // =========================================================
    function addInitialesButton() {
        if (!isTicketPage()) { document.getElementById('btn-inserer-initiales')?.remove(); return; }
        if (document.getElementById('btn-inserer-initiales')) return;

        const btn = document.createElement('button');
        btn.id = 'btn-inserer-initiales';
        btn.type = 'button';
        btn.className = 'tm-btn';
        btn.innerHTML = '<i class="fa fa-pencil" aria-hidden="true"></i>Insérer initiales';

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
        btn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
        btn.title = 'Désassigner';
        btn.setAttribute('aria-label', 'Désassigner');

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
        // Trouver le dernier bouton stat natif Odoo. Nos boutons Ventes / Doublons portent
        // aussi la classe oe_stat_button (gabarit Odoo) : on exclut tout ce qui est DANS nos
        // badges, sinon on insérerait un badge après son propre bouton (HierarchyRequestError).
        const btns = Array.from(container.querySelectorAll('.o_stat_button,.oe_stat_button'))
            .filter(el => !el.closest('#badge-devis-client, #badge-tickets-ouverts'));
        const last = btns.length ? btns[btns.length-1] : null;
        if (last && !badge.contains(last) && !last.contains(badge)) {
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

    // Bouton statistique créé UNE fois puis mis à jour sur place. Le recréer à chaque
    // rafraîchissement (toutes les 3-5 s et à chaque changement de la page) faisait
    // perdre le clic si le bouton était remplacé entre l'appui et le relâchement.
    function tmUpsertStatButton(badge, spec) {
        let el = badge.querySelector(':scope > button.tm-stat');
        if (!el) {
            el = document.createElement('button');
            el.type = 'button';
            badge.innerHTML = '';
            badge.appendChild(el);
        }
        if (el.className !== spec.className) el.className = spec.className;
        if (el.title !== spec.title) el.title = spec.title;
        if (el.dataset.sig !== spec.innerHTML) { el.innerHTML = spec.innerHTML; el.dataset.sig = spec.innerHTML; }
        el.onclick = spec.onclick; // remplace le gestionnaire sans recréer l'élément
        return el;
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

        // Description du bouton ; l'élément réel est réutilisé par tmUpsertStatButton
        const spec = {};
        spec.type = 'button';
        spec.title = n > 0 ? `${n} ventes trouvées` : 'Aucune vente';
        spec.className = 'btn oe_stat_button tm-stat' + (n > 0 ? '' : ' tm-stat-empty');

        spec.onclick = async () => {
            if (n <= 0) return;
            document.getElementById('popup-devis-odoobtn')?.remove();
            const pop = tmPopup('popup-devis-odoobtn', 'Ventes', String(n));
            const body = pop.querySelector('.tm-pop-body');
            body.innerHTML = '<div class="tm-pop-empty">Chargement…</div>';

            const titleField = await detectSaleOrderTitleField();
            const baseFields = ['name','state','date_order','amount_total','currency_id'];
            if (titleField) baseFields.push(titleField);
            const records = await odooRpc('sale.order', 'search_read', [
                [['partner_id','in',partnerIds]], baseFields, 0, 20, 'date_order desc'
            ]) || [];
            if (!pop.isConnected) return;
            const stateMap = {
                draft: ['Devis', ''], sent: ['Devis envoyé', 'is-info'], sale: ['Bon de commande', 'is-success'],
                done: ['Verrouillé', 'is-success'], cancel: ['Annulé', 'is-danger']
            };
            const money = (v, cur) => {
                try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur || 'EUR' }).format(v || 0); }
                catch (_) { return `${(Math.round((v || 0) * 100) / 100).toLocaleString('fr-FR')} ${cur || ''}`; }
            };
            body.innerHTML = '';
            if (!records.length) { body.innerHTML = '<div class="tm-pop-empty">Aucune vente</div>'; return; }
            records.forEach(r => {
                const st = String(r.state || '').toLowerCase();
                const [stateLabel, stateCls] = stateMap[st] || [r.state || '', ''];
                const cur = Array.isArray(r.currency_id) ? r.currency_id[1] : 'EUR';
                const dt = r.date_order ? new Date(String(r.date_order).replace(' ', 'T') + 'Z') : null;
                const when = dt && !isNaN(dt) ? dt.toLocaleDateString('fr-FR') : '';
                const title = (titleField && r[titleField]) ? r[titleField] : '';

                const item = document.createElement('div');
                item.className = 'tm-so st-' + (st || 'draft') + (st === 'cancel' ? ' is-cancel' : '');
                item.innerHTML = `<div class="tm-so-row" role="button" tabindex="0" title="Afficher les lignes">`
                    + `<span class="tm-so-ref">${tmEsc(r.name)}</span>`
                    + `<span class="tm-so-main"><span class="tm-so-title">${tmEsc(title || '—')}</span><br><span class="tm-so-date">${tmEsc(when)}</span></span>`
                    + `<span class="tm-state ${stateCls}">${tmEsc(stateLabel)}</span>`
                    + `<span class="tm-so-amount">${tmEsc(money(r.amount_total, cur))}</span>`
                    + `<button type="button" class="tm-icon-btn tm-so-open" title="Ouvrir la vente" aria-label="Ouvrir la vente"><i class="fa fa-external-link" aria-hidden="true"></i></button>`
                    + `</div>`;
                const row = item.firstElementChild;
                row.querySelector('.tm-so-open').addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.open(`/web#id=${r.id}&model=sale.order&view_type=form`, '_blank');
                });
                const toggle = async () => {
                    const existing = item.querySelector('.tm-so-lines');
                    if (existing) { existing.remove(); item.classList.remove('is-open'); return; }
                    const lines = await odooRpc('sale.order.line', 'search_read', [
                        [['order_id','=',r.id]], ['name','product_uom_qty','price_unit','price_subtotal','currency_id','display_type'], 0, 100, 'sequence asc'
                    ]) || [];
                    const box = document.createElement('div');
                    box.className = 'tm-so-lines';
                    box.innerHTML = '<table><thead><tr><th>Article</th><th class="num">Qté</th><th class="num">Prix unitaire</th><th class="num">Sous-total</th></tr></thead><tbody>'
                        + (lines.length ? lines.map(l => {
                            const c2 = Array.isArray(l.currency_id) ? l.currency_id[1] : cur;
                            if (l.display_type) return `<tr><td colspan="4"><b>${tmEsc((l.name || '').replace(/\n/g, ' '))}</b></td></tr>`;
                            return `<tr><td>${tmEsc((l.name || '').replace(/\n/g, ' '))}</td><td class="num">${Number(l.product_uom_qty || 0).toLocaleString('fr-FR')}</td>`
                                + `<td class="num">${tmEsc(money(l.price_unit, c2))}</td><td class="num">${tmEsc(money(l.price_subtotal, c2))}</td></tr>`;
                        }).join('') : '<tr><td colspan="4">Aucune ligne</td></tr>')
                        + '</tbody></table>';
                    item.classList.add('is-open');
                    item.appendChild(box);
                };
                row.addEventListener('click', toggle);
                row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
                body.appendChild(item);
            });
        };

        spec.innerHTML = `<i class="o_button_icon fa fa-fw fa-dollar" aria-hidden="true"></i>`
            + `<span class="o_stat_info"><span class="o_stat_value">${Math.min(n, 999)}</span><span class="o_stat_text">Ventes</span></span>`;
        tmUpsertStatButton(badge, spec);
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

        // Description du bouton ; l'élément réel est réutilisé par tmUpsertStatButton
        const spec = {};
        spec.type = 'button';
        spec.className = 'btn oe_stat_button tm-stat' + (n > 0 ? ' tm-stat-alert' : ' tm-stat-empty');
        spec.title = n > 0 ? `${n} ticket(s) ouvert(s)` : 'Aucun doublon';
        spec.onclick = () => { if (n > 0) showOpenTicketsPopup(code, domain); };

        spec.innerHTML = `<i class="o_button_icon fa fa-fw fa-clone" aria-hidden="true"></i>`
            + `<span class="o_stat_info"><span class="o_stat_value">${Math.min(n, 999)}</span><span class="o_stat_text">Doublons</span></span>`;

        if (n > 0) {
            showDoublonToast(code, n);
            if (autoPopupLastCode !== code) { autoPopupLastCode = code; showOpenTicketsPopup(code, domain); }
        }
        tmUpsertStatButton(badge, spec);
        ensureBadgeOrder(stats);
    }

    async function showOpenTicketsPopup(codeClient, domain) {
        document.getElementById('popup-tickets-ouverts')?.remove();
        const pop = tmPopup('popup-tickets-ouverts', 'Doublons possibles', `client ${codeClient}`);
        pop.querySelector('.tm-pop-title').insertAdjacentHTML('afterbegin', '<i class="fa fa-exclamation-triangle" aria-hidden="true"></i>');
        const body = pop.querySelector('.tm-pop-body');
        body.innerHTML = '<div class="tm-pop-empty">Chargement…</div>';

        const recs = await odooRpc('helpdesk.ticket','search_read',[domain,['name','stage_id','user_id','create_date','team_id'],0,30,'create_date desc']) || [];
        if (!pop.isConnected) return;
        body.innerHTML = '';
        if (!recs.length) { body.innerHTML = '<div class="tm-pop-empty">Aucun ticket ouvert</div>'; return; }
        recs.forEach(r => {
            const href = `/web#id=${r.id}&model=helpdesk.ticket&view_type=form`;
            const team = r.team_id ? getTeamInfo(r.team_id) : null;
            const meta = [
                Array.isArray(r.stage_id) ? r.stage_id[1] : '',
                Array.isArray(r.user_id) ? r.user_id[1] : 'Non assigné'
            ].filter(Boolean).join(' · ');
            const row = document.createElement('a');
            row.className = 'tm-dup';
            row.href = href;
            row.style.textDecoration = 'none';
            row.innerHTML = `<span class="tm-dup-name">${tmEsc(r.name || ('Ticket #' + r.id))}</span>`
                + `<span class="tm-dup-date">${tmEsc(formatDateFr(r.create_date))}</span>`
                + `<span class="tm-dup-meta">${team ? `<span class="ticket-team" data-team="${tmEsc(team.name)}">${tmEsc(team.label || team.name)}</span>` : ''}${tmEsc(meta)}</span>`;
            row.addEventListener('click', (e) => { e.preventDefault(); window.location.href = href; pop.remove(); });
            body.appendChild(row);
        });
    }

    // Panneau flottant commun (ventes, doublons) : en-tête titre + compteur + fermer
    function tmPopup(id, title, count) {
        const pop = document.createElement('div');
        pop.id = id;
        pop.className = 'tm-pop ' + id;
        pop.setAttribute('role', 'dialog');
        pop.setAttribute('aria-label', title);
        pop.innerHTML = `<div class="tm-pop-head"><span class="tm-pop-title">${tmEsc(title)}</span>`
            + (count ? `<span class="tm-pop-count">${tmEsc(count)}</span>` : '')
            + `<span class="tm-pop-actions"><button type="button" class="tm-icon-btn" data-close aria-label="Fermer" title="Fermer"><i class="fa fa-times" aria-hidden="true"></i></button></span></div>`
            + `<div class="tm-pop-body"></div>`;
        pop.querySelector('[data-close]').addEventListener('click', () => pop.remove());
        document.body.appendChild(pop);
        return pop;
    }

    function showDoublonToast(code, n) {
        const key = `${code}_${n}`;
        if (lastToastKey === key) return;
        lastToastKey = key;
        tmNotify({
            key: 'doublon', type: 'warning', title: 'Doublon possible', autoclose: 9000,
            message: `${n} ticket${n > 1 ? 's' : ''} déjà ouvert${n > 1 ? 's' : ''} pour le client ${code}.`
        });
    }

    // Notification Odoo native (service « notification » du client web), avec repli sur
    // la pile maison si le service est introuvable. Une seule notification par clé.
    const _tmNotifActive = new Map(); // key -> fonction de fermeture
    function getOdooNotificationService() {
        const w = _pageWin();
        const envs = [];
        try { if (w.odoo && w.odoo.__WOWL_DEBUG__ && w.odoo.__WOWL_DEBUG__.root) envs.push(w.odoo.__WOWL_DEBUG__.root.env); } catch (_) {}
        try {
            [w.__owl__ && w.__owl__.apps, w.__OWL_DEVTOOLS__ && w.__OWL_DEVTOOLS__.apps].forEach(set => {
                if (set && typeof set.forEach === 'function') set.forEach(app => { if (app && app.env) envs.push(app.env); });
            });
        } catch (_) {}
        try { getOwlRootNodes().forEach(n => { if (n && n.component && n.component.env) envs.push(n.component.env); }); } catch (_) {}
        for (const env of envs) {
            const svc = env && env.services && env.services.notification;
            if (svc && typeof svc.add === 'function') return svc;
        }
        return null;
    }

    function tmNotify({ key, type = 'warning', title = '', message = '', sticky = false, autoclose = 0, buttons = [], onClose } = {}) {
        if (key && _tmNotifActive.has(key)) return;
        let closeFn = null;
        const done = () => { if (key) _tmNotifActive.delete(key); if (typeof onClose === 'function') { try { onClose(); } catch (_) {} } };
        const svc = getOdooNotificationService();
        if (svc) {
            try {
                const opts = { title, type, sticky: sticky || !autoclose, onClose: done };
                if (autoclose) opts.autocloseDelay = autoclose;
                if (buttons.length) opts.buttons = buttons.map(b => ({ name: b.name, primary: !!b.primary, onClick: () => { b.onClick(); if (closeFn) closeFn(); } }));
                closeFn = svc.add(message, opts);
                if (key) _tmNotifActive.set(key, closeFn || (() => {}));
                return;
            } catch (_) { /* repli ci-dessous */ }
        }
        const el = tmToast({
            key, tone: type === 'danger' ? 'danger' : 'warn', title,
            lines: [{ text: message }], ttl: sticky ? 0 : (autoclose || 8000), onClose: done
        });
        if (el && key) _tmNotifActive.set(key, () => el.remove());
    }

    function scheduleOpenTicketsUpdate(delay = 400) {
        clearTimeout(openTicketsTimer);
        openTicketsTimer = setTimeout(updateOpenTicketsBadge, delay);
    }


    // =========================================================
    // LISTE TICKETS — MISE EN ÉVIDENCE DES TICKETS BLOQUANTS
    // =========================================================
    // Odoo colore en rouge (text-danger) les tickets bloquants : on ajoute un liseré
    // via la classe .ticket-bloquant (le style est entièrement en CSS).
    function updateTicketListAnimations() {
        if (!isTicketList()) return;
        document.querySelectorAll('.o_list_view tr.o_data_row, .o_list_renderer tr.o_data_row').forEach(row => {
            row.classList.toggle('ticket-bloquant', row.classList.contains('text-danger'));
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
    // BADGES CLIENT « PRIORITAIRE » (ASSISTANCE MATÉRIEL) ET « NEW » — via API
    // =========================================================
    // Pourquoi l'ancienne version ratait des clients :
    //  1. le filtre /^new\b/ refusait « NEW2026 » (pas de frontière entre W et 2) et tout
    //     libellé ne commençant pas par NEW ;
    //  2. la recherche des étiquettes était limitée à 50 résultats « ilike new » ;
    //  3. seules les étiquettes du TICKET étaient lues : un client étiqueté après la
    //     création de ses tickets (ou étiqueté sur la société mère) n'avait pas de badge ;
    //  4. le rapprochement ligne ↔ ticket se faisait par le NOM du ticket (homonymes) et
    //     exigeait une colonne « Sujet/Nom » visible.
    // Désormais : ID réel du ticket lu dans le modèle Owl de la liste, étiquettes du ticket
    // + du client + de sa société, cache par ID avec durée de vie, une seule requête à la fois.
    function normTagText(t) {
        return (t || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ');
    }
    // « NEW », « NEW 2026 », « NEW2026 », « CONTRAT NEW » — mais pas « NEWS » ni « RENEW ».
    function isNewTagName(name) {
        return /(^|[^A-Z0-9])NEW(?![A-Z])/.test(normTagText(name));
    }
    function isAssistanceTagName(name) {
        const n = normTagText(name);
        return n.includes('ASSISTANCE') && n.includes('MAT');
    }

    const PRIO_TTL_MS = 5 * 60 * 1000;
    const _prioTicketCache = new Map();   // ticketId -> { mat, new, at }
    const _prioPartnerCache = new Map();  // partnerId -> { tagIds:Set, commercialId, at }
    let _prioTagIndex = null;             // { mat:Set, new:Set, at }
    let _prioFields = null;               // { ticket:[...], partner:[...] } champs vers winpharma.tags
    let _prioBusy = false;

    function clearPrioritaireCaches() {
        _prioTicketCache.clear();
        _prioPartnerCache.clear();
        _prioTagIndex = null;
    }

    // Champs many2many pointant vers winpharma.tags, sur le ticket et sur le client.
    async function getPrioTagFields() {
        if (_prioFields) return _prioFields;
        const pick = (defs) => Object.entries(defs || {})
            .filter(([, d]) => d && d.relation === 'winpharma.tags' && /many2many|one2many/.test(d.type || ''))
            .map(([f]) => f);
        const [tf, pf] = await Promise.all([
            odooRpc('helpdesk.ticket', 'fields_get', [[], ['relation', 'type']]),
            odooRpc('res.partner', 'fields_get', [[], ['relation', 'type']])
        ]);
        const ticket = pick(tf);
        if (!ticket.length && tf && tf.etiquette_winpharma) ticket.push('etiquette_winpharma');
        _prioFields = { ticket, partner: pick(pf) };
        return _prioFields;
    }

    async function getPrioTagIndex() {
        if (_prioTagIndex && Date.now() - _prioTagIndex.at < PRIO_TTL_MS) return _prioTagIndex;
        const recs = await odooRpc('winpharma.tags', 'search_read', [
            ['|', ['name', 'ilike', 'new'], ['name', 'ilike', 'assistance']], ['id', 'name'], 0, 0
        ]) || [];
        const idx = { mat: new Set(), new: new Set(), at: Date.now() };
        recs.forEach(r => {
            if (isAssistanceTagName(r.name)) idx.mat.add(r.id);
            if (isNewTagName(r.name)) idx.new.add(r.id);
        });
        _prioTagIndex = idx;
        return idx;
    }

    // Valeurs many2one / many2many : formats [id, nom], {id, display_name} ou id selon la version
    const m2oId = (v) => Array.isArray(v) ? v[0] : (v && typeof v === 'object' ? v.id : (typeof v === 'number' ? v : null));
    const m2mIds = (v) => Array.isArray(v) ? v.map(x => Array.isArray(x) ? x[0] : (x && typeof x === 'object' ? x.id : x)).filter(Boolean) : [];

    // data-id de la ligne (datapoint Owl) -> { resId, partnerId } depuis le modèle de la liste.
    function getListRowRecordMap() {
        const map = new Map();
        const model = findTicketListModel();
        if (!model || !model.root) return map;
        const visit = (list, depth) => {
            if (!list || depth > 6) return;
            (list.records || []).forEach(rec => {
                if (rec && rec.id != null && rec.resId) {
                    map.set(String(rec.id), { resId: Number(rec.resId), partnerId: m2oId(rec.data && rec.data.partner_id) });
                }
            });
            (list.groups || []).forEach(g => visit(g.list || g, depth + 1));
        };
        try { visit(model.root, 0); } catch (_) {}
        return map;
    }

    async function loadPartnerTags(partnerIds, fields, depth = 0) {
        const now = Date.now();
        const todo = [...new Set(partnerIds.filter(id => id && !(_prioPartnerCache.has(id) && now - _prioPartnerCache.get(id).at < PRIO_TTL_MS)))];
        if (!todo.length) return;
        const recs = await odooRpc('res.partner', 'read', [todo, fields.partner.concat(['commercial_partner_id'])]) || [];
        recs.forEach(r => {
            const tagIds = new Set();
            fields.partner.forEach(f => m2mIds(r[f]).forEach(id => tagIds.add(id)));
            _prioPartnerCache.set(r.id, { tagIds, commercialId: m2oId(r.commercial_partner_id), at: now });
        });
        // Société mère : ses étiquettes valent pour tous ses contacts
        const parents = recs.map(r => m2oId(r.commercial_partner_id)).filter(id => id && !_prioPartnerCache.has(id));
        if (parents.length && depth < 1) await loadPartnerTags(parents, fields, depth + 1);
    }

    async function applyPrioritaireBadges() {
        if (!isTicketList() || _prioBusy) return;
        const table = document.querySelector('.o_list_view table, table.o_list_table, .o_list_renderer table');
        if (!table) return;
        const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
        if (!rows.length) return;

        _prioBusy = true;
        try {
            // Cellule où afficher le badge : colonne Client/Pharmacie, sinon 1re cellule de données
            const ths = Array.from(table.querySelectorAll('thead th'));
            const idxClient = ths.findIndex(th => /client|pharmacie/i.test(th.textContent || ''));
            const recMap = getListRowRecordMap();

            // Repli si le modèle Owl est inaccessible : rapprochement par nom de ticket,
            // uniquement quand ce nom est unique (sinon on ne devine pas).
            let byName = null;
            if (!recMap.size) {
                const idxName = ths.findIndex(th => /^(nom|sujet|titre)$|sujet/i.test((th.textContent || '').trim()));
                if (idxName >= 0) {
                    rows.forEach(r => { r.__tmName = ((r.querySelectorAll('td')[idxName] || {}).textContent || '').trim(); });
                    const names = [...new Set(rows.map(r => r.__tmName).filter(Boolean))];
                    const found = names.length ? (await odooRpc('helpdesk.ticket', 'search_read', [[['name', 'in', names]], ['id', 'name', 'partner_id'], 0, 2000]) || []) : [];
                    const count = new Map();
                    found.forEach(t => count.set(t.name, (count.get(t.name) || 0) + 1));
                    byName = new Map(found.filter(t => count.get(t.name) === 1).map(t => [t.name, { resId: t.id, partnerId: m2oId(t.partner_id) }]));
                }
            }

            const rowInfos = rows.map(row => {
                const rec = byName ? byName.get(row.__tmName) : recMap.get(String(row.getAttribute('data-id') || ''));
                const cells = row.querySelectorAll('td');
                const cell = (idxClient >= 0 && cells[idxClient]) || row.querySelector('td.o_data_cell') || null;
                return rec && cell ? { row, cell, ticketId: rec.resId, partnerId: rec.partnerId } : null;
            }).filter(Boolean);
            if (!rowInfos.length) return;

            const now = Date.now();
            const stale = rowInfos.filter(r => {
                const c = _prioTicketCache.get(r.ticketId);
                return !c || now - c.at > PRIO_TTL_MS;
            });

            if (stale.length) {
                const [fields, tagIdx] = await Promise.all([getPrioTagFields(), getPrioTagIndex()]);
                const ids = [...new Set(stale.map(r => r.ticketId))];
                const tickets = fields.ticket.length
                    ? (await odooRpc('helpdesk.ticket', 'read', [ids, fields.ticket.concat(['partner_id'])]) || [])
                    : ids.map(id => ({ id, partner_id: (stale.find(r => r.ticketId === id) || {}).partnerId }));
                const partnerOf = new Map(tickets.map(t => [t.id, m2oId(t.partner_id)]));
                if (fields.partner.length) await loadPartnerTags([...partnerOf.values()].filter(Boolean), fields);

                tickets.forEach(t => {
                    const tagIds = new Set();
                    fields.ticket.forEach(f => m2mIds(t[f]).forEach(id => tagIds.add(id)));
                    const p = _prioPartnerCache.get(partnerOf.get(t.id));
                    if (p) {
                        p.tagIds.forEach(id => tagIds.add(id));
                        const parent = p.commercialId && _prioPartnerCache.get(p.commercialId);
                        if (parent) parent.tagIds.forEach(id => tagIds.add(id));
                    }
                    const has = (set) => [...tagIds].some(id => set.has(id));
                    _prioTicketCache.set(t.id, { mat: has(tagIdx.mat), new: has(tagIdx.new), at: now });
                });
                // Tickets non relus (droits / erreur) : « aucun badge » mémorisé pour ne pas boucler
                ids.forEach(id => { if (!_prioTicketCache.has(id)) _prioTicketCache.set(id, { mat: false, new: false, at: now }); });
            }

            rowInfos.forEach(({ cell, ticketId }) => {
                const info = _prioTicketCache.get(ticketId) || {};
                let holder = cell.querySelector('.tm-client-badges');
                if (!info.mat && !info.new) { if (holder) holder.remove(); return; }
                const sig = (info.mat ? 'm' : '') + (info.new ? 'n' : '');
                if (holder && holder.dataset.sig === sig) return;
                if (!holder) { holder = document.createElement('div'); holder.className = 'tm-client-badges'; cell.appendChild(holder); }
                holder.dataset.sig = sig;
                holder.innerHTML = (info.mat ? '<span class="tm-tag tm-tag-prio" title="Client sous contrat d&#39;assistance matériel">Prioritaire · matériel</span>' : '')
                    + (info.new ? '<span class="tm-tag tm-tag-new" title="Nouveau client">NEW</span>' : '');
            });
        } catch (e) {
            console.warn('[Badges client] Erreur:', e);
        } finally {
            _prioBusy = false;
        }
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

    // =========================================================
    // NOTIFICATIONS — pile commune en bas à droite (RDV, doublons)
    // =========================================================
    // Avant, la notif RDV et le toast doublon s'affichaient au même endroit et se
    // recouvraient. Ils sont maintenant empilés (4 au maximum, la plus ancienne part).
    function tmToastStack() {
        let stack = document.getElementById('tm-toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'tm-toast-stack';
            stack.setAttribute('role', 'status');
            stack.setAttribute('aria-live', 'polite');
            document.body.appendChild(stack);
        }
        return stack;
    }

    // tone : 'warn' | 'urgent' | 'danger' ; lines : [{ text, cls }] ; ttl en ms (0 = reste affichée)
    function tmToast({ key, tone = 'warn', icon = '', title = '', lines = [], ttl = 0, onClose } = {}) {
        const stack = tmToastStack();
        if (key && Array.from(stack.children).some(el => el.dataset.key === key)) return null;
        while (stack.children.length >= 4) stack.firstElementChild.remove();

        const el = document.createElement('div');
        el.className = 'tm-toast tone-' + tone;
        if (key) el.dataset.key = key;
        const ic = document.createElement('div'); ic.className = 'tm-toast-icon'; ic.textContent = icon;
        const tt = document.createElement('div'); tt.className = 'tm-toast-title'; tt.textContent = title;
        const close = document.createElement('button');
        close.type = 'button'; close.className = 'tm-toast-close'; close.title = 'Fermer'; close.setAttribute('aria-label', 'Fermer'); close.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
        const body = document.createElement('div'); body.className = 'tm-toast-body';
        lines.filter(l => l && l.text).forEach(l => {
            const d = document.createElement('div');
            d.className = 'tm-toast-line' + (l.cls ? ' ' + l.cls : '');
            d.textContent = l.text;
            body.appendChild(d);
        });
        el.appendChild(ic); el.appendChild(tt); el.appendChild(close);
        if (body.children.length) el.appendChild(body);

        let done = false;
        const finish = (reason) => {
            if (done) return; done = true;
            el.remove();
            if (typeof onClose === 'function') { try { onClose(reason); } catch (_) {} }
        };
        close.addEventListener('click', () => finish('user'));
        if (ttl > 0) setTimeout(() => { if (el.isConnected) finish('timeout'); }, ttl);
        stack.appendChild(el);
        return el;
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

    // Notif fermée (auto ou croix) : elle revient après 3 min. « Ne plus afficher » = définitif.
    const _rdvSnooze = new Map();
    function showRdvNotif({ type, pharma, assigne, heure, diff }, key) {
        if (localStorage.getItem('notifFermee_' + key)) return;
        if ((_rdvSnooze.get(key) || 0) > Date.now()) return;
        const late = type === 'depasse';
        let dismissed = false;
        tmNotify({
            key: 'rdv:' + key,
            type: late ? 'danger' : 'warning',
            title: late ? 'Rendez-vous dépassé' : `Rendez-vous dans ${diff} min`,
            message: [pharma, heure, assigne ? `posé par ${assigne}` : ''].filter(Boolean).join(' · '),
            sticky: late,
            autoclose: late ? 0 : 30000,
            buttons: [{ name: 'Ne plus afficher', onClick: () => {
                dismissed = true;
                try { localStorage.setItem('notifFermee_' + key, '1'); } catch (_) {}
            } }],
            // Fermeture sans « Ne plus afficher » : la notif revient dans 3 min
            onClose: () => { if (!dismissed) _rdvSnooze.set(key, Date.now() + 3 * 60 * 1000); }
        });
    }

    // =========================================================
    // STYLES CATÉGORIES / ÉQUIPES — en-têtes de groupe de la liste des tickets
    // =========================================================
    // accent = couleur principale ; le fond est dérivé automatiquement (transparence).
    const CATEGORY_STYLES = {
        'HOTLINE':               { accent:'#10b981', emoji:'📞' },
        'LOGICIEL N2':           { accent:'#8b5cf6', emoji:'💻' },
        'MATERIEL N2':           { accent:'#ef4444', emoji:'🧰' },
        'RMA/SAV TECH EN COURS': { accent:'#f59e0b', emoji:'📦' },
        'RMA':                   { accent:'#f59e0b', emoji:'📦' },
        'MSAV':                  { accent:'#ec4899', emoji:'✉️' },
        'MAIL SAV':              { accent:'#ec4899', emoji:'✉️' },
        'WINTEAM':               { accent:'#0ea5e9', emoji:'⭐' },
        // Équipes supprimées d'Odoo : en gris, pour qu'un groupe historique se
        // distingue d'un groupe actif sans pour autant rester sans style.
        'LOGICIEL':              { accent:'#64748b', emoji:'🗄️' },
        'MATERIEL':              { accent:'#94a3b8', emoji:'🗄️' }
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
        // Les variantes N2 d'abord : sinon un libellé "Logiciel N2 bis" serait
        // rangé avec l'ancienne équipe "Logiciel".
        if (base.startsWith('LOGICIEL')) return /N2/i.test(base) ? 'LOGICIEL N2' : 'LOGICIEL';
        if (base.startsWith('MATERIEL')) return /N2/i.test(base) ? 'MATERIEL N2' : 'MATERIEL';
        if (base.startsWith('HOTLINE')) return 'HOTLINE';
        if (base.startsWith('MAIL SAV') || base.startsWith('MAILSAV')) return 'MAIL SAV';
        if (base.startsWith('RMA')) return 'RMA/SAV TECH EN COURS';
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

        // Correspondances basées sur les noms exacts d'Odoo.
        // L'ORDRE EST SIGNIFICATIF, deux pièges :
        //  - "logiciel n2" / "materiel n2" avant les motifs "logiciel" / "materiel"
        //    seuls, sinon les N2 seraient fusionnés avec les anciennes équipes ;
        //  - "mail sav" avant "rma || sav", sinon "Mail SAV" contient "sav" et
        //    tombe dans la branche RMA (les styles MailSAV devenaient du code mort).
        if (normalizedTeamName.includes('logiciel n2')) {
            return { icon: 'fa-laptop', class: 'LogicielN2', name: 'LogicielN2', label: 'Logiciel N2' };
        }
        if (normalizedTeamName.includes('materiel n2')) {
            return { icon: 'fa-wrench', class: 'MaterielN2', name: 'MaterielN2', label: 'Matériel N2' };
        }
        if (normalizedTeamName.includes('hotline')) {
            return { icon: 'fa-phone', class: 'Hotline', name: 'Hotline', label: 'Hotline' };
        }
        if (normalizedTeamName.includes('mail sav') || normalizedTeamName.includes('mailsav')) {
            return { icon: 'fa-envelope', class: 'MailSAV', name: 'MailSAV', label: 'Mail SAV' };
        }
        if (normalizedTeamName.includes('rma') || normalizedTeamName.includes('sav')) {
            return { icon: 'fa-exchange', class: 'RMA', name: 'RMA', label: 'RMA/SAV' };
        }
        if (normalizedTeamName.includes('winteam')) {
            return { icon: 'fa-star', class: 'Winteam', name: 'Winteam', label: 'Winteam' };
        }
        // Équipes supprimées d'Odoo, encore portées par les tickets historiques.
        // Sans ces deux branches elles tombaient dans le `default` : icône « ? »
        // et surtout data-team="Matriel" (l'accent était mangé par le
        // replace(/[^a-zA-Z0-9]/g)), donc aucune règle CSS ne s'appliquait.
        if (normalizedTeamName.includes('logiciel')) {
            return { icon: 'fa-laptop', class: 'Logiciel', name: 'Logiciel', label: 'Logiciel (hist.)' };
        }
        if (normalizedTeamName.includes('materiel')) {
            return { icon: 'fa-wrench', class: 'Materiel', name: 'Materiel', label: 'Matériel (hist.)' };
        }

        // Correspondances par ID (fallback)
        // Les anciennes équipes "Logiciel" (8) et "Matériel" (1) ne sont plus référencées.
        // `String(teamId)` : un id arrivant sous forme de chaîne ("9") ne matchait
        // pas le switch, qui compare en ===.
        switch (String(teamId)) {
            case '9':
                return { icon: 'fa-exchange', class: 'RMA', name: 'RMA', label: 'RMA/SAV' };
            case '10':
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

    // =========================================================
    // APPELS WINLINK DANS L'HISTORIQUE DES TICKETS
    // =========================================================
    // Le portail (api/ticket_calls.php) rattache les appels au ticket par le numéro du
    // client et la période du ticket, et renvoie durée + présence d'un enregistrement.
    //  - UNE seule requête par client, lancée à l'affichage de l'historique (mise en cache 2 min) ;
    //  - l'audio n'est JAMAIS préchargé : il est téléchargé au clic sur « Écouter », lu
    //    depuis une URL blob locale, et libéré à la fermeture de l'historique.
    const PORTAL_TICKET_CALLS_URL = 'https://hotline.sippharma.fr/odoospeek/portal/api/ticket_calls.php';
    const PORTAL_RECORDING_URL = 'https://hotline.sippharma.fr/odoospeek/portal/api/call_recording_stream.php';
    const WL_CACHE_MS = 2 * 60 * 1000;
    const WL_MAX_AUDIO = 6;                 // blobs audio gardés en mémoire au maximum
    const WL_AUDIO_BUDGET = 96 * 1024 * 1024; // un fichier plus volumineux reste seul, jusqu’à sa fin
    const _wlCallsCache = new Map();        // client + tickets/périodes -> { at, data }
    const _wlCallsRequests = new Map();     // mutualise les requêtes de métadonnées
    const _wlAudio = new Map();             // recId -> object URL (LRU, six fichiers maximum)
    const _wlAudioBytes = new Map();        // recId -> taille du blob
    const _wlAudioRequests = new Map();     // un téléchargement par enregistrement
    let _wlAudioGeneration = 0;
    let _wlPlaySequence = 0;
    let _wlListeningContext = null;
    let _wlCenteredMix = null;
    const _wlCenteredSources = new WeakMap();
    let _wlPhoneFields = null;

    function tmEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function wlFmtDuration(sec) {
        sec = Math.max(0, Math.round(Number(sec) || 0));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        const p = n => String(n).padStart(2, '0');
        if (h) return `${h} h ${p(m)}`;
        if (m) return `${m} min ${p(s)}`;
        return `${s} s`;
    }

    function wlFmtWhen(s) {
        const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}h${m[5]}` : String(s || '');
    }

    function wlPostJson(url, payload) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            try {
                GM_xmlhttpRequest({
                    method: 'POST', url, timeout: 20000, anonymous: false,
                    headers: { 'Content-Type': 'application/json', 'X-Api-Key': PORTAL_API_KEY },
                    data: JSON.stringify(payload),
                    onload: (resp) => {
                        try { if (resp && resp.status === 200) { resolve(JSON.parse(resp.responseText)); return; } } catch (_) {}
                        resolve(null);
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            } catch (_) { resolve(null); }
        });
    }

    // Numéros du client : le contact, sa société et tous les contacts de la société.
    async function wlPartnerPhones(partnerId) {
        if (!_wlPhoneFields) {
            const defs = await odooRpc('res.partner', 'fields_get', [['phone', 'mobile'], ['type']]) || {};
            _wlPhoneFields = ['phone', 'mobile'].filter(f => defs[f]);
            if (!_wlPhoneFields.length) _wlPhoneFields = ['phone'];
        }
        const pid = Number(partnerId);
        const p = await odooRead('res.partner', pid, ['commercial_partner_id']);
        const cid = m2oId(p && p.commercial_partner_id) || pid;
        const recs = await odooRpc('res.partner', 'search_read', [
            ['|', '|', ['id', '=', pid], ['id', '=', cid], ['commercial_partner_id', '=', cid]], _wlPhoneFields, 0, 60
        ]) || [];
        const out = new Set();
        recs.forEach(r => _wlPhoneFields.forEach(f => {
            const d = String(r[f] || '').replace(/\D/g, '');
            if (d.length >= 9) out.add(d);
        }));
        return [...out].slice(0, 20);
    }

    async function wlFetchCalls(records, partnerId) {
        const tickets = records.slice(0, 300).map(t => ({
            id: t.id,
            create: t.create_date || null,
            close: t.close_date || null,
            user: Array.isArray(t.user_id) ? t.user_id[1] : ''
        }));
        const key = JSON.stringify([String(partnerId), tickets]);
        const hit = _wlCallsCache.get(key);
        if (hit && Date.now() - hit.at < WL_CACHE_MS) return hit.data;
        if (_wlCallsRequests.has(key)) return _wlCallsRequests.get(key);
        const pending = (async () => {
            const phones = await wlPartnerPhones(partnerId);
            if (!phones.length) return { ok: true, tickets: {}, noPhone: true };
            const data = await wlPostJson(PORTAL_TICKET_CALLS_URL, { phones, tickets });
            if (data && data.ok) {
                _wlCallsCache.delete(key);
                _wlCallsCache.set(key, { at: Date.now(), data });
                while (_wlCallsCache.size > 50) _wlCallsCache.delete(_wlCallsCache.keys().next().value);
            }
            return data;
        })();
        _wlCallsRequests.set(key, pending);
        try { return await pending; }
        finally { _wlCallsRequests.delete(key); }
    }

    function wlCallRowHtml(c) {
        const out = c.dir === 'outgoing';
        const incoming = c.dir === 'incoming';
        const directionLabel = out ? 'Appel sortant' : incoming ? 'Appel entrant' : 'Direction non précisée';
        const dirIcon = out
            ? '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            : incoming ? '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M17 7 7 17M15 17H7V9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
                : '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
        const action = c.rec
            ? `<button type="button" class="tk-play" data-rec="${Number(c.rec)}" title="Télécharger et écouter l'enregistrement">Écouter</button>`
            : '<span class="tk-norec">Pas d\'enregistrement</span>';
        return `<div class="tk-call">`
            + `<span class="tk-call-dir ${out ? 'out' : incoming ? 'in' : 'unknown'}" title="${directionLabel}">${dirIcon}</span>`
            + `<span class="tk-call-when">${tmEsc(wlFmtWhen(c.at))}</span>`
            + `<span class="tk-call-who">${tmEsc(c.user || '—')}</span>`
            + `<span class="tk-call-dur">${tmEsc(wlFmtDuration(c.duration))}</span>`
            + action
            + `<div class="tk-audio-slot"></div>`
            + `</div>`;
    }

    async function loadWinlinkCalls(records, partnerId, root) {
        if (!root || !records || !records.length || !partnerId) return;
        const slots = root.querySelectorAll('.tk-talk[data-talk-for]');
        slots.forEach(s => { s.className = 'tk-talk is-loading'; s.textContent = 'Appels…'; });

        let data = null;
        try { data = await wlFetchCalls(records, partnerId); } catch (_) { data = null; }
        if (!root.isConnected) return;

        const byTicket = (data && data.ok && data.tickets) || {};
        root.querySelectorAll('.tk-talk[data-talk-for]').forEach(slot => {
            const id = slot.getAttribute('data-talk-for');
            const info = byTicket[id];
            const box = root.querySelector(`.tk-calls[data-calls-for="${id}"]`);
            if (!info || !Array.isArray(info.calls) || !info.calls.length) {
                slot.className = 'tk-talk is-empty';
                slot.textContent = '';
                if (box) box.innerHTML = '';
                return;
            }
            const n = info.calls.length;
            slot.className = 'tk-talk';
            slot.setAttribute('role', 'button');
            slot.setAttribute('tabindex', '0');
            slot.title = (info.truncated ? `${n} derniers appels du client sur cette période. ` : '')
                + 'Rapprochement par numéro et dates, sans lien certain avec ce ticket.';
            const label = info.truncated ? `${n} derniers appels du client` : `${n} appel${n > 1 ? 's' : ''} du client`;
            slot.innerHTML = `${label} · <b>${tmEsc(wlFmtDuration(info.talk_sec))}</b>`;
            if (box) box.innerHTML = info.calls.map(wlCallRowHtml).join('');
        });
        if (!data || !data.ok) {
            const first = root.querySelector('.tk-talk.is-empty');
            if (first) { first.className = 'tk-talk is-error'; first.textContent = 'Winlink indisponible'; }
        }
    }

    function wlResetAudioRow(row) {
        if (!row || !row.isConnected || row.querySelector('.tk-play')) return;
        const slot = row.querySelector('.tk-audio-slot');
        if (!slot || !slot.dataset.rec) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tk-play';
        btn.dataset.rec = slot.dataset.rec;
        btn.textContent = 'Écouter';
        btn.title = "Télécharger et écouter l'enregistrement";
        row.insertBefore(btn, slot);
    }

    function wlRemoveAudio(audio) {
        const row = audio.closest('.tk-call');
        try { audio.pause(); } catch (_) {}
        try { _wlCenteredSources.get(audio)?.disconnect(); } catch (_) {}
        _wlCenteredSources.delete(audio);
        audio.removeAttribute('src');
        try { audio.load(); } catch (_) {}
        audio.remove();
        wlResetAudioRow(row);
    }

    function wlDropAudio(key) {
        const url = _wlAudio.get(key);
        if (!url) return;
        document.querySelectorAll('audio.tk-audio').forEach(a => { if (a.src === url) wlRemoveAudio(a); });
        try { URL.revokeObjectURL(url); } catch (_) {}
        _wlAudio.delete(key);
        _wlAudioBytes.delete(key);
    }

    function wlGetAudioUrl(recId) {
        const key = String(recId);
        if (!/^[1-9]\d*$/.test(key)) return Promise.resolve(null);
        if (_wlAudio.has(key)) {
            const u = _wlAudio.get(key);
            _wlAudio.delete(key); _wlAudio.set(key, u);
            return Promise.resolve(u);
        }
        if (_wlAudioRequests.has(key)) return _wlAudioRequests.get(key).promise;
        // Deux téléchargements au maximum, sans file d'attente cachée après fermeture.
        if (typeof GM_xmlhttpRequest !== 'function' || _wlAudioRequests.size >= 2) return Promise.resolve(null);
        const generation = _wlAudioGeneration;
        const request = { settled: false, handle: null, finish: null, promise: null };
        request.promise = new Promise(resolve => {
            request.finish = value => {
                if (request.settled) return;
                request.settled = true;
                if (_wlAudioRequests.get(key) === request) _wlAudioRequests.delete(key);
                resolve(value);
            };
        });
        _wlAudioRequests.set(key, request);
        try {
            request.handle = GM_xmlhttpRequest({
                method: 'GET', url: PORTAL_RECORDING_URL + '?call_id=' + encodeURIComponent(key),
                responseType: 'blob', timeout: 90000, anonymous: false,
                headers: { 'X-Api-Key': PORTAL_API_KEY },
                onload: resp => {
                    if (request.settled || generation !== _wlAudioGeneration) { request.finish(null); return; }
                    try {
                        if (!resp || resp.status !== 200 || !resp.response) { request.finish(null); return; }
                        const ct = ((resp.responseHeaders || '').match(/content-type:\s*([^\r\n;]+)/i) || [])[1] || 'audio/wav';
                        if (!/^audio\//i.test(ct) && !/^application\/octet-stream$/i.test(ct)) { request.finish(null); return; }
                        const blob = resp.response instanceof Blob ? resp.response : new Blob([resp.response], { type: ct });
                        if (!blob.size) { request.finish(null); return; }
                        // Éviction avant de créer une septième URL, même si un ancien lecteur est affiché.
                        wlTrimAudioCache(WL_MAX_AUDIO - 1);
                        while (_wlAudio.size && wlAudioBytes() + blob.size > WL_AUDIO_BUDGET) {
                            wlDropAudio(_wlAudio.keys().next().value);
                        }
                        const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: ct }));
                        _wlAudio.set(key, url);
                        _wlAudioBytes.set(key, blob.size);
                        request.finish(url);
                    } catch (_) { request.finish(null); }
                },
                onerror: () => request.finish(null),
                ontimeout: () => request.finish(null),
                onabort: () => request.finish(null)
            });
        } catch (_) { request.finish(null); }
        return request.promise;
    }

    function wlAudioBytes() {
        let total = 0;
        for (const bytes of _wlAudioBytes.values()) total += bytes;
        return total;
    }

    function wlTrimAudioCache(max = WL_MAX_AUDIO) {
        while (_wlAudio.size > max || (_wlAudio.size > 1 && wlAudioBytes() > WL_AUDIO_BUDGET)) {
            wlDropAudio(_wlAudio.keys().next().value);
        }
    }

    // Le mélange mono est limité à l'écoute : les archives stéréo restent intactes.
    function wlEnsureListeningContext() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error('Écoute centrée indisponible');
        if (!_wlListeningContext || _wlListeningContext.state === 'closed') {
            _wlListeningContext = new AudioContext();
            _wlCenteredMix = _wlListeningContext.createGain();
            _wlCenteredMix.channelCount = 1;
            _wlCenteredMix.channelCountMode = 'explicit';
            _wlCenteredMix.channelInterpretation = 'speakers';
            _wlCenteredMix.gain.value = 1;
            _wlCenteredMix.connect(_wlListeningContext.destination);
        }
        return _wlListeningContext.state === 'running' ? Promise.resolve() : _wlListeningContext.resume();
    }

    function wlCenterAudio(audio) {
        if (!_wlCenteredSources.has(audio)) {
            const source = _wlListeningContext.createMediaElementSource(audio);
            source.connect(_wlCenteredMix);
            _wlCenteredSources.set(audio, source);
        }
    }

    // Fermer ou masquer arrête aussi les téléchargements et ne laisse aucun blob tardif.
    function wlReleaseAudio() {
        ++_wlAudioGeneration;
        ++_wlPlaySequence;
        for (const request of _wlAudioRequests.values()) {
            request.finish(null);
            try { request.handle?.abort(); } catch (_) {}
        }
        _wlAudioRequests.clear();
        document.querySelectorAll('audio.tk-audio').forEach(wlRemoveAudio);
        for (const key of [..._wlAudio.keys()]) wlDropAudio(key);
        document.querySelectorAll('.tk-play').forEach(btn => {
            btn.disabled = false;
            btn.textContent = 'Écouter';
            btn.classList.remove('is-error');
        });
        const context = _wlListeningContext;
        _wlListeningContext = null;
        _wlCenteredMix = null;
        if (context) { try { Promise.resolve(context.close()).catch(() => {}); } catch (_) {} }
    }

    async function wlPlay(btn) {
        const row = btn.closest('.tk-call');
        const slot = row && row.querySelector('.tk-audio-slot');
        if (!slot) return;
        const generation = _wlAudioGeneration;
        const sequence = ++_wlPlaySequence;
        slot.dataset.rec = btn.dataset.rec;
        btn.disabled = true;
        btn.classList.remove('is-error');
        btn.textContent = 'Chargement…';
        document.querySelectorAll('audio.tk-audio').forEach(a => { try { a.pause(); } catch (_) {} });
        try {
            // Initialisé dans le geste utilisateur, avant toute requête réseau.
            await wlEnsureListeningContext();
            if (generation !== _wlAudioGeneration || !btn.isConnected) return;
            const url = await wlGetAudioUrl(btn.dataset.rec);
            if (generation !== _wlAudioGeneration || !btn.isConnected || !slot.isConnected) return;
            if (!url) throw new Error('Enregistrement indisponible');
            // Un enregistrement ne garde qu'un lecteur, même s'il apparaît dans plusieurs périodes.
            document.querySelectorAll('audio.tk-audio').forEach(a => {
                if (a.dataset.rec === btn.dataset.rec) wlRemoveAudio(a);
            });
            const audio = document.createElement('audio');
            audio.className = 'tk-audio';
            audio.dataset.rec = btn.dataset.rec;
            audio.controls = true;
            audio.preload = 'none';
            audio.src = url;
            wlCenterAudio(audio);
            audio.addEventListener('play', () => {
                document.querySelectorAll('audio.tk-audio').forEach(a => { if (a !== audio) a.pause(); });
                if (_wlListeningContext?.state === 'suspended') _wlListeningContext.resume().catch(() => {});
            });
            audio.addEventListener('error', () => {
                if (audio.isConnected) { wlDropAudio(audio.dataset.rec); }
            });
            audio.addEventListener('ended', () => {
                // Ne pas conserver un long appel dépassant le budget après son écoute.
                if ((_wlAudioBytes.get(audio.dataset.rec) || 0) > WL_AUDIO_BUDGET) wlDropAudio(audio.dataset.rec);
            });
            slot.innerHTML = '';
            slot.appendChild(audio);
            btn.remove();
            if (sequence === _wlPlaySequence) audio.play().catch(() => {});
        } catch (_) {
            if (generation !== _wlAudioGeneration || !btn.isConnected) return;
            btn.disabled = false;
            btn.textContent = 'Réessayer l’écoute';
            btn.classList.add('is-error');
            btn.title = 'Lecture indisponible. Cliquez pour réessayer.';
        }
    }

    // Délégation d'événements, posée une seule fois par liste
    function wlBindHistoryEvents(root) {
        if (!root || root.dataset.wlBound === '1') return;
        root.dataset.wlBound = '1';
        const toggle = (chip) => {
            const id = chip.getAttribute('data-talk-for');
            const box = root.querySelector(`.tk-calls[data-calls-for="${id}"]`);
            if (!box || !box.children.length) return;
            box.hidden = !box.hidden;
            chip.classList.toggle('is-open', !box.hidden);
        };
        root.addEventListener('click', (e) => {
            const t = e.target instanceof Element ? e.target : null;
            if (!t) return;
            const play = t.closest('.tk-play');
            if (play) { e.stopPropagation(); if (!play.disabled) wlPlay(play); return; }
            const chip = t.closest('.tk-talk[role="button"]');
            if (chip) { e.stopPropagation(); toggle(chip); return; }
            if (t.closest('.tk-calls')) e.stopPropagation();
        });
        root.addEventListener('keydown', (e) => {
            const chip = e.target instanceof Element && e.target.closest('.tk-talk[role="button"]');
            if (chip && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(chip); }
        });
    }

    // Fonction pour mettre à jour la liste des tickets
    function updateTicketsList(tickets, partnerId) {
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
                        <span class="ticket-title">${tmEsc(ticket.name || 'Sans titre')}</span>
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
                            ${tmEsc(userName)}
                        </div>
                        <span class="ticket-status ${stageInfo.class}">${tmEsc(stageInfo.text)}</span>
                        <span class="tk-talk is-empty" data-talk-for="${Number(ticket.id)}"></span>
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
                    <div class="tk-calls" data-calls-for="${Number(ticket.id)}" hidden></div>
                </div>
            `;
        }).join('');

        ticketsList.innerHTML = html;
        wlBindHistoryEvents(ticketsList);

        // Ajouter les événements de clic pour ouvrir les tickets
        ticketsList.querySelectorAll('.ticket-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Clics sur les appels / le lecteur audio : ne pas ouvrir le ticket
                if (e.target instanceof Element && e.target.closest('.tk-talk, .tk-calls')) return;
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

        // Appels Winlink (durée + enregistrements) : une requête groupée, en arrière-plan
        if (partnerId) loadWinlinkCalls(records, partnerId, ticketsList);

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
                </div>
                <div class="historique-header-right">
                    <div class="ticket-filters">
                        <input type="search" class="form-control form-control-sm" placeholder="Rechercher dans les tickets…" id="ticketSearch">
                        <select class="form-select form-select-sm" id="teamFilter">
                            <option value="">Toutes les équipes</option>
                            <option value="Hotline">Hotline</option>
                            <option value="LogicielN2">Logiciel N2</option>
                            <option value="MaterielN2">Matériel N2</option>
                            <option value="RMA">RMA/SAV</option>
                            <option value="MailSAV">Mail SAV</option>
                            <option value="Winteam">Winteam</option>
                            <option value="Logiciel">Logiciel (hist.)</option>
                            <option value="Materiel">Matériel (hist.)</option>
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
        wlReleaseAudio();
        document.getElementById('partner-history-modal')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'partner-history-modal';
        overlay.className = 'partner-history-modal-overlay';

        const modal = document.createElement('div');
        modal.className = 'partner-history-modal';

        const title = document.createElement('div');
        title.className = 'partner-history-modal-toolbar';
        title.innerHTML = `<span>${tmEsc(partnerName || ('Client #' + partnerId))}</span>`;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'tm-icon-btn';
        closeBtn.setAttribute('aria-label', 'Fermer');
        closeBtn.title = 'Fermer';
        closeBtn.innerHTML = '<i class="fa fa-times"></i>';
        const closeModal = () => { wlReleaseAudio(); overlay.remove(); };
        closeBtn.addEventListener('click', closeModal);
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
            if (e.target === overlay) closeModal();
        });

        setupHistoryThemeToggle(historyContainer);

        const tickets = await fetchClientTickets(partnerId);
        if (tickets) {
            updateTicketsList(tickets, partnerId);
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
        const partnerId = await getIdToProcess();
        const tickets = partnerId ? await fetchClientTickets(partnerId) : null;
        if (tickets) {
            updateTicketsList(tickets, partnerId);
        }

        // Ajouter les gestionnaires d'événements pour les filtres
        setupTicketFilters();

        // Afficher selon l'état sauvegardé
        const shouldBeVisible = getHistoryState();
        if (shouldBeVisible) {
            historyContainer.classList.add('visible');
            const button = document.getElementById('showHistoryButton');
            if (button) {
                button.innerHTML = '<i class="fa fa-times"></i> Masquer l\'historique'; button.classList.add('is-active');
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
                        <input type="search" class="form-control form-control-sm" placeholder="Rechercher un produit, une référence, un n° de série…" id="productSearch">
                        <select class="form-select form-select-sm" id="typeFilter">
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
                button.innerHTML = '<i class="fa fa-times"></i> Masquer les produits'; button.classList.add('is-active');
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
            historyButton.type = 'button';
            historyButton.className = 'tm-btn';
            historyButton.innerHTML = '<i class="fa fa-history"></i> Historique des tickets'; historyButton.classList.remove('is-active');
            historyButton.title = 'Afficher/masquer l\'historique des tickets';

            historyButton.addEventListener('click', function() {
                let historyContainer = document.getElementById('zone_historique_tickets');

                if (historyContainer) {
                    historyContainer.classList.toggle('visible');
                    const isVisible = historyContainer.classList.contains('visible');
                    saveHistoryState(isVisible);

                    if (isVisible) {
                        historyButton.innerHTML = '<i class="fa fa-times"></i> Masquer l\'historique'; historyButton.classList.add('is-active');
                    } else {
                        wlReleaseAudio();
                        historyButton.innerHTML = '<i class="fa fa-history"></i> Historique des tickets'; historyButton.classList.remove('is-active');
                    }
                } else {
                    addTicketHistory().then((newContainer) => {
                        if (newContainer) {
                            newContainer.classList.add('visible');
                            saveHistoryState(true);
                            historyButton.innerHTML = '<i class="fa fa-times"></i> Masquer l\'historique'; historyButton.classList.add('is-active');
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
            productsButton.type = 'button';
            productsButton.className = 'tm-btn';
            productsButton.innerHTML = '<i class="fa fa-cubes"></i> Produits du client'; productsButton.classList.remove('is-active');
            productsButton.title = 'Afficher/masquer les produits du client';

            productsButton.addEventListener('click', function() {
                let productsContainer = document.getElementById('zone_produits_client');

                if (productsContainer) {
                    const wasVisible = productsContainer.classList.contains('visible');

                    if (wasVisible) {
                        productsContainer.classList.remove('visible');
                        productsButton.innerHTML = '<i class="fa fa-cubes"></i> Produits du client'; productsButton.classList.remove('is-active');
                        saveProductsState(false);
                    } else {
                        productsContainer.classList.add('visible');
                        productsButton.innerHTML = '<i class="fa fa-times"></i> Masquer les produits'; productsButton.classList.add('is-active');
                        saveProductsState(true);
                    }
                } else {
                    addClientProducts().then((newContainer) => {
                        if (newContainer) {
                            newContainer.classList.add('visible');
                            saveProductsState(true);
                            productsButton.innerHTML = '<i class="fa fa-times"></i> Masquer les produits'; productsButton.classList.add('is-active');
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
            wlReleaseAudio();

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
        #tm-tel-wrap .tm-tel-input { width:180px; }
        #tm-tel-suggest { position:absolute; left:0; top:calc(100% + 4px); z-index:2147483646; min-width:280px; max-height:300px; overflow:auto;
            display:none; padding:4px 0; background:var(--tm-bg-elevated); color:var(--tm-text);
            border:1px solid var(--tm-border); border-radius:var(--tm-radius); box-shadow:var(--tm-shadow); }
        #tm-tel-suggest .tm-it { padding:7px 14px; cursor:pointer; display:flex; flex-direction:column; gap:1px; }
        #tm-tel-suggest .tm-it:hover { background:var(--tm-bg-hover); }
        #tm-tel-suggest .tm-it .tm-nm { font-weight:500; color:var(--tm-strong); }
        #tm-tel-suggest .tm-it .tm-ph { font-size:12px; color:var(--tm-muted); }
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
        telInput.type = 'text'; telInput.className = 'tm-tel-input form-control form-control-sm';
        telInput.placeholder = 'Numéro de téléphone';
        telInput.title = 'Rechercher le client par téléphone (+33, espaces et points acceptés)';
        telInput.autocomplete = 'off';

        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'tm-tel-btn tm-btn tm-btn-icon'; btn.title = 'Rechercher le client'; btn.setAttribute('aria-label', 'Rechercher le client');
        btn.innerHTML = '<i class="fa fa-search" aria-hidden="true"></i>';

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
            position: relative; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; align-self: center;
            margin: 0 8px; padding: 0 10px;
        }
        #tm-missed-fab .tm-missed-count {
            min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; box-sizing: border-box;
            background: var(--tm-danger); color: #fff; font-size: 11px; font-weight: 600; line-height: 18px; text-align: center;
            font-variant-numeric: tabular-nums;
        }
        #tm-missed-fab .tm-missed-count.tm-missed-zero { background: var(--tm-bg-subtle); color: var(--tm-muted); }
        #tm-missed-fab .tm-missed-ico { color: var(--tm-muted); flex: 0 0 auto; }
        #tm-missed-fab.has-missed .tm-missed-ico { color: var(--tm-danger); }
        #tm-missed-fab.has-missed { border-color: var(--tm-danger) !important; }
        #tm-missed-fab .tm-missed-label { font-weight: 500; }
        #tm-missed-panel { top: 52px; width: 360px; max-height: 70vh; z-index: 99999; }
        .tm-missed-row {
            display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 1px 12px;
            padding: 9px 16px; border-bottom: 1px solid var(--tm-border);
        }
        .tm-missed-row:last-child { border-bottom: 0; }
        .tm-missed-row-main { display: flex; align-items: center; gap: 8px; }
        .tm-missed-phone { font-weight: 500; color: var(--tm-strong); font-variant-numeric: tabular-nums; }
        .tm-missed-badge { font-size: 12px; color: var(--tm-danger); }
        .tm-missed-ok { font-size: 12px; color: var(--tm-success); }
        .tm-missed-time { grid-column: 2; grid-row: 1; font-size: 12px; color: var(--tm-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .tm-missed-name { grid-column: 1 / -1; font-size: 12.5px; color: var(--tm-link); }
        .tm-missed-resolving, .tm-missed-unknown { color: var(--tm-muted); }
        .tm-missed-row.tm-missed-done .tm-missed-phone { color: var(--tm-muted); font-weight: 400; }
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
        const fab = document.getElementById('tm-missed-fab');
        if (fab) fab.classList.toggle('has-missed', c > 0);
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

    // Noms des numéros inconnus du portail. Avant : jusqu'à ~15 requêtes Odoo PAR numéro
    // (une par variante d'écriture), numéro après numéro, oubliées au rechargement.
    // Maintenant : cache navigateur (7 jours, 1 jour si introuvable), puis UNE requête
    // groupée pour tous les numéros restants, et un repli individuel limité à 5 numéros.
    const TM_MISSED_NAMES_KEY = 'tm_missed_names_v1';
    function tmMissedNameStore() {
        try { const v = JSON.parse(localStorage.getItem(TM_MISSED_NAMES_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; }
        catch (_) { return {}; }
    }
    function tmMissedNameStoreSave(store) {
        const now = Date.now();
        Object.keys(store).forEach(k => { if (!store[k] || now - store[k].t > 7 * 864e5) delete store[k]; });
        try { localStorage.setItem(TM_MISSED_NAMES_KEY, JSON.stringify(store)); } catch (_) {}
    }

    async function tmMissedBatchLookup(suffixes) {
        const found = new Map();
        if (!suffixes.length) return found;
        if (!_wlPhoneFields) {
            const defs = await odooRpc('res.partner', 'fields_get', [['phone', 'mobile'], ['type']]) || {};
            _wlPhoneFields = ['phone', 'mobile'].filter(f => defs[f]);
            if (!_wlPhoneFields.length) _wlPhoneFields = ['phone'];
        }
        const conds = suffixes.map(x => ['phone_mobile_search', 'ilike', x]);
        const domain = Array(conds.length - 1).fill('|').concat(conds);
        const recs = await odooRpc('res.partner', 'search_read', [domain, ['display_name'].concat(_wlPhoneFields), 0, 300]) || [];
        const wanted = new Set(suffixes);
        recs.forEach(r => _wlPhoneFields.forEach(f => {
            const sfx = String(r[f] || '').replace(/\D/g, '').slice(-9);
            if (wanted.has(sfx) && !found.has(sfx)) found.set(sfx, r.display_name || '');
        }));
        return found;
    }

    async function tmMissedResolveNames(panel, entries) {
        const store = tmMissedNameStore();
        const now = Date.now();
        const sfxOf = (phone) => String(phone || '').replace(/\D/g, '').slice(-9);
        const paint = (sfx, name) => {
            if (!panel.isConnected) return;
            panel.querySelectorAll('.tm-missed-row[data-digits]').forEach(row => {
                if (!row.dataset.digits.endsWith(sfx)) return;
                const cell = row.querySelector('[data-name]');
                if (cell) cell.innerHTML = name ? tmMissedEsc(name) : '<span class="tm-missed-unknown">Numéro inconnu</span>';
            });
        };

        const todo = new Map(); // sfx -> numéro d'origine
        for (const g of entries) {
            if (g.partner_name) continue;
            const sfx = sfxOf(g.phone);
            if (sfx.length < 9) continue;
            const hit = _tmMissedNameCache[sfx] !== undefined ? { n: _tmMissedNameCache[sfx] } : store[sfx];
            const fresh = hit && (hit.t === undefined || now - hit.t < (hit.n ? 7 * 864e5 : 864e5));
            if (fresh) paint(sfx, hit.n); else todo.set(sfx, g.phone);
        }
        if (!todo.size) return;

        let found = new Map();
        try { found = await tmMissedBatchLookup([...todo.keys()]); } catch (_) {}
        const rest = [...todo.keys()].filter(x => !found.has(x)).slice(0, 5);
        await Promise.all(rest.map(async sfx => {
            try {
                const recs = await tmTelSearchPartner(todo.get(sfx), 1);
                if (recs && recs.length) found.set(sfx, recs[0].display_name || '');
            } catch (_) {}
        }));

        for (const sfx of todo.keys()) {
            if (!found.has(sfx) && !rest.includes(sfx)) continue; // au-delà des 5 : retenté au prochain affichage
            const name = found.get(sfx) || '';
            _tmMissedNameCache[sfx] = name;
            store[sfx] = { n: name, t: now };
            paint(sfx, name);
        }
        tmMissedNameStoreSave(store);
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
            + (resolved ? '<span class="tm-missed-ok">Rappelé</span>' : '') + `</div>`
            + `<div class="tm-missed-name" data-name>${nameHtml}</div>`
            + `<div class="tm-missed-time">${tmMissedFmtTime(g.last_time)}</div>`
            + `</div>`;
    }

    function tmMissedRenderPanel() {
        let panel = document.getElementById('tm-missed-panel');
        if (!panel) { panel = document.createElement('div'); panel.id = 'tm-missed-panel'; panel.className = 'tm-pop'; document.body.appendChild(panel); }

        const data = _tmMissedData;
        const pending = data && Array.isArray(data.pending) ? data.pending : [];
        const resolved = data && Array.isArray(data.resolved) ? data.resolved : [];
        const head = `<div class="tm-pop-head"><span class="tm-pop-title">À rappeler aujourd'hui</span>`
            + (data ? `<span class="tm-pop-count">${pending.length}</span>` : '')
            + `<span class="tm-pop-actions"><button type="button" class="tm-icon-btn" id="tm-missed-reload" title="Actualiser" aria-label="Actualiser"><i class="fa fa-refresh" aria-hidden="true"></i></button>`
            + `<button type="button" class="tm-icon-btn" id="tm-missed-close" title="Fermer" aria-label="Fermer"><i class="fa fa-times" aria-hidden="true"></i></button></span></div>`;

        let body;
        if (!data) body = `<div class="tm-pop-empty">Chargement…</div>`;
        else if (!pending.length && !resolved.length) body = `<div class="tm-pop-empty">Aucun appel manqué aujourd'hui</div>`;
        else if (!pending.length) body = `<div class="tm-pop-empty">Tous les appels manqués ont été rappelés</div>`
            + `<div class="tm-pop-section">Déjà rappelés · ${resolved.length}</div>`
            + resolved.map(g => tmMissedRowHtml(g, true)).join('');
        else {
            body = pending.map(g => tmMissedRowHtml(g, false)).join('');
            if (resolved.length) {
                body += `<div class="tm-pop-section">Déjà rappelés · ${resolved.length}</div>`
                    + resolved.map(g => tmMissedRowHtml(g, true)).join('');
            }
        }

        panel.innerHTML = head + `<div class="tm-pop-body">${body}</div>`;
        panel.querySelector('#tm-missed-close')?.addEventListener('click', () => panel.remove());
        panel.querySelector('#tm-missed-reload')?.addEventListener('click', () => tmMissedRefresh(true));
        const toResolve = pending.concat(resolved);
        if (toResolve.length) tmMissedResolveNames(panel, toResolve);
    }

    function tmMissedTogglePanel() {
        const existing = document.getElementById('tm-missed-panel');
        if (existing) { existing.remove(); return; }
        tmMissedRenderPanel();                                   // affichage immédiat des données en cache
        tmMissedRefresh(Date.now() - _tmMissedLastFetch > 30000); // rafraîchi seulement si > 30 s
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
        fab.className = 'tm-btn';
        // Icône « appel manqué » (Material Icons, licence Apache 2.0)
        fab.innerHTML = '<svg class="tm-missed-ico" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 5.5L12 11l7-7-1-1-6 6-4.5-4.5H11V3H5v6h1.5V5.5zm17.21 11.17C20.66 13.78 16.54 12 12 12 7.46 12 3.34 13.78.29 16.67c-.18.18-.29.43-.29.71s.11.53.29.71l2.48 2.48c.18.18.43.29.71.29.27 0 .52-.1.7-.28.79-.73 1.68-1.36 2.66-1.85.33-.16.56-.5.56-.9v-3.1c1.45-.48 3-.73 4.6-.73 1.6 0 3.15.25 4.6.72v3.1c0 .39.23.74.56.9.98.49 1.88 1.11 2.67 1.85.18.18.43.28.7.28.28 0 .53-.11.71-.29l2.48-2.48c.18-.18.29-.43.29-.71s-.12-.52-.3-.7z"/></svg>'
            + '<span class="tm-missed-label">Manqués</span><span class="tm-missed-count" id="tm-missed-count">…</span>';
        fab.addEventListener('click', tmMissedTogglePanel);

        if (anchor.mode === 'prepend') anchor.el.insertBefore(fab, anchor.el.firstChild);
        else anchor.el.parentNode.insertBefore(fab, anchor.el);
        tmMissedRefresh(false); // réutilise les données de moins de 60 s (retour sur la liste)
    }

    // =========================================================
    // JAUGE DE PERFORMANCE HOTLINER (portail Winlink)
    // =========================================================
    // Pastille flottante en haut au centre, visible uniquement sur la LISTE des
    // tickets. Tout le calcul est fait côté portail (api/hotliner_score.php) :
    // ce script ne reçoit qu'un remplissage de 0 à 10, une couleur, une série et
    // les deux chiffres que le hotliner a le droit de voir. Les objectifs ne
    // transitent jamais jusqu'ici — ce fichier est lisible depuis l'éditeur
    // Tampermonkey, n'y remettez aucun seuil.
    const HS_FLAME = '<i class="fa fa-fire" aria-hidden="true"></i>';   // icône de série (Font Awesome d'Odoo)
    const HS_REFRESH_MS = 300000;      // 5 min entre deux relevés
    const HS_MIN_GAP_MS = 10000;       // plancher anti-rafale, même sur demande explicite
    let _hsData = null;
    let _hsLoading = false;
    let _hsLastAttempt = 0;
    let _hsStylesInjected = false;
    const HS_RETRY_MS = 900000;        // 15 min avant de retenter quand il n'y a pas de jauge
    // Pas de verrou définitif : la jauge peut être indisponible parce que le compte
    // n'a pas de poste Speek, mais aussi parce qu'un administrateur l'a masquée
    // depuis le portail. Si on abandonnait pour de bon, une réactivation ne
    // reviendrait qu'après un rechargement complet de la page Odoo.
    let _hsUnavailableUntil = 0;

    function hsEsc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function hsInjectStyles() {
        if (_hsStylesInjected) return; _hsStylesInjected = true;
        const st = document.createElement('style');
        st.textContent = `
        #tm-hs-gauge {
            position: fixed; top: 7px; left: 50%; transform: translateX(-50%); z-index: 99998;
            display: inline-flex; align-items: center; gap: 8px; height: 24px; padding: 0 10px; box-sizing: border-box;
            border-radius: 12px; cursor: pointer; user-select: none;
            background: var(--tm-bg-elevated); border: 1px solid var(--tm-border); box-shadow: 0 1px 3px rgba(0,0,0,.12);
        }
        #tm-hs-gauge:hover { border-color: var(--tm-muted); }
        #tm-hs-gauge:focus-visible { outline: 2px solid var(--tm-link); outline-offset: 2px; }
        .tm-hs-bars { display: inline-flex; align-items: center; gap: 2px; }
        .tm-hs-seg { display: block; width: 6px; height: 10px; border-radius: 1px; background: var(--tm-border); }
        #tm-hs-gauge[data-level="red"]   .tm-hs-seg.on { background: var(--tm-danger); }
        #tm-hs-gauge[data-level="amber"] .tm-hs-seg.on { background: var(--tm-warning); }
        #tm-hs-gauge[data-level="green"] .tm-hs-seg.on { background: var(--tm-success); }
        .tm-hs-flame { display: inline-flex; align-items: center; gap: 3px; font-size: 12px; color: var(--tm-warning); }
        .tm-hs-flame b { font-size: 11.5px; font-weight: 600; color: var(--tm-text); }
        #tm-hs-panel {
            position: fixed; top: 38px; left: 50%; transform: translateX(-50%); z-index: 99999; width: 260px; overflow: hidden;
            background: var(--tm-bg-elevated); color: var(--tm-text); font-size: 13px;
            border: 1px solid var(--tm-border); border-radius: var(--tm-radius); box-shadow: var(--tm-shadow);
        }
        .tm-hs-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--tm-border); font-weight: 600; color: var(--tm-strong); }
        .tm-hs-head span::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: var(--tm-border); vertical-align: middle; }
        #tm-hs-panel[data-level="red"]   .tm-hs-head span::before { background: var(--tm-danger); }
        #tm-hs-panel[data-level="amber"] .tm-hs-head span::before { background: var(--tm-warning); }
        #tm-hs-panel[data-level="green"] .tm-hs-head span::before { background: var(--tm-success); }
        .tm-hs-body { padding: 6px 16px 12px; }
        .tm-hs-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 5px 0; color: var(--tm-muted); }
        .tm-hs-row b { font-weight: 600; color: var(--tm-strong); white-space: nowrap; font-variant-numeric: tabular-nums; }
        .tm-hs-row b .fa { color: var(--tm-warning); }
        .tm-hs-msg { margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--tm-border); color: var(--tm-text); }
        .tm-hs-warn { margin-top: 6px; font-size: 12px; color: var(--tm-warning); }
        `;
        document.head.appendChild(st);
    }

    // Niveau affiché. 'idle' (gris) tant qu'on n'a pas de données, ou quand le
    // portail signale que les clôtures Odoo n'ont pas pu être lues : mieux vaut
    // ne rien trancher qu'afficher un rouge dû à une panne d'API.
    function hsLevel() {
        const d = _hsData;
        if (!d || d.odoo_ok === false) return 'idle';
        return (d.level === 'red' || d.level === 'amber' || d.level === 'green') ? d.level : 'idle';
    }

    function hsGaugeHtml() {
        const d = _hsData || {};
        const seg = Math.max(0, Math.min(10, Number(d.segments) || 0));
        const streak = Math.max(0, Number(d.streak) || 0);
        let bars = '';
        for (let i = 0; i < 10; i++) bars += `<i class="tm-hs-seg${i < seg ? ' on' : ''}"></i>`;
        const flame = streak >= 2 ? `<span class="tm-hs-flame">${HS_FLAME}<b>${streak}</b></span>` : '';
        return `<span class="tm-hs-bars">${bars}</span>${flame}`;
    }

    function hsRenderGauge() {
        const g = document.getElementById('tm-hs-gauge');
        if (!g) return;
        g.dataset.level = hsLevel();
        g.innerHTML = hsGaugeHtml();
        const streak = _hsData ? Math.max(0, Number(_hsData.streak) || 0) : 0;
        g.setAttribute('aria-label', streak >= 2
            ? `Ma journée, série de ${streak} jours. Ouvrir le détail.`
            : 'Ma journée. Ouvrir le détail.');
    }

    function hsRenderPanel() {
        let p = document.getElementById('tm-hs-panel');
        if (!p) {
            p = document.createElement('div');
            p.id = 'tm-hs-panel';
            p.setAttribute('role', 'dialog');
            p.setAttribute('aria-label', 'Ma journée');
            document.body.appendChild(p);
        }
        const d = _hsData;
        const level = hsLevel();
        p.dataset.level = level;

        const head = `<div class="tm-hs-head"><span>Ma journée</span>`
            + `<button type="button" class="tm-icon-btn" id="tm-hs-close" title="Fermer" aria-label="Fermer"><i class="fa fa-times" aria-hidden="true"></i></button></div>`;

        if (!d) {
            p.innerHTML = head + `<div class="tm-hs-body"><div class="tm-hs-msg">Chargement…</div></div>`;
        } else {
            const streak = Math.max(0, Number(d.streak) || 0);
            const msg = level === 'green' ? 'Objectif du jour atteint, beau travail.'
                      : level === 'amber' ? 'Bonne dynamique, continue comme ça.'
                      : level === 'red'   ? 'La journée est encore devant toi.'
                      : 'Relevé partiel pour le moment.';
            p.innerHTML = head
                + `<div class="tm-hs-body">`
                + `<div class="tm-hs-row"><span>Appels clôturés</span><b>${d.closed == null ? '—' : Math.max(0, Number(d.closed) || 0)}</b></div>`
                + `<div class="tm-hs-row"><span>Temps au téléphone</span><b>${hsEsc(d.talk_human || '0min')}</b></div>`
                + `<div class="tm-hs-row"><span>Série en cours</span><b>${streak >= 2 ? HS_FLAME + ' ' + streak + ' jours' : '—'}</b></div>`
                + `<div class="tm-hs-msg">${msg}</div>`
                + (d.odoo_ok === false ? `<div class="tm-hs-warn">Clôtures Odoo momentanément indisponibles.</div>` : '')
                + `</div>`;
        }
        p.querySelector('#tm-hs-close')?.addEventListener('click', () => p.remove());
    }

    function hsFetch(userName) {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            // Clé API en en-tête (pas dans l'URL) et domaine déjà déclaré en @connect.
            const url = PORTAL_HOTLINER_SCORE_URL + '?user=' + encodeURIComponent(userName);
            try {
                GM_xmlhttpRequest({
                    method: 'GET', url, timeout: 20000, anonymous: false,
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

    async function hsRefresh(force) {
        const now = Date.now();
        // Un appel forcé (clic, retour sur l'onglet) ignore la fenêtre d'attente :
        // c'est le bon moment pour revérifier.
        if (!force && now < _hsUnavailableUntil) return;
        // La fenêtre porte sur la dernière TENTATIVE, pas sur le dernier succès :
        // sinon, portail injoignable, chaque passage de runAll relancerait une
        // requête (runAll est déclenché par l'observer DOM, donc très souvent).
        if (!force && (now - _hsLastAttempt) < HS_REFRESH_MS) return;
        if ((now - _hsLastAttempt) < HS_MIN_GAP_MS) return;
        if (_hsLoading) return;
        _hsLoading = true;
        _hsLastAttempt = now;
        try {
            const user = getOdooCurrentUserName() || await warmCurrentUserName();
            if (!user) return;
            const data = await hsFetch(user);
            // Échec réseau : on conserve le dernier état connu plutôt que de
            // repasser la jauge à zéro, ce qui serait interprété comme un recul.
            if (!data || data.ok !== true) return;
            if (data.known === false) {
                // Deux cas : aucun poste Speek rattaché à ce compte, ou jauge masquée
                // depuis le portail. On retente dans 15 min au lieu d'abandonner.
                _hsUnavailableUntil = now + HS_RETRY_MS;
                _hsData = null;
                hsRemoveWidgets();
                return;
            }
            _hsUnavailableUntil = 0;
            _hsData = data;
            hsMountGauge();
            hsRenderGauge();
            if (document.getElementById('tm-hs-panel')) hsRenderPanel();
        } finally {
            _hsLoading = false;
        }
    }

    function hsRemoveWidgets() {
        document.getElementById('tm-hs-gauge')?.remove();
        document.getElementById('tm-hs-panel')?.remove();
    }

    function hsTogglePanel() {
        if (document.getElementById('tm-hs-panel')) {
            document.getElementById('tm-hs-panel').remove();
            return;
        }
        hsRenderPanel();
        hsRefresh(true);
    }

    // Crée la pastille si elle n'existe pas encore. Idempotent.
    function hsMountGauge() {
        if (document.getElementById('tm-hs-gauge')) return;
        hsInjectStyles();
        const g = document.createElement('div');
        g.id = 'tm-hs-gauge';
        g.dataset.level = 'idle';
        g.title = 'Ma journée';
        g.setAttribute('role', 'button');
        g.setAttribute('tabindex', '0');
        g.addEventListener('click', hsTogglePanel);
        g.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                hsTogglePanel();
            }
        });
        document.body.appendChild(g);
        hsRenderGauge();
    }

    function ensureHotlinerGauge() {
        if (!isTicketList()) { hsRemoveWidgets(); return; }
        // Pendant la fenêtre d'attente, on ne montre rien et on ne demande rien.
        if (Date.now() < _hsUnavailableUntil) { hsRemoveWidgets(); return; }
        // La pastille n'est montée qu'une fois les données obtenues : sinon un rond
        // gris apparaîtrait puis disparaîtrait à chaque nouvelle tentative sur les
        // comptes qui n'ont pas de jauge.
        if (_hsData) hsMountGauge();
        hsRefresh(false);
    }

    // =========================================================
    // OPÉRATEUR EN LIGNE AVEC LE CLIENT (liste des tickets)
    // =========================================================
    // Le portail (api/live_calls.php) connaît les appels en cours, signalés par le poste
    // de chaque opérateur. Sur la liste des tickets, chaque ligne dont le client est
    // actuellement au téléphone reçoit :
    //  - un liseré vert à gauche de la ligne,
    //  - si l'opérateur au téléphone est l'assigné : anneau vert fixe autour de sa photo et
    //    « ● En appel · 03:12 » sous son nom,
    //  - sinon : ses initiales avec un point vert et « En appel avec Marie · 00:41 » sous le client.
    //  Le chrono avance chaque seconde.
    // Coût : une requête portail toutes les 6 s (liste affichée et onglet visible
    // uniquement) ; la résolution numéro → client Odoo est mise en cache 10 min.
    const PORTAL_LIVE_CALLS_URL = 'https://hotline.sippharma.fr/odoospeek/portal/api/live_calls.php';
    const LIVE_POLL_MS = 6000;
    const LIVE_PHONE_TTL_MS = 10 * 60 * 1000;
    let _liveCalls = [];                    // [{ user, phone, started_at, direction, commercialIds:Set }]
    let _liveClockOffset = 0;               // secondes : heure portail - heure locale
    let _liveBusy = false;
    let _liveLastPoll = 0;
    let _liveLastSuccess = 0;
    const LIVE_STALE_MS = 45000;
    const _livePhoneRequests = new Map();
    let _livePhoneFieldsPromise = null;
    let _liveRendering = false;
    let _liveRenderAgain = false;
    const _livePhoneCache = new Map();      // 9 derniers chiffres -> { ids:Set(commercial), at }
    const _liveCommercialOf = new Map();    // partnerId -> commercialPartnerId

    function liveFetch() {
        return new Promise((resolve) => {
            if (typeof GM_xmlhttpRequest !== 'function') { resolve(null); return; }
            try {
                GM_xmlhttpRequest({
                    method: 'GET', url: PORTAL_LIVE_CALLS_URL, timeout: 8000, anonymous: false,
                    headers: { 'X-Api-Key': PORTAL_API_KEY },
                    onload: (resp) => {
                        try { if (resp && resp.status === 200) { resolve(JSON.parse(resp.responseText)); return; } } catch (_) {}
                        resolve(null);
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            } catch (_) { resolve(null); }
        });
    }

    // Nom normalisé pour comparer « SAIR ALEXIS » (Odoo) et « Alexis Sair » (téléphonie)
    function liveNormName(n) {
        return String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
    }

    // Prénom affiché : le nom est au format « NOM PRÉNOM » côté Odoo
    function liveFirstName(n) {
        const parts = String(n || '').trim().split(/\s+/);
        const p = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    }

    function liveFmtElapsed(sec) {
        sec = Math.max(0, Math.floor(sec));
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        const p = n => String(n).padStart(2, '0');
        return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
    }

    function livePhoneKey(phone) {
        let digits = String(phone || '').replace(/\D/g, '');
        if (digits.startsWith('00')) digits = digits.slice(2);
        if (/^330[1-9]\d{8}$/.test(digits)) digits = digits.slice(2);
        else if (/^33[1-9]\d{8}$/.test(digits)) digits = '0' + digits.slice(2);
        return digits;
    }

    async function liveReadRpc(method, args) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const value = await odooRpc('res.partner', method, args, {}, { signal: controller.signal });
            if (value == null) throw new Error('Lecture Odoo temporairement indisponible');
            return value;
        } finally { clearTimeout(timeout); }
    }

    async function livePhoneFields() {
        if (!_livePhoneFieldsPromise) {
            _livePhoneFieldsPromise = liveReadRpc('fields_get', [
                ['phone', 'mobile', 'phone_mobile_search'], ['type']
            ]).then(defs => {
                const fields = ['phone', 'mobile'].filter(f => defs && defs[f]);
                return { fields: fields.length ? fields : ['phone'], search: !!(defs && defs.phone_mobile_search) };
            }).catch(() => {
                _livePhoneFieldsPromise = null;
                return { fields: ['phone'], search: false };
            });
        }
        return _livePhoneFieldsPromise;
    }

    async function liveCommercialIdsForPhone(phone) {
        const key = livePhoneKey(phone);
        if (key.length < 9) return new Set();
        const hit = _livePhoneCache.get(key);
        if (hit && Date.now() - hit.at < (hit.ids.size ? LIVE_PHONE_TTL_MS : 60000)) return hit.ids;
        if (_livePhoneRequests.has(key)) return _livePhoneRequests.get(key);
        const pending = (async () => {
            const ids = new Set();
            try {
                const defs = await livePhoneFields();
                // Une seule recherche par numéro : jamais la boucle des variantes name_search.
                const variants = new Set([String(phone).trim(), key]);
                const group = (n, sep) => n.replace(/(\d{2})(?=\d)/g, '$1' + sep);
                [' ', '.', '-'].forEach(sep => variants.add(group(key, sep)));
                if (/^0[1-9]\d{8}$/.test(key)) {
                    variants.add('+33' + key.slice(1));
                    variants.add('33' + key.slice(1));
                    variants.add('0033' + key.slice(1));
                }
                const clauses = defs.search
                    ? [['phone_mobile_search', 'ilike', /^0[1-9]\d{8}$/.test(key) ? key.slice(1) : key]]
                    : defs.fields.flatMap(f => [...variants].map(v => [f, 'ilike', v]));
                const domain = Array(Math.max(0, clauses.length - 1)).fill('|').concat(clauses);
                const fields = ['id', 'commercial_partner_id'].concat(defs.fields);
                const rows = await liveReadRpc('search_read', [domain, fields, 0, 30]);
                if (!Array.isArray(rows)) throw new Error('Réponse Odoo inattendue');
                rows.forEach(r => {
                    // Un même suffixe peut exister dans deux pays : validation canonique complète.
                    const exact = defs.fields.some(f => livePhoneKey(r[f]) === key);
                    if (!exact) return;
                    const cid = m2oId(r.commercial_partner_id) || r.id;
                    _liveCommercialOf.set(r.id, cid);
                    ids.add(cid);
                });
            } catch (_) { return ids; } // Une erreur n'est pas mémorisée comme « client absent ».
            _livePhoneCache.delete(key);
            _livePhoneCache.set(key, { ids, at: Date.now() });
            while (_livePhoneCache.size > 200) _livePhoneCache.delete(_livePhoneCache.keys().next().value);
            return ids;
        })();
        _livePhoneRequests.set(key, pending);
        try { return await pending; }
        finally { _livePhoneRequests.delete(key); }
    }

    function liveExpireCalls() {
        if (!_liveCalls.length) return;
        const serverNow = Date.now() / 1000 + _liveClockOffset;
        const fresh = Date.now() - _liveLastSuccess <= LIVE_STALE_MS;
        const remaining = fresh ? _liveCalls.filter(c => {
            const expires = Number(c.expires_at);
            return !Number.isFinite(expires) || expires <= 0 || expires > serverNow;
        }) : [];
        if (remaining.length !== _liveCalls.length) {
            _liveCalls = remaining;
            document.querySelectorAll('.tm-live-row').forEach(liveClearRow);
            if (remaining.length && isTicketList()) renderLiveCalls().catch(() => {});
        }
    }

    async function liveEnsureCommercialOf(partnerIds) {
        const todo = [...new Set(partnerIds.filter(id => id && !_liveCommercialOf.has(id)))];
        if (!todo.length) return;
        // Le verrou de renderLiveCalls mutualise les rendus Owl/rafraîchissements.
        for (let i = 0; i < todo.length; i += 100) {
            const batch = todo.slice(i, i + 100);
            const rows = await liveReadRpc('read', [batch, ['commercial_partner_id']]);
            if (!Array.isArray(rows)) throw new Error('Réponse Odoo inattendue');
            rows.forEach(r => _liveCommercialOf.set(r.id, m2oId(r.commercial_partner_id) || r.id));
            batch.forEach(id => { if (!_liveCommercialOf.has(id)) _liveCommercialOf.set(id, id); });
        }
    }

    async function refreshLiveCalls(force) {
        liveExpireCalls();
        if (!isTicketList() || document.hidden || _liveBusy) return;
        if (!force && Date.now() - _liveLastPoll < LIVE_POLL_MS - 500) return;
        _liveBusy = true;
        _liveLastPoll = Date.now();
        try {
            const data = await liveFetch();
            if (!data || !data.ok) return;
            const receivedAt = Date.now();
            const serverNow = Number(data.now);
            if (Number.isFinite(serverNow) && serverNow > 0) _liveClockOffset = serverNow - Date.now() / 1000;
            const calls = (Array.isArray(data.calls) ? data.calls : []).filter(c =>
                c && typeof c.phone === 'string' && Number.isFinite(Number(c.started_at)) && Number(c.started_at) > 0
            ).slice(0, 100);
            // Concurrence bornée à deux lectures Odoo, y compris pour une grande équipe.
            for (let i = 0; i < calls.length; i += 2) {
                await Promise.all(calls.slice(i, i + 2).map(async c => { c.commercialIds = await liveCommercialIdsForPhone(c.phone); }));
            }
            _liveLastSuccess = receivedAt;
            _liveCalls = calls.filter(c => c.commercialIds && c.commercialIds.size);
            await renderLiveCalls();
        } catch (e) {
            console.warn('[Live] Erreur:', e);
        } finally {
            _liveBusy = false;
        }
    }

    function liveClearRow(row) {
        row.classList.remove('tm-live-row');
        row.querySelectorAll('.tm-live-chip').forEach(el => el.remove());
        row.querySelectorAll('.tm-live-cell').forEach(el => el.classList.remove('tm-live-cell'));
        row.querySelectorAll('.tm-live-ring').forEach(el => el.classList.remove('tm-live-ring'));
    }

    function liveInitials(n) {
        const w = String(n || '').trim().split(/\s+/).filter(Boolean);
        if (!w.length) return '?';
        // « NOM PRÉNOM » -> initiale du prénom puis du nom (« SAIR ALEXIS » -> « AS »)
        return ((w[1] || '').charAt(0) + w[0].charAt(0)).toUpperCase() || w[0].charAt(0).toUpperCase();
    }

    // Construit (ou reconstruit si le cas a changé) le contenu de l'indicateur :
    //  - assigné au téléphone : « ● En appel · 03:12 » sous son nom
    //  - autre opérateur      : [AS●] « En appel avec Marie · 00:41 » sous le client
    function liveBuildChip(chip, isAssignee, user) {
        const kind = isAssignee ? 'self' : 'other:' + user;
        if (chip.dataset.kind === kind) return;
        chip.dataset.kind = kind;
        chip.innerHTML = '';
        if (isAssignee) {
            const dot = document.createElement('span');
            dot.className = 'tm-live-dot';
            chip.appendChild(dot);
            chip.dataset.label = 'En appel';
        } else {
            const op = document.createElement('span');
            op.className = 'tm-live-op';
            op.textContent = liveInitials(user);
            const dot = document.createElement('span');
            dot.className = 'tm-live-dot';
            op.appendChild(dot);
            chip.appendChild(op);
            chip.dataset.label = `En appel avec ${user || 'un opérateur'}`;
        }
        const txt = document.createElement('span');
        txt.className = 'tm-live-txt';
        txt.appendChild(document.createTextNode(''));
        chip.appendChild(txt);
    }

    async function renderLiveCalls() {
        liveExpireCalls();
        if (!isTicketList()) return;
        if (_liveRendering) { _liveRenderAgain = true; return; }
        _liveRendering = true;
        try { await renderLiveCallsNow(); }
        finally {
            _liveRendering = false;
            if (_liveRenderAgain) { _liveRenderAgain = false; renderLiveCalls().catch(() => {}); }
        }
    }

    async function renderLiveCallsNow() {
        const table = document.querySelector('.o_list_view table, table.o_list_table, .o_list_renderer table');
        if (!table) return;
        const rows = Array.from(table.querySelectorAll('tbody tr.o_data_row'));
        if (!_liveCalls.length) { rows.forEach(liveClearRow); return; }

        const ths = Array.from(table.querySelectorAll('thead th'));
        const idxClient = ths.findIndex(th => /client|pharmacie/i.test(th.textContent || ''));
        const idxUser = ths.findIndex(th => /assign|responsable|utilisateur|technicien/i.test(th.textContent || ''));
        const recMap = getListRowRecordMap();
        await liveEnsureCommercialOf([...recMap.values()].map(r => r.partnerId).filter(Boolean));

        rows.forEach(row => {
            const rec = recMap.get(String(row.getAttribute('data-id') || ''));
            const commercial = rec && rec.partnerId ? _liveCommercialOf.get(rec.partnerId) : null;
            const call = commercial ? _liveCalls.find(c => c.commercialIds.has(commercial)) : null;
            if (!call) { liveClearRow(row); return; }

            const cells = row.querySelectorAll('td');
            const userCell = idxUser >= 0 ? cells[idxUser] : null;
            const assignee = userCell ? (userCell.textContent || '').replace(/En appel.*$/, '').trim() : '';
            const isAssignee = !!assignee && liveNormName(assignee) === liveNormName(call.user);
            const host = isAssignee ? userCell : ((idxClient >= 0 && cells[idxClient]) || row.querySelector('td.o_data_cell'));
            if (!host) return;

            row.querySelectorAll('.tm-live-cell').forEach(el => { if (el !== host) el.classList.remove('tm-live-cell'); });
            if (!host.classList.contains('tm-live-cell')) host.classList.add('tm-live-cell');
            row.classList.add('tm-live-row'); // liseré vert à gauche de la ligne
            // Anneau vert fixe autour de la photo de l'assigné (simple classe : rien n'est
            // inséré dans le widget Odoo, que Owl redessine à sa guise)
            const avatar = isAssignee
                ? userCell.querySelector('img.o_avatar, .o_m2o_avatar img, .o_avatar img, img.rounded-circle, img.rounded, img')
                : null;
            row.querySelectorAll('.tm-live-ring').forEach(el => { if (el !== avatar) el.classList.remove('tm-live-ring'); });
            if (avatar && !avatar.classList.contains('tm-live-ring')) avatar.classList.add('tm-live-ring');

            let chip = row.querySelector('.tm-live-chip');
            if (chip && chip.parentElement !== host) { chip.remove(); chip = null; }
            if (!chip) {
                chip = document.createElement('div');
                chip.className = 'tm-live-chip';
                host.appendChild(chip);
            }
            liveBuildChip(chip, isAssignee, call.user || '');
            chip.dataset.start = String(call.started_at);
            chip.title = `${call.user || 'Un opérateur'} est au téléphone avec ce client`
                + (call.direction === 'outgoing' ? ' (appel sortant)' : call.direction === 'incoming' ? ' (appel entrant)' : '');
            liveTickChip(chip);
        });
    }

    function liveTickChip(chip) {
        const txt = chip.querySelector('.tm-live-txt');
        if (!txt) return;
        const elapsed = Date.now() / 1000 + _liveClockOffset - (Number(chip.dataset.start) || 0);
        const value = `${chip.dataset.label} · ${liveFmtElapsed(elapsed)}`;
        // Mise à jour du nœud texte (mutation characterData) : n'éveille pas l'observer principal
        if (!txt.firstChild) txt.appendChild(document.createTextNode(value));
        else if (txt.firstChild.nodeValue !== value) txt.firstChild.nodeValue = value;
    }

    // Chrono : ne touche que les pastilles affichées (souvent 0 ou 1)
    setInterval(() => {
        liveExpireCalls();
        if (!document.hidden) document.querySelectorAll('.tm-live-chip').forEach(liveTickChip);
    }, 1000);
    window.addEventListener('pagehide', wlReleaseAudio);

    // =========================================================
    // NETTOYAGE DES DONNÉES LOCALES DES FONCTIONS SUPPRIMÉES
    // =========================================================
    // Le bouton « Traiter l'appel » et le panneau des raisons de clôture ont été retirés
    // en v4.4.0. Leurs clés locales ne servent plus : on les efface (navigateur seulement,
    // aucune écriture dans Odoo).
    function cleanupLegacyStorage() {
        try {
            Object.keys(localStorage)
                .filter(k => k.startsWith('etatTraitement_') || k === 'reasonPanelTheme')
                .forEach(k => localStorage.removeItem(k));
        } catch (_) {}
        try {
            Object.keys(sessionStorage)
                .filter(k => /^(pendingReason|reasonPanel|pendingTimerStopAfterClosure)/.test(k))
                .forEach(k => sessionStorage.removeItem(k));
        } catch (_) {}
    }

    // =========================================================
    // OBSERVER PRINCIPAL + INITIALISATION
    // =========================================================
    let lastUrl = window.location.href;

    function runAll() {
        addInitialesButton();
        addClearAssignButton();
        ensurePhoneSearchUI(); // Recherche client par téléphone (champ Client)
        ensureMissedCallsButton(); // Bouton flottant "Appels manqués" (liste tickets uniquement)
        ensureHotlinerGauge(); // Jauge de performance du jour (liste tickets uniquement)
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
    }

    // =========================================================
    // AUTO-REFRESH INVISIBLE DE LA LISTE DES TICKETS
    // =========================================================
    // Odoo ne rafraîchit plus automatiquement la liste : on recharge périodiquement les
    // données du contrôleur liste via son modèle Owl. C'est totalement invisible (pas de
    // F5, pas de flash, le scroll est conservé) car Owl ne re-render que les lignes changées.
    const TM_AR_DEBUG = false; // logs dans la console pour diagnostiquer (repasser à true si besoin)
    function _arLog(...a) { if (TM_AR_DEBUG) { try { console.log('[AutoRefresh]', ...a); } catch (_) {} } }

    // Le vrai window de la page (Odoo/Owl y posent leurs globals). Dans Tampermonkey, le
    // script tourne dans un bac à sable où window ne reflète pas toujours ces globals.
    function _pageWin() {
        try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow; } catch (_) {}
        return window;
    }

    // Convertit un composant Owl (instance) en "node" (ComponentNode) exploitable pour le walk.
    function _toOwlNode(obj) {
        if (!obj) return null;
        if (obj.children && obj.component) return obj;   // déjà un node
        if (obj.__owl__) return obj.__owl__;             // instance de composant -> node
        return obj;
    }

    // Récupère les racines de l'arbre Owl depuis toutes les sources connues.
    function getOwlRootNodes() {
        const w = _pageWin();
        const roots = [];
        const pushApp = (app) => {
            const r = app && (app.root || app.__root);
            const node = _toOwlNode(r);
            if (node && !roots.includes(node)) roots.push(node);
        };
        try {
            const sets = [
                w.__owl__ && w.__owl__.apps,
                w.__OWL_DEVTOOLS__ && w.__OWL_DEVTOOLS__.apps,
                w.__OWL__ && w.__OWL__.apps
            ];
            for (const set of sets) {
                if (!set) continue;
                if (typeof set.forEach === 'function') set.forEach(pushApp);
                else if (set.values) { for (const a of set.values()) pushApp(a); }
            }
        } catch (_) {}
        // Mode debug Odoo : composant racine exposé
        try {
            const dbg = w.odoo && w.odoo.__WOWL_DEBUG__;
            if (dbg && dbg.root) {
                const node = _toOwlNode(dbg.root);
                if (node && !roots.includes(node)) roots.push(node);
            }
        } catch (_) {}
        return roots;
    }

    // Sonde de diagnostic : quels globals Owl sont disponibles ? (à lancer depuis la console)
    function owlProbe() {
        const w = _pageWin();
        const size = (s) => { try { return s ? (s.size != null ? s.size : (s.length != null ? s.length : 'set?')) : null; } catch (_) { return 'err'; } };
        return {
            usingUnsafeWindow: (typeof unsafeWindow !== 'undefined' && _pageWin() === unsafeWindow),
            has_owl: !!w.__owl__,
            owl_apps: w.__owl__ ? size(w.__owl__.apps) : null,
            has_OWL_DEVTOOLS: !!w.__OWL_DEVTOOLS__,
            devtools_apps: w.__OWL_DEVTOOLS__ ? size(w.__OWL_DEVTOOLS__.apps) : null,
            has_OWL: !!w.__OWL__,
            has_odoo: !!w.odoo,
            has_wowl_debug: !!(w.odoo && w.odoo.__WOWL_DEBUG__),
            rootNodes: getOwlRootNodes().length
        };
    }

    // Parcourt l'arbre des composants Owl et applique visit(component) à chacun.
    function walkOwlNodes(node, visit, depth) {
        depth = depth || 0;
        if (!node || depth > 600) return;
        try { if (node.component) visit(node.component); } catch (_) {}
        const children = node && node.children;
        if (children) {
            for (const k in children) {
                walkOwlNodes(children[k], visit, depth + 1);
            }
        }
    }

    function _modelResModel(m) {
        try {
            return (m.config && m.config.resModel)
                || (m.root && m.root.resModel)
                || (m.rootParams && m.rootParams.resModel)
                || (m.env && m.env.config && m.env.config.resModel)
                || null;
        } catch (_) { return null; }
    }

    // Un modèle "liste" a une racine avec records OU groups (liste groupée), pas un simple resId (form).
    function _isListModel(m) {
        try {
            const r = m && m.root;
            if (!r) return false;
            if (Array.isArray(r.records)) return true;
            if (Array.isArray(r.groups)) return true;
            if (typeof r.count === 'number' && r.resId === undefined) return true;
            return false;
        } catch (_) { return false; }
    }

    // Collecte tous les modèles Owl accessibles (avec une méthode de rechargement).
    function collectOwlModels() {
        const models = [];
        for (const root of getOwlRootNodes()) {
            walkOwlNodes(root, (comp) => {
                try {
                    const m = comp.model || (comp.props && comp.props.model) || (comp.env && comp.env.model) || null;
                    if (m && m.root && !models.includes(m)) models.push(m);
                } catch (_) {}
            });
        }
        return models;
    }

    // Retrouve le modèle Owl du contrôleur liste helpdesk.ticket actuellement affiché.
    function findTicketListModel() {
        const models = collectOwlModels();
        if (!models.length) { _arLog('aucun modèle Owl trouvé'); return null; }
        if (TM_AR_DEBUG) {
            _arLog('modèles trouvés:', models.map(m => ({ resModel: _modelResModel(m), list: _isListModel(m), hasLoad: typeof m.load === 'function' })));
        }
        // IMPORTANT : ne JAMAIS retomber sur un modèle qui n'est pas une vraie liste
        // (sinon sur un formulaire/création de ticket, on recharge le modèle du FORMULAIRE
        // et ça efface tout ce que l'utilisateur vient de saisir).
        return models.find(m => _isListModel(m) && _modelResModel(m) === 'helpdesk.ticket')
            || null;
    }

    // Recharge un modèle en essayant les différentes API selon la version d'Odoo.
    async function _reloadModel(model) {
        const tries = [
            () => model.load && model.load({}),
            () => model.load && model.load(),
            () => model.root && model.root.load && model.root.load(),
            () => model.root && model.root.model && model.root.model.load && model.root.model.load({})
        ];
        for (const fn of tries) {
            try {
                const p = fn();
                if (p !== undefined) {
                    if (p && typeof p.then === 'function') await p;
                    try { model.notify && model.notify(); } catch (_) {}
                    return true;
                }
            } catch (e) { _arLog('méthode de reload échouée:', e && e.message); }
        }
        return false;
    }

    let _autoRefreshRunning = false;
    async function autoRefreshTicketList(force) {
        if (_autoRefreshRunning) return false;
        if (!force && document.hidden) return false;   // onglet en arrière-plan : inutile
        // Garde-fou absolu : jamais d'auto-refresh sur un formulaire (création ou édition d'un ticket).
        // C'est ce cas précis qui effaçait la saisie en cours lors de la création d'un ticket.
        if (isTicketForm() || isCreatingTicket()) { _arLog('formulaire ticket ouvert, skip'); return false; }
        if (!force && !isTicketList()) { _arLog('pas sur la liste des tickets, skip'); return false; }

        // Ne rien faire si l'utilisateur est en pleine interaction (sinon on le perturberait).
        // On bloque UNIQUEMENT quand il tape réellement (saisie dans la recherche ou édition
        // inline d'une ligne) — pas quand une simple ligne/cellule a le focus.
        if (!force) {
            if (document.querySelector('.modal.show, .o_dialog, .o_technical_modal')) { _arLog('modal ouverte, skip'); return false; }
            if (document.querySelector('.o_data_row.o_selected_row, .o_list_record_selector input:checked')) { _arLog('lignes sélectionnées, skip'); return false; }
            if (document.querySelector('.o-autocomplete--dropdown-menu, .o_datetime_picker')) { _arLog('menu déroulant ouvert, skip'); return false; }
            const ae = document.activeElement;
            const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
            if (typing && ae.closest('.o_searchview, .o_cp_searchview, .o_control_panel, .o_data_row')) { _arLog('saisie en cours, skip'); return false; }
        }

        const model = findTicketListModel();
        if (!model) return false;

        _autoRefreshRunning = true;
        try {
            const ok = await _reloadModel(model);
            _arLog(ok ? '✅ liste rechargée' : '❌ aucune méthode de reload n\'a fonctionné');
            return ok;
        } finally {
            _autoRefreshRunning = false;
        }
    }

    // Test manuel depuis la console : __tmForceRefresh()
    // Exposé sur unsafeWindow (le vrai window de la page) car la console s'exécute hors du
    // bac à sable Tampermonkey. Fallback sur window si unsafeWindow indisponible.
    (function exposeForceRefresh() {
        const fn = () => autoRefreshTicketList(true);
        try { if (typeof unsafeWindow !== 'undefined') unsafeWindow.__tmForceRefresh = fn; } catch (_) {}
        try { window.__tmForceRefresh = fn; } catch (_) {}
        try { window.__tmListModels = () => collectOwlModels().map(m => ({ resModel: _modelResModel(m), list: _isListModel(m), hasLoad: typeof m.load === 'function' })); } catch (_) {}
        try { if (typeof unsafeWindow !== 'undefined') unsafeWindow.__tmListModels = window.__tmListModels; } catch (_) {}
        try { window.__tmOwlProbe = owlProbe; } catch (_) {}
        try { if (typeof unsafeWindow !== 'undefined') unsafeWindow.__tmOwlProbe = owlProbe; } catch (_) {}
    })();

    // Tick automatique avec log (permet de voir qu'il tente bien toutes les 15s).
    function autoRefreshTick() {
        if (!isTicketList()) return;
        _arLog('tick auto (15s)…');
        autoRefreshTicketList(false);
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
    // Mutations venant uniquement des chronos « en ligne » : à ignorer (sinon recalcul chaque seconde)
    const isLiveChipMutation = (m) => {
        const t = m.target && (m.target.nodeType === 1 ? m.target : m.target.parentElement);
        return !!(t && t.closest && t.closest('.tm-live-chip'));
    };
    const listObserver = new MutationObserver((muts) => {
        if (!isTicketList()) return;
        if (muts.every(isLiveChipMutation)) return;
        setTimeout(() => { updateTicketListAnimations(); }, 500);
        // Relancer les badges immédiatement si des lignes ont été recréées
        clearTimeout(_listBadgeDebounce);
        _listBadgeDebounce = setTimeout(() => {
            // Le cache (par ID de ticket, 5 min) évite de réinterroger Odoo à chaque re-render
            applyPrioritaireBadges();
            if (_liveCalls.length) renderLiveCalls().catch(() => {});
        }, 150);
    });
    listObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Détection changement d'URL (SPA Odoo)
    setInterval(() => {
        const cur = window.location.href;
        if (cur !== lastUrl) {
            lastUrl = cur;
            clearPrioritaireCaches();

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
    setInterval(scanRdvRappels, 2000);
    setInterval(scheduleDevisUpdate, 5000);
    setInterval(scheduleOpenTicketsUpdate, 3000);
    setInterval(() => refreshLiveCalls(false), LIVE_POLL_MS); // Opérateurs en ligne avec le client
    setInterval(autoRefreshTick, 15000); // Auto-refresh invisible de la liste des tickets (nouveaux tickets)

    // Rafraîchir aussi dès que l'utilisateur revient sur l'onglet (retour rapide sans attendre 15s)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        setTimeout(autoRefreshTick, 300);
        setTimeout(() => refreshLiveCalls(true), 400);
        // La jauge a pu vieillir pendant l'absence : on la remet à jour au retour.
        if (isTicketList()) setTimeout(() => hsRefresh(true), 600);
    });

    // Démarrage
    injectStyles();
    tmSyncTheme();
    cleanupLegacyStorage();
    // Rafraîchir le compteur d'appels manqués toutes les 60s (uniquement sur la liste tickets)
    setInterval(() => { if (isTicketList() && document.getElementById('tm-missed-fab')) tmMissedRefresh(); }, 60000);
    // Rafraîchir la jauge toutes les 5 min (uniquement sur la liste tickets).
    // Volontairement sans exiger que la pastille existe : c'est aussi ce qui permet
    // à une jauge réactivée depuis le portail de réapparaître sans recharger la page.
    setInterval(() => { if (isTicketList()) ensureHotlinerGauge(); }, HS_REFRESH_MS);
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
