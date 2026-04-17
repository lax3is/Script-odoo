// ==UserScript==
// @name         Bouton Traiter l'Appel Odoo
// @namespace    http://tampermonkey.net/
// @version      3.6.5
// @description  Traitement d'appel Odoo – full API, timer, étiquettes, badges, RDV, historique et produits clients
// @author       Alexis.sair
// @match        https://winprovence.odoo.com/*
// @match        http://winprovence.odoo.com/*
// @match        https://*.odoo.com/*
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
// @connect      winprovence.fr
// @connect      *.winprovence.fr
// @connect      winprovence.odoo.fr
// ==/UserScript==

(function () {
    'use strict';

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
    function getOdooContext() {
        try { return (window.odoo && odoo.session_info && odoo.session_info.user_context) || {}; } catch (e) { return {}; }
    }

    async function odooRpc(model, method, args = [], kwargs = {}) {
        try {
            const res = await fetch(_ru() + '/web/dataset/call_kw', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Authorization': _authHeader()
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
            if (data && data.error) console.warn('[OdooAPI] Erreur RPC:', data.error.data?.message || data.error.message);
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
    function isTicketPage() {
        return window.location.href.includes('model=helpdesk.ticket');
    }
    function isTicketForm() {
        const h = window.location.href;
        return h.includes('model=helpdesk.ticket') && (h.includes('view_type=form') || h.includes('id='));
    }
    function isTicketList() {
        return window.location.href.includes('model=helpdesk.ticket') && window.location.href.includes('view_type=list');
    }
    function isCreatingTicket() {
        return window.location.href.includes('model=helpdesk.ticket') && window.location.href.includes('view_type=form');
    }

    function getTicketIdFromUrl() {
        const m = window.location.href.match(/[#&?]id=(\d+)/);
        return m ? m[1] : null;
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

    function readFirstText(selectors) {
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (!el) continue;
            const v = (el.value || el.textContent || '').trim();
            if (v) return v;
        }
        return '';
    }

    function getOdooCurrentUserName() {
        // Prefer session_info if available
        try {
            const n = (window.odoo && odoo.session_info && (odoo.session_info.name || odoo.session_info.username)) || '';
            if (n) return String(n).trim();
        } catch (_) {}

        // Fallback UI: navbar user name
        try {
            const navUser = document.querySelector(
                '.o_user_menu .o_menu_brand, ' +
                '.o_user_menu span[class*="name"], ' +
                '.o_main_navbar .o_user_menu > a > span, ' +
                '.o_main_navbar .o_user_menu .o_dropdown_title'
            );
            if (navUser) {
                const t = (navUser.textContent || '').trim();
                if (t) return t;
            }
        } catch (_) {}

        return '';
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
            const currentUser = getOdooCurrentUserName();

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
                deleted_by: String(p.deleted_by || ''),
                deleted_at_local: String(p.deleted_at_local || ''),
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

            const currentUser = getOdooCurrentUserName();
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
            console.log('[HISTORY] URL complète:', window.location.href);
            console.log('[HISTORY] Hash:', window.location.hash);
            
            // Essayer différentes méthodes pour parser l'URL Odoo
            let params, model, id;
            
            // Méthode 1: URLSearchParams sur le hash
            if (window.location.hash) {
                params = new URLSearchParams(window.location.hash.slice(1));
                model = params.get("model");
                id = params.get("id");
                console.log('[HISTORY] Méthode 1 - Model:', model, 'ID:', id);
            }
            
            // Méthode 2: Parser manuellement l'URL Odoo
            if (!model || !id) {
                const urlMatch = window.location.href.match(/[#&]model=([^&]+).*[#&]id=(\d+)/);
                if (urlMatch) {
                    model = urlMatch[1];
                    id = urlMatch[2];
                    console.log('[HISTORY] Méthode 2 - Model:', model, 'ID:', id);
                }
            }
            
            // Méthode 3: Utiliser l'API Odoo pour obtenir l'ID actuel
            if (!model || !id) {
                try {
                    if (window.odoo && window.odoo.env && window.odoo.env.services && window.odoo.env.services.action) {
                        const actionService = window.odoo.env.services.action;
                        if (actionService.currentController && actionService.currentController.props) {
                            const props = actionService.currentController.props;
                            model = props.resModel;
                            id = props.resId;
                            console.log('[HISTORY] Méthode 3 - Model:', model, 'ID:', id);
                        }
                    }
                } catch (e) {
                    console.log('[HISTORY] Méthode 3 échouée:', e);
                }
            }
            
            if (!model || !id) {
                console.log('[HISTORY] Impossible de déterminer le modèle et l\'ID');
                return null;
            }

            console.log('[HISTORY] Modèle détecté:', model, 'ID:', id);

            if (model === "res.partner") {
                console.log('[HISTORY] Retour direct de l\'ID partenaire:', id);
                return id;
            } else if (model === "helpdesk.ticket") {
                console.log('[HISTORY] Récupération du partenaire depuis le ticket:', id);
                const ticketDetails = await odooRead('helpdesk.ticket', Number(id), ['partner_id']);
                console.log('[HISTORY] Détails du ticket:', ticketDetails);
                if (ticketDetails && ticketDetails.partner_id) {
                    console.log('[HISTORY] Partner ID trouvé:', ticketDetails.partner_id[0]);
                    return ticketDetails.partner_id[0];
                }
                return null;
            } else if (model === "sale.order") {
                console.log('[HISTORY] Récupération du partenaire depuis la commande:', id);
                const orderDetails = await odooRead('sale.order', Number(id), ['partner_id']);
                console.log('[HISTORY] Détails de la commande:', orderDetails);
                if (orderDetails && orderDetails.partner_id) {
                    console.log('[HISTORY] Partner ID trouvé:', orderDetails.partner_id[0]);
                    return orderDetails.partner_id[0];
                }
                return null;
            }
            
            console.log('[HISTORY] Modèle non supporté:', model);
            return null;
        } catch (error) {
            console.error('[HISTORY] Erreur dans getIdToProcess:', error);
            return null;
        }
    }

    // Fonction pour vérifier si l'URL correspond aux patterns autorisés
    function isValidUrlForHistory() {
        const hash = window.location.hash;
        const isTicketPage = hash.includes("model=helpdesk.ticket") && hash.includes("view_type=form");
        const isPartnerPage = hash.includes("model=res.partner") && hash.includes("view_type=form");
        const isSaleOrderPage = hash.includes("model=sale.order") && hash.includes("view_type=form");
        return isTicketPage || isPartnerPage || isSaleOrderPage;
    }

    // Fonction pour récupérer les tickets d'un client
    async function fetchClientTickets() {
        try {
            console.log('[HISTORY] Début de fetchClientTickets');
            const partnerId = await getIdToProcess();
            console.log('[HISTORY] Partner ID récupéré:', partnerId);
            
            if (!partnerId) {
                console.log('[HISTORY] Aucun partner ID trouvé');
                return null;
            }

            console.log('[HISTORY] Recherche des tickets pour le partner:', partnerId);
            
            const tickets = await odooRpc('helpdesk.ticket', 'web_search_read', [], {
                offset: 0,
                limit: 0,
                order: "create_date DESC, priority DESC, id ASC",
                domain: [["partner_id", "=", parseInt(partnerId)]],
                fields: [
                    "name", "priority", "create_date", "close_date", "team_id",
                    "user_id", "stage_id", "request_answer", "description"
                ]
            });

            console.log('[HISTORY] Résultat de la recherche de tickets:', tickets);
            
            if (tickets && tickets.records) {
                console.log('[HISTORY] Nombre de tickets trouvés:', tickets.records.length);
            } else {
                console.log('[HISTORY] Aucun ticket dans la réponse ou format inattendu');
            }

            return tickets;
        } catch (error) {
            console.error('[HISTORY] Erreur lors de la récupération des tickets:', error);
            return null;
        }
    }

    // Fonction pour récupérer les produits d'un client via traçabilité
    async function fetchClientProducts() {
        try {
            console.log('[PRODUCTS] Début de fetchClientProducts');
            const partnerId = await getIdToProcess();
            console.log('[PRODUCTS] Partner ID récupéré:', partnerId);
            
            if (!partnerId) {
                console.log('[PRODUCTS] Aucun partner ID trouvé');
                return null;
            }

            console.log('[PRODUCTS] Récupération des produits pour le partner:', partnerId);

            // Utilisation de l'API de traçabilité
            const payload = {
                "id": 38,
                "jsonrpc": "2.0",
                "method": "call",
                "params": {
                    "args": [{
                        "lang": "fr_FR",
                        "tz": "Europe/Paris",
                        "uid": 493,
                        "allowed_company_ids": [1],
                        "active_id": parseInt(partnerId),
                        "model": "res.partner",
                        "ttype": false,
                        "auto_unfold": false,
                        "lot_name": false
                    }],
                    "model": "stock.traceability.report",
                    "method": "get_html",
                    "kwargs": {
                        "context": {
                            "lang": "fr_FR",
                            "tz": "Europe/Paris",
                            "uid": 493,
                            "allowed_company_ids": [1]
                        }
                    }
                }
            };

            console.log('[PRODUCTS] Payload de la requête:', payload);

            const response = await fetch(_ru() + '/web/dataset/call_kw/stock.traceability.report/get_html', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Authorization': _authHeader()
                },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            console.log('[PRODUCTS] Réponse HTTP status:', response.status);

            const data = await response.json();
            console.log('[PRODUCTS] Données reçues:', data);

            if (!data || !data.result || !data.result.html) {
                console.log('[PRODUCTS] Pas de HTML dans la réponse');
                return null;
            }

            // Parser le HTML pour extraire les informations
            const parser = new DOMParser();
            const doc = parser.parseFromString(data.result.html, 'text/html');
            const rows = doc.querySelectorAll('tr[data-id]');
            console.log('[PRODUCTS] Nombre de lignes trouvées dans le HTML:', rows.length);

            // Regrouper les produits par référence
            const groupedProducts = {};
            Array.from(rows).forEach((row, index) => {
                const cells = row.querySelectorAll('td');
                console.log('[PRODUCTS] Ligne', index, '- Nombre de cellules:', cells.length);
                
                if (cells.length >= 7) {
                    const reference = cells[0].textContent.trim();
                    const productCell = cells[1].textContent.trim();
                    const productMatch = productCell.match(/\[(.*?)\]\s*(.*)/);
                    const productCode = productMatch ? productMatch[1] : '';
                    const productName = productMatch ? productMatch[2] : productCell;
                    const date = cells[2].textContent.trim();
                    const lot = cells[3].textContent.trim();
                    const quantity = cells[6].textContent.trim();

                    console.log('[PRODUCTS] Produit trouvé:', { reference, productCode, productName, date, lot, quantity });

                    if (reference.startsWith('SORTIE') || reference.startsWith('EXPEDITIONS')) {
                        const isExpress = reference.includes('EXPRESS');
                        if (!groupedProducts[reference]) {
                            groupedProducts[reference] = {
                                date: date,
                                isExpress: isExpress,
                                products: {}
                            };
                        }

                        const productKey = `${productCode}-${productName}`;
                        if (!groupedProducts[reference].products[productKey]) {
                            groupedProducts[reference].products[productKey] = {
                                code: productCode,
                                name: productName,
                                lots: [],
                                totalQuantity: 0
                            };
                        }

                        if (lot) {
                            groupedProducts[reference].products[productKey].lots.push(lot);
                        }
                        groupedProducts[reference].products[productKey].totalQuantity += parseFloat(quantity) || 0;
                    }
                }
            });

            console.log('[PRODUCTS] Produits groupés:', groupedProducts);

            // Transformer les données
            const products = {
                result: {
                    records: Object.entries(groupedProducts).flatMap(([reference, group]) =>
                        Object.values(group.products).map(product => ({
                            name: product.name,
                            default_code: product.code,
                            type: group.isExpress ? 'express' : 'normal',
                            create_date: group.date,
                            description: `Référence: ${reference}\nLots: ${product.lots.join(', ')}\nQuantité: ${product.totalQuantity}`,
                            categ_id: [null, 'Produit client']
                        }))
                    )
                }
            };

            console.log('[PRODUCTS] Produits transformés:', products);
            console.log('[PRODUCTS] Nombre de produits finaux:', products.result.records.length);

            return products;
        } catch (error) {
            console.error('[PRODUCTS] Erreur lors de la récupération des produits:', error);
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
        if (document.querySelector('button[name="action_timer_pause"][type="object"]')) return 'running';
        if (document.querySelector('button[name="action_timer_resume"][type="object"]')) return 'paused';
        if (document.querySelector('button[name="action_timer_start"][type="object"]')) return 'stopped';
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
        if (document.querySelector('button.btn.o_arrow_button_current[data-value="4"]')) return true;

        const currentStageEls = document.querySelectorAll(
            '.o_arrow_button_current, .o_statusbar_status .btn-primary, .o_statusbar_status button[aria-pressed="true"]'
        );

        return Array.from(currentStageEls).some(el => isResolvedStageText(el.textContent || ''));
    }

    function findAssignButton() {
        return document.querySelector('button[name="assign_ticket_to_self"]') ||
            Array.from(document.getElementsByTagName('button')).find(b => {
                const s = b.querySelector('span');
                return s && s.textContent.trim().toLowerCase() === "me l'assigner";
            });
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
        /* === BOUTONS STATUSBAR — alignés sur la hauteur Odoo native (28px) === */
        #btn-traiter-appel, #btn-inserer-initiales {
            height: 28px !important;
            line-height: 1 !important;
            border-radius: 4px !important;
            font-weight: 600 !important;
            font-size: 12px !important;
            padding: 0 10px !important;
            border: none !important;
            cursor: pointer !important;
            transition: filter .12s ease !important;
            margin-right: 4px !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
        }
        #btn-traiter-appel:hover, #btn-inserer-initiales:hover { filter: brightness(1.12); }
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
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 15px;
            padding: 8px 16px;
            background: linear-gradient(135deg, #00A09D 0%, #008F8C 100%);
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(0,160,157,0.3);
            transition: all 0.3s ease;
            margin-right: 12px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        #showHistoryButton:hover, #showProductsButton:hover {
            background: linear-gradient(135deg, #008F8C 0%, #007F7D 100%);
            box-shadow: 0 4px 12px rgba(0,160,157,0.4);
            transform: translateY(-2px);
        }
        #showHistoryButton:active, #showProductsButton:active {
            transform: translateY(0px);
            box-shadow: 0 2px 6px rgba(0,160,157,0.3);
        }
        #showHistoryButton i, #showProductsButton i {
            font-size: 14px;
        }
        #showHistoryButton::before, #showProductsButton::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 100%);
            border-radius: 8px;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        #showHistoryButton:hover::before, #showProductsButton:hover::before {
            opacity: 1;
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

        /* Bouton "ME L'ASSIGNER" natif Odoo — harmonisé, texte blanc */
        button[name="assign_ticket_to_self"] {
            height: 28px !important;
            line-height: 1 !important;
            border-radius: 4px !important;
            font-size: 12px !important;
            padding: 0 10px !important;
            font-weight: 600 !important;
            vertical-align: middle !important;
            box-sizing: border-box !important;
            color: #fff !important;
            background: #017e84 !important;
            border: none !important;
        }
        button[name="assign_ticket_to_self"]:hover {
            background: #015f64 !important;
        }
        /* Bouton désassignation */
        .clear-assign-button {
            background: none; border: none; color: #dc3545;
            cursor: pointer; font-size: 14px; padding: 0;
            position: absolute; right: 34px; top: 50%;
            transform: translateY(-50%); z-index: 2; line-height: 1;
        }
        /* === INDICATEUR EN COURS — dans le formulaire === */
        #texte-clignotant-container {
            display: inline-flex; align-items: center; gap: 10px;
            padding: 5px 12px 5px 8px;
            border-radius: 20px;
            background: linear-gradient(90deg, rgba(59,130,246,.18) 0%, rgba(37,99,235,.12) 100%);
            border: 1px solid rgba(59,130,246,.5);
            box-shadow: 0 0 12px rgba(59,130,246,.18);
        }
        #texte-clignotant-container span {
            color: #93c5fd; font-weight: 700; font-size: 12px;
        }
        #texte-clignotant-container .wave-text {
            display: inline-flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0;
            line-height: 1.1;
        }
        #texte-clignotant-container .wave-letter {
            display: inline-block;
            animation: letterWave 2s ease-in-out infinite;
            margin-right: -0.03em;
            letter-spacing: 0;
        }
        #texte-clignotant-container .wave-space {
            margin-right: 0.28em;
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
            0%,100% { box-shadow: 0 0 0 0 rgba(59,130,246,.3); background-color: rgba(59,130,246,.06); }
            50%      { box-shadow: 0 0 10px 0 rgba(59,130,246,.5); background-color: rgba(59,130,246,.13); }
        }
        .o_list_view .o_data_row.ticket-en-traitement {
            position: relative !important; z-index: 1 !important;
            border: 2px solid rgba(59,130,246,.7) !important; border-radius: 4px !important;
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
        if (document.getElementById('texte-clignotant-container')) return;
        const assignBtn = findAssignButton();
        if (assignBtn) return;

        const reponseField = document.querySelector('div#request_answer.note-editable');
        if (!reponseField) return;

        const container = document.createElement('div');
        container.id = 'texte-clignotant-container';

        const img = document.createElement('img');
        img.src = 'https://media.tenor.com/ZZu2QC-efdUAAAAi/cute-cat-white.gif';
        img.style.cssText = 'width:28px;height:28px;flex-shrink:0;border-radius:50%;';

        const txt = document.createElement('span');
        txt.className = 'wave-text';
        const text = "Traitement de l'appel en cours ...";
        // Créer un span par lettre pour l'effet vague
        text.split('').forEach((char, i) => {
            const letterSpan = document.createElement('span');
            letterSpan.className = char === ' ' ? 'wave-letter wave-space' : 'wave-letter';
            letterSpan.textContent = char === ' ' ? '\u00A0' : char; // espace insécable
            letterSpan.style.animationDelay = `${i * 0.08}s`; // délai échelonné
            txt.appendChild(letterSpan);
        });

        container.appendChild(img);
        container.appendChild(txt);

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'margin-bottom:6px;';
        wrapper.appendChild(container);

        if (reponseField.firstChild) reponseField.insertBefore(wrapper, reponseField.firstChild);
        else reponseField.appendChild(wrapper);
    }

    function removeBlinkText() {
        const el = document.getElementById('texte-clignotant-container');
        if (!el) return;
        // Supprimer uniquement le wrapper direct du container, pas le contenu utilisateur
        const wrapper = el.parentElement;
        if (wrapper && wrapper.tagName === 'SPAN' && wrapper.children.length === 1) {
            wrapper.remove();
        } else {
            el.remove();
        }
    }

    // =========================================================
    // BOUTON TRAITER L'APPEL — LOGIQUE PRINCIPALE
    // =========================================================
    function updateTraiterBtn(btn, enCours, paused = false) {
        if (enCours) {
            btn.textContent = 'Mettre en pause';
            btn.className = 'btn en-cours';
            btn.id = 'btn-traiter-appel';
        } else if (paused) {
            btn.textContent = "Reprendre l'appel";
            btn.className = 'btn en-pause';
            btn.id = 'btn-traiter-appel';
        } else {
            btn.textContent = "Traiter l'appel";
            btn.className = 'btn en-attente';
            btn.id = 'btn-traiter-appel';
        }
    }

    async function handleTraiterClick(btn) {
        if (state.isProcessing) return;
        state.isProcessing = true;
        btn.disabled = true;

        const ticketId = getTicketIdFromPage();
        if (!ticketId) { state.isProcessing = false; btn.disabled = false; return; }

        // Utiliser l'état DOM en priorité : le localStorage peut être décalé.
        // Fallback sur l'état "effectif" si jamais DOM ne renvoie rien.
        let currentState = domTimerState();
        if (currentState === 'unknown') currentState = await getEffectiveTimerState(ticketId);

        try {
            if (currentState === 'running') {
                // Pause
                simulerRaccourciPause();
                await wait(300);
                await waitForDomTimerState('paused', 7000);
                saveState(ticketId, 'paused');
                updateTraiterBtn(btn, false, true);
                removeBlinkText();
                await saveForm();

            } else {
                // Reprendre depuis pause ou démarrer depuis stop
                const needStart = currentState === 'stopped';

                // Assigner à soi-même seulement si on démarre (sinon on risque de perturber la reprise)
                if (needStart) {
                    const assignDomBtn = findAssignButton();
                    if (assignDomBtn) {
                        assignDomBtn.click();
                        for (let i = 0; i < 15; i++) {
                            await wait(300);
                            if (!findAssignButton()) break;
                        }
                    } else {
                        await odooCall('helpdesk.ticket', 'assign_ticket_to_self', [Number(ticketId)]);
                        await wait(500);
                    }
                }

                if (currentState === 'paused') {
                    // Resume via Alt+W
                    simulerRaccourciPause();
                    await wait(300);
                    await waitForDomTimerState('running', 7000);
                } else {
                    // Start via Alt+Z
                    simulerRaccourciTimer();
                    await wait(300);
                    await waitForDomTimerState('running', 7000);
                }

                saveState(ticketId, 'running');
                state.timerStoppedForTicket = null;
                state.timerStoppedAt = 0;
                updateTraiterBtn(btn, true);
                await wait(100);
                addBlinkText();
                await saveForm();
            }
        } catch (e) {
            console.warn('[TraiterAppel] Erreur:', e);
        } finally {
            await wait(200);
            btn.disabled = false;
            state.isProcessing = false;
        }
    }

    function addTraiterButton() {
        if (!isTicketPage()) { removeTraiterButton(); return; }
        const statusbar = document.querySelector('.o_statusbar_buttons');
        if (!statusbar || document.getElementById('btn-traiter-appel')) return;

        const ticketId = getTicketIdFromPage();
        const st = ticketId ? loadState(ticketId) : 'stopped';

        const btn = document.createElement('button');
        btn.id = 'btn-traiter-appel';
        btn.type = 'button';
        updateTraiterBtn(btn, st === 'running', st === 'paused');

        // Restaurer le gif si le timer était en cours
        if (st === 'running') setTimeout(addBlinkText, 600);

        btn.addEventListener('click', () => handleTraiterClick(btn));
        statusbar.insertBefore(btn, statusbar.firstChild);

        if (ticketId) {
            setTimeout(async () => {
                if (!document.body.contains(btn)) return;
                const realState = await getEffectiveTimerState(ticketId);
                updateTraiterBtn(btn, realState === 'running', realState === 'paused');
                if (realState === 'running') addBlinkText();
                if (realState !== 'running') removeBlinkText();
            }, 150);
        }
    }

    function removeTraiterButton() {
        document.getElementById('btn-traiter-appel')?.remove();
        removeBlinkText();
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

    function startClosureWatcher() {
        setInterval(async () => {
            if (!isTicketResolved() || state.closureRunning) return;
            const ticketId = getTicketIdFromPage();
            if (!ticketId) return;

            // Éviter de relancer si on vient juste de finir
            if (state.timerStoppedForTicket === ticketId && Date.now() - state.timerStoppedAt < 15000) return;

            // On ne stoppe que si le timer n'est pas déjà arrêté
            const stDom = domTimerState();
            if (stDom !== 'running' && stDom !== 'paused') return;

            state.closureRunning = true;

            try {
                removeBlinkText();
                const btn = document.getElementById('btn-traiter-appel');
                if (btn) updateTraiterBtn(btn, false, false);

                const stopped = await stopTimerAndTimesheetViaShortcuts(ticketId);
                if (stopped) {
                    state.timerStoppedForTicket = String(ticketId);
                    state.timerStoppedAt = Date.now();
                }

                // Ouvrir le panneau raisons APRES la séquence stop/timesheet
                sessionStorage.removeItem('pendingReasonPanelAfterClosure');
                scheduleReasonPanel(250, 40);
            } catch (e) {
                console.warn('[Clôture] Erreur:', e);
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
            // Ne pas ouvrir le panneau via la méthode normale
            sessionStorage.removeItem('pendingReasonPanel');
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

            // Priorité 1 : session Odoo
            try { userName = odoo?.session_info?.name || ''; } catch(_) {}

            // Priorité 2 : navbar haut droite
            if (!userName) {
                const navUser = document.querySelector(
                    '.o_user_menu .o_menu_brand, .o_user_menu span[class*="name"], ' +
                    '.o_main_navbar .o_user_menu > a > span, ' +
                    '.o_main_navbar .o_user_menu .o_dropdown_title'
                );
                if (navUser) userName = navUser.textContent.trim();
            }

            // Priorité 3 : champ assigné DOM (lecture seule)
            if (!userName) {
                const assignField = document.querySelector(
                    '.o_field_widget[name="user_id"] .o_form_uri, ' +
                    '.o_field_widget[name="user_id"] span'
                );
                if (assignField) userName = assignField.textContent.trim();
            }

            if (!userName) { alert('Impossible de récupérer votre nom. Vérifiez que vous êtes connecté.'); return; }

            const initiales = userName.trim().split(/\s+|-/g).map(p => p[0]?.toUpperCase() || '').filter(Boolean).join('.');
            const now = new Date();
            const pad = n => n.toString().padStart(2, '0');
            const texte = `${initiales} ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}H${pad(now.getMinutes())} : `;
            const zone = document.querySelector('div#request_answer.note-editable');
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

        const btnMsg = document.querySelector('button.o_chatter_button_new_message, button[accesskey="m"]');
        if (btnMsg?.parentNode) btnMsg.parentNode.insertBefore(btn, btnMsg);
        else {
            const zone = document.querySelector('div#request_answer.note-editable');
            if (zone?.parentNode) zone.parentNode.insertBefore(btn, zone);
        }
    }

    // =========================================================
    // BOUTON DÉSASSIGNATION (croix)
    // =========================================================
    function addClearAssignButton() {
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
            console.log('[ReasonPanel] Panneau déjà complété pour ce ticket, skip schedule');
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
            console.log('[ReasonPanel] Panneau déjà complété pour ce ticket, skip');
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
            --bg:#0f1115; --elev:#151823; --text:#e6e8ee; --muted:#a8b0c2;
            --accent:#00d0b6; --accent-2:#3b82f6; --danger:#ef4444; --success:#22c55e;
            --chip:#1f2330; --chip-border:#2a3042;
        }
        #odoo-reason-panel.theme-light {
            --bg:#fff; --elev:#f6f7fb; --text:#0e1320; --muted:#56607a;
            --accent:#09b39e; --accent-2:#2563eb; --danger:#dc2626; --success:#16a34a;
            --chip:#eef1f7; --chip-border:#dde3f0;
        }
        #odoo-reason-panel { width:min(960px,92vw); max-height:86vh; border-radius:14px; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,.35); display:flex; flex-direction:column; font-family:Inter,system-ui,sans-serif; }
        #odoo-reason-panel .hdr { background:var(--elev); padding:16px 18px; display:flex; align-items:center; gap:12px; color:var(--text); border-bottom:1px solid var(--chip-border); }
        #odoo-reason-panel .title { font-size:16px; font-weight:600; margin-right:auto; }
        #odoo-reason-panel .theme-toggle { border:1px solid var(--chip-border); background:var(--chip); color:var(--text); border-radius:20px; padding:6px 10px; cursor:pointer; font-size:12px; }
        #odoo-reason-panel .close-btn { border:1px solid var(--chip-border); background:transparent; color:var(--danger); border-radius:999px; width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-size:18px; }
        #odoo-reason-panel .body { background:var(--bg); color:var(--text); display:grid; grid-template-columns:1fr 1fr; min-height:0; overflow:auto; }
        #odoo-reason-panel .col { padding:14px 16px; border-right:1px solid var(--chip-border); }
        #odoo-reason-panel .col:last-child { border-right:0; }
        #odoo-reason-panel .col-title { font-weight:600; margin-bottom:10px; color:var(--muted); text-transform:uppercase; font-size:12px; letter-spacing:.6px; }
        #odoo-reason-panel .list { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        #odoo-reason-panel .chip { border:1px solid var(--chip-border); background:var(--chip); color:var(--text); padding:9px 10px; border-radius:10px; display:flex; align-items:center; gap:8px; cursor:pointer; user-select:none; transition:transform .06s ease; }
        #odoo-reason-panel .chip:hover { transform:translateY(-1px); }
        #odoo-reason-panel .chip input { accent-color:var(--accent-2); }
        #odoo-reason-panel .chip--software input { accent-color:var(--success); }
        #odoo-reason-panel .chip.selected { border-color:var(--accent-2); box-shadow:0 0 0 2px rgba(59,130,246,.25) inset; }
        #odoo-reason-panel .chip--software.selected { border-color:var(--success); box-shadow:0 0 0 2px rgba(34,197,94,.25) inset; }
        #odoo-reason-panel .ftr { background:var(--elev); padding:12px 16px; display:flex; align-items:center; gap:10px; border-top:1px solid var(--chip-border); }
        #odoo-reason-panel .btn { padding:10px 16px; border-radius:10px; font-weight:600; border:1px solid transparent; cursor:pointer; }
        #odoo-reason-panel .btn.primary { background:linear-gradient(180deg,var(--accent),#08a892); color:#fff; }
        #odoo-reason-panel .btn.primary:disabled { opacity:.55; cursor:not-allowed; }
        #odoo-reason-panel .btn.ghost { background:transparent; border-color:var(--chip-border); color:var(--text); }
        @media(max-width:768px) {
            #odoo-reason-panel .body { grid-template-columns:1fr; }
            #odoo-reason-panel .list { grid-template-columns:1fr; }
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
            const title = document.createElement('div'); title.className = 'title'; title.textContent = 'Sélection des raisons (Matériel / Logiciel)';
            const themeBtn = document.createElement('button'); themeBtn.className = 'theme-toggle'; themeBtn.textContent = savedTheme === 'dark' ? 'Thème clair' : 'Thème sombre';
            const closeBtn = document.createElement('button'); closeBtn.className = 'close-btn'; closeBtn.textContent = '×';
            hdr.appendChild(title); hdr.appendChild(themeBtn); hdr.appendChild(closeBtn);

            // Body
            const body = document.createElement('div'); body.className = 'body';

            function buildCol(titleText, items, prefix, type) {
                const col = document.createElement('div'); col.className = 'col';
                const ttl = document.createElement('div'); ttl.className = 'col-title'; ttl.textContent = titleText;
                const list = document.createElement('div'); list.className = 'list';
                items.slice().sort((a,b) => a.name.localeCompare(b.name,'fr',{sensitivity:'base',ignorePunctuation:true})).forEach((item, idx) => {
                    const chip = document.createElement('label');
                    chip.className = 'chip' + (type === 'software' ? ' chip--software' : '');
                    const cb = document.createElement('input'); cb.type = 'checkbox';
                    // Stocker l'ID si disponible, sinon le nom (fallback)
                    cb.value = item.id ? String(item.id) : item.name;
                    cb.dataset.tagName = item.name;
                    cb.dataset.tagId = item.id ? String(item.id) : '';
                    cb.id = `${prefix}-${idx}`;
                    const span = document.createElement('span'); span.textContent = item.name;
                    chip.appendChild(cb); chip.appendChild(span);
                    list.appendChild(chip);
                });
                col.appendChild(ttl); col.appendChild(list);
                return col;
            }

            body.appendChild(buildCol('🔧 Raisons matériel', HARDWARE, 'hw', 'hardware'));
            body.appendChild(buildCol('📖 Raisons logiciel', SOFTWARE, 'sw', 'software'));

            // Footer
            const ftr = document.createElement('div'); ftr.className = 'ftr';
            const skipBtn = document.createElement('button'); skipBtn.type = 'button'; skipBtn.className = 'btn ghost'; skipBtn.textContent = "Pas d'étiquette";
            const submitBtn = document.createElement('button'); submitBtn.type = 'button'; submitBtn.className = 'btn primary'; submitBtn.textContent = 'Valider'; submitBtn.disabled = true; submitBtn.style.display = 'none';
            ftr.appendChild(skipBtn); ftr.appendChild(submitBtn);

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
            };
            allChips.forEach(chip => {
                chip.addEventListener('click', e => {
                    if (!(e.target instanceof HTMLInputElement)) { e.preventDefault(); const cb = chip.querySelector('input'); cb.checked = !cb.checked; }
                    updateSubmit();
                });
                chip.querySelector('input').addEventListener('change', updateSubmit);
            });
            updateSubmit();

            themeBtn.addEventListener('click', () => {
                const isLight = panel.classList.toggle('theme-light');
                localStorage.setItem(themeKey, isLight ? 'light' : 'dark');
                themeBtn.textContent = isLight ? 'Thème sombre' : 'Thème clair';
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
        for (const sel of ['.o_form_button_box','.o_form_buttonbox','.oe_button_box','.o_button_box']) {
            const el = document.querySelector(sel);
            if (el?.querySelector('.o_stat_button,.oe_stat_button')) return el;
        }
        return null;
    }

    function placeAfterStats(container, badge) {
        if (!container || !badge) return;
        // Ne déplacer que si le badge n'est pas encore dans le container
        if (badge.parentNode === container) return;
        // Trouver le dernier bouton stat natif Odoo (exclure nos propres badges)
        const btns = Array.from(container.querySelectorAll('.o_stat_button,.oe_stat_button'))
            .filter(el => el.id !== 'badge-devis-client' && el.id !== 'badge-tickets-ouverts');
        const last = btns.length ? btns[btns.length-1] : null;
        if (last) last.insertAdjacentElement('afterend', badge);
        else container.appendChild(badge);
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
        if (!isTicketPage()) { document.getElementById('badge-devis-client')?.remove(); return; }
        const ticketId = getTicketIdFromPage();
        if (!ticketId) return;

        const stats = findStatsContainer();
        let badge = document.getElementById('badge-devis-client');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'badge-devis-client';
            if (stats) placeAfterStats(stats, badge);
            else return;
        } else if (stats) placeAfterStats(stats, badge);

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
        if (!isCreatingTicket()) { document.getElementById('badge-tickets-ouverts')?.remove(); return; }
        const stats = findStatsContainer();
        if (!stats) return;

        let badge = document.getElementById('badge-tickets-ouverts');
        if (!badge) {
            badge = document.createElement('span'); badge.id = 'badge-tickets-ouverts';
            placeAfterStats(stats, badge);
        } else placeAfterStats(stats, badge);
        badge.style.marginRight = '8px';

        const code = findPartnerCode();
        if (!code) { badge.innerHTML = ''; return; }

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
            a.href = `/web?debug=#id=${r.id}&model=helpdesk.ticket&view_type=form`;
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
        document.querySelectorAll('.o_list_view .o_data_row').forEach(row => {
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
                    row.style.border = '2px solid rgba(59,130,246,.7)';
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
    let _assistanceTagIds = null;

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

    async function applyPrioritaireBadges() {
            if (!isTicketList()) return;
            const rows = Array.from(document.querySelectorAll('.o_list_view .o_data_row'));
            if (!rows.length) return;

            const tagIds = await getAssistanceTagIds();
            if (!tagIds.length) return;

            // Extraire partner_id depuis le lien res.partner + nom du ticket depuis la cellule name
            const rowInfos = rows.map(row => {
                const partnerCell = row.querySelector('td[name="partner_id"]');
                const partnerLink = partnerCell ? partnerCell.querySelector('a') : null;
                const href = partnerLink ? (partnerLink.getAttribute('href') || '') : '';
                const m = href.match(/[#&?]id=(\d+)/);
                const partnerId = m ? Number(m[1]) : null;

                const nameCell = row.querySelector('td[name="name"]');
                const ticketName = nameCell ? nameCell.textContent.trim() : '';

                return { row, partnerId, partnerCell, nameCell, ticketName };
            }).filter(r => r.partnerId && r.partnerCell && r.ticketName);

            if (!rowInfos.length) return;

            // Clé de cache = partnerId + ticketName (identifie le ticket exact)
            const toFetch = rowInfos.filter(r => !_assistanceCache.has(r.partnerId + '|' + r.ticketName));
            const partnerIds = [...new Set(toFetch.map(r => r.partnerId))];

            if (partnerIds.length) {
                try {
                    // Récupérer tous les tickets de ces partenaires avec id, name, etiquette_winpharma
                    const recs = await odooRpc('helpdesk.ticket', 'search_read', [
                        [['partner_id', 'in', partnerIds]],
                        ['id', 'name', 'partner_id', 'etiquette_winpharma'], 0, 1000
                    ]) || [];

                    // Construire un map (partnerId, ticketName) -> hasTag
                    recs.forEach(rec => {
                        const pid = Array.isArray(rec.partner_id) ? rec.partner_id[0] : rec.partner_id;
                        const tags = rec.etiquette_winpharma || [];
                        const tagIdList = tags.map(t => Array.isArray(t) ? t[0] : t);
                        const hasTag = tagIds.some(id => tagIdList.includes(id));
                        _assistanceCache.set(pid + '|' + (rec.name || '').trim(), hasTag);
                    });

                    // Marquer false pour les lignes non trouvées dans l'API
                    toFetch.forEach(r => {
                        const key = r.partnerId + '|' + r.ticketName;
                        if (!_assistanceCache.has(key)) _assistanceCache.set(key, false);
                    });
                } catch (e) {
                    console.warn('[PrioritaireBadge] Erreur API:', e);
                    toFetch.forEach(r => _assistanceCache.set(r.partnerId + '|' + r.ticketName, false));
                }
            }

            rowInfos.forEach(({ row, partnerId, partnerCell, nameCell, ticketName }) => {
                const key = partnerId + '|' + ticketName;
                const isPrioritaire = _assistanceCache.get(key) === true;
                // Badge injecté sous le nom du client (toujours visible, pas tronqué)
                const existing = partnerCell.querySelector('.badge-client-prioritaire');
                if (isPrioritaire && !existing) {
                    const badge = document.createElement('div');
                    badge.className = 'badge-client-prioritaire';
                    badge.textContent = '⚠ Client prioritaire — contrat matériel';
                    partnerCell.appendChild(badge);
                } else if (!isPrioritaire && existing) {
                    existing.remove();
                }
            });
        }

    // =========================================================
    // RAPPELS RDV
    // =========================================================
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

            const match = cellRdv.textContent.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
            if (!match) { cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-rouge','rdv-clignote-depasse'); return; }
            const [_, jj, mm, aaaa, hh, min] = match;
            const dateRdv = new Date(`${aaaa}-${mm}-${jj}T${hh}:${min}:00`);
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
    // STYLES CATÉGORIES (Logiciel, Matériel, etc.)
    // =========================================================
    const CATEGORY_STYLES = {
        'LOGICIEL':              { bg:'rgba(22,163,74,.18)',  border:'1px solid rgba(22,163,74,.35)',  emoji:'💻' },
        'MATERIEL':              { bg:'rgba(168,85,247,.18)', border:'1px solid rgba(168,85,247,.35)', emoji:'🛠️' },
        'MATERIEL N2':           { bg:'rgba(220,38,38,.18)',  border:'1px solid rgba(220,38,38,.35)',  emoji:'🧰' },
        'RMA/SAV TECH EN COURS': { bg:'rgba(249,115,22,.18)', border:'1px solid rgba(249,115,22,.35)', emoji:'📦' },
        'RMA':                   { bg:'rgba(249,115,22,.18)', border:'1px solid rgba(249,115,22,.35)', emoji:'📦' },
        'WINTEAM':               { bg:'rgba(14,165,233,.18)', border:'1px solid rgba(14,165,233,.35)', emoji:'⭐' }
    };

    function normLabel(text) {
        return (text||'').replace(/\s*\(\d+\)\s*$/,'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    }

    function tryCategoryStyle(el) {
        if (!el || el.nodeType !== 1 || el.dataset?.styledCategory === '1') return;
        if (el.closest?.('.dropdown-menu,.o-dropdown--menu,.o-autocomplete,.o-autocomplete--dropdown,.ui-autocomplete,.o_control_panel,.o_main_navbar,.o_searchview,.o_breadcrumb')) return;
        const raw = (el.innerText||el.textContent||'').trim();
        if (!raw || raw.length > 64) return;
        const base = normLabel(raw);
        let key = CATEGORY_STYLES[base] ? base : null;
        if (!key && base === 'MATERIEL' && /\bN2\b/i.test(raw)) key = 'MATERIEL N2';
        if (!key) return;
        const cfg = CATEGORY_STYLES[key];
        try {
            el.style.backgroundColor = cfg.bg;
            el.style.border = cfg.border;
            el.style.borderRadius = '6px';
            el.style.padding = '2px 8px';
            el.style.display = 'inline-block';
            el.style.fontWeight = '600';
            if (!el.querySelector('.cat-emoji')) {
                const tag = document.createElement('span'); tag.className = 'cat-emoji'; tag.textContent = cfg.emoji + ' ';
                if (el.firstChild) el.insertBefore(tag, el.firstChild); else el.appendChild(tag);
            }
            el.dataset.styledCategory = '1';
        } catch (_) {}
    }

    function scanCategoryStyles() {
        const href = window.location.href;
        const scopes = [];
        if (isTicketList()) { const s = document.querySelector('.o_list_view,.o_list_renderer'); if (s) scopes.push(s); }
        if (isTicketForm()) { const s = document.querySelector('.o_form_view'); if (s) scopes.push(s); }
        scopes.forEach(scope => scope.querySelectorAll('label,a,li,div,span').forEach(tryCategoryStyle));
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

        historyContainer.innerHTML = `
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

        buttonContainer.insertAdjacentElement('afterend', historyContainer);

        // Ajouter la logique du bouton de thème sombre
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            // Vérifier l'état actuel du thème
            const isDark = localStorage.getItem('odoo-history-theme') === 'dark';
            if (isDark) {
                document.body.classList.add('dark-theme');
                themeToggle.classList.add('active');
                themeToggle.innerHTML = '<i class="fa fa-sun-o"></i>';
            }

            themeToggle.addEventListener('click', () => {
                const isCurrentlyDark = document.body.classList.contains('dark-theme');
                
                if (isCurrentlyDark) {
                    // Passer en mode clair
                    document.body.classList.remove('dark-theme');
                    themeToggle.classList.remove('active');
                    themeToggle.innerHTML = '<i class="fa fa-moon-o"></i>';
                    localStorage.setItem('odoo-history-theme', 'light');
                } else {
                    // Passer en mode sombre
                    document.body.classList.add('dark-theme');
                    themeToggle.classList.add('active');
                    themeToggle.innerHTML = '<i class="fa fa-sun-o"></i>';
                    localStorage.setItem('odoo-history-theme', 'dark');
                }
            });
        }

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
        if (!isValidUrlForHistory()) return;
        if (historyButtonAdded && productsButtonAdded) return;

        const formSheet = document.querySelector('.o_form_sheet');
        if (!formSheet) return;

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

            // Ajouter les boutons immédiatement
            setTimeout(() => {
                addHistoryAndProductsButtons();

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
    // OBSERVER PRINCIPAL + INITIALISATION
    // =========================================================
    let lastUrl = window.location.href;

    function runAll() {
        addTraiterButton();
        styleCloseButton();
        addInitialesButton();
        addClearAssignButton();
        addHistoryAndProductsButtons(); // Nouvelle fonction pour l'historique et les produits
        hookDeleteAuditClicks();
        hookOdooDeleteRpcAudit();
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
        if (!hasDevis || !hasDoublons) {
            clearTimeout(_badgeDebounce);
            _badgeDebounce = setTimeout(async () => {
                _badgeUpdating = true;
                await updateDevisBadge();
                await updateOpenTicketsBadge();
                _badgeUpdating = false;
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

    // Démarrage
    sessionStorage.removeItem('pendingReasonPanel'); // éviter ouverture fantôme au reload
    injectStyles();
    startClosureWatcher();
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

    // =========================================================
    // WIDGET POINTEUSE EMPLOYÉS
    // =========================================================
   // =========================================================
// WIDGET POINTEUSE EMPLOYÉS - VERSION AMÉLIORÉE
// =========================================================
// Widget de gestion de présence

const PRESENCE_API_URL = 'https://hotline.sippharma.fr/odoospeek/portal/api/timeclock_ingest.php';
const PRESENCE_API_KEY = 'spk_1_2E6RrG4l2gQ6j1o0vQxV3p9mN8yAqK5lVZ3c4rB1uS7dT9wX0yZ2a';

// État de la présence
let presenceState = {
    lastAction: localStorage.getItem('tm_last_clock_action') || null,
    lastActionTime: parseInt(localStorage.getItem('tm_last_clock_time')) || 0,
    endTime: localStorage.getItem('tm_planned_end_time') || null,
    reminderShown: false,
    blinkInterval: null,
    disableReminder: localStorage.getItem('tm_disable_reminder') === 'true',
    lastResetDate: localStorage.getItem('tm_last_reset_date') || '',
    lastPresenceSnapshot: {} // Pour détecter les changements
};

// Vérifier si on doit réinitialiser (nouveau jour)
function checkDailyReset() {
    const today = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    
    if (presenceState.lastResetDate !== today) {
        // Nouveau jour détecté, réinitialiser
        console.log('[Présence] Nouveau jour détecté, réinitialisation des notifications');
        presenceState.reminderShown = false;
        presenceState.lastResetDate = today;
        localStorage.setItem('tm_last_reset_date', today);
        
        // Ne pas réinitialiser disableReminder car c'est un choix permanent de l'utilisateur
    }
}

// Démarrer la surveillance des changements de présence
function startPresenceMonitoring() {
    // Faire un premier appel immédiat pour initialiser le snapshot (sans notifications)
    loadInitialPresenceSnapshot();
    
    // Puis vérifier toutes les 30 secondes
    setInterval(async () => {
        try {
            const result = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: PRESENCE_API_URL.replace('timeclock_ingest.php', 'timeclock_presence.php') + '?api_key=' + PRESENCE_API_KEY,
                    headers: {
                        'X-Api-Key': PRESENCE_API_KEY
                    },
                    onload: function(response) {
                        try {
                            const data = JSON.parse(response.responseText);
                            resolve(data);
                        } catch (e) {
                            reject(new Error('Erreur de parsing JSON'));
                        }
                    },
                    onerror: function(error) {
                        reject(new Error('Erreur réseau'));
                    }
                });
            });
            
            if (result.ok && result.presence) {
                checkPresenceChanges(result.presence);
            }
        } catch (error) {
            console.error('[Présence] Erreur monitoring:', error);
        }
    }, 30000); // Toutes les 30 secondes
}

// Charger le snapshot initial sans afficher de notifications
async function loadInitialPresenceSnapshot() {
    try {
        const result = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: PRESENCE_API_URL.replace('timeclock_ingest.php', 'timeclock_presence.php') + '?api_key=' + PRESENCE_API_KEY,
                headers: {
                    'X-Api-Key': PRESENCE_API_KEY
                },
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
                    } catch (e) {
                        reject(new Error('Erreur de parsing JSON'));
                    }
                },
                onerror: function(error) {
                    reject(new Error('Erreur réseau'));
                }
            });
        });
        
        if (result.ok && result.presence) {
            const allUsers = {};
            
            // Construire le snapshot initial
            (result.presence.present || []).forEach(p => {
                allUsers[p.name] = { status: 'online', time: p.last_action_time };
            });
            (result.presence.on_break || []).forEach(p => {
                allUsers[p.name] = { status: 'pause', time: p.last_action_time };
            });
            (result.presence.absent || []).forEach(p => {
                allUsers[p.name] = { status: 'offline', time: p.last_action_time };
            });
            
            presenceState.lastPresenceSnapshot = allUsers;
            console.log('[Présence] Snapshot initial chargé:', Object.keys(allUsers).length, 'utilisateurs');
        }
    } catch (error) {
        console.error('[Présence] Erreur chargement snapshot initial:', error);
    }
}

// Détecter les changements de statut
function checkPresenceChanges(presence) {
    const currentUserName = getOdooCurrentUserName() || 'Utilisateur';
    const allUsers = {};
    
    // Construire un snapshot de tous les utilisateurs avec leur statut
    (presence.present || []).forEach(p => {
        allUsers[p.name] = { status: 'online', time: p.last_action_time };
    });
    (presence.on_break || []).forEach(p => {
        allUsers[p.name] = { status: 'pause', time: p.last_action_time };
    });
    (presence.absent || []).forEach(p => {
        allUsers[p.name] = { status: 'offline', time: p.last_action_time };
    });
    
    // Comparer avec le snapshot précédent
    Object.keys(allUsers).forEach(userName => {
        // Ne pas notifier pour soi-même
        if (userName === currentUserName) return;
        
        const currentStatus = allUsers[userName].status;
        const previousStatus = presenceState.lastPresenceSnapshot[userName]?.status;
        
        // Si le statut a changé
        if (previousStatus && previousStatus !== currentStatus) {
            // Mapper le statut vers une action pour la notification
            let actionType = '';
            switch (currentStatus) {
                case 'online':
                    actionType = previousStatus === 'pause' ? 'break_end' : 'clock_in';
                    break;
                case 'offline':
                    actionType = 'clock_out';
                    break;
                case 'pause':
                    actionType = 'break_start';
                    break;
            }
            
            if (actionType) {
                console.log(`[Présence] ${userName} : ${previousStatus} → ${currentStatus}`);
                showPresenceToast(actionType, userName);
            }
        }
    });
    
    // Sauvegarder le snapshot actuel
    presenceState.lastPresenceSnapshot = allUsers;
}

function createPresenceWidget() {
    // Vérifier si le widget existe déjà
    if (document.getElementById('tm-presence-widget')) return;

    const widget = document.createElement('div');
    widget.id = 'tm-presence-widget';
    widget.innerHTML = `
        <div id="tm-presence-btn" title="Gestion de présence">
            <div class="tm-status-indicator" id="tm-status-indicator"></div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
        </div>
        <div id="tm-presence-panel" style="display:none">
            <div class="tm-panel-header">
                <span class="tm-panel-title">Gestion de présence</span>
            </div>
            
            <!-- Boutons d'action avec labels -->
            <div class="tm-actions-row">
                <button class="tm-action-btn-small tm-action-in" data-action="clock_in">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M9 11l3 3L22 4"></path>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                    <span class="tm-action-label">Dispo</span>
                </button>
                <button class="tm-action-btn-small tm-action-out" data-action="clock_out">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                    <span class="tm-action-label">Absent</span>
                </button>
                <button class="tm-action-btn-small tm-action-pause" data-action="break_start">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="10" y1="15" x2="10" y2="9"></line>
                        <line x1="14" y1="15" x2="14" y2="9"></line>
                    </svg>
                    <span class="tm-action-label">Pause</span>
                </button>
                <button class="tm-action-btn-small tm-action-resume" data-action="break_end">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polygon points="10 8 16 12 10 16 10 8"></polygon>
                    </svg>
                    <span class="tm-action-label">Reprise</span>
                </button>
            </div>
            
            <div id="tm-presence-status" class="tm-status"></div>
            
            <!-- Liste des utilisateurs -->
            <div class="tm-presence-section-title">Équipe</div>
            <div id="tm-presence-inline" class="tm-presence-inline">
                <div class="tm-presence-loading-inline">Chargement...</div>
            </div>
        </div>
        
        <!-- Modal de rappel -->
        <div id="tm-reminder-modal" style="display:none">
            <div class="tm-reminder-content">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#00A09D" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <div class="tm-reminder-title">N'oubliez pas de mettre à jour votre statut!</div>
                <div class="tm-reminder-text">Vous êtes connecté depuis plus de 10 minutes</div>
                <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px">
                    <button id="tm-reminder-close" class="tm-reminder-btn">J'ai compris</button>
                    <label class="tm-reminder-checkbox">
                        <input type="checkbox" id="tm-reminder-disable" />
                        <span>Ne plus me rappeler (pour commerciaux/responsables)</span>
                    </label>
                </div>
            </div>
        </div>
        
        <!-- Modal heure de fin -->
        <div id="tm-endtime-modal" style="display:none">
            <div class="tm-endtime-content">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#00A09D" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <div class="tm-endtime-title">À quelle heure terminez-vous ?</div>
                <div class="tm-endtime-text">Optionnel - Pour vous rappeler de changer votre statut</div>
                <input type="time" id="tm-endtime-input" class="tm-endtime-input" />
                <div class="tm-endtime-buttons">
                    <button id="tm-endtime-skip" class="tm-endtime-btn-skip">Passer</button>
                    <button id="tm-endtime-save" class="tm-endtime-btn-save">Enregistrer</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(widget);

    // Toggle panel
    const btn = document.getElementById('tm-presence-btn');
    const panel = document.getElementById('tm-presence-panel');
    
    btn.addEventListener('click', () => {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            // Charger automatiquement les présences à l'ouverture
            loadPresenceInPanel();
        }
    });
    
    // Initialiser le témoin lumineux au chargement
    if (presenceState.lastAction) {
        updateStatusIndicator(presenceState.lastAction);
    }
    
    // Fermer le panel si on clique en dehors
    document.addEventListener('click', (e) => {
        const widget = document.getElementById('tm-presence-widget');
        if (widget && !widget.contains(e.target)) {
            panel.style.display = 'none';
        }
    });

    // Gérer les clics sur les boutons de pointage
    document.querySelectorAll('.tm-action-btn-small').forEach(button => {
        button.addEventListener('click', async () => {
            const action = button.getAttribute('data-action');
            
            // Si c'est une arrivée, demander l'heure de fin d'abord
            if (action === 'clock_in') {
                showEndTimeModal();
            } else {
                await sendPresenceAction(action);
            }
        });
    });

    // Fermer le modal de rappel
    document.getElementById('tm-reminder-close').addEventListener('click', () => {
        const disableCheckbox = document.getElementById('tm-reminder-disable');
        if (disableCheckbox && disableCheckbox.checked) {
            presenceState.disableReminder = true;
            localStorage.setItem('tm_disable_reminder', 'true');
            console.log('[Présence] Notifications désactivées par l\'utilisateur');
        }
        closeReminderModal();
    });
    
    // Modal heure de fin - Passer
    document.getElementById('tm-endtime-skip').addEventListener('click', async () => {
        closeEndTimeModal();
        await sendPresenceAction('clock_in');
    });
    
    // Modal heure de fin - Enregistrer
    document.getElementById('tm-endtime-save').addEventListener('click', async () => {
        const endTime = document.getElementById('tm-endtime-input').value;
        if (endTime) {
            presenceState.endTime = endTime;
            localStorage.setItem('tm_planned_end_time', endTime);
        }
        closeEndTimeModal();
        await sendPresenceAction('clock_in');
    });

    // Démarrer la vérification du rappel
    startReminderCheck();
    
    // Démarrer la surveillance des changements de présence
    startPresenceMonitoring();
}

async function sendPresenceAction(actionType) {
    try {
        // Récupérer les infos utilisateur Odoo
        const userName = getOdooCurrentUserName() || 'Utilisateur';
        const userEmail = (window.odoo && odoo.session_info && odoo.session_info.email) || '';
        const userId = (window.odoo && odoo.session_info && odoo.session_info.uid) || null;
        
        showStatus('Envoi en cours...', '#00A09D');

        // Créer un timestamp en heure locale (pas UTC)
        const now = new Date();
        const localTimestamp = now.getFullYear() + '-' +
            String(now.getMonth() + 1).padStart(2, '0') + '-' +
            String(now.getDate()).padStart(2, '0') + ' ' +
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');

        const formData = new URLSearchParams({
            api_key: PRESENCE_API_KEY,
            employee_name: userName,
            employee_email: userEmail,
            action_type: actionType,
            timestamp: localTimestamp,
            odoo_user_id: userId || '',
            machine_name: navigator.userAgent,
            notes: presenceState.endTime ? `Fin prévue: ${presenceState.endTime}` : ''
        });

        // Utiliser GM_xmlhttpRequest au lieu de fetch pour éviter les problèmes CORS
        const result = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: PRESENCE_API_URL,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Api-Key': PRESENCE_API_KEY
                },
                data: formData.toString(),
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
                    } catch (e) {
                        reject(new Error('Erreur de parsing JSON'));
                    }
                },
                onerror: function(error) {
                    reject(new Error('Erreur réseau'));
                }
            });
        });

        if (result.ok) {
            // Sauvegarder l'action
            presenceState.lastAction = actionType;
            presenceState.lastActionTime = Date.now();
            localStorage.setItem('tm_last_clock_action', actionType);
            localStorage.setItem('tm_last_clock_time', Date.now().toString());
            
            // Arrêter le clignotement et réinitialiser le rappel
            stopBlinking();
            presenceState.reminderShown = false;
            
            // Mettre à jour le témoin lumineux
            updateStatusIndicator(actionType);
            
            const labels = {
                'clock_in': '✅ Statut: Disponible',
                'clock_out': '✅ Statut: Non disponible',
                'break_start': '✅ Statut: En pause',
                'break_end': '✅ Statut: Disponible'
            };
            showStatus(labels[actionType] || '✅ Enregistré', '#28a745');
            
            // Recharger la liste des présences
            setTimeout(() => loadPresenceInPanel(), 500);
            
            // Afficher une notification toast
            showPresenceToast(actionType, userName);
        } else {
            throw new Error(result.error || 'Erreur inconnue');
        }
    } catch (error) {
        console.error('[Présence] Erreur:', error);
        showStatus('❌ Erreur: ' + error.message, '#dc2626');
    }
}

function showStatus(message, color) {
    const statusEl = document.getElementById('tm-presence-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = color;
        
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
    }
}

function startReminderCheck() {
    // Vérifier le reset quotidien au démarrage
    checkDailyReset();
    
    // Vérifier toutes les minutes
    setInterval(() => {
        // Vérifier le reset quotidien à chaque itération
        checkDailyReset();
        
        const now = Date.now();
        const tenMinutes = 10 * 60 * 1000;
        
        // Vérifier si l'heure de fin est dépassée
        if (presenceState.endTime && presenceState.lastAction === 'clock_in') {
            const currentTime = new Date();
            const [endHour, endMinute] = presenceState.endTime.split(':').map(Number);
            const endTimeToday = new Date();
            endTimeToday.setHours(endHour, endMinute, 0, 0);
            
            // Si l'heure de fin est dépassée, passer en non dispo automatiquement
            if (currentTime >= endTimeToday) {
                console.log('[Présence] Heure de fin dépassée, passage en non dispo automatique');
                sendPresenceAction('clock_out');
                presenceState.endTime = null;
                localStorage.removeItem('tm_planned_end_time');
                return;
            }
        }
        
        // Ne pas afficher le rappel si l'utilisateur l'a désactivé
        if (presenceState.disableReminder) {
            return;
        }
        
        // Si pas d'action ET pas encore montré le rappel
        // OU si dernière action il y a plus de 10 min ET pas encore montré le rappel
        if (!presenceState.lastAction && !presenceState.reminderShown) {
            if (now - presenceState.lastActionTime > tenMinutes || presenceState.lastActionTime === 0) {
                showReminderModal();
                startBlinking();
                presenceState.reminderShown = true;
            }
        }
    }, 60000); // Vérifier toutes les minutes
}

function showReminderModal() {
    const modal = document.getElementById('tm-reminder-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeReminderModal() {
    const modal = document.getElementById('tm-reminder-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function startBlinking() {
    const btn = document.getElementById('tm-presence-btn');
    if (!btn || presenceState.blinkInterval) return;
    
    btn.classList.add('tm-blink-warning');
}

function stopBlinking() {
    const btn = document.getElementById('tm-presence-btn');
    if (btn) {
        btn.classList.remove('tm-blink-warning');
    }
}

function updateStatusIndicator(actionType) {
    const indicator = document.getElementById('tm-status-indicator');
    if (!indicator) return;
    
    // Retirer toutes les classes de statut
    indicator.classList.remove('tm-indicator-online', 'tm-indicator-offline', 'tm-indicator-pause');
    
    // Ajouter la classe appropriée
    switch (actionType) {
        case 'clock_in':
        case 'break_end':
            indicator.classList.add('tm-indicator-online');
            break;
        case 'clock_out':
            indicator.classList.add('tm-indicator-offline');
            break;
        case 'break_start':
            indicator.classList.add('tm-indicator-pause');
            break;
    }
}

async function loadPresenceInPanel() {
    const listEl = document.getElementById('tm-presence-inline');
    
    listEl.innerHTML = '<div class="tm-presence-loading-inline">Chargement...</div>';
    
    try {
        // Utiliser GM_xmlhttpRequest au lieu de fetch
        const result = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: PRESENCE_API_URL.replace('timeclock_ingest.php', 'timeclock_presence.php') + '?api_key=' + PRESENCE_API_KEY,
                headers: {
                    'X-Api-Key': PRESENCE_API_KEY
                },
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
                    } catch (e) {
                        reject(new Error('Erreur de parsing JSON'));
                    }
                },
                onerror: function(error) {
                    reject(new Error('Erreur réseau'));
                }
            });
        });
        
        if (result.ok && result.presence) {
            displayPresenceInline(result.presence);
        } else {
            listEl.innerHTML = '<div class="tm-presence-error-inline">Erreur de chargement</div>';
        }
    } catch (error) {
        console.error('[Présence] Erreur chargement présences:', error);
        listEl.innerHTML = '<div class="tm-presence-error-inline">Erreur de chargement</div>';
    }
}

function displayPresenceInline(presence) {
    const listEl = document.getElementById('tm-presence-inline');
    
    const present = presence.present || [];
    const onBreak = presence.on_break || [];
    const absent = presence.absent || [];
    
    let html = '';
    
    // Afficher les présents (disponibles)
    if (present.length > 0) {
        present.forEach(person => {
            html += `
                <div class="tm-presence-item-inline">
                    <span class="tm-presence-dot-online"></span>
                    <span class="tm-presence-name-inline">${person.name}</span>
                    <span class="tm-presence-status-inline tm-status-online">Disponible</span>
                </div>
            `;
        });
    }
    
    // Afficher les en pause
    if (onBreak.length > 0) {
        onBreak.forEach(person => {
            html += `
                <div class="tm-presence-item-inline">
                    <span class="tm-presence-dot-pause"></span>
                    <span class="tm-presence-name-inline">${person.name}</span>
                    <span class="tm-presence-status-inline tm-status-pause">En pause</span>
                </div>
            `;
        });
    }
    
    // Afficher les non disponibles
    if (absent.length > 0) {
        absent.forEach(person => {
            html += `
                <div class="tm-presence-item-inline">
                    <span class="tm-presence-dot-offline"></span>
                    <span class="tm-presence-name-inline">${person.name}</span>
                    <span class="tm-presence-status-inline tm-status-offline">Non dispo</span>
                </div>
            `;
        });
    }
    
    if (!html) {
        html = '<div class="tm-presence-empty-inline">Aucune donnée disponible</div>';
    }
    
    listEl.innerHTML = html;
}

function showEndTimeModal() {
    const modal = document.getElementById('tm-endtime-modal');
    const input = document.getElementById('tm-endtime-input');
    
    // Pré-remplir avec l'heure sauvegardée ou suggérer 17:30
    if (presenceState.endTime) {
        input.value = presenceState.endTime;
    } else {
        input.value = '17:30';
    }
    
    if (modal) {
        modal.style.display = 'flex';
        // Focus sur l'input après un court délai pour l'animation
        setTimeout(() => input.focus(), 300);
    }
}

function closeEndTimeModal() {
    const modal = document.getElementById('tm-endtime-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showPresenceToast(actionType, userName) {
    // Créer le conteneur de toasts s'il n'existe pas
    let toastContainer = document.getElementById('tm-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'tm-toast-container';
        document.body.appendChild(toastContainer);
    }
    
    // Créer le toast
    const toast = document.createElement('div');
    toast.className = 'tm-toast';
    
    // Déterminer l'icône, le texte et la couleur selon l'action
    let indicator = '';
    let message = '';
    let indicatorClass = '';
    
    switch (actionType) {
        case 'clock_in':
            indicator = 'tm-toast-indicator-online';
            message = `${userName} est maintenant <strong>disponible</strong>`;
            indicatorClass = 'online';
            break;
        case 'clock_out':
            indicator = 'tm-toast-indicator-offline';
            message = `${userName} est maintenant <strong>absent</strong>`;
            indicatorClass = 'offline';
            break;
        case 'break_start':
            indicator = 'tm-toast-indicator-pause';
            message = `${userName} est en <strong>pause</strong>`;
            indicatorClass = 'pause';
            break;
        case 'break_end':
            indicator = 'tm-toast-indicator-online';
            message = `${userName} a repris — <strong>disponible</strong>`;
            indicatorClass = 'online';
            break;
    }
    
    toast.innerHTML = `
        <div class="tm-toast-indicator ${indicator}"></div>
        <div class="tm-toast-content">
            <div class="tm-toast-message">${message}</div>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Animation d'entrée
    setTimeout(() => {
        toast.classList.add('tm-toast-show');
    }, 10);
    
    // Animation de sortie et suppression après 4 secondes
    setTimeout(() => {
        toast.classList.remove('tm-toast-show');
        toast.classList.add('tm-toast-hide');
        
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 4000);
}

// Styles pour le widget moderne
GM_addStyle(`
    /* Widget container */
    #tm-presence-widget {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    /* Bouton principal */
    #tm-presence-btn {
        width: 56px;
        height: 56px;
        background: linear-gradient(135deg, #00A09D 0%, #008F8C 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0,160,157,0.3);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        color: white;
        position: relative;
    }
    
    #tm-presence-btn:hover {
        transform: scale(1.05);
        box-shadow: 0 12px 32px rgba(0,160,157,0.4);
    }
    
    #tm-presence-btn.tm-blink-warning {
        animation: blinkOrange 2s ease-in-out infinite;
    }
    
    @keyframes blinkOrange {
        0%, 100% {
            background: linear-gradient(135deg, #00A09D 0%, #008F8C 100%);
            box-shadow: 0 8px 24px rgba(0,160,157,0.3);
        }
        50% {
            background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
            box-shadow: 0 8px 24px rgba(255,152,0,0.4);
        }
    }
    
    /* Panel encore plus transparent */
    #tm-presence-panel {
        position: absolute;
        bottom: 72px;
        right: 0;
        background: rgba(255, 255, 255, 0.75);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.15);
        min-width: 300px;
        animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    /* Header du panel */
    .tm-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }
    
    .tm-panel-title {
        font-size: 16px;
        font-weight: 700;
        color: #1a1a1a;
    }
    
    /* Témoin lumineux en haut à gauche, dépassant du bouton */
    .tm-status-indicator {
        position: absolute;
        top: -2px;
        left: -2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        box-shadow: 0 0 4px rgba(0,0,0,0.3);
        z-index: 1;
    }
    
    .tm-indicator-online {
        background: #10b981;
        animation: pulseGreen 2s ease-in-out infinite;
    }
    
    .tm-indicator-offline {
        background: #ef4444;
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
    }
    
    .tm-indicator-pause {
        background: #f59e0b;
        animation: pulseOrange 2s ease-in-out infinite;
    }
    
    @keyframes pulseGreen {
        0%, 100% {
            opacity: 1;
            box-shadow: 0 0 4px rgba(0,0,0,0.3), 0 0 8px rgba(16, 185, 129, 0.6);
        }
        50% {
            opacity: 0.7;
            box-shadow: 0 0 4px rgba(0,0,0,0.3), 0 0 12px rgba(16, 185, 129, 0.8);
        }
    }
    
    @keyframes pulseOrange {
        0%, 100% {
            opacity: 1;
            box-shadow: 0 0 4px rgba(0,0,0,0.3), 0 0 8px rgba(245, 158, 11, 0.6);
        }
        50% {
            opacity: 0.7;
            box-shadow: 0 0 4px rgba(0,0,0,0.3), 0 0 12px rgba(245, 158, 11, 0.8);
        }
    }
    
    /* Boutons d'actions avec labels */
    .tm-actions-row {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        justify-content: space-between;
    }
    
    .tm-action-btn-small {
        background: rgba(248, 249, 250, 0.5);
        border: 2px solid transparent;
        border-radius: 10px;
        padding: 10px 8px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: all 0.2s;
        flex: 1;
        min-width: 0;
    }
    
    .tm-action-btn-small:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .tm-action-btn-small svg {
        display: block;
        flex-shrink: 0;
        stroke: #9ca3af;
        transition: stroke 0.2s;
    }
    
    .tm-action-label {
        font-size: 10px;
        font-weight: 600;
        color: #9ca3af;
        white-space: nowrap;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        transition: color 0.2s;
    }
    
    .tm-action-in:hover {
        background: rgba(209, 250, 229, 0.9);
        border-color: #10b981;
    }
    
    .tm-action-in:hover svg {
        stroke: #10b981;
    }
    
    .tm-action-in:hover .tm-action-label {
        color: #10b981;
    }
    
    .tm-action-out:hover {
        background: rgba(254, 226, 226, 0.9);
        border-color: #ef4444;
    }
    
    .tm-action-out:hover svg {
        stroke: #ef4444;
    }
    
    .tm-action-out:hover .tm-action-label {
        color: #ef4444;
    }
    
    .tm-action-pause:hover {
        background: rgba(254, 243, 199, 0.9);
        border-color: #f59e0b;
    }
    
    .tm-action-pause:hover svg {
        stroke: #f59e0b;
    }
    
    .tm-action-pause:hover .tm-action-label {
        color: #f59e0b;
    }
    
    .tm-action-resume:hover {
        background: rgba(219, 234, 254, 0.9);
        border-color: #3b82f6;
    }
    
    .tm-action-resume:hover svg {
        stroke: #3b82f6;
    }
    
    .tm-action-resume:hover .tm-action-label {
        color: #3b82f6;
    }
    
    /* Status */
    .tm-status {
        text-align: center;
        font-size: 12px;
        font-weight: 600;
        padding: 6px;
        border-radius: 8px;
        min-height: 18px;
        margin-bottom: 12px;
    }
    
    /* Section titre présences */
    .tm-presence-section-title {
        font-size: 11px;
        font-weight: 700;
        color: #666;
        margin-bottom: 10px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    /* Liste de présence encore plus transparente avec scrollbar stylée */
    .tm-presence-inline {
        max-height: 280px;
        overflow-y: auto;
        background: rgba(248, 249, 250, 0.3);
        border-radius: 10px;
        padding: 10px;
    }
    
    /* Scrollbar personnalisée pour Webkit (Chrome, Safari, Edge) */
    .tm-presence-inline::-webkit-scrollbar {
        width: 6px;
    }
    
    .tm-presence-inline::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.05);
        border-radius: 10px;
    }
    
    .tm-presence-inline::-webkit-scrollbar-thumb {
        background: rgba(0, 160, 157, 0.4);
        border-radius: 10px;
        transition: background 0.2s;
    }
    
    .tm-presence-inline::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 160, 157, 0.6);
    }
    
    /* Scrollbar pour Firefox */
    .tm-presence-inline {
        scrollbar-width: thin;
        scrollbar-color: rgba(0, 160, 157, 0.4) rgba(0, 0, 0, 0.05);
    }
    
    .tm-presence-loading-inline,
    .tm-presence-error-inline,
    .tm-presence-empty-inline {
        text-align: center;
        padding: 16px;
        color: #999;
        font-size: 12px;
    }
    
    .tm-presence-item-inline {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 8px;
        margin-bottom: 6px;
        transition: all 0.2s;
    }
    
    .tm-presence-item-inline:hover {
        transform: translateX(4px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        background: rgba(255, 255, 255, 0.75);
    }
    
    .tm-presence-item-inline:last-child {
        margin-bottom: 0;
    }
    
    .tm-presence-dot-online {
        width: 8px;
        height: 8px;
        background: #10b981;
        border-radius: 50%;
        flex-shrink: 0;
        animation: pulse 2s ease-in-out infinite;
    }
    
    .tm-presence-dot-pause {
        width: 8px;
        height: 8px;
        background: #f59e0b;
        border-radius: 50%;
        flex-shrink: 0;
        animation: pulse 2s ease-in-out infinite;
    }
    
    .tm-presence-dot-offline {
        width: 8px;
        height: 8px;
        background: #ef4444;
        border-radius: 50%;
        flex-shrink: 0;
        animation: pulse 2s ease-in-out infinite;
    }
    
    @keyframes pulse {
        0%, 100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.6;
            transform: scale(1.1);
        }
    }
    
    .tm-presence-name-inline {
        flex: 1;
        font-weight: 600;
        font-size: 12px;
        color: #333;
    }
    
    .tm-presence-status-inline {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }
    
    .tm-status-online {
        color: #10b981;
    }
    
    .tm-status-pause {
        color: #f59e0b;
    }
    
    .tm-status-offline {
        color: #ef4444;
    }
    /* Modal de rappel */
    #tm-reminder-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        animation: fadeIn 0.3s;
        backdrop-filter: blur(4px);
    }
    
    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }
    
    .tm-reminder-content {
        background: white;
        border-radius: 20px;
        padding: 36px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        max-width: 380px;
    }
    
    @keyframes scaleIn {
        from {
            opacity: 0;
            transform: scale(0.9);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }
    
    .tm-reminder-content svg {
        margin: 0 auto 20px;
        display: block;
    }
    
    .tm-reminder-title {
        font-size: 22px;
        font-weight: 700;
        color: #1a1a1a;
        margin-bottom: 10px;
    }
    
    .tm-reminder-text {
        font-size: 14px;
        color: #666;
        margin-bottom: 20px;
    }
    
    .tm-reminder-btn {
        padding: 12px 28px;
        background: #00A09D;
        color: white;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: all 0.2s;
    }
    
    .tm-reminder-btn:hover {
        background: #008F8C;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,160,157,0.3);
    }
    
    .tm-reminder-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #666;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        transition: background 0.2s;
    }
    
    .tm-reminder-checkbox:hover {
        background: rgba(0,0,0,0.03);
    }
    
    .tm-reminder-checkbox input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
    }
    
    .tm-reminder-checkbox span {
        user-select: none;
    }
    
    /* Modal heure de fin */
    #tm-endtime-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100001;
        animation: fadeIn 0.3s;
        backdrop-filter: blur(4px);
    }
    
    .tm-endtime-content {
        background: white;
        border-radius: 20px;
        padding: 36px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        animation: scaleIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        max-width: 380px;
        width: 90%;
    }
    
    .tm-endtime-content svg {
        margin: 0 auto 20px;
        display: block;
    }
    
    .tm-endtime-title {
        font-size: 20px;
        font-weight: 700;
        color: #1a1a1a;
        margin-bottom: 6px;
    }
    
    .tm-endtime-text {
        font-size: 13px;
        color: #666;
        margin-bottom: 20px;
    }
    
    .tm-endtime-input {
        width: 100%;
        padding: 14px;
        font-size: 22px;
        text-align: center;
        border: 2px solid #e0e0e0;
        border-radius: 10px;
        margin-bottom: 20px;
        font-family: 'SF Mono', Monaco, monospace;
        transition: all 0.2s;
    }
    
    .tm-endtime-input:focus {
        outline: none;
        border-color: #00A09D;
        box-shadow: 0 0 0 4px rgba(0,160,157,0.1);
    }
    
    .tm-endtime-buttons {
        display: flex;
        gap: 10px;
    }
    
    .tm-endtime-btn-skip,
    .tm-endtime-btn-save {
        flex: 1;
        padding: 12px 20px;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: all 0.2s;
    }
    
    .tm-endtime-btn-skip {
        background: #f0f0f0;
        color: #666;
    }
    
    .tm-endtime-btn-skip:hover {
        background: #e0e0e0;
        color: #333;
    }
    
    .tm-endtime-btn-save {
        background: #00A09D;
        color: white;
    }
    
    .tm-endtime-btn-save:hover {
        background: #008F8C;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,160,157,0.3);
    }
    
    /* Toast notifications */
    #tm-toast-container {
        position: fixed;
        bottom: 100px;
        right: 24px;
        z-index: 99998;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
    }
    
    .tm-toast {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-radius: 12px;
        padding: 14px 18px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        border: 1px solid rgba(255, 255, 255, 0.3);
        min-width: 280px;
        max-width: 400px;
        transform: translateY(100px);
        opacity: 0;
        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: auto;
    }
    
    .tm-toast-show {
        transform: translateY(0);
        opacity: 1;
    }
    
    .tm-toast-hide {
        transform: translateY(100px);
        opacity: 0;
    }
    
    .tm-toast-indicator {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    
    .tm-toast-indicator-online {
        background: #10b981;
        box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
        animation: pulseGreen 2s ease-in-out infinite;
    }
    
    .tm-toast-indicator-offline {
        background: #ef4444;
        box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
    }
    
    .tm-toast-indicator-pause {
        background: #f59e0b;
        box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
        animation: pulseOrange 2s ease-in-out infinite;
    }
    
    .tm-toast-content {
        flex: 1;
    }
    
    .tm-toast-message {
        font-size: 13px;
        color: #333;
        line-height: 1.4;
    }
    
    .tm-toast-message strong {
        font-weight: 700;
        color: #1a1a1a;
    }
`);

// Créer le widget au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPresenceWidget);
} else {
    createPresenceWidget();
}

// Recréer le widget si nécessaire (navigation SPA)
setInterval(() => {
    if (!document.getElementById('tm-presence-widget')) {
        createPresenceWidget();
    }
}, 2000);

})(); // Fermeture de la fonction principale
