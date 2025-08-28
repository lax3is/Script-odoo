// ==UserScript==
// @name         Bouton Traiter l'Appel Odoo
// @namespace    http://tampermonkey.net/
// @version      2.2.2
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
    let timerState = {
        isRunning: false,
        isProcessing: false
    };

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

    // Fonction pour retirer les éléments liés au traitement en dehors de la fiche ticket
    function retirerBoutonsTraitement() {
        try {
            // Ne retirer que si on n'est ni sur la fiche ticket ni sur la liste des tickets
            const isTicketPage = window.location.href.includes('model=helpdesk.ticket');
            if (!isTicketPage) {
                const btnTraiter = document.getElementById('btn-traiter-appel');
                if (btnTraiter) {
                    btnTraiter.remove();
                }
                const texteCligno = document.getElementById('texte-clignotant-container');
                if (texteCligno) {
                    texteCligno.remove();
                }
            }
        } catch (e) {
            /* ignore */
        }
    }

    // Fonction pour simuler le raccourci clavier Alt+Z
    function simulerRaccourciTimer() {
        if (timerState.isProcessing) return;
        timerState.isProcessing = true;

        const event = new KeyboardEvent('keydown', {
            key: 'z',
            code: 'KeyZ',
            altKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);

        setTimeout(() => {
            timerState.isProcessing = false;
        }, 1000);
    }

    // Fonction pour simuler le raccourci clavier Alt+W
    function simulerRaccourciPause() {
        if (timerState.isProcessing) return;
        timerState.isProcessing = true;

        const event = new KeyboardEvent('keydown', {
            key: 'w',
            code: 'KeyW',
            altKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);

        setTimeout(() => {
            timerState.isProcessing = false;
        }, 1000);
    }

    // Fonction pour simuler le raccourci clavier Alt+Q
    function simulerRaccourciStop() {
        if (timerState.isProcessing) return;
        timerState.isProcessing = true;

        const event = new KeyboardEvent('keydown', {
            key: 'q',
            code: 'KeyQ',
            altKey: true,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(event);

        setTimeout(() => {
            timerState.isProcessing = false;
        }, 1000);
    }

    // Fonction pour vérifier l'état du timer
    function verifierEtatTimer() {
        const btnLancer = document.querySelector('button[name="action_timer_start"][type="object"]');
        const btnPause = document.querySelector('button[name="action_timer_pause"][type="object"]');
        const btnRelancer = document.querySelector('button[name="action_timer_resume"][type="object"]');

        if (btnRelancer) {
            timerState.isRunning = true;
            return 'relancer';
        } else if (btnPause) {
            timerState.isRunning = true;
            return 'pause';
        } else if (btnLancer) {
            timerState.isRunning = false;
            return 'lancer';
        }
        timerState.isRunning = false;
        return null;
    }

    // Fonction pour créer le bouton
    function ajouterBoutonTraiter() {
        console.log("Tentative d'ajout du bouton");
        // Limiter aux pages de tickets (fiche et liste)
        const isTicketPage = window.location.href.includes('model=helpdesk.ticket');
        if (!isTicketPage) {
            retirerBoutonsTraitement();
            return;
        }
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
                if (timerState.isProcessing) {
                    console.log("Une action est déjà en cours, veuillez patienter...");
                    return;
                }

                console.log("Bouton cliqué");
                enTraitement = !enTraitement;

                if (enTraitement) {
                    const etatTimer = verifierEtatTimer();
                    const estEnPause = etatTimer === 'relancer';

                    if (estEnPause) {
                        // Cas 3: Reprendre l'appel
                        console.log("Reprise de l'appel");

                        // 1. Relancer le timer en premier
                        console.log("Démarrage du timer");
                        simulerRaccourciPause();
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Vérifier si le timer a bien démarré
                        const nouvelEtat = verifierEtatTimer();
                        if (nouvelEtat !== 'pause') {
                            console.log("Le timer n'a pas démarré, nouvelle tentative...");
                            simulerRaccourciPause();
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }

                        // 2. Mettre à jour l'interface
                        btn.innerText = 'Mettre en Attente';
                        btn.className = 'btn btn-warning';
                        ajouterTexteCligonotant();

                        // 3. Sauvegarder
                        const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                        if (btnEnregistrer) {
                            console.log("Sauvegarde des modifications");
                            btnEnregistrer.click();
                        }
                    } else {
                        // Cas 1: Traiter l'appel
                        console.log("Traitement de l'appel");

                        // 1. Démarrer le timer en premier
                        console.log("Démarrage du timer");
                        simulerRaccourciTimer();
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Vérifier si le timer a bien démarré
                        const nouvelEtat = verifierEtatTimer();
                        if (nouvelEtat !== 'pause') {
                            console.log("Le timer n'a pas démarré, nouvelle tentative...");
                            simulerRaccourciTimer();
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }

                        // 2. Vérifier si le bouton ME L'ASSIGNER est disponible
                        const btnAssigner = trouverBoutonAssigner();
                        if (btnAssigner) {
                            console.log("Bouton ME L'ASSIGNER trouvé, clic automatique");
                            btnAssigner.click();
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }

                        // 3. Mettre à jour l'interface
                        btn.innerText = 'Mettre en Attente';
                        btn.className = 'btn btn-warning';
                        ajouterTexteCligonotant();

                        // 4. Sauvegarder
                        const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                        if (btnEnregistrer) {
                            console.log("Sauvegarde des modifications");
                            btnEnregistrer.click();
                        }
                    }

                    if (ticketId) {
                        sauvegarderEtat(true, ticketId);
                    }
                } else {
                    // Cas 2: Mettre en pause
                    console.log("Mise en pause de l'appel");

                    // 1. Mettre en pause le timer en premier
                    console.log("Mise en pause du timer");
                    simulerRaccourciPause();
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Vérifier si le timer est bien en pause
                    const nouvelEtat = verifierEtatTimer();
                    if (nouvelEtat !== 'relancer') {
                        console.log("Le timer n'est pas en pause, nouvelle tentative...");
                        simulerRaccourciPause();
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    // 2. Mettre à jour l'interface
                    btn.innerText = 'Traiter l\'appel';
                    btn.className = 'btn btn-primary';
                    supprimerTexteCligonotant();

                    if (ticketId) {
                        sauvegarderEtat(false, ticketId);
                    }

                    // 3. Sauvegarder
                    const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                    if (btnEnregistrer) {
                        console.log("Sauvegarde des modifications");
                        btnEnregistrer.click();
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
        container.setAttribute('data-persistent', 'true'); // Marquer comme persistant
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
        let isProcessingClosure = false;

        setInterval(async () => {
            if (estTicketResolu() && !isProcessingClosure && !timerState.isProcessing) {
                console.log("Ticket résolu détecté");

                const etatTimer = verifierEtatTimer();
                if (etatTimer === 'pause' || etatTimer === 'relancer') {
                    isProcessingClosure = true;
                    console.log("Timer en cours détecté, début de la séquence de clôture");

                    try {
                        // 1. Supprimer le texte clignotant en premier
                        console.log("Suppression du texte clignotant");
                        supprimerTexteCligonotant();
                        await new Promise(resolve => setTimeout(resolve, 200));

                        // 2. Mettre à jour l'interface du bouton
                        const boutonTraiter = document.getElementById('btn-traiter-appel');
                        if (boutonTraiter) {
                            boutonTraiter.innerText = 'Traiter l\'appel';
                            boutonTraiter.className = 'btn btn-primary';
                        }

                        // 3. Simuler Alt+Z une seule fois pour ouvrir la fiche de temps
                        console.log("Ouverture de la fiche de temps (Alt+Z)");
                        simulerRaccourciTimer();
                        await new Promise(resolve => setTimeout(resolve, 300));

                        // 4. Attendre que la fiche de temps soit ouverte
                        let ficheTemps = null;
                        let tentatives = 0;
                        while (!ficheTemps && tentatives < 3) {
                            ficheTemps = document.querySelector('.o_timer_dialog');
                            if (!ficheTemps) {
                                await new Promise(resolve => setTimeout(resolve, 200));
                                tentatives++;
                            }
                        }

                        if (ficheTemps) {
                            console.log("Fiche de temps ouverte, attente de 1 seconde pour le remplissage");
                            // Attendre que l'utilisateur remplisse la fiche de temps
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            // 5. Simuler Alt+Q pour fermer la fiche de temps
                            console.log("Fermeture de la fiche de temps (Alt+Q)");
                            simulerRaccourciStop();
                            await new Promise(resolve => setTimeout(resolve, 300));

                            // 6. Vérifier que la fiche est bien fermée
                            if (document.querySelector('.o_timer_dialog')) {
                                console.log("La fiche de temps n'est pas fermée, nouvelle tentative Alt+Q");
                                simulerRaccourciStop();
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        } else {
                            console.log("La fiche de temps n'a pas pu être ouverte");
                        }

                        // 7. Sauvegarder l'état
                        const ticketId = obtenirTicketId();
                        if (ticketId) {
                            sauvegarderEtat(false, ticketId);
                        }

                        // 8. Sauvegarder les modifications
                        const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                        if (btnEnregistrer) {
                            console.log("Sauvegarde des modifications après clôture");
                            btnEnregistrer.click();
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }

                        // 9. Dernier Alt+Q pour s'assurer que tout est bien fermé
                        console.log("Dernier Alt+Q pour finaliser la clôture");
                        simulerRaccourciStop();
                        await new Promise(resolve => setTimeout(resolve, 300));

                        console.log("Séquence de clôture terminée");
                    } finally {
                        setTimeout(() => {
                            isProcessingClosure = false;
                            console.log("Traitement de clôture terminé");
                        }, 1000);
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
        // Limiter aux pages de tickets (fiche et liste)
        const isTicketPage = window.location.href.includes('model=helpdesk.ticket');
        if (!isTicketPage) {
            const exist = document.getElementById('btn-creer-ticket');
            if (exist) exist.remove();
            return;
        }
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
        // Limiter aux pages de tickets (fiche et liste)
        const isTicketPage = window.location.href.includes('model=helpdesk.ticket');
        if (!isTicketPage) {
            const exist = document.getElementById('btn-inserer-initiales');
            if (exist) exist.remove();
            return;
        }
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
            bloc.style.margin = '0';
            bloc.textContent = texte;
            // Insérer à la toute fin de la zone de réponse (toujours en bas)
            const reponseField = document.querySelector('div#request_answer.note-editable');
            if (reponseField) {
                // Nettoyer les espaces/sauts de ligne de fin
                (function cleanupTail(node){
                    while (node.lastChild && (
                        node.lastChild.nodeName === 'BR' ||
                        (node.lastChild.nodeType === 3 && !node.lastChild.textContent.trim()) ||
                        (node.lastChild.nodeType === 1 && !(node.lastChild.id === 'texte-clignotant-container') && node.lastChild.textContent.trim() === '')
                    )) {
                        node.removeChild(node.lastChild);
                    }
                })(reponseField);
                // Un seul saut de ligne avant le bloc si du contenu existe
                if (reponseField.childNodes.length) reponseField.appendChild(document.createElement('br'));
                reponseField.appendChild(bloc);
                // Faire défiler vers le bas pour visibilité
                try { reponseField.scrollTop = reponseField.scrollHeight; } catch(e) {}
            } else {
                alert("Zone de réponse non trouvée !");
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
                scheduleBadgeDevisUpdate();
                appliquerClignotementInternet();
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
                    scheduleBadgeDevisUpdate();
                    appliquerClignotementInternet();
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

                // Vérifier si on a déjà appliqué le style pour éviter les doublons
                if (!ligne.hasAttribute('data-animation-applied')) {
                    ligne.setAttribute('data-animation-applied', 'true');
                    // Ajouter une bordure plus visible
                    ligne.style.border = '2px solid rgba(0, 123, 255, 0.6)';
                    ligne.style.borderRadius = '4px';
                }
            } else {
                // Retirer les classes et styles seulement si nécessaire
                if (ligne.classList.contains('ticket-en-traitement')) {
                    ligne.classList.remove('ticket-en-traitement');
                    ligne.removeAttribute('data-animation-applied');
                    ligne.style.border = '';
                    ligne.style.borderRadius = '';
                }
            }
        });
    }

    // Modifier le style de l'animation pour la rendre plus visible
    function ajouterStyleAnimation() {
        const style = document.createElement('style');
        style.textContent = `
            /* Effet de glow et de fond pour les tickets en traitement (scopé à la vue liste) */
            @keyframes ticketEnTraitement {
                0% {
                    box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4);
                    background-color: rgba(0, 123, 255, 0.08);
                }
                50% {
                    box-shadow: 0 0 8px 0 rgba(0, 123, 255, 0.6);
                    background-color: rgba(0, 123, 255, 0.03);
                }
                100% {
                    box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4);
                    background-color: rgba(0, 123, 255, 0.08);
                }
            }
            @keyframes ticketEnTraitementBg {
                0% { background-color: rgba(0, 123, 255, 0.08); }
                50% { background-color: rgba(0, 123, 255, 0.03); }
                100% { background-color: rgba(0, 123, 255, 0.08); }
            }
            /* Forcer l'effet au premier plan au-dessus du thème MAIS sous les popups */
            .o_list_view .o_data_row.ticket-en-traitement {
                position: relative !important;
                z-index: 1 !important;
                border: 2px solid rgba(0, 123, 255, 0.6) !important;
                border-radius: 4px !important;
            }
            .o_list_view .o_data_row.ticket-en-traitement::after {
                content: '';
                position: absolute;
                top: -1px; left: -1px; right: -1px; bottom: -1px;
                pointer-events: none;
                border-radius: 3px;
                animation: ticketEnTraitement 2s infinite;
                box-shadow: 0 0 8px 0 rgba(0, 123, 255, 0.6);
                background-color: rgba(0, 123, 255, 0.05);
                z-index: 1 !important;
            }
            .o_list_view .o_data_row.ticket-en-traitement td {
                position: relative !important;
                z-index: 1 !important;
            }
            .o_list_view .o_data_row.ticket-en-traitement td::after {
                content: '';
                position: absolute;
                inset: 0;
                pointer-events: none;
                animation: ticketEnTraitementBg 2s infinite;
                background-color: rgba(0, 123, 255, 0.08);
                z-index: 1 !important;
            }
            /* RDV: effets plus subtils */
            .o_list_view .rdv-clignote-orange, .o_list_view .rdv-clignote-rouge, .o_list_view .rdv-clignote-depasse {
                position: relative !important;
                z-index: 1 !important;
            }
            @keyframes rdvOrangeBg { from { background: rgba(255, 152, 0, 0.15); } to { background: rgba(255, 152, 0, 0.25); } }
            @keyframes rdvRougeBg { from { background: rgba(229, 57, 53, 0.15); } to { background: rgba(229, 57, 53, 0.25); } }
            @keyframes rdvDepasseBg {
                0% { background: rgba(229, 57, 53, 0.25); box-shadow: 0 0 8px rgba(229, 57, 53, 0.5); }
                50% { background: rgba(183, 28, 28, 0.35); box-shadow: 0 0 12px rgba(229, 57, 53, 0.6); }
                100% { background: rgba(229, 57, 53, 0.25); box-shadow: 0 0 8px rgba(229, 57, 53, 0.5); }
            }
            .o_list_view .rdv-clignote-orange::after,
            .o_list_view .rdv-clignote-rouge::after,
            .o_list_view .rdv-clignote-depasse::after {
                content: '';
                position: absolute;
                inset: -1px;
                pointer-events: none;
                border-radius: 2px;
                z-index: 1 !important;
            }
            .o_list_view .rdv-clignote-orange::after { animation: rdvOrangeBg 1.5s infinite alternate; }
            .o_list_view .rdv-clignote-rouge::after { animation: rdvRougeBg 1.2s infinite alternate; }
            .o_list_view .rdv-clignote-depasse::after { animation: rdvDepasseBg 1s infinite alternate; }
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
                        // Restaurer les éléments après rafraîchissement automatique
                        restaurerElementsApresRafraichissement();
                    }, 500);
                }
            }
        }
    });

    // Fonction pour restaurer les éléments après rafraîchissement automatique
    function restaurerElementsApresRafraichissement() {
        try {
            // Vérifier si on est sur la liste des tickets
            if (!window.location.href.includes('model=helpdesk.ticket&view_type=list')) return;

            // Restaurer le texte clignotant si nécessaire
            const lignesTickets = document.querySelectorAll('.o_list_view .o_data_row');
            lignesTickets.forEach(ligne => {
                const contenuLigne = ligne.textContent.toLowerCase();
                if (contenuLigne.includes("traitement de l'appel en cours")) {
                    // Vérifier si l'animation est déjà appliquée
                    if (!ligne.classList.contains('ticket-en-traitement')) {
                        ligne.classList.add('ticket-en-traitement');
                        ligne.setAttribute('data-animation-applied', 'true');
                        ligne.style.border = '2px solid rgba(0, 123, 255, 0.6)';
                        ligne.style.borderRadius = '4px';
                    }
                }
            });

            // Restaurer le bouton de traitement si nécessaire
            setTimeout(() => {
                ajouterBoutonTraiter();
            }, 300);
        } catch (e) {
            console.log("Erreur lors de la restauration:", e);
        }
    }

    // Ajouter l'initialisation de l'animation dans la fonction d'initialisation
    function initialiserAnimation() {
        ajouterStyleAnimation();
        observerTickets.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        // Mettre à jour l'animation plus fréquemment pour une meilleure persistance
        setInterval(mettreAJourAnimationTickets, 1000);

        // Restaurer les éléments plus fréquemment aussi
        setInterval(restaurerElementsApresRafraichissement, 1500);
    }

    // Appeler l'initialisation de l'animation au démarrage
    setTimeout(initialiserAnimation, 1000);

    // Gestion spéciale des rafraîchissements automatiques d'Odoo
    let lastUrl = window.location.href;
    setInterval(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            // URL a changé, attendre un peu puis restaurer
            setTimeout(() => {
                if (window.location.href.includes('model=helpdesk.ticket&view_type=list')) {
                    restaurerElementsApresRafraichissement();
                    mettreAJourAnimationTickets();
                }
            }, 1000);
        }
    }, 500);

    console.log("Script de désassignation démarré");

    // === INDICATEUR DEVIS EN COURS (VENTES) ===
    // Styles
    const styleDevis = document.createElement('style');
    styleDevis.textContent = `
    #badge-devis-client { display:inline-flex; align-items:center; gap:6px; margin-left:8px; vertical-align:middle; }
    /* Icône sac type Odoo */
    #badge-devis-client .bd-bag { width:18px; height:18px; display:inline-block; background-repeat:no-repeat; background-size:100% 100%; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.2));
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 8h12l-1 12H7L6 8z'/%3E%3Cpath d='M9 8V6a3 3 0 0 1 6 0v2'/%3E%3C/g%3E%3C/svg%3E"); }
    /* pastille iOS collée au bord du bouton */
    #badge-devis-client .bd-count { position:absolute; top:-6px; right:-6px; min-width:18px; height:18px; padding:0 4px; border-radius:10px; background:#e53935; color:#fff; font-size:11px; line-height:18px; text-align:center; font-weight:800; box-shadow:0 0 6px rgba(0,0,0,0.25); }
    #badge-devis-client .bd-tip { font-size:12px; color:#ffcc80; font-weight:600; }
    #badge-devis-client .bd-label { color:#fff; font-weight:700; letter-spacing:.2px; }
    #badge-devis-client button { all:unset; cursor:pointer; }
    #badge-devis-client .bd-btn { position:relative; display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:6px 12px; border-radius:12px; background: linear-gradient(135deg,#9a6a89 0%, #7a476a 100%); color:#fff; font-weight:700; box-shadow:0 4px 14px rgba(0,0,0,0.2); min-width:46px; height:36px; border:none; }
    #badge-devis-client .bd-btn.empty { background: #455a64; color:#eceff1; }
    /* Popup devis */
    .popup-devis-odoobtn { position:fixed; top:80px; right:24px; background:#1f2a30; color:#fff; border-radius:8px; box-shadow:0 10px 30px rgba(0,0,0,0.35); z-index: 6000; width: 1100px; max-height: 70vh; overflow:auto; }
    .popup-devis-odoobtn header{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,0.08); font-weight:700; }
    .popup-devis-odoobtn header button{ all:unset; cursor:pointer; color:#1DE9B6; }
    .popup-devis-odoobtn ul{ list-style:none; margin:0; padding:8px 0; }
    .popup-devis-odoobtn li{ padding:10px 14px; border-bottom:1px dashed rgba(255,255,255,0.08); display:flex; align-items:center; gap:12px; position:relative; cursor:pointer; flex-wrap: wrap; align-items: flex-start; }
    .popup-devis-odoobtn li a{ color:#8be9fd; text-decoration:none; min-width:90px; }
    .popup-devis-odoobtn .muted{ color:#9aa7ad; font-size:12px; margin-left:auto; }
    .popup-devis-odoobtn .so-title{ color:#ffcc80; font-size:12px; margin-left:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 45%; }
    .popup-devis-odoobtn li.state-sale, .popup-devis-odoobtn li.state-done { background: rgba(46,125,50,0.12); border-left: 3px solid #2e7d32; }
    .popup-devis-odoobtn li.state-cancel { background: rgba(229,57,53,0.12); border-left: 3px solid #e53935; }
    .popup-devis-odoobtn li:hover { background-color: rgba(255,255,255,0.05); }
    .popup-devis-odoobtn li.expanded { flex-direction: column; align-items: stretch; }
    .popup-devis-odoobtn .so-lines { width:100%; flex: 1 1 100%; order: 10; background: rgba(255,255,255,0.03); border-left:2px solid rgba(255,255,255,0.08); margin:8px 0 -2px 0; padding:8px 12px; border-radius:4px; }
    .popup-devis-odoobtn .so-lines .line { display:grid; grid-template-columns: 1fr 80px 110px 120px; gap:10px; align-items:center; padding:4px 0; border-bottom:1px dashed rgba(255,255,255,0.06); }
    .popup-devis-odoobtn .so-lines .line.header { font-weight:700; color:#cfd8dc; border-bottom:1px solid rgba(255,255,255,0.12); }
    .popup-devis-odoobtn .so-lines .line:last-child { border-bottom:none; }
    .popup-devis-odoobtn .so-lines .pname { color:#eceff1; }
    .popup-devis-odoobtn .so-lines .qty { text-align:right; }
    .popup-devis-odoobtn .so-lines .price, .popup-devis-odoobtn .so-lines .subtotal { text-align:right; color:#b0bec5; }
    `;
    document.head.appendChild(styleDevis);

    function getOdooContext() {
        try {
            // odoo.session_info.user_context disponible dans le client web
            return (window.odoo && odoo.session_info && odoo.session_info.user_context) || {};
        } catch (e) { return {}; }
    }

    async function odooRpc(model, method, args = [], kwargs = {}) {
        try {
            const res = await fetch('/web/dataset/call_kw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                credentials: 'include',
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'call',
                    params: { model, method, args, kwargs: Object.assign({ context: getOdooContext() }, kwargs) }
                })
            });
            const data = await res.json();
            if (data && data.result !== undefined) return data.result;
        } catch (err) { console.warn('RPC Odoo échoué', model, method, err); }
        return null;
    }

    // Détection dynamique du champ "Titre" de sale.order
    let saleOrderTitleFieldName = undefined; // cache
    async function detectSaleOrderTitleField() {
        if (saleOrderTitleFieldName !== undefined) return saleOrderTitleFieldName;
        const fields = await odooRpc('sale.order', 'fields_get', [[], ['string']]) || {};
        // 1) chercher par libellé "Titre"
        for (const [fname, def] of Object.entries(fields)) {
            const s = (def && def.string ? String(def.string) : '').toLowerCase();
            if (s === 'titre' || s.includes('titre')) { saleOrderTitleFieldName = fname; return fname; }
        }
        // 2) chercher par quelques noms probables
        const candidates = ['x_studio_titre', 'x_studio_title', 'title', 'x_title', 'x_titre', 'client_order_ref'];
        for (const c of candidates) { if (fields[c]) { saleOrderTitleFieldName = c; return c; } }
        saleOrderTitleFieldName = null; // pas trouvé
        return null;
    }

    let devisBadgeUpdateTimer = null;
    function isHelpdeskTicketForm(){
        const s = (window.location.href || '') + ' ' + (window.location.hash || '');
        return s.includes('model=helpdesk.ticket') && s.includes('view_type=form');
    }
    function removeDevisBadge(){
        const b = document.getElementById('badge-devis-client');
        if (b && b.parentNode) b.parentNode.removeChild(b);
    }
    function assurerBadgeImmediatPlacement(){
        const isTicketPage = window.location.href.includes('model=helpdesk.ticket');
        if (!isTicketPage) { removeDevisBadge(); return false; }
        const stats = findStatsContainer();
        const anchor = findTicketsOuvertsAnchor();
        if (!stats && !anchor) return false;
        let badge = document.getElementById('badge-devis-client');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'badge-devis-client';
            const btn = document.createElement('button');
            btn.className = 'bd-btn empty';
            btn.title = 'Ventes';
            btn.textContent = 'Ventes';
            badge.appendChild(btn);
        }
        if (stats) {
            placeBadgeAfterStats(stats, badge);
        } else if (anchor && anchor.parentNode) {
            anchor.parentNode.appendChild(badge);
        }
        return true;
    }
    function findTicketsOuvertsAnchor(){
        // Cherche un élément qui contient le texte "Tickets Ouverts"
        const scopes = document.querySelectorAll('.o_form_statusbar, .o_form_view .o_statusbar_buttons, .o_form_statusbar .o_statusbar_buttons, .o_form_sheet_bg');
        for (const scope of scopes){
            const nodes = scope.querySelectorAll('button, a, span, div');
            for (const n of nodes){
                const txt = (n.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
                if (txt.includes('tickets') && txt.includes('ouverts')) return n;
            }
        }
        return null;
    }
    function findStatsContainer(){
        // Cherche un conteneur de boutons statistiques (ligne avec "Tickets Ouverts", "Documents", ...)
        const candidates = document.querySelectorAll('.o_form_button_box, .o_form_buttonbox, .oe_button_box, .o_button_box, .o_form_statusbar');
        for (const el of candidates){
            if (el.querySelector && el.querySelector('.o_stat_button, .oe_stat_button')) return el;
        }
        return null;
    }
    function getLastStatButton(container){
        if (!container) return null;
        const list = container.querySelectorAll('.o_stat_button, .oe_stat_button, button.o_stat_button');
        return list && list.length ? list[list.length - 1] : null;
    }
    function placeBadgeAfterStats(container, badge){
        if (!container || !badge) return;
        const last = getLastStatButton(container);
        if (last && last.nextSibling !== badge) {
            last.insertAdjacentElement('afterend', badge);
        } else if (!last && badge.parentNode !== container) {
            container.appendChild(badge);
        }
    }
    async function mettreAJourBadgeDevis() {
        // Uniquement sur les pages de tickets (fiche et liste)
        if (!window.location.href.includes('model=helpdesk.ticket')) return;

        const ticketId = obtenirTicketId();
        if (!ticketId) return;

        // Chercher une zone d'en-tête en haut à gauche proche de "Tickets Ouverts"
        // Fallback: à défaut, rester près du champ client
        let headerLeft = document.querySelector('.o_form_statusbar .o_statusbar_buttons, .o_form_statusbar');
        // Si on trouve précisément le bouton "Tickets Ouverts", on insère juste avant
        const ticketsAnchor = findTicketsOuvertsAnchor();
        const statsContainer = findStatsContainer();
        const clientField = document.querySelector('.o_field_widget[name="partner_id"]');

        // Créer ou récupérer le badge
        let badge = document.getElementById('badge-devis-client');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'badge-devis-client';
            if (statsContainer) {
                placeBadgeAfterStats(statsContainer, badge);
            } else if (ticketsAnchor && ticketsAnchor.parentNode) {
                ticketsAnchor.parentNode.appendChild(badge);
            } else if (headerLeft) {
                headerLeft.insertAdjacentElement('afterbegin', badge);
            } else if (clientField && clientField.parentNode) {
                clientField.parentNode.appendChild(badge);
            } else {
                return;
            }
        }
        // S'assurer à chaque update de la bonne position (après les stat buttons)
        if (statsContainer){
            placeBadgeAfterStats(statsContainer, badge);
        } else if (ticketsAnchor && ticketsAnchor.parentNode && badge.parentNode !== ticketsAnchor.parentNode){
            try { ticketsAnchor.parentNode.appendChild(badge); } catch(e){}
        }

        // Lire le partner_id du ticket via RPC
        const recs = await odooRpc('helpdesk.ticket', 'read', [[Number(ticketId)], ['partner_id']]);
        const partnerId = Array.isArray(recs) && recs[0] && Array.isArray(recs[0].partner_id) ? recs[0].partner_id[0] : null;
        if (!partnerId) { badge.innerHTML = ''; return; }

        // Prendre le partenaire commercial (entreprise) pour inclure tous les contacts enfants
        const pr = await odooRpc('res.partner', 'read', [[Number(partnerId)], ['commercial_partner_id']]);
        const commercialPartnerId = Array.isArray(pr) && pr[0] && Array.isArray(pr[0].commercial_partner_id) ? pr[0].commercial_partner_id[0] : partnerId;

        // Récupérer tous les contacts appartenant à l'entreprise
        const partnerIds = await odooRpc('res.partner', 'search', [[['commercial_partner_id', '=', commercialPartnerId]]]);

        // Compter toutes les ventes (quel que soit l'état) pour ces contacts
        const count = await odooRpc('sale.order', 'search_count', [[
            ['partner_id', 'in', Array.isArray(partnerIds) ? partnerIds : [commercialPartnerId]]
        ]]);

        const n = Number(count) || 0;
        // Construire le contenu
        const btn = document.createElement('button');
        btn.title = n > 0 ? `${n} ventes trouvées` : 'Aucune vente';
        btn.className = 'bd-btn' + (n > 0 ? '' : ' empty');
        btn.onclick = async () => {
            if (n <= 0) return;
            // Charger jusqu'à 20 ventes récentes et les proposer dans un popup cliquable
            const titleField = await detectSaleOrderTitleField();
            const baseFields = ['name','state','date_order','amount_total','currency_id'];
            if (titleField) baseFields.push(titleField);
            const records = await odooRpc('sale.order', 'search_read', [
                [
                    ['partner_id', 'in', Array.isArray(partnerIds) ? partnerIds : [commercialPartnerId]]
                ],
                baseFields,
                0, 20, 'date_order desc'
            ]);
            const popId = 'popup-devis-odoobtn';
            const old = document.getElementById(popId);
            if (old) old.remove();
            const pop = document.createElement('div');
            pop.id = popId;
            pop.className = 'popup-devis-odoobtn';
            const header = document.createElement('header');
            header.innerHTML = `<span>Ventes (${n})</span>`;
            const close = document.createElement('button');
            close.textContent = 'Fermer';
            close.onclick = () => pop.remove();
            header.appendChild(close);
            const list = document.createElement('ul');
            const stateMap = { draft: 'Brouillon', sent: 'Envoyé', sale: 'Bon de commande', done: 'Terminé', cancel: 'Annulé' };
            (records || []).forEach(r => {
                const li = document.createElement('li');
                // Classe en fonction du statut
                const st = String(r.state || '').toLowerCase();
                if (st === 'sale' || st === 'done') li.classList.add('state-sale');
                if (st === 'cancel') li.classList.add('state-cancel');
                const a = document.createElement('a');
                a.href = `/web?debug=#id=${r.id}&model=sale.order&view_type=form`;
                a.target = '_blank';
                a.textContent = r.name;
                // Empêcher le clic sur le numéro d'ouvrir/fermer les lignes
                a.addEventListener('click', (ev) => { ev.stopPropagation(); });
                const titleFieldName = saleOrderTitleFieldName;
                if (titleFieldName && r[titleFieldName]) {
                    const t = document.createElement('span');
                    t.className = 'so-title';
                    t.textContent = `— ${r[titleFieldName]}`;
                    li.appendChild(t);
                }
                const muted = document.createElement('span');
                muted.className = 'muted';
                const dt = r.date_order ? new Date(r.date_order) : null;
                const fmt = dt ? dt.toLocaleDateString()+' '+dt.toLocaleTimeString().slice(0,5) : '';
                const cur = Array.isArray(r.currency_id) ? r.currency_id[1] : '';
                const stFr = stateMap[st] || r.state;
                muted.textContent = `${fmt} • ${stFr} • ${Math.round((r.amount_total||0)*100)/100} ${cur}`;
                li.appendChild(a);
                li.appendChild(muted);

                // Chargement paresseux des lignes au clic
                li.addEventListener('click', async (e) => {
                    // Éviter d'ouvrir le lien si on clique dans la ligne
                    if (e.target && e.target.tagName === 'A') return;
                    e.preventDefault();
                    // Toggle si déjà chargé
                    const existing = li.querySelector('.so-lines');
                    if (existing) { existing.remove(); return; }
                    const lines = await odooRpc('sale.order.line', 'search_read', [
                        [['order_id', '=', r.id]],
                        ['name','product_uom_qty','price_unit','price_subtotal','currency_id'],
                        0, 100, 'sequence asc'
                    ]);
                    const box = document.createElement('div');
                    box.className = 'so-lines';
                    const header = document.createElement('div');
                    header.className = 'line header';
                    header.innerHTML = '<div>Produit</div><div>Qté</div><div>Prix</div><div>Sous-total</div>';
                    box.appendChild(header);
                    (lines||[]).forEach(l => {
                        const row = document.createElement('div');
                        row.className = 'line';
                        const cur = Array.isArray(l.currency_id) ? l.currency_id[1] : '';
                        row.innerHTML = `
                            <div class="pname">${(l.name||'').replace(/\n/g,' ')} </div>
                            <div class="qty">${Number(l.product_uom_qty||0)}</div>
                            <div class="price">${Math.round((l.price_unit||0)*100)/100} ${cur}</div>
                            <div class="subtotal">${Math.round((l.price_subtotal||0)*100)/100} ${cur}</div>
                        `;
                        box.appendChild(row);
                    });
                    li.classList.add('expanded');
                    li.appendChild(box);
                });
                list.appendChild(li);
            });
            pop.appendChild(header);
            pop.appendChild(list);
            document.body.appendChild(pop);
        };
        // Icône sac
        const bag = document.createElement('span');
        bag.className = 'bd-bag';
        btn.appendChild(bag);
        // Libellé dans le bouton
        const label = document.createElement('span');
        label.className = 'bd-label';
        label.textContent = 'Ventes';
        btn.appendChild(label);
        // Bulle compteur au bord du bouton
        if (n > 0) {
            const c = document.createElement('span');
            c.className = 'bd-count';
            c.textContent = String(Math.min(n, 99));
            btn.appendChild(c);
        }

        badge.innerHTML = '';
        badge.style.marginRight = '8px';
        badge.appendChild(btn);
    }

    function scheduleBadgeDevisUpdate(delay = 400) {
        clearTimeout(devisBadgeUpdateTimer);
        devisBadgeUpdateTimer = setTimeout(mettreAJourBadgeDevis, delay);
    }

    // Placement immédiat au plus tôt
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            assurerBadgeImmediatPlacement();
            scheduleBadgeDevisUpdate(50);
        });
    } else {
        setTimeout(() => { assurerBadgeImmediatPlacement(); scheduleBadgeDevisUpdate(50); }, 0);
    }
    // Observer pour re-placer dès que la barre stats apparaît
    const observerStatsInstant = new MutationObserver(() => {
        const isTicketPage = window.location.href.includes('model=helpdesk.ticket');
        if (!isTicketPage) { removeDevisBadge(); return; }
        if (assurerBadgeImmediatPlacement()) {
            // Une fois placé, on peut arrêter si souhaité mais on garde pour robustesse
        }
    });
    observerStatsInstant.observe(document.body, { childList: true, subtree: true });

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
        scheduleBadgeDevisUpdate(800);
        // Nettoyage si on quitte la fiche ticket
        retirerBoutonsTraitement();
        const bc = document.getElementById('btn-creer-ticket');
        if (bc && !isHelpdeskTicketForm()) bc.remove();
        const bi = document.getElementById('btn-inserer-initiales');
        if (bi && !isHelpdeskTicketForm()) bi.remove();
    });

    // Vérification périodique
    setInterval(createClearButton, 5000);
    setInterval(scheduleBadgeDevisUpdate, 5000);

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

    // Style clignotement léger pour le tag INTERNET
    const styleInternet = document.createElement('style');
    styleInternet.textContent = `
    @keyframes internetBlink {
      0% { filter: none; background-color: rgba(30,136,229,0.10); box-shadow: 0 0 0 0 rgba(30,136,229,0); }
      50% { filter: brightness(1.12) saturate(1.15); background-color: rgba(30,136,229,0.22); box-shadow: 0 0 16px 3px rgba(30,136,229,0.55); }
      100% { filter: none; background-color: rgba(30,136,229,0.10); box-shadow: 0 0 0 0 rgba(30,136,229,0); }
    }
    @keyframes internetRing {
      0% { opacity: .25; transform: scale(0.98); }
      50% { opacity: .65; transform: scale(1); }
      100% { opacity: .25; transform: scale(0.98); }
    }
    .internet-blink {
      animation: internetBlink 1.2s infinite;
      position: relative;
      z-index: 1;
    }
    .internet-blink::after {
      content: '';
      position: absolute;
      left: -2px; right: -2px; top: -2px; bottom: -2px;
      border-radius: 6px;
      pointer-events: none;
      box-shadow: 0 0 18px 4px rgba(30,136,229,0.55);
      animation: internetRing 1.2s infinite;
      z-index: 2;
    }
    `;
    document.head.appendChild(styleInternet);

    function appliquerClignotementInternet() {
        try {
            const nodes = document.querySelectorAll('.o_tag, .badge, .o_tag_badge_text, .o_tag_badge, .o_badge');
            nodes.forEach(el => {
                const text = (el.textContent || '').trim().toLowerCase();
                if (text.includes('internet')) {
                    const target = el.classList && (el.classList.contains('o_tag') || el.classList.contains('badge'))
                        ? el
                        : (el.closest && el.closest('.o_tag, .badge')) || el;
                    if (target && target.classList && !target.classList.contains('internet-blink')) {
                        target.classList.add('internet-blink');
                    }
                }
            });
        } catch (e) { /* ignore */ }
    }

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
