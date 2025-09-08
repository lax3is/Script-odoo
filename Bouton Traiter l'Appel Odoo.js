// ==UserScript==
// @name         Odoo Tickets History
// @namespace    http://tampermonkey.net/
// @version      2.2.6
// @description  Affiche l'historique des tickets dans Odoo
// @author       Alexis Sair
// @match        https://winprovence.odoo.com/web*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      winprovence.odoo.com
// @updateURL    https://raw.githubusercontent.com/lax3is/Historiques-appels-et-ventes/refs/heads/main/Historiqueappelsventes.js
// @downloadURL  https://raw.githubusercontent.com/lax3is/Historiques-appels-et-ventes/refs/heads/main/Historiqueappelsventes.js
// ==/UserScript==

(function() {
    'use strict';

    // Ajout du CSS pour modifier le style de rightSection et positionner l'historique en bas
    GM_addStyle(`
        /* Style pour le thème clair par défaut */
        .o_ChatterTopbar_rightSection {
            justify-content: flex-start !important;
        }

        /* Variables de couleur pour le thème clair */
        :root {
            --hist-bg-color: #ffffff;
            --hist-text-color: #333333;
            --hist-border-color: #e0e0e0;
            --hist-header-bg: #f8f9fa;
            --hist-hover-bg: #f5f5f5;
            --hist-input-bg: #ffffff;
            --hist-shadow-color: rgba(0,0,0,0.1);
            --hist-scrollbar-track: #f1f1f1;
            --hist-scrollbar-thumb: #c1c1c1;
            --hist-btn-bg: #00A09D;
            --hist-btn-hover-bg: #008F8C;
            --hist-btn-active-bg: #007F7D;
        }

        /* Variables de couleur pour le thème sombre */
        .o_web_client.o_dark_mode, .dark-mode, [data-color-scheme="dark"], body.dark {
            --hist-bg-color: #1f2937;
            --hist-text-color: #e5e7eb;
            --hist-border-color: #374151;
            --hist-header-bg: #111827;
            --hist-hover-bg: #2d3748;
            --hist-input-bg: #374151;
            --hist-shadow-color: rgba(0,0,0,0.3);
            --hist-scrollbar-track: #1f2937;
            --hist-scrollbar-thumb: #4b5563;
            --hist-btn-bg: #069a94;
            --hist-btn-hover-bg: #057e79;
            --hist-btn-active-bg: #046a66;
        }

        /* Styles pour les boutons de thème */
        #theme-toggle-container {
            position: static;
            display: flex;
            gap: 8px;
            margin-left: 15px;
        }

        .theme-toggle-btn {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 1px 3px var(--hist-shadow-color);
            transition: all 0.2s ease;
        }

        .theme-toggle-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 2px 4px var(--hist-shadow-color);
        }

        #dark-theme-btn {
            background-color: #1f2937;
            color: #f3f4f6;
        }

        #light-theme-btn {
            background-color: #f8fafc;
            color: #334155;
        }

        #dark-theme-btn.active, #light-theme-btn.active {
            border: 2px solid var(--hist-btn-bg);
        }

        /* Style pour le reste du contenu inchangé */
        .o_TicketList {
            position: fixed !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
            background: var(--hist-bg-color) !important;
            border-top: 1px solid var(--hist-border-color) !important;
            z-index: 1000 !important;
            height: 50vh !important;
            display: flex !important;
            flex-direction: column !important;
            box-shadow: 0 -2px 10px var(--hist-shadow-color) !important;
        }

        .o_TicketList_header {
            padding: 0.5rem 1rem !important;
            background: var(--hist-header-bg) !important;
            border-bottom: 1px solid var(--hist-border-color) !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            color: var(--hist-text-color) !important;
        }

        .o_TicketList_closeButton {
            background: none !important;
            border: none !important;
            color: var(--hist-text-color) !important;
            cursor: pointer !important;
            padding: 0.5rem !important;
            font-size: 1.2rem !important;
            line-height: 1 !important;
            transition: color 0.2s ease !important;
        }

        .o_TicketList_closeButton:hover {
            opacity: 0.8 !important;
        }

        .o_content.o_controller_with_searchpanel {
            margin-bottom: 50vh !important;
            transition: margin-bottom 0.3s ease !important;
        }

        .o_TicketList_content {
            flex: 1 !important;
            overflow-y: auto !important;
            padding: 1rem !important;
            background-color: var(--hist-bg-color) !important;
            color: var(--hist-text-color) !important;
        }

        .o_TicketList_filters {
            padding: 1rem !important;
            background: var(--hist-bg-color) !important;
            border-bottom: 1px solid var(--hist-border-color) !important;
        }

        .o_TicketList.minimized {
            height: 40px !important;
        }

        .o_TicketList.minimized .o_TicketList_content,
        .o_TicketList.minimized .o_TicketList_filters {
            display: none !important;
        }

        .o_TicketList_toggleButton {
            background: none !important;
            border: none !important;
            color: var(--hist-text-color) !important;
            cursor: pointer !important;
            padding: 0.5rem !important;
            margin-right: 0.5rem !important;
        }

        .o_TicketList_toggleButton:hover {
            opacity: 0.8 !important;
        }

        #zone_historique_tickets, #zone_produits_client {
            border: 1px solid var(--hist-border-color);
            padding: 20px;
            margin: 20px 0;
            background-color: var(--hist-bg-color);
            border-radius: 4px;
            box-shadow: 0 1px 3px var(--hist-shadow-color);
            max-height: 600px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            color: var(--hist-text-color);
            display: none !important;
        }

        #zone_historique_tickets.visible, #zone_produits_client.visible {
            display: flex !important;
        }

        /* Quand les deux sections sont visibles, réduire la hauteur pour qu'elles s'affichent bien ensemble */
        #zone_historique_tickets.visible ~ #zone_produits_client.visible,
        #zone_produits_client.visible ~ #zone_historique_tickets.visible {
            max-height: 400px; /* Réduire la hauteur quand les deux sont affichés */
        }

        /* Ajouter un espace entre les deux sections quand elles sont affichées ensemble */
        #zone_historique_tickets.visible + #zone_produits_client.visible {
            margin-top: 0;
        }

        #zone_produits_client.visible + #zone_historique_tickets.visible {
            margin-top: 0;
        }

        #ticketsList {
            overflow-y: auto;
            flex: 1;
            padding-right: 10px;
        }

        #ticketsList::-webkit-scrollbar {
            width: 8px;
        }

        #ticketsList::-webkit-scrollbar-track {
            background: var(--hist-scrollbar-track);
            border-radius: 4px;
        }

        #ticketsList::-webkit-scrollbar-thumb {
            background: var(--hist-scrollbar-thumb);
            border-radius: 4px;
        }

        #ticketsList::-webkit-scrollbar-thumb:hover {
            opacity: 0.8;
        }

        /* Style pour l'en-tête du tableau d'historique */
        .historique-header {
            position: sticky;
            top: 0;
            background: var(--hist-bg-color);
            z-index: 10;
            padding-bottom: 15px;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--hist-border-color);
            color: var(--hist-text-color);
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
        }

        .historique-header-left {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .historique-header-right {
            flex: 1;
            display: flex;
            justify-content: flex-end;
        }

        .ticket-item {
            padding: 12px;
            background-color: var(--hist-bg-color);
            margin-bottom: 10px;
            border: 1px solid var(--hist-border-color);
            border-radius: 4px;
            transition: all 0.2s ease;
            color: var(--hist-text-color);
        }

        .ticket-item:hover {
            background-color: var(--hist-hover-bg);
            transform: translateY(-1px);
        }

        .ticket-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .ticket-title {
            font-weight: 500;
            color: var(--hist-text-color);
        }

        .ticket-date {
            color: var(--hist-text-color);
            opacity: 0.8;
            font-size: 0.9em;
        }

        .ticket-info {
            display: flex;
            gap: 20px;
            margin-top: 8px;
            color: var(--hist-text-color);
            opacity: 0.9;
            font-size: 0.9em;
        }

        .ticket-timesheet {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
            color: var(--hist-text-color);
            background-color: var(--hist-bg-color);
            padding: 2px 6px;
            border-radius: 3px;
            border: 1px solid var(--hist-border-color);
        }

        .ticket-description, .ticket-response-content {
            color: var(--hist-text-color);
            opacity: 0.9;
            padding: 8px 0;
            font-size: 0.95em;
            line-height: 1.4;
        }

        .ticket-team {
            display: flex;
            align-items: center;
            gap: 5px;
        }

        .ticket-status {
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.85em;
            color: white;
        }

        .no-tickets {
            text-align: center;
            padding: 20px;
            color: var(--hist-text-color);
            opacity: 0.7;
            font-style: italic;
        }

        .ticket-filters {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }

        .filter-input {
            padding: 5px 10px;
            border: 1px solid var(--hist-border-color);
            border-radius: 4px;
            font-size: 0.9em;
            background-color: var(--hist-input-bg);
            color: var(--hist-text-color);
        }

        .filter-input::placeholder {
            color: var(--hist-text-color);
            opacity: 0.6;
        }

        .ticket-item[data-team="Logiciel"] {
            border-left: 4px solid #4CAF50 !important;
            background-color: var(--hist-bg-color) !important;
        }

        .ticket-item[data-team="Materiel"] {
            border-left: 4px solid #2196F3 !important;
            background-color: var(--hist-bg-color) !important;
        }

        .ticket-item[data-team="RMA"] {
            border-left: 4px solid #FF9800 !important;
            background-color: var(--hist-bg-color) !important;
        }

        .ticket-team[data-team="Logiciel"] i {
            color: #4CAF50 !important;
        }

        .ticket-team[data-team="Materiel"] i {
            color: #2196F3 !important;
        }

        .ticket-team[data-team="RMA"] i {
            color: #FF9800 !important;
        }

        .ticket-item[data-team="Logiciel"] .ticket-status {
            background-color: #4CAF50 !important;
        }

        .ticket-item[data-team="Materiel"] .ticket-status {
            background-color: #2196F3 !important;
        }

        .ticket-item[data-team="RMA"] .ticket-status {
            background-color: #FF9800 !important;
        }

        .ticket-item[data-team="Logiciel"]:hover {
            box-shadow: 0 2px 8px rgba(76, 175, 80, 0.2) !important;
        }

        .ticket-item[data-team="Materiel"]:hover {
            box-shadow: 0 2px 8px rgba(33, 150, 243, 0.2) !important;
        }

        .ticket-item[data-team="RMA"]:hover {
            box-shadow: 0 2px 8px rgba(255, 152, 0, 0.2) !important;
        }

        #showHistoryButton, #showProductsButton {
            position: relative;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 15px;
            padding: 6px 14px;
            background-color: var(--hist-btn-bg);
            color: white;
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            box-shadow: 0 1px 2px var(--hist-shadow-color);
            transition: all 0.2s ease;
            margin-right: 10px;
        }

        #showHistoryButton:hover, #showProductsButton:hover {
            background-color: var(--hist-btn-hover-bg);
            box-shadow: 0 2px 4px var(--hist-shadow-color);
        }

        #showHistoryButton:active, #showProductsButton:active {
            background-color: var(--hist-btn-active-bg);
            transform: translateY(1px);
        }

        #showHistoryButton i, #showProductsButton i {
            font-size: 14px;
        }

        /* Style pour les produits du client */
        #zone_produits_client {
            border: 1px solid var(--hist-border-color);
            padding: 20px;
            margin: 20px 0;
            background-color: var(--hist-bg-color);
            border-radius: 4px;
            box-shadow: 0 1px 3px var(--hist-shadow-color);
            max-height: 600px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            color: var(--hist-text-color);
        }

        .produits-header {
            position: sticky;
            top: 0;
            background: var(--hist-bg-color);
            z-index: 10;
            padding-bottom: 15px;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--hist-border-color);
            color: var(--hist-text-color);
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: center;
        }

        .produits-header-left {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .produits-header-right {
            flex: 1;
            display: flex;
            justify-content: flex-end;
        }

        #productsList {
            overflow-y: auto;
            flex: 1;
            padding-right: 10px;
        }

        #productsList::-webkit-scrollbar {
            width: 8px;
        }

        #productsList::-webkit-scrollbar-track {
            background: var(--hist-scrollbar-track);
            border-radius: 4px;
        }

        #productsList::-webkit-scrollbar-thumb {
            background: var(--hist-scrollbar-thumb);
            border-radius: 4px;
        }

        #productsList::-webkit-scrollbar-thumb:hover {
            opacity: 0.8;
        }

        .product-item {
            padding: 12px;
            background-color: var(--hist-bg-color);
            margin-bottom: 10px;
            border: 1px solid var(--hist-border-color);
            border-left: 4px solid #6B7280;
            border-radius: 4px;
            transition: all 0.2s ease;
            color: var(--hist-text-color);
        }

        .product-item:hover {
            background-color: var(--hist-hover-bg);
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(107, 114, 128, 0.2);
        }

        .product-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .product-title {
            font-weight: 500;
            color: var(--hist-text-color);
        }

        .product-date {
            color: var(--hist-text-color);
            opacity: 0.8;
            font-size: 0.9em;
        }

        .product-info {
            display: flex;
            gap: 20px;
            margin-top: 8px;
            color: var(--hist-text-color);
            opacity: 0.9;
            font-size: 0.9em;
        }

        .product-type {
            background-color: #6B7280;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.85em;
        }

        .hardware-product {
            border-left-color: #2196F3;
        }

        .hardware-product .product-type {
            background-color: #2196F3;
        }

        .software-product {
            border-left-color: #4CAF50;
        }

        .software-product .product-type {
            background-color: #4CAF50;
        }

        .service-product {
            border-left-color: #FF9800;
        }

        .service-product .product-type {
            background-color: #FF9800;
        }

        /* Container pour les boutons */
        .buttons-container {
            margin: 20px 0 5px 0;
            display: flex;
            gap: 10px;
        }

        /* Style pour le filtre de produits */
        .product-filters {
            display: flex;
            gap: 10px;
        }

        .filter-input {
            padding: 5px 10px;
            border: 1px solid var(--hist-border-color);
            border-radius: 4px;
            font-size: 0.9em;
            background-color: var(--hist-input-bg);
            color: var(--hist-text-color);
        }

        .filter-input::placeholder {
            color: var(--hist-text-color);
            opacity: 0.6;
        }

        .no-products {
            text-align: center;
            padding: 20px;
            color: var(--hist-text-color);
            opacity: 0.7;
            font-style: italic;
        }

        .dark-theme-detected {
            --hist-bg-color: #1f2937;
            --hist-text-color: #e5e7eb;
            --hist-border-color: #374151;
            --hist-header-bg: #111827;
            --hist-hover-bg: #2d3748;
            --hist-input-bg: #374151;
            --hist-shadow-color: rgba(0,0,0,0.3);
            --hist-scrollbar-track: #1f2937;
            --hist-scrollbar-thumb: #4b5563;
            --hist-btn-bg: #069a94;
            --hist-btn-hover-bg: #057e79;
            --hist-btn-active-bg: #046a66;
        }

        /* Ajout du style pour le badge "Produits" */
        .produit-badge .product-type {
            background-color: #7c3aed !important;
            color: #fff !important;
            border-radius: 12px;
            padding: 2px 8px;
            font-size: 0.85em;
        }
    `);

    // Variables pour suivre l'état des modifications
    let layoutModified = false;
    let ticketButtonAdded = false;
    let ticketButtonSelected = false;
    let originalContent = null;
    let originalComposer = null;
    let historyAdded = false;
    let historyButtonAdded = false;
    let productsAdded = false;
    let productsButtonAdded = false;

    // Variable pour éviter les doubles chargements
    let isProcessingNavigation = false;

    // Observer les changements de thème de manière plus agressive pour Odoo
    let themeInterval;

    // Fonction pour démarrer la vérification périodique, avec annulation sécurisée de l'intervalle précédent
    function startThemeChecking() {
        // Nettoyer l'ancien intervalle s'il existe
        if (themeInterval) {
            clearInterval(themeInterval);
            themeInterval = null;
        }

        let checkCount = 0;
        themeInterval = setInterval(() => {
            detectDarkTheme();
            checkCount++;
            if (checkCount >= 5) { // Limiter à 5 vérifications
                clearInterval(themeInterval);
                themeInterval = null;
            }
        }, 3000);
    }

    // Démarrer la vérification initiale
    startThemeChecking();

    // Fonction pour détecter le thème sombre
    function detectDarkTheme() {
        try {
            // Approche simplifiée pour la détection du thème sombre
            let isDarkMode = document.documentElement.classList.contains('o_dark_mode') ||
                document.body.classList.contains('o_dark_mode') ||
                document.querySelector('.o_web_client.o_dark_mode') !== null;

            // Vérifier si mode forcé via localStorage
            const forcedTheme = localStorage.getItem('odoo_custom_theme');
            if (forcedTheme === 'dark') {
                isDarkMode = true;
            } else if (forcedTheme === 'light') {
                isDarkMode = false;
            }

            // Appliquer ou supprimer la classe selon l'état
            if (isDarkMode) {
                document.documentElement.classList.add('dark-theme-detected');
                const darkBtn = document.querySelector('#dark-theme-btn');
                const lightBtn = document.querySelector('#light-theme-btn');
                if (darkBtn && lightBtn) {
                    darkBtn.classList.add('active');
                    lightBtn.classList.remove('active');
                }
            } else {
                document.documentElement.classList.remove('dark-theme-detected');
                const darkBtn = document.querySelector('#dark-theme-btn');
                const lightBtn = document.querySelector('#light-theme-btn');
                if (darkBtn && lightBtn) {
                    lightBtn.classList.add('active');
                    darkBtn.classList.remove('active');
                }
            }

            return isDarkMode;
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la détection du thème:', error);
            return false;
        }
    }

    // Fonction pour basculer le thème
    function toggleTheme(mode) {
        try {
            // Sauvegarder la préférence
            localStorage.setItem('odoo_custom_theme', mode);

            // Classe Odoo officielle
            if (mode === 'dark') {
                document.documentElement.classList.add('o_dark_mode');
                document.body.classList.add('o_dark_mode');
                if (document.querySelector('.o_web_client')) {
                    document.querySelector('.o_web_client').classList.add('o_dark_mode');
                }
            } else {
                document.documentElement.classList.remove('o_dark_mode');
                document.body.classList.remove('o_dark_mode');
                if (document.querySelector('.o_web_client')) {
                    document.querySelector('.o_web_client').classList.remove('o_dark_mode');
                }
            }

            // Mettre à jour l'état des boutons
            detectDarkTheme();

            console.log(`[ODOO-EXT] Thème basculé en mode: ${mode}`);
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors du changement de thème:', error);
        }
    }

    // Fonction pour faire des requêtes HTTP avec GM_xmlhttpRequest
    function makeRequest(url, method, data) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: method,
                url: url,
                data: data ? JSON.stringify(data) : null,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
                    } catch (error) {
                        reject(error);
                    }
                },
                onerror: function(error) {
                    reject(error);
                }
            });
        });
    }

    // Fonction waitForElement adaptée pour Tampermonkey
    function waitForElement(selector, timeout = 10000) {
        console.log('[ODOO-EXT] Attente de l\'élément:', selector);

        return new Promise((resolve, reject) => {
            if (document.querySelector(selector)) {
                console.log('[ODOO-EXT] Élément trouvé immédiatement');
                return resolve(document.querySelector(selector));
            }

            const observer = new MutationObserver(() => {
                if (document.querySelector(selector)) {
                    console.log('[ODOO-EXT] Élément trouvé après mutation');
                    observer.disconnect();
                    resolve(document.querySelector(selector));
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                console.log('[ODOO-EXT] Timeout sur l\'attente de l\'élément');
                observer.disconnect();
                reject();
            }, timeout);
        });
    }

    // Fonction pour sauvegarder l'état de l'historique
    function saveHistoryState(isVisible) {
        try {
            localStorage.setItem('ticketHistory_visible', isVisible ? 'true' : 'false');
            console.log(`[ODOO-EXT] État de l'historique sauvegardé: ${isVisible}`);
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
            console.log(`[ODOO-EXT] État de l'affichage des produits sauvegardé: ${isVisible}`);
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

    // Fonction pour convertir la priorité en classe d'urgence
    function getPriorityClass(priority) {
        switch(priority) {
            case '0':
            case 0:
                return 'urgency-low';     // blanc
            case '1':
            case 1:
                return 'urgency-normal';   // vert
            case '2':
            case 2:
                return 'urgency-high';     // orange
            case '3':
            case 3:
                return 'urgency-urgent';   // rouge
            default:
                return 'urgency-low';
        }
    }

    // Fonction pour obtenir l'icône de l'équipe selon l'ID
    function getTeamIconById(teamId) {
        switch(teamId) {
            case 8:
                return { icon: 'fa-laptop', class: 'Logiciel', name: 'Logiciel' };
            case 1:
                return { icon: 'fa-wrench', class: 'Materiel', name: 'Materiel' };
            case 9:
                return { icon: 'fa-exchange', class: 'RMA', name: 'RMA' };
            default:
                return { icon: 'fa-question', class: 'Unknown', name: 'Inconnu' };
        }
    }

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

    // Fonction pour récupérer les détails des timesheets
    async function fetchTimesheetDetails(timesheetIds) {
        if (!timesheetIds || !Array.isArray(timesheetIds) || timesheetIds.length === 0) {
            return [];
        }

        try {
            const timesheetPayload = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    model: "account.analytic.line",
                    method: "read",
                    args: [timesheetIds],
                    kwargs: {
                        fields: ["unit_amount", "name", "date"]
                    }
                },
                id: 200
            };

            const response = await makeRequest(
                'https://winprovence.odoo.com/web/dataset/call_kw/account.analytic.line/read',
                'POST',
                timesheetPayload
            );

            if (response && response.result) {
                return response.result;
            }
            return [];
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la récupération des timesheets:', error);
            return [];
        }
    }

    // Récupère les totaux de temps par ticket via read_group (plus efficace côté serveur)
    async function fetchTimesheetTotalsByTicket(ticketIds) {
        try {
            if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
                return {};
            }

            const payload = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    model: "account.analytic.line",
                    method: "read_group",
                    args: [
                        [
                            ["ticket_id", "in", ticketIds]
                        ],
                        ["unit_amount", "ticket_id"],
                        ["ticket_id"],
                        0,
                        0,
                        { aggregate: { unit_amount: "sum" } }
                    ],
                    kwargs: {}
                },
                id: 201
            };

            const response = await makeRequest(
                'https://winprovence.odoo.com/web/dataset/call_kw/account.analytic.line/read_group',
                'POST',
                payload
            );

            const totalsByTicket = {};
            if (response && response.result && Array.isArray(response.result)) {
                response.result.forEach(group => {
                    // ticket_id est un many2one: [id, name]
                    const ticketId = Array.isArray(group.ticket_id) ? group.ticket_id[0] : group.ticket_id;
                    const sum = typeof group.unit_amount === 'number' ? group.unit_amount : (group['unit_amount:sum'] || 0);
                    if (ticketId) {
                        totalsByTicket[ticketId] = sum || 0;
                    }
                });
            }

            return totalsByTicket;
        } catch (error) {
            console.error('[ODOO-EXT] Erreur read_group timesheets:', error);
            return {};
        }
    }

    // Détecte dynamiquement le champ total d'heures sur helpdesk.ticket (si disponible)
    let cachedTicketTotalField = null;
    async function detectTicketTotalField() {
        if (cachedTicketTotalField !== null) {
            return cachedTicketTotalField;
        }

        try {
            const payload = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    model: "helpdesk.ticket",
                    method: "fields_get",
                    args: [],
                    kwargs: { attributes: ["type", "string"] }
                },
                id: 202
            };

            const response = await makeRequest(
                'https://winprovence.odoo.com/web/dataset/call_kw/helpdesk.ticket/fields_get',
                'POST',
                payload
            );

            const candidates = [
                // Champs standards ou fréquents
                'timesheet_total_duration',
                'timesheet_ids_amount',
                'timesheet_total',
                'total_hours_spent',
                'total_time_spent',
                'total_time',
                // Champs studio potentiels
                'x_heures_passees',
                'x_hours_spent',
                'x_total_time',
                'x_studio_heures_passees',
                'x_studio_total_time'
            ];

            if (response && response.result) {
                for (const name of candidates) {
                    if (Object.prototype.hasOwnProperty.call(response.result, name)) {
                        cachedTicketTotalField = name;
                        return cachedTicketTotalField;
                    }
                }
            }

            cachedTicketTotalField = undefined;
            return undefined;
        } catch (error) {
            console.warn('[ODOO-EXT] Impossible de détecter un champ total sur helpdesk.ticket:', error);
            cachedTicketTotalField = undefined;
            return undefined;
        }
    }

    // Fonction pour calculer le temps total passé sur un ticket
    function calculateTimeSpent(timesheetDetails) {
        if (!timesheetDetails || !Array.isArray(timesheetDetails) || timesheetDetails.length === 0) {
            return 0;
        }

        // Calculer la somme des heures (unit_amount)
        const totalHours = timesheetDetails.reduce((sum, timesheet) => {
            return sum + (timesheet.unit_amount || 0);
        }, 0);

        return totalHours;
    }

    // Convertit des heures décimales en format HH:MM (aligné avec "Heures passées" d'Odoo)
    function formatTimeSpent(timeSpent) {
        const totalMinutes = Math.round((timeSpent || 0) * 60);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    // Fonction pour générer le HTML des tickets
    function generateTicketsHtml(tickets) {
        if (!tickets || !tickets.result || !tickets.result.records) {
            return '<div class="no-results-message">Aucun ticket trouvé</div>';
        }

        return tickets.result.records.map(ticket => {
            const teamInfo = getTeamIconById(ticket.team_id[0]);
            const priorityClass = getPriorityClass(ticket.priority);
            const userId = ticket.user_id ? ticket.user_id[0] : null;
            const userName = ticket.user_id ? ticket.user_id[1] : 'Non assigné';
            const avatarUrl = userId ? `https://winprovence.odoo.com/web/image/res.users/${userId}/avatar_128` : '';
            const stageName = translateStage(ticket.stage_id[1]);

            return `
                <div class="col-12 ticket-item"
                     data-team="${teamInfo.name}"
                     data-date="${ticket.create_date}"
                     data-name="${ticket.name.toLowerCase()}"
                >
                    <div class="o_Ticket ${priorityClass}">
                        <div class="o_Ticket_header">
                            <div class="team-icon ${teamInfo.class}">
                                <i class="fa ${teamInfo.icon}"></i>
                            </div>
                            <div class="ticket-title-container">
                                <h3 class="ticket-title" title="${ticket.name}">${ticket.name}</h3>
                                <div class="ticket-dates">
                                    <i class="fa fa-calendar-o fa-fw"></i> ${formatDate(ticket.create_date)}
                                    ${ticket.close_date ? `
                                        <i class="o_TrackingValue_separator fa fa-long-arrow-right mx-1 text-600" title="Changé" role="img" aria-label="Changed"></i>
                                        <i class="fa fa-calendar-check-o fa-fw"></i> ${formatDate(ticket.close_date)}
                                    ` : ''}
                                </div>
                            </div>
                            <div class="ticket-status-container">
                                <span class="ticket-status">${stageName}</span>
                            </div>
                        </div>
                        <div class="ticket-details">
                            <div class="ticket-info">
                                <div class="ticket-info-item">
                                    <div class="ticket-info-icon">
                                        ${userId ? `
                                            <img src="${avatarUrl}" alt="${userName}" class="rounded-circle" style="width: 24px; height: 24px; object-fit: cover;">
                                        ` : `
                                            <i class="fa fa-user-o" style="font-size: 16px; color: var(--gray-500);"></i>
                                        `}
                                    </div>
                                    <div class="ticket-info-content">
                                        ${userName}
                                    </div>
                                </div>
                                <div class="ticket-info-item">
                                    <div class="ticket-info-icon">
                                        <i class="fa ${teamInfo.icon}"></i>
                                    </div>
                                    <div class="ticket-info-content">
                                        ${teamInfo.name}
                                    </div>
                                </div>
                            </div>
                            ${ticket.request_answer ? `
                                <div class="ticket-response">
                                    <div class="ticket-response-header">
                                        <i class="fa fa-comment-o"></i>
                                        <span>Note interne</span>
                                    </div>
                                    <div class="ticket-response-content">
                                        ${ticket.request_answer}
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Fonction modifiée pour récupérer tous les tickets
    async function fetchTickets() {
        try {
            const partnerId = await getIdToProcess();

            if (!partnerId) {
                console.log('[ODOO-EXT] Aucun ID valide trouvé');
                return null;
            }

            console.log('[ODOO-EXT] Récupération des tickets pour le partner_id:', partnerId);

            const searchPayload = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    model: "helpdesk.ticket",
                    method: "web_search_read",
                    args: [],
                    kwargs: {
                        offset: 0,
                        limit: 0, // Pas de limite pour récupérer tous les tickets
                        order: "create_date DESC, priority DESC, sla_deadline ASC, id ASC",
                        domain: [
                            ["partner_id", "=", parseInt(partnerId)]
                        ],
                        fields: [
                            "name",
                            "priority",
                            "create_date",
                            "close_date",
                            "team_id",
                            "user_id",
                            "stage_id",
                            "request_answer",
                            "description", // Ajout du champ description
                            "timesheet_ids" // Ajout du champ feuille de temps
                        ]
                    }
                },
                id: 100
            };

            const data = await makeRequest(
                'https://winprovence.odoo.com/web/dataset/call_kw/helpdesk.ticket/web_search_read',
                'POST',
                searchPayload
            );

            console.log('[ODOO-EXT] Tickets récupérés:', data);
            return data;
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la récupération des tickets:', error);
            return null;
        }
    }

    // Fonction pour récupérer l'ID selon le modèle présent dans l'URL
    async function getIdToProcess() {
        const params = new URLSearchParams(window.location.hash.slice(1));
        const model = params.get("model");
        const id = params.get("id");

        console.log(`[ODOO-EXT] Analyse de l'URL - Modèle: ${model}, ID: ${id}, URL complète: ${window.location.href}`);

        if (model === "res.partner") {
            console.log("[ODOO-EXT] ID partenaire récupéré directement:", id);
            return id;
        } else if (model === "helpdesk.ticket") {
            if (!id) {
                console.error("[ODOO-EXT] Aucun ID de ticket trouvé dans l'URL");
                return null;
            }

            console.log(`[ODOO-EXT] Récupération des détails du ticket ${id} pour trouver le client associé`);
            const ticketDetails = await fetchTicketDetails(id);

            console.log(`[ODOO-EXT] Détails du ticket ${id}:`, ticketDetails);

            if (ticketDetails && ticketDetails.partner_id) {
                console.log(`[ODOO-EXT] Partner ID récupéré depuis le ticket ${id}:`, ticketDetails.partner_id[0], ticketDetails.partner_id[1]);
                return ticketDetails.partner_id[0];
            } else {
                console.error(`[ODOO-EXT] Le ticket ${id} n'a pas de client (partner_id) associé`);
                return null;
            }
        } else if (model === "sale.order") {
            if (!id) {
                console.error("[ODOO-EXT] Aucun ID de commande trouvé dans l'URL");
                return null;
            }

            console.log(`[ODOO-EXT] Récupération des détails de la commande ${id} pour trouver le client associé`);

            const orderPayload = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    args: [[parseInt(id, 10)]],
                    model: "sale.order",
                    method: "read",
                    kwargs: {
                        fields: ["partner_id", "name"]
                    }
                },
                id: 1
            };

            try {
                console.log(`[ODOO-EXT] Requête détails commande ${id}:`, orderPayload);
                const data = await makeRequestWithDetailed(
                    'https://winprovence.odoo.com/web/dataset/call_kw/sale.order/read',
                    'POST',
                    orderPayload
                );

                if (data && data.result && data.result[0] && data.result[0].partner_id) {
                    console.log(`[ODOO-EXT] Partner ID récupéré depuis la commande ${id}:`, data.result[0].partner_id[0], data.result[0].partner_id[1]);
                    return data.result[0].partner_id[0];
                } else {
                    console.error(`[ODOO-EXT] La commande ${id} n'a pas de client (partner_id) associé ou données invalides:`, data);
                    return null;
                }
            } catch (error) {
                console.error(`[ODOO-EXT] Erreur lors de la récupération du partner_id de la commande ${id}:`, error);
                return null;
            }
        } else {
            console.error(`[ODOO-EXT] Modèle non pris en charge: ${model}. URL: ${window.location.href}`);
            return null;
        }

        console.error(`[ODOO-EXT] Impossible de récupérer l'ID du partenaire pour le modèle ${model}`);
        return null;
    }

    // Fonction pour récupérer les détails d'un ticket
    async function fetchTicketDetails(ticketId) {
        const readPayload = {
            jsonrpc: "2.0",
            method: "call",
            params: {
                args: [[parseInt(ticketId, 10)]],
                model: "helpdesk.ticket",
                method: "read",
                kwargs: {
                    context: {
                        lang: "fr_FR",
                        tz: "Europe/Paris",
                        uid: 493,
                        allowed_company_ids: [1],
                        bin_size: true,
                        params: {
                            id: parseInt(ticketId, 10),
                            menu_id: 250,
                            cids: 1,
                            action: 368,
                            model: "helpdesk.ticket",
                            view_type: "form"
                        }
                    }
                }
            },
            id: 5
        };

        try {
            console.log(`[ODOO-EXT] Requête détails ticket ${ticketId}:`, readPayload);
            const data = await makeRequestWithDetailed(
                'https://winprovence.odoo.com/web/dataset/call_kw/helpdesk.ticket/read',
                'POST',
                readPayload
            );

            console.log(`[ODOO-EXT] Détails du ticket ${ticketId} récupérés:`, data);

            if (data && data.result && Array.isArray(data.result) && data.result.length > 0) {
                return data.result[0];
            }

            console.error(`[ODOO-EXT] Réponse inattendue lors de la lecture du ticket ${ticketId}:`, data);
            return null;
        } catch (error) {
            console.error(`[ODOO-EXT] Erreur lors de la requête read du ticket ${ticketId}:`, error);
            return null;
        }
    }

    // Fonction pour vérifier si l'URL correspond aux patterns autorisés
    function isValidUrl() {
        const hash = window.location.hash;

        const isTicketPage = hash.includes("model=helpdesk.ticket") &&
                            hash.includes("view_type=form") &&
                            hash.includes("action=368");

        const isPartnerPage = hash.includes("model=res.partner") &&
                             hash.includes("view_type=form");

        const isSaleOrderPage = hash.includes("model=sale.order") &&
                               hash.includes("view_type=form");

        // Vérification si l'URL contient le paramètre showProducts
        const shouldShowProducts = hash.includes("showProducts=true");

        // Si le paramètre showProducts est présent, afficher automatiquement les produits
        if (shouldShowProducts) {
            setTimeout(() => {
                const productsButton = document.getElementById('showProductsButton');
                if (productsButton && !getProductsState()) {
                    console.log('[ODOO-EXT] Affichage automatique des produits via URL');
                    productsButton.click();
                }
            }, 1000);
        }

        const isValid = isTicketPage || isPartnerPage || isSaleOrderPage;

        if (isValid) {
            console.log('[ODOO-EXT] Page valide détectée:', {
                isTicketPage,
                isPartnerPage,
                isSaleOrderPage,
                shouldShowProducts,
                hash
            });
        }

        return isValid;
    }

    // Fonction pour traduire les stages
    function translateStage(stageName) {
        const stageTranslations = {
            'New': 'Nouveau',
            'In Progress': 'En cours',
            'Pending': 'En attente',
            'Solved': 'Résolu',
            'Canceled': 'Annulé',
            'Cancelled': 'Annulé',
            'Closed': 'Fermé',
            'Nouveau': 'Nouveau',
            'En cours': 'En cours',
            'En attente': 'En attente',
            'Résolu': 'Résolu',
            'Annulé': 'Annulé',
            'Fermé': 'Fermé'
        };
        return stageTranslations[stageName] || stageName;
    }

    // Fonction pour vérifier si nous sommes sur une vue pertinente
    function isRelevantView() {
        return document.querySelector('.o_Chatter_fixedPanel') !== null && isValidUrl();
    }

    // Fonction pour réinitialiser l'état
    function resetState() {
        console.log('[ODOO-EXT] Réinitialisation de l\'état');
        layoutModified = false;
        ticketButtonAdded = false;
        ticketButtonSelected = false;

        const hideStyle = document.getElementById('hideChatterContent');
        if (hideStyle) {
            hideStyle.remove();
        }

        const bonjourDiv = document.getElementById('bonjourMessage');
        if (bonjourDiv) {
            bonjourDiv.remove();
        }
    }

    // Fonction pour restaurer l'affichage normal
    function restoreDefaultDisplay() {
        ticketButtonSelected = false;
        const hideStyle = document.getElementById('hideChatterContent');
        if (hideStyle) {
            hideStyle.remove();
        }
        const bonjourDiv = document.getElementById('bonjourMessage');
        if (bonjourDiv) {
            bonjourDiv.style.display = 'none';
        }
    }

    // Fonction pour modifier la disposition
    function modifyLayout() {
        if (!layoutModified) {
            const borderLeft = document.querySelector('div.o_ChatterTopbar_borderLeft.flex-grow-1.pe-2.ms-2');
            if (borderLeft) {
                borderLeft.remove();
                console.log('[ODOO-EXT] BorderLeft exact supprimé');
                layoutModified = true;
            }
        }
    }

    // Fonction pour appliquer toutes les modifications
    async function applyModifications() {
        try {
            modifyLayout();
            await addTicketButton();
        } catch (error) {
            console.log('[ODOO-EXT] Erreur lors de l\'application des modifications:', error);
        }
    }

    // Fonction pour ajouter le bouton d'historique
    async function addTicketButton() {
        if (ticketButtonAdded) return;

        try {
            // Attendre que le bouton soit présent dans le DOM
            const ticketButton = await waitForElement('.o_ChatterTopbar_button .fa-life-ring');

            if (ticketButton && ticketButton.parentElement) {
                console.log('[ODOO-EXT] Clic sur le bouton ticket');
                ticketButton.parentElement.click();
                ticketButtonSelected = true;
            } else {
                console.log('[ODOO-EXT] Bouton non trouvé, nouvelle tentative dans 300ms');
                await new Promise(resolve => setTimeout(resolve, 300));
                await addTicketButton();
            }

            ticketButtonAdded = true;
        } catch (error) {
            console.log('[ODOO-EXT] Erreur lors de la modification du bouton:', error);
        }
    }

    // Fonction pour gérer la navigation (modifiée)
    async function handleNavigation(reason = 'url') {
        if (isProcessingNavigation) return;

        try {
            isProcessingNavigation = true;
            console.log(`[ODOO-EXT] Navigation détectée (${reason})`);

            // Redémarrer la vérification du thème
            startThemeChecking();

            // Réduire le délai d'attente à 100ms au lieu de 500ms
            await new Promise(resolve => setTimeout(resolve, 100));

            if (!isRelevantView()) {
                console.log('[ODOO-EXT] Vue non pertinente, skip');
                return;
            }

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
            addButtons();

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

        } finally {
            setTimeout(() => {
                isProcessingNavigation = false;
            }, 100); // Réduire le délai de déverrouillage à 100ms
        }
    }

    // Fonction pour ajouter l'historique des tickets (modifiée)
    async function addTicketHistory() {
        if (historyAdded) return;

        const formSheet = document.querySelector('.o_form_sheet');
        if (!formSheet) return;

        // Trouver le conteneur des boutons au lieu du conteneur du bouton historique spécifique
        const buttonContainer = document.querySelector('.buttons-container');
        if (!buttonContainer) return;

        // Créer la zone d'historique
        const historyContainer = document.createElement('div');
        historyContainer.id = 'zone_historique_tickets';
        historyContainer.className = 'history-container';

        // Ajouter le contenu initial avec la nouvelle structure d'en-tête
        historyContainer.innerHTML = `
            <div class="historique-header">
                <div class="historique-header-left">
                    <span>Historique des tickets</span>
                    <div id="theme-toggle-container">
                        <button id="light-theme-btn" class="theme-toggle-btn" title="Activer le thème clair">
                            <i class="fa fa-sun-o"></i>
                        </button>
                        <button id="dark-theme-btn" class="theme-toggle-btn" title="Activer le thème sombre">
                            <i class="fa fa-moon-o"></i>
                        </button>
                    </div>
                </div>
                <div class="historique-header-right">
                    <div class="ticket-filters">
                        <input type="text" class="filter-input" placeholder="Rechercher..." id="ticketSearch">
                        <select class="filter-input" id="teamFilter">
                            <option value="">Toutes les équipes</option>
                            <option value="Logiciel">Logiciel</option>
                            <option value="Materiel">Matériel</option>
                            <option value="RMA">RMA/SAV</option>
                        </select>
                    </div>
                </div>
            </div>
            <div id="ticketsList">
                <div class="no-tickets">Chargement des tickets...</div>
            </div>
        `;

        // Insérer le conteneur après les boutons
        const existingProducts = document.getElementById('zone_produits_client');
        if (existingProducts) {
            // Si produits déjà affiché, on place l'historique après
            existingProducts.insertAdjacentElement('afterend', historyContainer);
        } else {
            // Sinon, on place l'historique directement après les boutons
            buttonContainer.insertAdjacentElement('afterend', historyContainer);
        }

        // Ajouter les événements aux boutons de thème
        const lightBtn = document.getElementById('light-theme-btn');
        const darkBtn = document.getElementById('dark-theme-btn');

        if (lightBtn && darkBtn) {
            lightBtn.addEventListener('click', () => toggleTheme('light'));
            darkBtn.addEventListener('click', () => toggleTheme('dark'));

            // Mettre à jour l'état actif
            detectDarkTheme();
        }

        // Charger les tickets
        const tickets = await fetchTickets();
        if (tickets) {
            await updateTicketsList(tickets);
        }

        // Ajouter les gestionnaires d'événements pour les filtres
        setupFilters();

        // Afficher selon l'état sauvegardé
        const shouldBeVisible = getHistoryState();
        if (shouldBeVisible) {
            historyContainer.classList.add('visible');
            // Mettre à jour le bouton
            const button = document.getElementById('showHistoryButton');
            if (button) {
                button.innerHTML = '<i class="fa fa-times"></i> Masquer l\'historique';
            }
        }

        historyAdded = true;
        console.log('[ODOO-EXT] Historique des tickets ajouté');
        return historyContainer;
    }

    // Fonction pour mettre à jour la liste des tickets
    async function updateTicketsList(tickets) {
        const ticketsList = document.getElementById('ticketsList');
        if (!ticketsList) return;

        if (!tickets || !tickets.result || !tickets.result.records || tickets.result.records.length === 0) {
            ticketsList.innerHTML = '<div class="no-tickets">Aucun ticket trouvé</div>';
            return;
        }

        // Construire la liste des IDs tickets et récupérer les totaux côté serveur
        const ticketIds = tickets.result.records.map(t => t.id).filter(Boolean);

        // 0) Essayer de récupérer un champ total directement sur helpdesk.ticket si disponible
        let totalsByField = {};
        const totalField = await detectTicketTotalField();
        if (totalField) {
            try {
                // Lire seulement le champ total pour tous les tickets
                const readPayload = {
                    jsonrpc: "2.0",
                    method: "call",
                    params: {
                        model: "helpdesk.ticket",
                        method: "read",
                        args: [ticketIds],
                        kwargs: { fields: ["id", totalField] }
                    },
                    id: 203
                };
                const readRes = await makeRequest(
                    'https://winprovence.odoo.com/web/dataset/call_kw/helpdesk.ticket/read',
                    'POST',
                    readPayload
                );
                if (readRes && readRes.result && Array.isArray(readRes.result)) {
                    readRes.result.forEach(r => {
                        if (r && typeof r[totalField] === 'number') {
                            totalsByField[r.id] = r[totalField];
                        }
                    });
                }
            } catch (e) {
                console.warn('[ODOO-EXT] Lecture du champ total échouée, fallback sur aggregation:', e);
            }
        }

        // 1) Fallback agrégation serveur via read_group
        const totalsByTicket = await fetchTimesheetTotalsByTicket(ticketIds);

        // Récupérer les détails des timesheets pour les tickets n'ayant pas de total serveur
        const ticketsWithTime = await Promise.all(tickets.result.records.map(async (ticket) => {
            let timeSpent = 0;

            // 1) Priorité au champ total directement sur le ticket
            if (totalsByField && typeof totalsByField[ticket.id] === 'number') {
                timeSpent = totalsByField[ticket.id] || 0;
            }

            // 2) Sinon, utiliser le total agrégé read_group
            if (!timeSpent && totalsByTicket && typeof totalsByTicket[ticket.id] === 'number') {
                timeSpent = totalsByTicket[ticket.id] || 0;
            }

            // 3) Fallback: calcul détaillé depuis les lignes si pas de total
            if (!timeSpent && ticket.timesheet_ids && ticket.timesheet_ids.length > 0) {
                const timesheetDetails = await fetchTimesheetDetails(ticket.timesheet_ids);
                timeSpent = calculateTimeSpent(timesheetDetails);
            }

            const timeSpentFormatted = formatTimeSpent(timeSpent);

            return {
                ...ticket,
                timeSpent,
                timeSpentFormatted
            };
        }));

        const html = ticketsWithTime.map(ticket => {
            const teamInfo = getTeamIconById(ticket.team_id[0]);
            const priorityClass = getPriorityClass(ticket.priority);
            const stageName = translateStage(ticket.stage_id[1]);
            const userName = ticket.user_id ? ticket.user_id[1] : 'Non assigné';

            return `
                <div class="ticket-item ${priorityClass}" data-team="${teamInfo.name}">
                    <div class="ticket-header">
                        <span class="ticket-title">${ticket.name}</span>
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
                            ${teamInfo.name}
                        </div>
                        <div class="ticket-assignee">
                            <i class="fa fa-user"></i>
                            ${userName}
                        </div>
                        <div class="ticket-timesheet" title="Heures passées (feuilles de temps)">
                            <i class="fa fa-clock-o"></i>
                            ${formatTimeSpent(ticket.timeSpent || 0)}
                        </div>
                        <span class="ticket-status">${stageName}</span>
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

        // Ajouter un compteur de tickets
        const headerElement = document.querySelector('.historique-header span');
        if (headerElement) {
            headerElement.textContent = `Historique des tickets (${tickets.result.records.length})`;
        }
    }

    // Fonction pour configurer les filtres
    function setupFilters() {
        const searchInput = document.getElementById('ticketSearch');
        const teamFilter = document.getElementById('teamFilter');

        if (searchInput && teamFilter) {
            const filterTickets = () => {
                const searchTerm = searchInput.value.toLowerCase();
                const selectedTeam = teamFilter.value;
                const tickets = document.querySelectorAll('.ticket-item');

                tickets.forEach(ticket => {
                    const title = ticket.querySelector('.ticket-title').textContent.toLowerCase();
                    const team = ticket.dataset.team;
                    const matchesSearch = title.includes(searchTerm);
                    const matchesTeam = !selectedTeam || team === selectedTeam;

                    ticket.style.display = matchesSearch && matchesTeam ? '' : 'none';
                });
            };

            searchInput.addEventListener('input', filterTickets);
            teamFilter.addEventListener('change', filterTickets);
        }
    }

    // Fonction pour récupérer les produits du client
    async function fetchClientProducts() {
        try {
            const partnerId = await getIdToProcess();

            if (!partnerId) {
                console.log('[ODOO-EXT] Aucun ID de client valide trouvé');
                return null;
            }

            console.log('[ODOO-EXT] Récupération des produits pour le partner_id:', partnerId);

            // Utilisation de l'API de traçabilité pour récupérer les produits
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

            console.log('[ODOO-EXT] Envoi de la requête de traçabilité pour le partenaire:', partnerId);

            const response = await makeRequestWithDetailed(
                "https://winprovence.odoo.com/web/dataset/call_kw/stock.traceability.report/get_html",
                "POST",
                payload
            );

            if (!response || !response.result || !response.result.html) {
                console.error("[ODOO-EXT] Réponse inattendue lors de la récupération de la traçabilité:", response);
                return null;
            }

            // Parser le HTML pour extraire les informations
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.result.html, 'text/html');
            const rows = doc.querySelectorAll('tr[data-id]');

            console.log('[ODOO-EXT] Nombre de lignes trouvées:', rows.length);

            // Regrouper les produits par référence
            const groupedProducts = {};
            Array.from(rows).forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 7) {
                    const reference = cells[0].textContent.trim();
                    const productCell = cells[1].textContent.trim();
                    const productMatch = productCell.match(/\[(.*?)\]\s*(.*)/);
                    const productCode = productMatch ? productMatch[1] : '';
                    const productName = productMatch ? productMatch[2] : productCell;
                    const date = cells[2].textContent.trim();
                    const lot = cells[3].textContent.trim();
                    const quantity = cells[6].textContent.trim();

                    // Ne garder que les références qui commencent par SORTIE ou EXPEDITIONS
                    if (reference.startsWith('SORTIE') || reference.startsWith('EXPEDITIONS')) {
                        const isExpress = reference.includes('EXPRESS');
                        if (!groupedProducts[reference]) {
                            groupedProducts[reference] = {
                                date: date,
                                isExpress: isExpress,
                                products: {}
                            };
                        }

                        // Créer une clé unique pour le produit
                        const productKey = `${productCode}-${productName}`;

                        if (!groupedProducts[reference].products[productKey]) {
                            groupedProducts[reference].products[productKey] = {
                                code: productCode,
                                name: productName,
                                lots: [],
                                totalQuantity: 0
                            };
                        }

                        // Ajouter le lot et mettre à jour la quantité
                        if (lot) {
                            groupedProducts[reference].products[productKey].lots.push(lot);
                        }
                        groupedProducts[reference].products[productKey].totalQuantity += parseFloat(quantity) || 0;
                    }
                }
            });

            // Transformer les données en format compatible avec l'affichage existant
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

            console.log('[ODOO-EXT] Produits transformés:', products);
            return products;

        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la récupération des produits:', error);
            return null;
        }
    }

    // Fonction améliorée pour faire des requêtes HTTP avec des détails de réponse
    function makeRequestWithDetailed(url, method, data) {
        return new Promise((resolve, reject) => {
            const startTime = new Date().getTime();
            console.log(`[ODOO-EXT] Début de la requête ${method} vers ${url}`);

            GM_xmlhttpRequest({
                method: method,
                url: url,
                data: data ? JSON.stringify(data) : null,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': '*/*',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
                },
                onload: function(response) {
                    const endTime = new Date().getTime();
                    const duration = endTime - startTime;

                    console.log(`[ODOO-EXT] Réponse reçue en ${duration}ms avec statut: ${response.status}`);
                    console.log(`[ODOO-EXT] En-têtes de réponse:`, response.responseHeaders);

                    try {
                        const data = JSON.parse(response.responseText);
                        console.log('[ODOO-EXT] Réponse décodée:', data);
                        resolve(data);
                    } catch (error) {
                        console.error('[ODOO-EXT] Erreur de décodage JSON:', error);
                        console.log('[ODOO-EXT] Réponse brute:', response.responseText.substring(0, 500) + '...');
                        reject(error);
                    }
                },
                onerror: function(error) {
                    console.error('[ODOO-EXT] Erreur réseau lors de la requête:', error);
                    reject(error);
                }
            });
        });
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
            const type = getProductType(product.type);
            const typeClass = getProductTypeClass(product.type);
            const price = product.list_price ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(product.list_price) : 'N/A';
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
                        <div class="product-price">
                            <i class="fa fa-euro"></i>
                            ${price}
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
                    const title = product.querySelector('.product-title').textContent.toLowerCase();
                    const type = product.dataset.type;
                    const matchesSearch = title.includes(searchTerm);
                    const matchesType = !selectedType || type === selectedType;

                    product.style.display = matchesSearch && matchesType ? '' : 'none';
                });
            };

            searchInput.addEventListener('input', filterProducts);
            typeFilter.addEventListener('change', filterProducts);
        }
    }

    // Fonction pour obtenir le libellé du type de produit
    function getProductType(type) {
        switch(type) {
            case 'product':
                return 'Matériel';
            case 'service':
                return 'Service';
            case 'consu':
                return 'Consommable';
            default:
                return 'Produits';
        }
    }

    // Fonction pour obtenir la classe CSS du type de produit
    function getProductTypeClass(type) {
        switch(type) {
            case 'product':
                return 'hardware-product';
            case 'service':
                return 'service-product';
            case 'consu':
                return 'software-product';
            default:
                return 'produit-badge';
        }
    }

    // Fonction pour ajouter la section produits du client
    async function addClientProducts() {
        if (productsAdded) return;

        const formSheet = document.querySelector('.o_form_sheet');
        if (!formSheet) return;

        // Trouver le conteneur des boutons
        const buttonContainer = document.querySelector('.buttons-container');
        if (!buttonContainer) return;

        // Créer la zone de produits
        const productsContainer = document.createElement('div');
        productsContainer.id = 'zone_produits_client';
        productsContainer.className = 'products-container';

        // Ajouter le contenu initial avec la structure d'en-tête
        productsContainer.innerHTML = `
            <div class="produits-header">
                <div class="produits-header-left">
                    <span>Produits du client</span>
                    <div id="theme-toggle-container-products">
                        <button id="light-theme-btn-products" class="theme-toggle-btn" title="Activer le thème clair">
                            <i class="fa fa-sun-o"></i>
                        </button>
                        <button id="dark-theme-btn-products" class="theme-toggle-btn" title="Activer le thème sombre">
                            <i class="fa fa-moon-o"></i>
                        </button>
                    </div>
                </div>
                <div class="produits-header-right">
                    <div class="product-filters">
                        <input type="text" class="filter-input" placeholder="Rechercher..." id="productSearch">
                        <select class="filter-input" id="typeFilter">
                            <option value="">Tous les types</option>
                            <option value="product">Matériel</option>
                            <option value="consu">Consommable</option>
                            <option value="service">Service</option>
                        </select>
                    </div>
                </div>
            </div>
            <div id="productsList">
                <div class="no-products">Chargement des produits...</div>
            </div>
        `;

        // Ajouter après le conteneur des boutons
        buttonContainer.insertAdjacentElement('afterend', productsContainer);
        console.log('[ODOO-EXT] Conteneur des produits créé:', productsContainer);
        console.log('[ODOO-EXT] ID du conteneur:', productsContainer.id);
        console.log('[ODOO-EXT] Classes du conteneur:', productsContainer.className);

        // Vérifier que le conteneur est bien dans le DOM
        const verifyContainer = document.getElementById('zone_produits_client');
        if (verifyContainer) {
            console.log('[ODOO-EXT] Conteneur trouvé dans le DOM');
        } else {
            console.error('[ODOO-EXT] ERREUR: Conteneur non trouvé dans le DOM après insertion');
        }

        // Ajouter les événements aux boutons de thème
        const lightBtn = document.getElementById('light-theme-btn-products');
        const darkBtn = document.getElementById('dark-theme-btn-products');

        if (lightBtn && darkBtn) {
            lightBtn.addEventListener('click', () => toggleTheme('light'));
            darkBtn.addEventListener('click', () => toggleTheme('dark'));

            // Mettre à jour l'état actif
            detectDarkTheme();
        }

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
            productsContainer.style.display = 'flex';
            // Mettre à jour le bouton
            const button = document.getElementById('showProductsButton');
            if (button) {
                button.innerHTML = '<i class="fa fa-times"></i> Masquer les produits';
            }
        } else {
            productsContainer.classList.remove('visible');
            productsContainer.style.display = 'none';
        }

        productsAdded = true;
        console.log('[ODOO-EXT] Produits du client ajoutés');
        return productsContainer;
    }

    // Fonction pour ajouter les boutons d'historique et de produits
    function addButtons() {
        if (historyButtonAdded && productsButtonAdded) return;

        const formSheet = document.querySelector('.o_form_sheet');
        if (!formSheet) return;

        // Vérifier si le conteneur de boutons existe déjà
        let buttonContainer = document.querySelector('.buttons-container');

        // Créer le conteneur pour les boutons s'il n'existe pas
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'buttons-container';
            formSheet.appendChild(buttonContainer); // Remettre à l'emplacement d'origine
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
                        productsContainer.style.display = 'none';
                        productsButton.innerHTML = '<i class="fa fa-cubes"></i> Produits du client';
                        saveProductsState(false);
                    } else {
                        productsContainer.classList.add('visible');
                        productsContainer.style.display = 'flex';
                        productsButton.innerHTML = '<i class="fa fa-times"></i> Masquer les produits';
                        saveProductsState(true);
                    }
                } else {
                    addClientProducts().then((newContainer) => {
                        if (newContainer) {
                            newContainer.classList.add('visible');
                            newContainer.style.display = 'flex';
                            saveProductsState(true);
                            productsButton.innerHTML = '<i class="fa fa-times"></i> Masquer les produits';
                        }
                    });
                }
            });

            buttonContainer.appendChild(productsButton);
            productsButtonAdded = true;
            updateProductsButton();
        }
    }

    // Observer les changements dans le DOM
    const viewObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.target.classList &&
                (mutation.target.classList.contains('o_content') ||
                 mutation.target.classList.contains('o_action_manager'))) {
                handleNavigation('view');
                break;
            }
        }
    });

    viewObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    // Gestionnaires d'événements de navigation
    ['popstate', 'hashchange'].forEach(event => {
        window.addEventListener(event, () => {
            console.log(`[ODOO-EXT] Événement ${event} détecté`);
            setTimeout(() => handleNavigation(event), 300);
        });
    });

    // Gestionnaire de clic global
    document.addEventListener('click', function(event) {
        const chatterToolbar = event.target.closest('.o_ChatterTopbar_tools');
        const bonjourMessage = event.target.closest('#bonjourMessage');
        const chatterTopbar = event.target.closest('.o_Chatter_topbar');

        if (!chatterToolbar && !bonjourMessage && !chatterTopbar) {
            restoreDefaultDisplay();
        }
    });

    // Initialisation
    handleNavigation('initial');

    // Fonction pour générer l'URL d'accès direct aux produits du client
    function generateProductsUrl() {
        try {
            const currentUrl = window.location.href;
            // Si l'URL contient déjà le paramètre showProducts, ne rien faire
            if (currentUrl.includes('showProducts=true')) {
                return currentUrl;
            }

            // Vérifier si l'URL contient déjà des paramètres
            if (currentUrl.includes('#')) {
                // Ajouter le paramètre showProducts=true à la fin
                return currentUrl + (currentUrl.includes('?') ? '&' : '?') + 'showProducts=true';
            } else {
                // Si pas de fragment (#), ajouter un fragment vide puis le paramètre
                return currentUrl + '#?showProducts=true';
            }
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la génération de l\'URL:', error);
            return window.location.href;
        }
    }

    // Ajouter un bouton pour copier l'URL des produits
    function addCopyUrlButton() {
        // Chercher le conteneur des boutons de produits
        const productsHeader = document.querySelector('.produits-header-right');
        if (!productsHeader || document.getElementById('copyProductsUrlButton')) {
            return;
        }

        // Créer le bouton pour copier l'URL
        const copyButton = document.createElement('button');
        copyButton.id = 'copyProductsUrlButton';
        copyButton.innerHTML = '<i class="fa fa-link"></i> Copier l\'URL';
        copyButton.title = 'Copier l\'URL pour accéder directement aux produits';
        copyButton.className = 'filter-input';
        copyButton.style.marginLeft = '10px';
        copyButton.style.cursor = 'pointer';

        // Ajouter l'événement de clic
        copyButton.addEventListener('click', function() {
            const url = generateProductsUrl();
            navigator.clipboard.writeText(url)
                .then(() => {
                    // Changer temporairement le texte du bouton pour indiquer la réussite
                    const originalText = copyButton.innerHTML;
                    copyButton.innerHTML = '<i class="fa fa-check"></i> URL copiée!';
                    copyButton.style.backgroundColor = 'var(--hist-btn-bg)';
                    copyButton.style.color = 'white';

                    // Restaurer le texte original après 2 secondes
                    setTimeout(() => {
                        copyButton.innerHTML = originalText;
                        copyButton.style.backgroundColor = '';
                        copyButton.style.color = '';
                    }, 2000);
                })
                .catch(err => {
                    console.error('[ODOO-EXT] Erreur lors de la copie de l\'URL:', err);
                    alert('Impossible de copier l\'URL. Veuillez réessayer.');
                });
        });

        // Ajouter le bouton au conteneur
        productsHeader.appendChild(copyButton);
        console.log('[ODOO-EXT] Bouton de copie d\'URL ajouté');
    }

    // Fonction pour diagnostiquer les problèmes liés aux produits clients
    async function diagnoseProductsIssue() {
        try {
            console.log('[ODOO-EXT] === DÉBUT DIAGNOSTIC PRODUITS CLIENTS ===');

            // 1. Vérifier l'URL actuelle
            console.log('[ODOO-EXT] URL actuelle:', window.location.href);

            // 2. Tenter de récupérer l'ID du client
            const partnerId = await getIdToProcess();
            console.log('[ODOO-EXT] ID du client détecté:', partnerId);

            if (!partnerId) {
                console.error('[ODOO-EXT] ERREUR: Impossible d\'obtenir l\'ID du client. Vérifiez que vous êtes sur une page cliente, un ticket ou une commande.');
                return;
            }

            // 3. Tester une requête simple pour vérifier les droits d'accès
            console.log('[ODOO-EXT] Test de connexion à l\'API Odoo...');

            const testPayload = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    model: "res.partner",
                    method: "read",
                    args: [[parseInt(partnerId)]],
                    kwargs: {
                        fields: ["name", "email", "phone"]
                    }
                },
                id: 99999
            };

            const testResponse = await makeRequestWithDetailed(
                'https://winprovence.odoo.com/web/dataset/call_kw/res.partner/read',
                'POST',
                testPayload
            );

            if (testResponse && testResponse.result) {
                console.log('[ODOO-EXT] Test API réussi:', testResponse.result);
            } else {
                console.error('[ODOO-EXT] ERREUR: Test API échoué, problème d\'accès à l\'API Odoo');
            }

            // 4. Vérifier si le modèle product.product est accessible
            console.log('[ODOO-EXT] Test d\'accès au modèle product.product...');

            const productModelPayload = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    model: "product.product",
                    method: "search_read",
                    args: [],
                    kwargs: {
                        domain: [],
                        fields: ["name"],
                        limit: 1
                    }
                },
                id: 99998
            };

            const productModelResponse = await makeRequestWithDetailed(
                'https://winprovence.odoo.com/web/dataset/call_kw/product.product/search_read',
                'POST',
                productModelPayload
            );

            if (productModelResponse && productModelResponse.result) {
                console.log('[ODOO-EXT] Accès au modèle product.product réussi:', productModelResponse.result);
            } else {
                console.error('[ODOO-EXT] ERREUR: Impossible d\'accéder au modèle product.product');
            }

            // 5. Tester spécifiquement la requête de produits clients
            console.log('[ODOO-EXT] Test de la requête de produits clients...');

            const productsPayload = {
                jsonrpc: "2.0",
                method: "call",
                params: {
                    model: "product.product",
                    method: "web_search_read",
                    args: [],
                    kwargs: {
                        domain: [
                            ["partner_ids", "in", [parseInt(partnerId)]]
                        ],
                        fields: ["name", "type"],
                        limit: 5
                    }
                },
                id: 99997
            };

            const productsResponse = await makeRequestWithDetailed(
                'https://winprovence.odoo.com/web/dataset/call_kw/product.product/web_search_read',
                'POST',
                productsPayload
            );

            if (productsResponse && productsResponse.result) {
                if (productsResponse.result.records && productsResponse.result.records.length > 0) {
                    console.log('[ODOO-EXT] Requête produits clients réussie:', productsResponse.result.records);
                } else {
                    console.warn('[ODOO-EXT] Aucun produit associé à ce client. Vérifiez que le champ partner_ids est configuré sur au moins un produit.');
                }
            } else {
                console.error('[ODOO-EXT] ERREUR: Échec de la requête de produits clients');
            }

            console.log('[ODOO-EXT] === FIN DIAGNOSTIC PRODUITS CLIENTS ===');

        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors du diagnostic:', error);
        }
    }

    // Fonction pour mettre à jour le bouton des produits
    function updateProductsButton() {
        try {
            const button = document.getElementById('showProductsButton');
            if (!button) return;

            // Ajouter un menu contextuel au bouton
            button.oncontextmenu = function(e) {
                e.preventDefault();
                diagnoseProductsIssue();
                return false;
            };

            // Ajouter un attribut title pour indiquer cette fonctionnalité
            button.title = 'Clic gauche: Afficher/masquer les produits | Clic droit: Diagnostiquer les problèmes';
        } catch (error) {
            console.error('[ODOO-EXT] Erreur lors de la mise à jour du bouton produits:', error);
        }
    }
})();
