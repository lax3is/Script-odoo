// ==UserScript==
// @name         Bouton Traiter l'Appel Odoo
// @namespace    http://tampermonkey.net/
// @version      2.1.6
// @description  Ajoute un bouton "Traiter l'appel" avec texte clignotant
// @author       Alexis.sair
// @match        https://winprovence.odoo.com/*
// @match        http://winprovence.odoo.com/*
// @updateURL    https://raw.githubusercontent.com/lax3is/Script-odoo/refs/heads/main/Bouton Traiter l'Appel Odoo.js
// @downloadURL  https://raw.githubusercontent.com/lax3is/Script-odoo/refs/heads/main/Bouton Traiter l'Appel Odoo.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log("Script de traitement d'appel démarré");

    let intervalId = null; // Pour stocker l'ID de l'intervalle de clignotement

    // Fonction pour sauvegarder l'état du traitement
    function sauvegarderEtat(enTraitement, ticketId) {
        console.log("Sauvegarde de l'état:", enTraitement, "pour le ticket:", ticketId);
        localStorage.setItem('etatTraitement_' + ticketId, enTraitement.toString());
        localStorage.setItem('dernierChangement_' + ticketId, new Date().getTime().toString());
    }

    // Fonction pour récupérer l'état du traitement
    function recupererEtat(ticketId) {
        const etat = localStorage.getItem('etatTraitement_' + ticketId) === 'true';
        console.log("Récupération de l'état pour le ticket", ticketId, ":", etat);
        return etat;
    }

    // Fonction pour obtenir l'ID du ticket actuel depuis l'URL
    function obtenirTicketId() {
        // Chercher d'abord dans le titre de la page qui contient généralement le numéro du ticket
        const title = document.title;
        let match = title.match(/[#](\d+)/);
        if (match) {
            console.log("ID du ticket trouvé dans le titre:", match[1]);
            return match[1];
        }

        // Chercher dans le fil d'Ariane
        const breadcrumb = document.querySelector('.o_breadcrumb');
        if (breadcrumb) {
            match = breadcrumb.textContent.match(/[#](\d+)/);
            if (match) {
                console.log("ID du ticket trouvé dans le fil d'Ariane:", match[1]);
                return match[1];
            }
        }

        // Chercher dans l'URL
        match = window.location.href.match(/[#&]id=(\d+)/);
        if (match) {
            console.log("ID du ticket trouvé dans l'URL:", match[1]);
            return match[1];
        }

        // Chercher dans le contenu de la page
        const pageContent = document.body.textContent;
        match = pageContent.match(/Ticket\s+[#](\d+)/i);
        if (match) {
            console.log("ID du ticket trouvé dans le contenu:", match[1]);
            return match[1];
        }

        console.log("Aucun ID de ticket trouvé");
        return null;
    }

    // Fonction pour trouver un bouton par son texte
    function trouverBoutonParTexte(texte) {
        const boutons = Array.from(document.getElementsByTagName('button'));
        return boutons.find(button => button.textContent.trim() === texte);
    }

    // Fonction pour trouver le bouton ME L'ASSIGNER
    function trouverBoutonAssigner() {
        // Essayer plusieurs sélecteurs pour trouver le bouton
        return document.querySelector('button[name="assign_ticket_to_self"]') ||
               document.querySelector('button.btn.btn-primary[data-hotkey="g"]') ||
               Array.from(document.getElementsByTagName('button')).find(btn => {
                   const span = btn.querySelector('span');
                   return span && span.textContent.trim().toLowerCase() === "me l'assigner";
               });
    }

    // Fonction pour trouver le bouton LANCER
    function trouverBoutonLancer() {
        // Chercher d'abord dans la barre d'état
        const statusbar = document.querySelector('.o_statusbar_buttons');
        if (statusbar) {
            // Chercher le bouton LANCER dans la barre d'état
            const buttons = Array.from(statusbar.getElementsByTagName('button'));
            const btnLancer = buttons.find(btn =>
                btn.getAttribute('name') === 'start_ticket' &&
                btn.getAttribute('type') === 'object'
            );
            if (btnLancer) return btnLancer;
        }
        // Fallback: chercher dans toute la page
        return document.querySelector('button[name="start_ticket"][type="object"]');
    }

    // Fonction pour trouver le bouton ARRÊTER
    function trouverBoutonArreter() {
        return document.querySelector('button[name="stop_ticket"][type="object"]');
    }

    // Fonction pour trouver le bouton PAUSE
    function trouverBoutonPause() {
        return document.querySelector('button[name="pause_ticket"][type="object"]');
    }

    // Fonction pour attendre l'apparition d'un bouton
    function attendreBouton(selectorFn, maxAttempts = 10) {
        return new Promise((resolve) => {
            let attempts = 0;
            const checkButton = () => {
                const button = selectorFn();
                if (button) {
                    resolve(button);
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(checkButton, 300);
                } else {
                    resolve(null);
                }
            };
            checkButton();
        });
    }

    // Fonction pour masquer les boutons du timer
    function masquerBoutonsTimer() {
        const style = document.createElement('style');
        style.textContent = `
            button[name="action_timer_start"],
            button[name="action_timer_pause"],
            button[name="action_timer_resume"],
            button[name="action_timer_stop"] {
                visibility: hidden !important;
                position: absolute !important;
                left: -9999px !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Fonction pour simuler le raccourci clavier Alt+Z
    function simulerRaccourciTimer() {
        const event = new KeyboardEvent('keydown', {
            key: 'z',
            code: 'KeyZ',
            altKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    // Fonction pour simuler le raccourci clavier Alt+W
    function simulerRaccourciPause() {
        const event = new KeyboardEvent('keydown', {
            key: 'w',
            code: 'KeyW',
            altKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    // Fonction pour simuler le raccourci clavier Alt+Q
    function simulerRaccourciStop() {
        const event = new KeyboardEvent('keydown', {
            key: 'q',
            code: 'KeyQ',
            altKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);
    }

    // Fonction pour démarrer le timer avec le raccourci clavier
    async function demarrerTimer(ticketId) {
        try {
            // Attendre que la page soit complètement chargée
            await new Promise(resolve => {
                const checkPage = () => {
                    if (document.readyState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkPage, 100);
                    }
                };
                checkPage();
            });

            // Simuler Alt+Z
            console.log("Simulation du raccourci Alt+Z");
            simulerRaccourciTimer();

            // Attendre un peu pour s'assurer que l'action est prise en compte
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        } catch (error) {
            console.error("Erreur lors du démarrage du timer:", error);
            return false;
        }
    }

    // Fonction pour mettre en pause le timer
    async function mettreEnPauseTimer() {
        try {
            // Attendre que la page soit complètement chargée
            await new Promise(resolve => {
                const checkPage = () => {
                    if (document.readyState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkPage, 100);
                    }
                };
                checkPage();
            });

            // Simuler Alt+W
            console.log("Simulation du raccourci Alt+W");
            simulerRaccourciPause();

            // Attendre un peu pour s'assurer que l'action est prise en compte
            await new Promise(resolve => setTimeout(resolve, 500));
            return true;
        } catch (error) {
            console.error("Erreur lors de la mise en pause du timer:", error);
            return false;
        }
    }

    // Fonction pour arrêter complètement le timer
    async function arreterTimer() {
        try {
            // Attendre que la page soit chargée
            await new Promise(resolve => {
                const checkPage = () => {
                    if (document.readyState === 'complete') {
                        resolve();
                    } else {
                        setTimeout(checkPage, 100);
                    }
                };
                checkPage();
            });

            // Simuler Alt+Z pour mettre en pause
            console.log("Simulation du raccourci Alt+Z");
            simulerRaccourciTimer();

            // Attendre avant d'envoyer Alt+Q
            await new Promise(resolve => setTimeout(resolve, 500));

            // Simuler Alt+Q pour arrêter
            console.log("Simulation du raccourci Alt+Q");
            simulerRaccourciStop();

            return true;
        } catch (error) {
            console.error("Erreur lors de l'arrêt du timer:", error);
            return false;
        }
    }

    // Fonction pour vérifier l'état du timer
    function verifierEtatTimer() {
        const btnLancer = document.querySelector('button[name="action_timer_start"][type="object"]');
        const btnPause = document.querySelector('button[name="action_timer_pause"][type="object"]');
        const btnRelancer = document.querySelector('button[name="action_timer_resume"][type="object"]');

        if (btnRelancer) {
            return 'relancer';
        } else if (btnPause) {
            return 'pause';
        } else if (btnLancer) {
            return 'lancer';
        }
        return null;
    }

    // Fonction pour créer le bouton
    function ajouterBoutonTraiter() {
        console.log("Tentative d'ajout du bouton");
        const statusbar = document.querySelector('.o_statusbar_buttons, .o_form_statusbar .o_statusbar_buttons');
        if (statusbar && !document.getElementById('btn-traiter-appel')) {
            console.log("Barre de statut trouvée, ajout du bouton");
            const btn = document.createElement('button');
            btn.id = 'btn-traiter-appel';

            const ticketId = obtenirTicketId();
            console.log("ID du ticket pour le bouton:", ticketId);
            let enTraitement = ticketId ? recupererEtat(ticketId) : false;

            // Vérifier si le timer est en pause et si le ticket est assigné
            const etatTimer = verifierEtatTimer();
            const estEnPause = etatTimer === 'relancer';
            const estAssigne = !trouverBoutonAssigner();

            if (enTraitement) {
                btn.innerText = 'Mettre en Attente';
                btn.className = 'btn btn-warning';
                setTimeout(() => {
                    ajouterTexteCligonotant();
                }, 500);
            } else {
                // Toujours afficher 'Traiter l\'appel' si non en traitement
                btn.innerText = 'Traiter l\'appel';
                btn.className = 'btn btn-primary';
            }

            btn.style.marginRight = '5px';
            statusbar.insertBefore(btn, statusbar.firstChild);

            // Ajouter l'événement click
            btn.addEventListener('click', async function() {
                console.log("Bouton cliqué");
                enTraitement = !enTraitement;

                if (enTraitement) {
                    // Vérifier l'état du timer pour déterminer l'action
                    const etatTimer = verifierEtatTimer();
                    const estEnPause = etatTimer === 'relancer';

                    if (estEnPause) {
                        // Cas 3: Reprendre l'appel
                        console.log("Reprise de l'appel");
                        btn.innerText = 'Mettre en Attente';
                        btn.className = 'btn btn-warning';
                        ajouterTexteCligonotant();
                        
                        // Relancer le timer avec Alt+W
                        simulerRaccourciPause();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } else {
                        // Cas 1: Traiter l'appel
                        console.log("Traitement de l'appel");
                        btn.innerText = 'Mettre en Attente';
                        btn.className = 'btn btn-warning';
                        ajouterTexteCligonotant();

                        // Vérifier si le bouton ME L'ASSIGNER est disponible
                        const btnAssigner = trouverBoutonAssigner();
                        if (btnAssigner) {
                            console.log("Bouton ME L'ASSIGNER trouvé, clic automatique");
                            btnAssigner.click();
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }

                        // Démarrer le timer avec Alt+Z
                        simulerRaccourciTimer();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }

                    if (ticketId) {
                        sauvegarderEtat(true, ticketId);
                    }

                    // Sauvegarder les changements
                    const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                    if (btnEnregistrer) {
                        console.log("Première sauvegarde");
                        btnEnregistrer.click();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        console.log("Deuxième sauvegarde");
                        btnEnregistrer.click();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } else {
                    // Cas 2: Mettre en pause
                    console.log("Mise en pause de l'appel");
                    btn.innerText = 'Traiter l\'appel';
                    btn.className = 'btn btn-primary';
                    supprimerTexteCligonotant();

                    if (ticketId) {
                        sauvegarderEtat(false, ticketId);
                    }

                    // Mettre en pause avec Alt+W
                    simulerRaccourciPause();
                    await new Promise(resolve => setTimeout(resolve, 3000));

                    // Sauvegarder les changements
                    const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                    if (btnEnregistrer) {
                        console.log("Première sauvegarde");
                        btnEnregistrer.click();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        console.log("Deuxième sauvegarde");
                        btnEnregistrer.click();
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
            });
        } else {
            console.log("Barre de statut non trouvée ou bouton déjà existant");
        }
    }

    // Fonction pour supprimer le texte clignotant
    function supprimerTexteCligonotant() {
        console.log("Suppression du texte clignotant");
        const texteContainer = document.getElementById('texte-clignotant-container');
        if (texteContainer) {
            texteContainer.remove();
        }
    }

    // Fonction pour ajouter le texte clignotant
    function ajouterTexteCligonotant() {
        console.log("Ajout du texte clignotant");

        // Vérifier si l'élément existe déjà
        if (document.getElementById('texte-clignotant-container')) {
            console.log("Le texte clignotant existe déjà");
            return;
        }

        // Trouver la zone de réponse
        const reponseField = document.querySelector('div#request_answer.note-editable');
        if (!reponseField) {
            console.log("Zone de réponse non trouvée");
            return;
        }

        // Créer le conteneur
        const container = document.createElement('div');
        container.id = 'texte-clignotant-container';
        container.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 10px;
            margin-right: 10px;
            padding: 5px;
        `;

        // Ajouter l'image de chargement
        const loadingImg = document.createElement('img');
        loadingImg.src = 'https://i.gifer.com/XOsX.gif';
        loadingImg.style.width = '25px';
        loadingImg.style.height = '25px';
        loadingImg.style.flexShrink = '0';

        // Créer le texte
        const textElement = document.createElement('span');
        textElement.innerText = 'Traitement de l\'appel en cours ...';
        textElement.style.cssText = `
            color: #ff0000;
            font-weight: bold;
            white-space: nowrap;
            display: inline;
        `;

        // Assembler le tout
        container.appendChild(loadingImg);
        container.appendChild(textElement);

        // Créer un span pour wrapper le conteneur
        const wrapper = document.createElement('span');
        wrapper.style.cssText = `
            display: inline-block;
            margin-right: 5px;
        `;
        wrapper.appendChild(container);

        // Insérer au début de la zone de réponse
        if (reponseField.firstChild) {
            reponseField.insertBefore(wrapper, reponseField.firstChild);
        } else {
            reponseField.appendChild(wrapper);
        }

        // Ajouter un espace après le wrapper
        const space = document.createTextNode(' ');
        wrapper.after(space);
    }

    // Fonction pour vérifier l'état du traitement
    function verifierEtatTraitement() {
        const boutonTraiter = document.getElementById('btn-traiter-appel');
        const ticketId = obtenirTicketId();
        const etatStocke = ticketId ? recupererEtat(ticketId) : false;

        if (boutonTraiter && boutonTraiter.innerText === 'Mettre en Attente') {
            return true;
        } else if (etatStocke) {
            // Si l'état stocké indique un traitement en cours mais le bouton n'est pas trouvé,
            // on force la création du bouton et on restaure l'état
            ajouterBoutonTraiter();
            // On vérifie à nouveau après un court délai
            return new Promise(resolve => {
                setTimeout(() => {
                    const boutonTraiter = document.getElementById('btn-traiter-appel');
                    if (boutonTraiter) {
                        boutonTraiter.innerText = 'Mettre en Attente';
                        boutonTraiter.className = 'btn btn-warning';
                        ajouterTexteCligonotant();
                    }
                    resolve(boutonTraiter && boutonTraiter.innerText === 'Mettre en Attente');
                }, 300);
            });
        }
        return false;
    }

    // Fonction pour vérifier si le ticket est résolu
    function estTicketResolu() {
        return document.querySelector('button.btn.o_arrow_button_current[data-value="4"]') !== null;
    }

    // Fonction pour gérer la clôture du ticket
    function gererClotureTicket() {
        // Vérifier régulièrement si le ticket devient résolu
        setInterval(async () => {
            if (estTicketResolu()) {
                console.log("Ticket résolu détecté");
                
                // Vérifier si le timer est en cours
                const etatTimer = verifierEtatTimer();
                if (etatTimer === 'pause' || etatTimer === 'relancer') {
                    console.log("Timer en cours détecté, arrêt complet du timer");

                    // Forcer la fin de traitement
                    const ticketId = obtenirTicketId();
                    if (ticketId) {
                        sauvegarderEtat(false, ticketId);
                    }

                    // Séquence d'arrêt : Alt+Z puis Alt+Q
                    console.log("Exécution de la séquence d'arrêt Alt+Z puis Alt+Q");
                    simulerRaccourciTimer(); // Alt+Z

                    // Attendre avant Alt+Q
                    await new Promise(resolve => setTimeout(resolve, 500));
                    simulerRaccourciStop(); // Alt+Q

                    // Attendre avant de continuer
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Mettre à jour le bouton
                    const boutonTraiter = document.getElementById('btn-traiter-appel');
                    if (boutonTraiter) {
                        boutonTraiter.innerText = 'Traiter l\'appel';
                        boutonTraiter.className = 'btn btn-primary';
                    }

                    // Supprimer le texte clignotant
                    supprimerTexteCligonotant();

                    // Attendre un peu pour s'assurer que le texte est bien supprimé
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Faire un double clic sur le bouton de sauvegarde
                    const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                    if (btnEnregistrer) {
                        console.log("Enregistrement des modifications après clôture (premier clic)");
                        btnEnregistrer.click();
                        
                        // Attendre un peu et cliquer une deuxième fois
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        console.log("Enregistrement des modifications après clôture (deuxième clic)");
                        btnEnregistrer.click();
                    }
                }
            }
        }, 1000);
    }

    // Fonction pour modifier le style du bouton de clôture
    function modifierBoutonCloture() {
        const boutonCloture = document.querySelector('button[name="close_ticket"][type="object"]');
        if (boutonCloture) {
            boutonCloture.className = 'btn btn-danger';
            boutonCloture.style.backgroundColor = '#dc3545';
            boutonCloture.style.borderColor = '#dc3545';
        }
    }

    // Fonction pour créer le bouton "Créer un ticket"
    function ajouterBoutonCreerTicket() {
        console.log("Tentative d'ajout du bouton Créer un ticket");
        const statusbar = document.querySelector('.o_statusbar_buttons, .o_form_statusbar .o_statusbar_buttons');
        if (statusbar && !document.getElementById('btn-creer-ticket')) {
            console.log("Barre de statut trouvée, ajout du bouton Créer un ticket");
            const btn = document.createElement('button');
            btn.id = 'btn-creer-ticket';
            btn.innerText = 'Créer un ticket';
            btn.className = 'btn btn-success';
            btn.style.marginRight = '5px';
            btn.style.marginLeft = 'auto';
            btn.style.order = '9999';
            
            // Ajouter l'événement click
            btn.addEventListener('click', function() {
                console.log("Bouton Créer un ticket cliqué");
                
                // Récupérer le nom de la pharmacie
                const clientElement = document.querySelector('.o_field_widget[name="partner_id"] input');
                if (clientElement) {
                    const nomPharmacie = clientElement.value;
                    console.log("Nom de la pharmacie récupéré:", nomPharmacie);
                    
                    // Stocker temporairement le nom dans le localStorage
                    localStorage.setItem('pharmacie_a_copier', nomPharmacie);
                }

                // Nettoyer tous les états de traitement existants
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('etatTraitement_')) {
                        localStorage.removeItem(key);
                    }
                    if (key && key.startsWith('dernierChangement_')) {
                        localStorage.removeItem(key);
                    }
                }
                
                // Rediriger vers la page de création de ticket
                window.location.href = 'https://winprovence.odoo.com/web?debug=#menu_id=250&cids=1&action=368&model=helpdesk.ticket&view_type=form';
            });

            // Ajouter le bouton à la fin de la barre de statut
            statusbar.appendChild(btn);

            // S'assurer que la barre de statut est en flexbox
            statusbar.style.display = 'flex';
            statusbar.style.flexWrap = 'wrap';
            statusbar.style.alignItems = 'center';
        }

        // Vérifier si on est sur la page de création de ticket et s'il y a un nom à coller
        const nomPharmacie = localStorage.getItem('pharmacie_a_copier');
        if (window.location.href.includes('model=helpdesk.ticket&view_type=form') && nomPharmacie) {
            // Attendre que le champ soit disponible
            const interval = setInterval(() => {
                const champClient = document.querySelector('.o_field_widget[name="partner_id"] input');
                if (champClient) {
                    clearInterval(interval);
                    // Coller le nom et déclencher les événements nécessaires
                    champClient.value = nomPharmacie;
                    champClient.dispatchEvent(new Event('input', { bubbles: true }));
                    champClient.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true
                    }));
                    // Nettoyer le localStorage
                    localStorage.removeItem('pharmacie_a_copier');
                }
            }, 500);
        }
    }

    // === STYLE BOUTON UI-BTN ODOO LIGHT ===
    const style = document.createElement('style');
    style.textContent = `
    .ui-btn {
      --btn-default-bg: #f5f5f5;
      --btn-padding: 6px 14px;
      --btn-hover-bg: #e0e0e0;
      --btn-transition: .2s;
      --btn-letter-spacing: .05rem;
      --btn-animation-duration: 1.2s;
      --btn-shadow-color: rgba(0,0,0,0.07);
      --btn-shadow: 0 1px 4px 0 var(--btn-shadow-color);
      --hover-btn-color: #1DE9B6;
      --default-btn-color: #222;
      --font-size: 14px;
      --font-weight: 500;
      --font-family: inherit;
      border-radius: 6px;
    }
    .ui-btn {
      box-sizing: border-box;
      padding: var(--btn-padding);
      align-items: center;
      justify-content: center;
      color: var(--default-btn-color) !important;
      font: var(--font-weight) var(--font-size) var(--font-family);
      background: var(--btn-default-bg);
      border: 1px solid #d1d1d1;
      cursor: pointer;
      transition: var(--btn-transition);
      overflow: hidden;
      box-shadow: var(--btn-shadow);
      border-radius: 6px;
      min-width: 0;
      min-height: 0;
      line-height: 1.2;
      margin-bottom: 4px;
    }
    .ui-btn span {
      letter-spacing: var(--btn-letter-spacing);
      transition: var(--btn-transition);
      box-sizing: border-box;
      position: relative;
      background: inherit;
      display: inline-block;
      color: #222 !important;
    }
    .ui-btn span::before {
      box-sizing: border-box;
      position: absolute;
      left: 0; top: 0; right: 0; bottom: 0;
      width: 100%; height: 100%;
      content: none;
      background: transparent;
      pointer-events: none;
    }
    .ui-btn:hover, .ui-btn:focus {
      background: var(--btn-hover-bg);
    }
    .ui-btn:hover span, .ui-btn:focus span {
      color: var(--hover-btn-color) !important;
    }
    .ui-btn:hover span::before, .ui-btn:focus span::before {
      animation: chitchat linear both var(--btn-animation-duration);
    }
    @keyframes chitchat {
      0% { content: "#"; }
      5% { content: "."; }
      10% { content: "^{"; }
      15% { content: "-!"; }
      20% { content: "#$_"; }
      25% { content: "№:0"; }
      30% { content: "#{+."; }
      35% { content: "@}-?"; }
      40% { content: "?{4@%"; }
      45% { content: "=.,^!"; }
      50% { content: "?2@%"; }
      55% { content: "\\;1}]"; }
      60% { content: "?{%:%"; right: 0; }
      65% { content: "|{f[4"; right: 0; }
      70% { content: "{4%0%"; right: 0; }
      75% { content: "'1_0<"; right: 0; }
      80% { content: "{0%"; right: 0; }
      85% { content: "]>'"; right: 0; }
      90% { content: "4"; right: 0; }
      95% { content: "2"; right: 0; }
      100% { content: none; right: 0; }
    }
    `;
    document.head.appendChild(style);

    // === AJOUT BOUTON INSERER INITIALES ===
    function ajouterBoutonInsererInitiales() {
        // Ne pas dupliquer
        if (document.getElementById('btn-inserer-initiales')) return;
        // Créer le bouton
        const btn = document.createElement('button');
        btn.id = 'btn-inserer-initiales';
        btn.className = 'btn btn-primary';
        btn.type = 'button';
        btn.textContent = 'Insérer initiales';
        btn.addEventListener('click', function() {
            const input = document.querySelector('input[name="user_id"], input#user_id.o-autocomplete--input, .o_field_many2one[name="user_id"] input');
            if (!input || !input.value) {
                alert("Aucun utilisateur assigné !");
                return;
            }
            const nomComplet = input.value.trim();
            const parties = nomComplet.split(/\s+|-/g);
            const initiales = parties.map(p => p[0]?.toUpperCase() || '').filter(Boolean).join('.');
            const now = new Date();
            const pad = n => n.toString().padStart(2, '0');
            const dateStr = `${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()} ${pad(now.getHours())}H${pad(now.getMinutes())}`;
            const texte = `${initiales} ${dateStr} : `;
            // Créer le bloc d'initiales
            const bloc = document.createElement('div');
            bloc.className = 'bloc-initiales-odoo';
            bloc.style.margin = '5px 0 0 0';
            bloc.textContent = texte;
            // Chercher le conteneur du texte rouge
            const cligno = document.getElementById('texte-clignotant-container');
            if (cligno && cligno.parentNode) {
                // Insérer juste après le texte rouge
                if (cligno.nextSibling) {
                    cligno.parentNode.insertBefore(bloc, cligno.nextSibling);
                } else {
                    cligno.parentNode.appendChild(bloc);
                }
            } else {
                // Sinon, en bas de la zone de réponse
                const reponseField = document.querySelector('div#request_answer.note-editable');
                if (reponseField) {
                    reponseField.appendChild(bloc);
                } else {
                    alert("Zone de réponse non trouvée !");
                }
            }
        });
        // Chercher le bouton 'Envoyer un message client'
        const btnMsg = document.querySelector('button.o_chatter_button_new_message, button[title*="message client"], button[accesskey="m"]');
        if (btnMsg && btnMsg.parentNode) {
            btnMsg.parentNode.insertBefore(btn, btnMsg);
        } else {
            // Sinon, juste avant la zone de réponse
            const reponseField = document.querySelector('div#request_answer.note-editable');
            if (reponseField && reponseField.parentNode) {
                reponseField.parentNode.insertBefore(btn, reponseField);
            }
        }
    }

    // Observer pour garder le bouton visible
    const observerBtnInitiales = new MutationObserver(() => {
        setTimeout(ajouterBoutonInsererInitiales, 500);
    });
    observerBtnInitiales.observe(document.body, {childList: true, subtree: true});
    // Appel initial direct
    setTimeout(ajouterBoutonInsererInitiales, 1000);

    // Fonction pour initialiser le script
    function initialiserScript() {
        console.log("Tentative d'initialisation du script");

        // Vérifier si nous sommes sur la page de création de ticket
        if (window.location.href.includes('model=helpdesk.ticket&view_type=form')) {
            console.log("Page de création de ticket détectée, nettoyage des états de traitement");
            // Nettoyer tous les états de traitement existants
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('etatTraitement_')) {
                    localStorage.removeItem(key);
                }
                if (key && key.startsWith('dernierChangement_')) {
                    localStorage.removeItem(key);
                }
            }
        }

        if (document.readyState === 'complete') {
            setTimeout(() => {
                ajouterBoutonTraiter();
                ajouterBoutonCreerTicket();
                gererClotureTicket();
                modifierBoutonCloture();
                masquerBoutonsTimer();

                // Vérifier et restaurer l'état du traitement
                const ticketId = obtenirTicketId();
                if (ticketId && recupererEtat(ticketId)) {
                    const boutonTraiter = document.getElementById('btn-traiter-appel');
                    if (boutonTraiter) {
                        boutonTraiter.innerText = 'Mettre en Attente';
                        boutonTraiter.className = 'btn btn-warning';
                        ajouterTexteCligonotant();
                    }
                }

                // Vérification initiale au cas où le ticket est déjà résolu
                if (estTicketResolu()) {
                    console.log("Ticket déjà résolu lors de l'initialisation");
                    const boutonTraiter = document.getElementById('btn-traiter-appel');
                    if (boutonTraiter && boutonTraiter.innerText === 'Mettre en Attente') {
                        boutonTraiter.click();
                    }
                }

                // Appel dans l'initialisation
                ajouterBoutonInsererInitiales();
            }, 1000);
        } else {
            setTimeout(initialiserScript, 1000);
        }
    }

    // Modifier l'observer pour inclure le nouveau bouton
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                setTimeout(() => {
                    ajouterBoutonTraiter();
                    ajouterBoutonCreerTicket(); // Ajouter le nouveau bouton
                    modifierBoutonCloture();
                }, 500);
            }
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Démarrer l'initialisation
    setTimeout(initialiserScript, 1000);

    // Fonction pour mettre à jour l'animation des tickets
    function mettreAJourAnimationTickets() {
        // Vérifier si nous sommes sur la vue liste des tickets et que l'URL correspond
        if (!window.location.href.includes('model=helpdesk.ticket&view_type=list')) return;

        const lignesTickets = document.querySelectorAll('.o_list_view .o_data_row');
        if (!lignesTickets.length) {
            console.log("Aucune ligne de ticket trouvée");
            return;
        }

        console.log("Analyse des lignes de tickets...");

        // Parcourir toutes les lignes de tickets
        lignesTickets.forEach(ligne => {
            // Récupérer tout le texte de la ligne
            const contenuLigne = ligne.textContent.toLowerCase();
            
            // Vérifier si le texte "traitement de l'appel en cours" est présent
            if (contenuLigne.includes("traitement de l'appel en cours")) {
                console.log("Ticket en traitement trouvé !");
                ligne.classList.add('ticket-en-traitement');
                // Ajouter une bordure plus visible
                ligne.style.border = '2px solid rgba(0, 123, 255, 0.5)';
            } else {
                ligne.classList.remove('ticket-en-traitement');
                ligne.style.border = '';
            }
        });
    }

    // Modifier le style de l'animation pour la rendre plus visible
    function ajouterStyleAnimation() {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes ticketEnTraitement {
                0% { 
                    box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.7);
                    background-color: rgba(0, 123, 255, 0.15);
                }
                50% { 
                    box-shadow: 0 0 15px 0 rgba(0, 123, 255, 0.9);
                    background-color: rgba(0, 123, 255, 0.05);
                }
                100% { 
                    box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.7);
                    background-color: rgba(0, 123, 255, 0.15);
                }
            }
            .ticket-en-traitement {
                animation: ticketEnTraitement 1.5s infinite;
                position: relative;
                z-index: 1;
            }
            .ticket-en-traitement td {
                background-color: rgba(0, 123, 255, 0.15) !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Modifier l'observer pour être plus spécifique à la vue liste
    const observerTickets = new MutationObserver((mutations) => {
        if (window.location.href.includes('model=helpdesk.ticket&view_type=list')) {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length || 
                    mutation.type === 'characterData' || 
                    mutation.type === 'childList') {
                    setTimeout(() => {
                        mettreAJourAnimationTickets();
                    }, 500);
                }
            }
        }
    });

    // Ajouter l'initialisation de l'animation dans la fonction d'initialisation
    function initialiserAnimation() {
        ajouterStyleAnimation();
        observerTickets.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        // Mettre à jour l'animation toutes les 2 secondes
        setInterval(mettreAJourAnimationTickets, 2000);
    }

    // Appeler l'initialisation de l'animation au démarrage
    setTimeout(initialiserAnimation, 1000);

    console.log("Script de désassignation démarré");

    function createClearButton() {
        // Rechercher le champ "Assigné à" avec plusieurs sélecteurs possibles
        const input = document.querySelector('input[name="user_id"], input#user_id.o-autocomplete--input, .o_field_many2one[name="user_id"] input');
        
        if (!input) {
            console.log("Champ 'Assigné à' non trouvé");
            return;
        }

        // Vérifier si le bouton existe déjà
        const existingButton = input.parentNode.querySelector('.clear-assign-button');
        if (existingButton) {
            console.log("Bouton de désassignation déjà présent");
            // Si le champ est vide, retirer le bouton
            if (!input.value) {
                existingButton.remove();
            }
            return;
        }

        // N'afficher la croix que si un utilisateur est assigné
        if (!input.value) {
            console.log("Champ 'Assigné à' vide, pas de croix");
            return;
        }

        // Créer le bouton
        const button = document.createElement('button');
        button.className = 'clear-assign-button';
        button.innerHTML = '❌';
        button.style.cssText = `
            margin-left: 5px;
            background: none;
            border: none;
            color: #dc3545;
            cursor: pointer;
            font-size: 16px;
            padding: 0;
            line-height: 1;
            position: absolute;
            right: -44px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 2;
        `;

        // Ajouter l'événement de clic
        button.addEventListener('click', async function(e) {
            e.preventDefault();
            console.log("Clic sur le bouton de désassignation");

            try {
                // Vider le champ
                input.value = '';
                
                // Déclencher les événements nécessaires
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Attendre un court délai pour s'assurer que les événements sont traités
                await new Promise(resolve => setTimeout(resolve, 300));

                // Trouver et cliquer sur le bouton de sauvegarde
                const saveButton = document.querySelector('.o_form_button_save, button[data-hotkey="s"]');
                if (saveButton) {
                    console.log("Sauvegarde des modifications");
                    saveButton.click();
                } else {
                    console.log("Bouton de sauvegarde non trouvé");
                }
            } catch (error) {
                console.error("Erreur lors de la désassignation:", error);
            }
        });

        // Ajouter le bouton au conteneur parent
        const container = input.parentNode;
        container.style.position = 'relative';
        container.appendChild(button);
        console.log("Bouton de désassignation ajouté");
    }

    // Observer pour détecter les changements dans le DOM
    const observerClearButton = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                setTimeout(createClearButton, 500);
            }
        });
    });

    // Configuration de l'observer
    observerClearButton.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initialisation au chargement
    window.addEventListener('load', function() {
        setTimeout(createClearButton, 2000);
    });

    // Réinitialisation lors des changements de route
    window.addEventListener('hashchange', function() {
        setTimeout(createClearButton, 1000);
    });

    // Vérification périodique
    setInterval(createClearButton, 5000);

    const styleBtnInitiales = document.createElement('style');
    styleBtnInitiales.textContent = `
    #btn-inserer-initiales {
      color: #fff !important;
      background-color: #17b6b2 !important;
      border-radius: 6px !important;
      border: none !important;
      font-weight: 500;
      font-size: 13px;
      padding: 4px 10px;
      box-shadow: none;
    }
    #btn-inserer-initiales:hover, #btn-inserer-initiales:focus {
      background-color: #139e9a !important;
      color: #fff !important;
    }
    `;
    document.head.appendChild(styleBtnInitiales);

    // === ANIMATION ET NOTIFICATIONS RAPPEL RDV ===
    // Ajout des styles d'animation
    const styleRdv = document.createElement('style');
    styleRdv.textContent = `
    .rdv-clignote-orange {
      animation: rdvOrange 1.2s infinite alternate;
    }
    .rdv-clignote-rouge {
      animation: rdvRouge 0.8s infinite alternate;
    }
    .rdv-clignote-depasse {
      animation: rdvDepasse 0.5s infinite alternate;
      box-shadow: 0 0 15px rgba(229, 57, 53, 0.7);
    }
    @keyframes rdvOrange {
      from { background: transparent; color: inherit; }
      to { background: #ff9800; color: #fff; }
    }
    @keyframes rdvRouge {
      from { background: transparent; color: inherit; }
      to { background: #e53935; color: #fff; }
    }
    @keyframes rdvDepasse {
      0% { 
        background: #e53935;
        color: #fff;
        box-shadow: 0 0 15px rgba(229, 57, 53, 0.7);
      }
      50% { 
        background: #b71c1c;
        color: #fff;
        box-shadow: 0 0 25px rgba(229, 57, 53, 0.9);
      }
      100% { 
        background: #e53935;
        color: #fff;
        box-shadow: 0 0 15px rgba(229, 57, 53, 0.7);
      }
    }
    .rdv-notif-odoo {
      position: fixed;
      top: 30px;
      right: 30px;
      left: auto;
      transform: none;
      background: #e53935;
      color: #fff;
      padding: 16px 32px 16px 20px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: bold;
      z-index: 99999;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
      opacity: 0.97;
      transition: opacity 0.3s;
      min-width: 320px;
      max-width: 480px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .rdv-notif-depasse {
      background: #b71c1c;
      animation: notifDepasse 1s infinite alternate;
      box-shadow: 0 0 20px rgba(229, 57, 53, 0.8);
    }
    @keyframes notifDepasse {
      0% {
        box-shadow: 0 0 20px rgba(229, 57, 53, 0.8);
      }
      50% {
        box-shadow: 0 0 30px rgba(229, 57, 53, 1);
      }
      100% {
        box-shadow: 0 0 20px rgba(229, 57, 53, 0.8);
      }
    }
    .rdv-notif-close {
      margin-left: auto;
      color: #1DE9B6;
      font-size: 18px;
      font-weight: normal;
      background: none;
      border: none;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
    }
    .rdv-notif-close:hover { opacity: 1; }
    `;
    document.head.appendChild(styleRdv);

    // Fonction pour afficher une notification en haut
    function afficherNotifRdv(message, rdvKey, estDepasse = false) {
        if (localStorage.getItem('notifFermee_' + rdvKey)) return; // Ne pas réafficher si déjà fermée
        if (document.getElementById('rdv-notif-odoo')) return; // éviter les doublons
        const notif = document.createElement('div');
        notif.id = 'rdv-notif-odoo';
        notif.className = 'rdv-notif-odoo' + (estDepasse ? ' rdv-notif-depasse' : '');
        notif.textContent = message;
        // Ajout croix
        const closeBtn = document.createElement('button');
        closeBtn.className = 'rdv-notif-close';
        closeBtn.innerHTML = '✖';
        closeBtn.onclick = () => {
            notif.remove();
            if (rdvKey) localStorage.setItem('notifFermee_' + rdvKey, '1');
        };
        notif.appendChild(closeBtn);
        document.body.appendChild(notif);
    }

    // Fonction principale de scan des rappels
    function scanRappelsRdv() {
        // Trouver l'index de la colonne "Nouveau rendez-vous"
        const ths = document.querySelectorAll('table thead th');
        let idxRdv = -1;
        ths.forEach((th, i) => {
            if (th.textContent.toLowerCase().includes('nouveau rendez-vous')) idxRdv = i;
        });
        if (idxRdv === -1) return;
        // Chercher le tableau des tickets
        const lignes = document.querySelectorAll('tr.o_data_row');
        lignes.forEach(ligne => {
            const cells = ligne.querySelectorAll('td');
            const cellRdv = cells[idxRdv];
            let cellPharma = null;
            cells.forEach(cell => {
                if (/pharmacie|pharma|pharmacies|pharmacie/i.test(cell.textContent)) cellPharma = cell;
            });
            if (!cellRdv) return;
            // Extraire la date
            const match = cellRdv.textContent.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
            if (!match) {
                // Si la date n'est plus présente, retirer les classes
                cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-rouge','rdv-clignote-depasse');
                return;
            }
            const [_, jj, mm, aaaa, hh, min, ss] = match;
            const dateRdv = new Date(`${aaaa}-${mm}-${jj}T${hh}:${min}:${ss}`);
            const now = new Date();
            const diff = (dateRdv - now) / 60000;
            // Si le rdv n'est pas aujourd'hui, retirer les classes et ne rien faire
            if (dateRdv.toDateString() !== now.toDateString()) {
                cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-rouge','rdv-clignote-depasse');
                return;
            }
            // Si le rdv est dépassé
            if (diff < 0) {
                cellRdv.classList.add('rdv-clignote-depasse');
                cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-rouge');
                // Notification pour RDV dépassé
                const rdvKey = `depasse_${cellRdv.textContent.trim()}_${cellPharma ? cellPharma.textContent.trim() : ''}`;
                if (!localStorage.getItem('notifFermee_' + rdvKey)) {
                    const nomPharma = cellPharma ? cellPharma.textContent.trim() : 'Client';
                    afficherNotifRdv(`⚠️ Attention : Heure de rendez-vous dépassée pour ${nomPharma} (${hh}:${min})`, rdvKey, true);
                }
                return;
            }
            // Sinon, appliquer la bonne classe (et ne jamais la retirer tant que le RDV n'est pas dépassé)
            if (diff <= 10) {
                cellRdv.classList.add('rdv-clignote-rouge');
                cellRdv.classList.remove('rdv-clignote-orange','rdv-clignote-depasse');
                // Notification (à chaque scan si pas fermée)
                const rdvKey = `${cellRdv.textContent.trim()}_${cellPharma ? cellPharma.textContent.trim() : ''}`;
                if (!localStorage.getItem('notifFermee_' + rdvKey)) {
                    const nomPharma = cellPharma ? cellPharma.textContent.trim() : 'Client';
                    afficherNotifRdv(`Rendez-vous dans 10 minutes : ${nomPharma} à ${hh}:${min}`, rdvKey);
                }
            } else {
                cellRdv.classList.add('rdv-clignote-orange');
                cellRdv.classList.remove('rdv-clignote-rouge','rdv-clignote-depasse');
            }
        });
    }
    setInterval(scanRappelsRdv, 2000); // toutes les 2s
    setTimeout(scanRappelsRdv, 1000); // au chargement
})();
