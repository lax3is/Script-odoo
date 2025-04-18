// ==UserScript==
// @name         Bouton Traiter l'Appel Odoo
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Ajoute un bouton "Traiter l'appel" avec texte clignotant
// @author       Alexis.sair
// @match        https://winprovence.odoo.com/*
// @match        http://winprovence.odoo.com/*
// @updateURL    https://raw.githubusercontent.com/lax3is/Script-odoo/00efb80f8a0ce0ee703c342ba06f813f87f224dd/Bouton%20Traiter%20l'Appel%20Odoo.js
// @downloadURL  https://raw.githubusercontent.com/lax3is/Script-odoo/00efb80f8a0ce0ee703c342ba06f813f87f224dd/Bouton%20Traiter%20l'Appel%20Odoo.js
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
               document.querySelector('button:has(span:contains("Me l\'assigner"))') ||
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

            if (enTraitement) {
                btn.innerText = 'Mettre en Attente';
                btn.className = 'btn btn-warning';
                setTimeout(() => {
                    ajouterTexteCligonotant();
                }, 500);
            } else {
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
                    // Passage à "Mettre en Attente"
                    btn.innerText = 'Mettre en Attente';
                    btn.className = 'btn btn-warning';
                    ajouterTexteCligonotant();

                    if (ticketId) {
                        sauvegarderEtat(true, ticketId);

                        // Séquence d'actions
                        const executerActions = async () => {
                            try {
                                // Vérifier l'état du timer
                                const etatTimer = verifierEtatTimer();
                                console.log("État du timer détecté:", etatTimer);

                                // Cliquer sur ME L'ASSIGNER si nécessaire
                                if (!etatTimer) {
                                    const btnAssigner = trouverBoutonAssigner();
                                    if (btnAssigner) {
                                        console.log("Clic sur ME L'ASSIGNER");
                                        btnAssigner.click();
                                        await new Promise(resolve => setTimeout(resolve, 1000));
                                    }
                                }

                                // Gérer le timer selon son état
                                switch (etatTimer) {
                                    case 'relancer':
                                        console.log("Timer en pause, relance avec Alt+W");
                                        simulerRaccourciPause();
                                        break;
                                    case 'lancer':
                                        console.log("Démarrage du timer avec Alt+Z");
                                        simulerRaccourciTimer();
                                        break;
                                    case 'pause':
                                        console.log("Timer déjà en cours");
                                        break;
                                    default:
                                        console.log("Démarrage initial du timer avec Alt+Z");
                                        simulerRaccourciTimer();
                                }

                                // Attendre avant d'enregistrer
                                await new Promise(resolve => setTimeout(resolve, 500));

                                const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                                if (btnEnregistrer) {
                                    console.log("Enregistrement des modifications");
                                    btnEnregistrer.click();
                                }
                            } catch (error) {
                                console.error("Erreur lors de l'exécution des actions:", error);
                            }
                        };

                        executerActions();
                    }
                } else {
                    // Passage à "Traiter l'appel"
                    btn.innerText = 'Traiter l\'appel';
                    btn.className = 'btn btn-primary';
                    supprimerTexteCligonotant();

                    if (ticketId) {
                        sauvegarderEtat(false, ticketId);

                        // Mettre en pause avec Alt+W
                        console.log("Mise en pause du timer avec Alt+W");
                        simulerRaccourciPause();

                        // Attendre avant d'enregistrer
                        await new Promise(resolve => setTimeout(resolve, 500));

                        const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                        if (btnEnregistrer) {
                            console.log("Enregistrement des modifications");
                            btnEnregistrer.click();
                        }
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
            // on force la création du bouton
            ajouterBoutonTraiter();
            // On vérifie à nouveau après un court délai
            return new Promise(resolve => {
                setTimeout(() => {
                    const boutonTraiter = document.getElementById('btn-traiter-appel');
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
                const boutonTraiter = document.getElementById('btn-traiter-appel');
                if (boutonTraiter && boutonTraiter.innerText === 'Mettre en Attente') {
                    console.log("Traitement en cours détecté, arrêt complet du timer");

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
                    boutonTraiter.innerText = 'Traiter l\'appel';
                    boutonTraiter.className = 'btn btn-primary';

                    // Supprimer le texte clignotant
                    supprimerTexteCligonotant();

                    // Attendre un peu pour s'assurer que le texte est bien supprimé
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Faire un deuxième clic sur le bouton de sauvegarde
                    const btnEnregistrer = document.querySelector('button.o_form_button_save, button[data-hotkey="s"]');
                    if (btnEnregistrer) {
                        console.log("Deuxième enregistrement des modifications après suppression du texte");
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

    // Modifier la fonction d'initialisation pour inclure la modification du bouton de clôture
    function initialiserScript() {
        console.log("Tentative d'initialisation du script");
        if (document.readyState === 'complete') {
            setTimeout(() => {
                ajouterBoutonTraiter();
                gererClotureTicket();
                modifierBoutonCloture(); // Ajouter l'appel à la nouvelle fonction

                // Vérification initiale au cas où le ticket est déjà résolu
                if (estTicketResolu()) {
                    console.log("Ticket déjà résolu lors de l'initialisation");
                    const boutonTraiter = document.getElementById('btn-traiter-appel');
                    if (boutonTraiter && boutonTraiter.innerText === 'Mettre en Attente') {
                        boutonTraiter.click();
                    }
                }
            }, 1000);
        } else {
            setTimeout(initialiserScript, 1000);
        }
    }

    // Modifier l'observer pour inclure la modification du bouton de clôture
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.addedNodes.length) {
                setTimeout(() => {
                    ajouterBoutonTraiter();
                    modifierBoutonCloture(); // Ajouter l'appel à la nouvelle fonction
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
})();
