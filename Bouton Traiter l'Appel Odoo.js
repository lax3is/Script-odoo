// ==UserScript==
// @name         Bouton Traiter l'Appel Odoo
// @namespace    http://tampermonkey.net/
// @version      3.3.1
// @description  Traitement d'appel Odoo – full API, timer, étiquettes, badges, RDV
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
// @connect      hotline.sippharma.fr
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

    // Sauvegarde fiable : bouton DOM en priorité, fallback Ctrl+S simulé
    async function saveForm() {
        const saveBtn = document.querySelector(
            'button.o_form_button_save, button[data-hotkey="s"], .o_form_button_save'
        );
        if (saveBtn && !saveBtn.disabled) {
            saveBtn.click();
            await wait(300);
        } else {
            // Fallback : simuler Ctrl+S
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true
            }));
            await wait(300);
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
                    await wait(800);
                    return true;
                }
            }
            await wait(250);
        }
        return false;
    }

    async function manualStopTimerFallback(ticketId) {
        dispatchAltShortcut('z', 'KeyZ');
        await wait(400);

        let dialog = null;
        for (let i = 0; i < 8; i++) {
            dialog = document.querySelector('.o_timer_dialog, .modal.show, .o_dialog');
            if (dialog) break;
            await wait(250);
        }

        if (dialog) {
            await wait(800);
        }

        dispatchAltShortcut('q', 'KeyQ');
        await wait(500);

        if (document.querySelector('.o_timer_dialog, .modal.show, .o_dialog')) {
            dispatchAltShortcut('q', 'KeyQ');
            await wait(500);
        }

        const saveBtn = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
        if (saveBtn && !saveBtn.disabled) {
            saveBtn.click();
            await wait(400);
        }

        dispatchAltShortcut('q', 'KeyQ');
        await wait(400);

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

                await wait(500);
                await autoConfirmTimesheetDialog(5000);

                const stopped = await waitForTimerStopped(ticketId, 5000);
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

        // Ancien script : Alt+Z pour ouvrir la fiche de temps, puis Alt+Q pour fermer/sauver
        simulerRaccourciTimer();
        await wait(300);

        let ficheTemps = null;
        let tentatives = 0;
        while (!ficheTemps && tentatives < 3) {
            ficheTemps = document.querySelector('.o_timer_dialog');
            if (!ficheTemps) {
                await wait(250);
                tentatives++;
            }
        }

        if (ficheTemps) await wait(1000);

        simulerRaccourciStop();
        await wait(400);

        if (document.querySelector('.o_timer_dialog')) {
            simulerRaccourciStop();
            await wait(400);
        }

        // Sauvegarde (si Odoo affiche encore un bouton save)
        const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
        if (btnEnregistrer && !btnEnregistrer.disabled) {
            btnEnregistrer.click();
            await wait(300);
        }

        // Dernier Q de sécurité
        simulerRaccourciStop();
        await wait(600);

        const stopped = await waitForDomTimerState('stopped', 8000);
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
            } else {
                sessionStorage.removeItem('pendingReasonPanelAfterClosure');
            }
            // Ne pas ouvrir le panneau tout de suite : la séquence stop/timesheet peut re-rendre l'écran.
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
            tries++;
            openReasonPanel();
            if (!document.getElementById('odoo-reason-overlay')) {
                if (tries < maxTries) setTimeout(attempt, retryMs);
                else sessionStorage.removeItem('pendingReasonPanel');
            } else {
                sessionStorage.removeItem('pendingReasonPanel');
            }
        };
        setTimeout(attempt, 200);
    }

    async function fetchReasonLists() {
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
        return { HARDWARE, SOFTWARE, hwRel, swRel };
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
        if (_reasonPanelOpen || _reasonPanelDone || document.getElementById('odoo-reason-overlay')) return;
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
        const wanted = uniqNormNames(names);
        if (!wanted.length) return false;

        const root = document.querySelector(`.o_field_many2many_tags[name="${fieldName}"], .o_field_widget[name="${fieldName}"]`);
        if (!root) return false;

        const existing = new Set(
            Array.from(root.querySelectorAll('.o_tag, .badge, .o_tag_badge_text'))
                .map(el => normalizeReasonName(el.textContent || ''))
                .filter(Boolean)
        );

        const input = root.querySelector('input');
        if (!(input instanceof HTMLInputElement)) return false;

        let added = false;
        for (const name of wanted) {
            if (existing.has(normalizeReasonName(name))) continue;

            input.focus();
            input.value = name;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(180);
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
            await wait(220);

            // Marquer "ajouté" si le tag apparait ou si la saisie a été consommée par le widget.
            const now = new Set(
                Array.from(root.querySelectorAll('.o_tag, .badge, .o_tag_badge_text'))
                    .map(el => normalizeReasonName(el.textContent || ''))
                    .filter(Boolean)
            );
            if (now.has(normalizeReasonName(name)) || String(input.value || '').trim() === '') {
                added = true;
                existing.add(normalizeReasonName(name));
            }
        }
        return added;
    }

    async function applyTagsViaDom(hwNames = [], swNames = []) {
        const hwOk = await addMany2ManyTagsViaDom('material_reason_tag_ids', hwNames);
        const swOk = await addMany2ManyTagsViaDom('software_reason_tag_ids', swNames);
        if (!hwOk && !swOk) return false;
        await wait(150);
        await saveForm();
        return true;
    }

    async function applyTagsToTicket(hwIds = [], swIds = [], hwNamesFallback = [], swNamesFallback = [], targetTicketId = null) {
        const ticketId = targetTicketId || sessionStorage.getItem('pendingReasonTicketId') || getTicketIdFromPage();
        if (!ticketId) return false;

        // Si on n'a pas d'IDs (fallback noms), on cherche par nom sans créer
        if (!hwIds.length && hwNamesFallback.length) {
            const fields = await odooRpc('helpdesk.ticket', 'fields_get', [['material_reason_tag_ids'], ['relation']]) || {};
            const rel = fields.material_reason_tag_ids?.relation;
            if (rel) {
                hwIds = await resolveTagIdsByName(rel, hwNamesFallback);
            }
        }
        if (!swIds.length && swNamesFallback.length) {
            const fields = await odooRpc('helpdesk.ticket', 'fields_get', [['software_reason_tag_ids'], ['relation']]) || {};
            const rel = fields.software_reason_tag_ids?.relation;
            if (rel) {
                swIds = await resolveTagIdsByName(rel, swNamesFallback);
            }
        }

        const vals = {};
        // [4, id] = lier sans créer (many2many link)
        if (hwIds.length) vals.material_reason_tag_ids = hwIds.map(id => [4, id]);
        if (swIds.length) vals.software_reason_tag_ids = swIds.map(id => [4, id]);
        if (!Object.keys(vals).length) {
            // Fallback non-admin : tenter via l'UI Odoo (many2many tags)
            return applyTagsViaDom(hwNamesFallback, swNamesFallback);
        }

        const writeOk = await odooWrite('helpdesk.ticket', Number(ticketId), vals);
        if (!writeOk) {
            // Fallback non-admin : certains profils ne peuvent pas write via API mais peuvent via le widget UI.
            return applyTagsViaDom(hwNamesFallback, swNamesFallback);
        }
        await wait(300);
        const saveBtn = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
        if (saveBtn) saveBtn.click();
        // Forcer le rechargement du formulaire pour afficher les tags sans F5
        await wait(600);
        try {
            // Méthode 1 : bouton discard puis reload (Odoo SPA)
            const discardBtn = document.querySelector('button.o_form_button_discard, button[data-hotkey="j"]');
            if (discardBtn) { discardBtn.click(); await wait(200); }
            // Méthode 2 : déclencher un reload via l'action manager Odoo
            if (window.__owl__) {
                const env = window.__owl__?.apps?.values?.()?.next?.()?.value?.env;
                if (env?.services?.action) {
                    env.services.action.restore();
                }
            }
        } catch (_) {}
        // Méthode 3 : reload de la vue courante via hashchange
        const currentHash = window.location.hash;
        window.location.hash = currentHash + '&_r=' + Date.now();
        await wait(100);
        window.history.replaceState(null, '', window.location.pathname + window.location.search + currentHash);
        return true;
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

    function jouerSonAlerte() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
            osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.2);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        } catch (e) { /* audio non supporté */ }
    }

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
                    // Son d'alerte une seule fois par session
                    if (!_alertSoundPlayed) { _alertSoundPlayed = true; jouerSonAlerte(); }
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
    // OBSERVER PRINCIPAL + INITIALISATION
    // =========================================================
    let lastUrl = window.location.href;

    function runAll() {
        addTraiterButton();
        styleCloseButton();
        addInitialesButton();
        addClearAssignButton();
        hookDeleteAuditClicks();
        hookOdooDeleteRpcAudit();
        scheduleDevisUpdate(100);
        scheduleOpenTicketsUpdate(100);
        applyInternetBlink();
        scanCategoryStyles();
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
            sessionStorage.removeItem('pendingReasonPanel');
            sessionStorage.removeItem('pendingReasonTicketId');
            _assistanceCache.clear();
            _assistanceTagIds = null;            // Plusieurs tentatives pour s'assurer que le DOM Odoo est prêt
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

})();
