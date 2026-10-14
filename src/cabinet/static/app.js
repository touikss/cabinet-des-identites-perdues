"use strict";

const API = "/api";

let sessionId = null;
let tags = ["", "", ""];
let cibleTemoin = 0;
let cibleTemoinVerdict = null;

const DOSSIERS = [
  {
    id: "facile",
    cote: "Carton A",
    nom: "Facile",
    couleur: "var(--encre-2)",
    desc: "Des événements que tout le monde a croisés à l'école. Les indices se reconnaissent vite.",
    tags: ["ÉVÉNEMENTS MAJEURS"],
    evenements: [
      "La chute de Constantinople (1453)",
      "Le sacre de Napoléon (1804)",
      "La signature de la Déclaration d'indépendance américaine (1776)",
      "Le procès de Galilée (1633)",
      "La construction de la tour Eiffel (1887-1889)",
      "Le premier vol des frères Wright (1903)",
      "L'éruption du Vésuve et la destruction de Pompéi (79)",
      "Le couronnement de Charlemagne (800)",
      "La signature de la Magna Carta (1215)",
      "L'abolition de l'esclavage en France (1848)",
    ],
  },
  {
    id: "classique",
    cote: "Carton B",
    nom: "Classique",
    couleur: "#8a6a3b",
    desc: "Des événements bien documentés mais moins cités. Il faut recouper deux ou trois indices.",
    tags: ["ÉVÉNEMENTS CONNUS"],
    evenements: [
      "Le concile de Constance (1414-1418)",
      "La construction de Notre-Dame de Paris (XIIe-XIVe siècle)",
      "Le procès de Jeanne d'Arc (1431)",
      "La peste noire à Florence (1348)",
      "L'invention de l'imprimerie par Gutenberg (v. 1450)",
      "Le couronnement de la reine Victoria (1838)",
      "L'exposition universelle de Paris (1889)",
      "La fondation de l'Académie française (1635)",
      "Le premier voyage de circumnavigation de Magellan (1519-1522)",
      "La construction du canal de Suez (1859-1869)",
    ],
  },
  {
    id: "difficile",
    cote: "Carton C",
    nom: "Difficile",
    couleur: "var(--encre-1)",
    desc: "Des événements obscurs, rarement enseignés. Les indices ne parlent qu'à qui cherche vraiment.",
    tags: ["ÉVÉNEMENTS OBSCURS"],
    evenements: [
      "Le concile de Nicée (325)",
      "La révolte des Bagaudes en Gaule romaine (IIIe siècle)",
      "La grande peste de Marseille (1720)",
      "Le procès des templiers (1307-1314)",
      "La construction de la cathédrale de Chartres (XIIe-XIIIe siècle)",
      "L'incendie de la bibliothèque d'Alexandrie",
      "Le schisme d'Occident et l'élection de plusieurs papes rivaux (1378)",
      "La fondation de l'université de Bologne (1088)",
      "La canicule et famine de 1315 en Europe",
      "Le grand incendie de Londres (1666)",
    ],
  },
  {
    id: "custom",
    cote: "Carton D",
    nom: "Sur commande",
    couleur: "var(--encre-3)",
    desc: "Vous désignez la lacune à combler : période, événement, lieu. L'archiviste sort le carton correspondant.",
    tags: ["LACUNE AU CHOIX"],
  },
];

const REGIMES_NOTORIETE = [
  { id: "facile", label: "Événement majeur" },
  { id: "classique", label: "Événement connu" },
  { id: "difficile", label: "Événement obscur" },
];

const REGLEMENT_ARTICLES = [
  {
    numeral: "I",
    titre: "Accès aux témoins",
    clauses: [
      "Une question par tour, adressée à un seul témoin. Le destinataire se désigne avant de verser la question au dossier.",
      "Le témoin interrogé répond toujours ; les deux autres peuvent réagir d'eux-mêmes s'ils ont quelque chose à ajouter ou à contredire.",
      "Aucun témoin ne mentira : ils ne disent que ce qu'ils ont vu, dans les termes de leur temps, et ignorent le nom de ce qu'ils vivent.",
      "Un témoin qui ne sait pas le dira. Le silence n'est jamais un aveu.",
    ],
  },
  {
    numeral: "II",
    titre: "Pièces exigées à la clôture",
    clauses: [
      "Le bulletin de résolution demande trois mentions : le nom de l'événement, sa date, et lequel des trois témoins est le personnage historique.",
      "Aucune fiche n'est acceptée incomplète. Le bulletin reste scellable tant que les trois mentions ne sont pas renseignées.",
      "Une fois scellé, le bulletin est versé au dossier : il ne se rouvre pas.",
    ],
  },
  {
    numeral: "III",
    titre: "Barème de restitution",
    clauses: ["La note finale est établie sur cent points, répartis entre les trois mentions et l'économie de questions."],
    rows: [
      { no: "01", k: "Événement historique", v: "40", rule: "Tout ou rien : l'événement est nommé ou il ne l'est pas." },
      { no: "02", k: "Date", v: "20", rule: "Par paliers d'écart : exacte 20, jusqu'à dix ans 15, cinquante ans 10, cent ans 5, deux cents ans 3, au-delà rien." },
      { no: "03", k: "Personnage historique", v: "15", rule: "Nom exact 10 points, bon témoin désigné 5 points, les deux comptés séparément." },
      { no: "04", k: "Économie de questions", v: "25", rule: "Plein jusqu'à six questions, puis deux points retirés par question supplémentaire." },
    ],
  },
  {
    numeral: "IV",
    titre: "Tenue du carnet",
    clauses: [
      "Le carnet de déduction se remplit seul à partir des dépositions recueillies, classé par témoin puis par indice.",
      "Il ne se corrige ni ne s'annote : il consigne, il n'interprète pas.",
    ],
  },
];

let cartonActuel = "classique";
let regimeNotoriete = "classique";
const champsCustom = { epoch: "", event: "", date: "", lieu: "" };

const el = (id) => document.getElementById(id);

function afficherEcran(id) {
  document.querySelectorAll(".ecran").forEach((e) => (e.hidden = true));
  el(id).hidden = false;
}

async function api(path, method, body) {
  const options = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Erreur serveur" }));
    throw new Error(data.detail || "Erreur serveur");
  }
  return res.json();
}

async function streamNDJSON(path, method, body, onLine) {
  const options = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const res = await fetch(API + path, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Erreur serveur" }));
    throw new Error(data.detail || "Erreur serveur");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const ligne = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (ligne) onLine(JSON.parse(ligne));
    }
  }
  const reste = buffer.trim();
  if (reste) onLine(JSON.parse(reste));
}

function romain(i) {
  return ["I", "II", "III"][i];
}

function versRomain(nombre) {
  const valeurs = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const symboles = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let reste = nombre;
  let resultat = "";
  for (let i = 0; i < valeurs.length; i++) {
    while (reste >= valeurs[i]) {
      resultat += symboles[i];
      reste -= valeurs[i];
    }
  }
  return resultat;
}

function formaterNumeroDossier(numero, suffixe) {
  return `${versRomain(numero)}-${String(suffixe).padStart(2, "0")}`;
}

function rendreCarnet(carnet) {
  const conteneur = el("carnet-contenu");
  conteneur.innerHTML = "";
  let compte = 0;
  const groupes = [{ tag: "Généraux", couleur: "var(--laiton-clair)", items: carnet.generaux || [] }];
  for (let i = 0; i < 3; i++) {
    groupes.push({ tag: (tags[i] || `Témoin ${i + 1}`).toUpperCase(), couleur: `var(--encre-${i + 1})`, items: carnet[`temoin_${i + 1}`] || [] });
  }
  groupes.forEach((g) => {
    if (!g.items.length) return;
    const bloc = document.createElement("div");
    bloc.className = "groupe-carnet";
    const entete = document.createElement("div");
    entete.className = "groupe-entete";
    entete.innerHTML = `<span class="mono" style="color:${g.couleur}"></span><span class="ligne"></span>`;
    entete.querySelector(".mono").textContent = g.tag;
    bloc.appendChild(entete);
    g.items.forEach((texte) => {
      const fiche = document.createElement("div");
      fiche.className = "fiche";
      fiche.style.setProperty("--accent", g.couleur);
      fiche.textContent = texte;
      bloc.appendChild(fiche);
      compte++;
    });
    conteneur.appendChild(bloc);
  });
  el("carnet-compte").textContent = compte + (compte > 1 ? " fiches" : " fiche");
}

function rendreChoixTemoin(container, actifIndex, onPick) {
  container.innerHTML = "";
  tags.forEach((tag, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-temoin" + (i === actifIndex ? " actif" : "");
    btn.style.color = `var(--encre-${i + 1})`;
    const puce = document.createElement("span");
    puce.className = "puce";
    btn.appendChild(puce);
    btn.appendChild(document.createTextNode((tag || `Témoin ${i + 1}`).toUpperCase()));
    btn.addEventListener("click", () => onPick(i));
    container.appendChild(btn);
  });
}

function rendreChoixTemoinRadio(container, actifIndex, onPick) {
  container.innerHTML = "";
  container.className = "liste-temoin-radio";
  tags.forEach((tag, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-temoin-radio" + (i === actifIndex ? " actif" : "");
    btn.style.color = `var(--encre-${i + 1})`;
    btn.innerHTML = '<span class="puce"></span><span class="who"></span>';
    btn.querySelector(".who").textContent = (tag || `Témoin ${i + 1}`).toUpperCase();
    btn.addEventListener("click", () => onPick(i));
    container.appendChild(btn);
  });
}

function rafraichirChoixTemoins() {
  rendreChoixTemoin(el("choix-temoin"), cibleTemoin, (i) => {
    cibleTemoin = i;
    rafraichirChoixTemoins();
  });
  rendreChoixTemoinRadio(el("choix-temoin-verdict"), cibleTemoinVerdict, (i) => {
    cibleTemoinVerdict = i;
    rafraichirChoixTemoins();
    validerFormulaireVerdict();
  });
}

let repliquesRoundCourant = null;

function scrollerVersLeBas() {
  const scroll = document.querySelector(".principal-scroll");
  scroll.scrollTop = scroll.scrollHeight;
}

function nouveauRound(question) {
  const round = document.createElement("div");
  round.className = "round";
  if (question !== null) {
    const ligneQ = document.createElement("div");
    ligneQ.className = "ligne-joueur";
    ligneQ.innerHTML = '<div class="tampon joueur">❖</div><div class="texte-joueur"></div>';
    ligneQ.querySelector(".texte-joueur").textContent = question;
    round.appendChild(ligneQ);
  }
  const replies = document.createElement("div");
  replies.className = "round-replies";
  round.appendChild(replies);
  el("rounds").appendChild(round);
  repliquesRoundCourant = replies;
  scrollerVersLeBas();
  return replies;
}

function ajouterReponseTemoin(locuteur, texte) {
  const div = document.createElement("div");
  div.className = `ligne-temoin t${locuteur}`;
  div.innerHTML =
    '<div class="tampon"></div><div><div class="nom-temoin"><span class="nom-temoin-texte"></span><span class="ligne"></span></div><div class="texte-temoin"></div></div>';
  div.querySelector(".tampon").textContent = romain(locuteur);
  div.querySelector(".nom-temoin-texte").textContent = (tags[locuteur] || `Témoin ${locuteur + 1}`).toUpperCase();
  div.querySelector(".texte-temoin").textContent = texte;
  repliquesRoundCourant.appendChild(div);
  scrollerVersLeBas();
}

function reconstruireDepuisLog(log) {
  el("rounds").innerHTML = "";
  el("texte-narration").textContent = "";
  nouveauRound(null);
  log.forEach((entry) => {
    if (entry.locuteur === "Narration") {
      el("texte-narration").textContent = entry.texte;
    } else if (entry.locuteur === "Joueur") {
      nouveauRound(entry.texte);
    } else {
      ajouterReponseTemoin(entry.locuteur, entry.texte);
    }
  });
}

function validerFormulaireVerdict() {
  const pret =
    el("input-evenement").value.trim() &&
    el("input-epoque").value.trim() &&
    el("input-personnage").value.trim() &&
    cibleTemoinVerdict !== null;
  el("btn-sceller").disabled = !pret;
}

function demarrerEcranJeu(numero, suffixe, ambiance) {
  el("numero-dossier-jeu").textContent = formaterNumeroDossier(numero, suffixe);
  el("texte-ambiance").textContent = ambiance;
  cibleTemoin = 0;
  cibleTemoinVerdict = null;
  el("input-evenement").value = "";
  el("input-epoque").value = "";
  el("input-personnage").value = "";
  rafraichirChoixTemoins();
  validerFormulaireVerdict();
  afficherEcran("ecran-jeu");
}

function champsCustomRemplis() {
  return Object.values(champsCustom).filter((v) => v.trim()).length;
}

function themeActuel() {
  if (cartonActuel !== "custom") {
    const evenements = DOSSIERS.find((d) => d.id === cartonActuel).evenements;
    return evenements[Math.floor(Math.random() * evenements.length)];
  }
  const parts = [];
  if (champsCustom.epoch.trim()) parts.push(`époque : ${champsCustom.epoch.trim()}`);
  if (champsCustom.event.trim()) parts.push(`événement : ${champsCustom.event.trim()}`);
  if (champsCustom.date.trim()) parts.push(`date précise : ${champsCustom.date.trim()}`);
  if (champsCustom.lieu.trim()) parts.push(`lieu ou thème : ${champsCustom.lieu.trim()}`);
  const qualificatif = REGIMES_NOTORIETE.find((r) => r.id === regimeNotoriete).label.toLowerCase();
  return parts.join(", ") + ` (${qualificatif})`;
}

function rendreCartons() {
  const conteneur = el("cartons-dossier");
  conteneur.innerHTML = "";
  DOSSIERS.forEach((d) => {
    const actif = d.id === cartonActuel;
    const carton = document.createElement("button");
    carton.type = "button";
    carton.className = "carton" + (actif ? " actif" : "");
    carton.style.color = d.couleur;
    carton.innerHTML =
      '<span class="carton-accent"></span>' +
      '<span class="carton-tete"><span class="carton-cote"></span><span class="carton-puce"><span></span></span></span>' +
      '<span class="carton-nom"></span><span class="carton-desc"></span><span class="carton-tags"></span>';
    carton.querySelector(".carton-accent").style.background = d.couleur;
    carton.querySelector(".carton-cote").textContent = d.cote;
    carton.querySelector(".carton-puce").style.borderColor = d.couleur;
    carton.querySelector(".carton-nom").textContent = d.nom;
    carton.querySelector(".carton-desc").textContent = d.desc;
    const tagsSpan = carton.querySelector(".carton-tags");
    d.tags.forEach((t) => {
      const chip = document.createElement("span");
      chip.textContent = t;
      tagsSpan.appendChild(chip);
    });
    carton.addEventListener("click", () => {
      cartonActuel = d.id;
      rendreCartons();
      el("bordereau-commande").hidden = cartonActuel !== "custom";
      rafraichirAccueilPied();
    });
    conteneur.appendChild(carton);
  });
}

function rendreRegimesNotoriete() {
  const conteneur = el("regimes-notoriete");
  conteneur.innerHTML = "";
  REGIMES_NOTORIETE.forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-regime" + (r.id === regimeNotoriete ? " actif" : "");
    btn.innerHTML = '<span class="puce"></span>';
    btn.appendChild(document.createTextNode(r.label.toUpperCase()));
    btn.addEventListener("click", () => {
      regimeNotoriete = r.id;
      rendreRegimesNotoriete();
      rafraichirAccueilPied();
    });
    conteneur.appendChild(btn);
  });
}

function rafraichirAccueilPied() {
  const pret = cartonActuel !== "custom" || champsCustomRemplis() > 0;
  el("btn-lancer").disabled = !pret;
  if (cartonActuel === "custom") {
    const n = champsCustomRemplis();
    el("accueil-resume").textContent = n
      ? `Carton D · ${n} critère(s) fixé(s) · ${REGIMES_NOTORIETE.find((r) => r.id === regimeNotoriete).label.toLowerCase()}`
      : "Désignez au moins un critère pour lancer la commande.";
  } else {
    const d = DOSSIERS.find((x) => x.id === cartonActuel);
    el("accueil-resume").textContent = `${d.cote} · ${d.nom} · ${d.tags.join(" · ")}`;
  }
}

function initEcranAccueil() {
  rendreCartons();
  rendreRegimesNotoriete();
  el("bordereau-commande").hidden = cartonActuel !== "custom";
  rafraichirAccueilPied();
  [
    ["input-custom-epoch", "epoch"],
    ["input-custom-event", "event"],
    ["input-custom-date", "date"],
    ["input-custom-lieu", "lieu"],
  ].forEach(([id, cle]) => {
    el(id).addEventListener("input", (e) => {
      champsCustom[cle] = e.target.value;
      rafraichirAccueilPied();
    });
  });
}

function rendreReglement() {
  const conteneur = el("reglement-articles");
  if (conteneur.childElementCount) return;
  REGLEMENT_ARTICLES.forEach((a) => {
    const section = document.createElement("section");
    section.className = "reglement-article-bloc";
    const titre = document.createElement("div");
    titre.className = "reglement-article-titre";
    titre.innerHTML = '<span class="reglement-numeral"></span><h2></h2><span class="ligne"></span>';
    titre.querySelector(".reglement-numeral").textContent = `ARTICLE ${a.numeral}`;
    titre.querySelector("h2").textContent = a.titre;
    section.appendChild(titre);

    const liste = document.createElement("ul");
    liste.className = "reglement-clauses";
    a.clauses.forEach((cl) => {
      const li = document.createElement("li");
      li.innerHTML = '<span class="puce-section">§</span><span></span>';
      li.querySelector("span:last-child").textContent = cl;
      liste.appendChild(li);
    });
    section.appendChild(liste);

    if (a.rows) {
      const table = document.createElement("div");
      table.className = "reglement-table";
      a.rows.forEach((r) => {
        const row = document.createElement("div");
        row.className = "reglement-row";
        row.innerHTML = '<span class="no"></span><span><span class="k"></span><span class="rule"></span></span><span class="v"></span>';
        row.querySelector(".no").textContent = r.no;
        row.querySelector(".k").textContent = r.k;
        row.querySelector(".rule").textContent = r.rule;
        row.querySelector(".v").textContent = r.v;
        table.appendChild(row);
      });
      const total = document.createElement("div");
      total.className = "reglement-total";
      total.innerHTML = '<span></span><span class="label">TOTAL</span><span class="v">100</span>';
      table.appendChild(total);
      section.appendChild(table);
    }
    conteneur.appendChild(section);
  });
}

const LIGNES_CHARGEMENT = [
  "Le bordereau part au bureau d'accueil.",
  "Un pas décroît dans l'escalier de service.",
  "Une lampe s'allume, quelque part sous vos pieds.",
  "On cherche la bonne travée.",
  "Un carton glisse hors de son rayon, plus lourd qu'il n'y paraît.",
  "Les feuillets sont séparés un à un, avec précaution.",
  "Un nom est décollé de la fiche, hors de votre vue.",
  "Le silence de la salle est celui de l'attente.",
];

let chargementInterval = null;
let chargementDonnees = null;

function demarrerChargement() {
  chargementDonnees = null;
  let i = 0;
  el("v-chargement-dossier").textContent = "-";
  el("v-chargement-pct").textContent = "LEVÉE EN COURS";
  el("v-chargement-ligne").textContent = LIGNES_CHARGEMENT[0];
  el("chargement-dots").style.opacity = "1";
  el("btn-entrer-salle").disabled = true;
  el("btn-entrer-salle").textContent = "Entrer dans la salle";
  el("chargement-hint").textContent = "Merci de patienter à la table.";
  clearInterval(chargementInterval);
  chargementInterval = setInterval(() => {
    i += 1;
    el("v-chargement-ligne").textContent = LIGNES_CHARGEMENT[i % LIGNES_CHARGEMENT.length];
  }, 5000);
  afficherEcran("ecran-chargement");
}

function chargementTermine(data) {
  clearInterval(chargementInterval);
  chargementDonnees = data;
  el("v-chargement-dossier").textContent = formaterNumeroDossier(data.numero_dossier, data.numero_dossier_suffixe);
  el("v-chargement-pct").textContent = "CARTON EN SALLE";
  el("v-chargement-ligne").textContent = "Le carton est sur la table.";
  el("chargement-dots").style.opacity = "0";
  el("btn-entrer-salle").disabled = false;
  el("chargement-hint").textContent = "";
}

function chargementEchoue(message) {
  clearInterval(chargementInterval);
  chargementDonnees = null;
  el("v-chargement-pct").textContent = "LEVÉE INTERROMPUE";
  el("v-chargement-ligne").textContent = message;
  el("chargement-dots").style.opacity = "0";
  el("btn-entrer-salle").disabled = false;
  el("btn-entrer-salle").textContent = "Retour à l'accueil";
  el("chargement-hint").textContent = "";
}

async function entrerDansLaSalle() {
  if (el("btn-entrer-salle").disabled) return;
  const data = chargementDonnees;
  if (!data) {
    afficherEcran("ecran-couverture");
    return;
  }
  sessionId = data.session_id;
  tags = data.tags_temoins;
  demarrerEcranJeu(data.numero_dossier, data.numero_dossier_suffixe, data.contexte_ambiance);
  el("rounds").innerHTML = "";
  el("texte-narration").textContent = "";
  nouveauRound(null);
  await streamNDJSON(`/parties/${sessionId}/ouverture`, "GET", null, (ligne) => {
    if (ligne.type === "fin") {
      rendreCarnet(ligne.carnet);
      el("prochain-numero").textContent = ligne.nb_questions;
    } else if (ligne.locuteur === "Narration") {
      el("texte-narration").textContent = ligne.texte;
    } else {
      ajouterReponseTemoin(ligne.locuteur, ligne.texte);
    }
  });
}

async function lancerEnquete() {
  el("erreur-couverture").hidden = true;
  demarrerChargement();
  try {
    const theme = themeActuel();
    const data = await api("/parties", "POST", { theme });
    chargementTermine(data);
  } catch (err) {
    chargementEchoue(err.message);
  }
}

async function poserQuestion(question) {
  nouveauRound(question);
  await streamNDJSON(
    `/parties/${sessionId}/questions`,
    "POST",
    { witness_index: cibleTemoin, question },
    (ligne) => {
      if (ligne.type === "fin") {
        rendreCarnet(ligne.carnet);
        el("prochain-numero").textContent = ligne.nb_questions;
      } else {
        ajouterReponseTemoin(ligne.locuteur, ligne.texte);
      }
    }
  );
}

function grilleVerdict(score) {
  if (score >= 70) return { label: "Affaire résolue", color: "#3f5a45", grade: "MENTION D'ARCHIVISTE" };
  if (score >= 35) return { label: "Affaire partiellement résolue", color: "#8a6a3b", grade: "DOSSIER INCOMPLET" };
  return { label: "Affaire non résolue", color: "#8a3b2e", grade: "CLASSÉ SANS SUITE" };
}

function couleurCritere(valeur, max) {
  const r = max ? valeur / max : 0;
  if (r >= 0.66) return "#3f5a45";
  if (r > 0) return "#8a6a3b";
  return "#b3a077";
}

function rendreVerdict(verdict) {
  const grille = grilleVerdict(verdict.score);
  el("v-badge-verdict").style.borderColor = grille.color;
  el("v-badge-verdict").style.color = grille.color;
  el("v-verdict-label").textContent = grille.label;
  el("v-verdict-ligne").textContent = verdict.verdict_texte;
  el("v-score-nombre").textContent = verdict.score;
  el("v-grade").textContent = grille.grade;
  el("v-grade").style.color = grille.color;

  const points = verdict.points;
  const criteres = [
    { label: "Événement historique", valeur: points.evenement, max: 40 },
    { label: "Époque", valeur: points.date, max: 20 },
    { label: "Personnage important", valeur: points.personnage, max: 15 },
    { label: "Économie de questions", valeur: points.questions, max: 25 },
  ];
  const conteneurCriteres = el("v-criteres");
  conteneurCriteres.innerHTML = "";
  criteres.forEach((c) => {
    const couleur = couleurCritere(c.valeur, c.max);
    const pct = c.max ? Math.round((c.valeur / c.max) * 100) : 0;
    const item = document.createElement("div");
    item.className = "pv-critere";
    item.innerHTML =
      '<span class="pv-critere-label"><span></span></span>' +
      '<span class="pv-critere-valeur"></span>' +
      '<span class="pv-critere-barre"><span></span></span>';
    item.querySelector(".pv-critere-label span").textContent = c.label;
    const valSpan = item.querySelector(".pv-critere-valeur");
    valSpan.style.color = couleur;
    valSpan.textContent = c.valeur;
    const maxSpan = document.createElement("span");
    maxSpan.textContent = `/${c.max}`;
    valSpan.appendChild(maxSpan);
    const barre = item.querySelector(".pv-critere-barre span");
    barre.style.width = pct + "%";
    barre.style.background = couleur;
    conteneurCriteres.appendChild(item);
  });

  const conteneurTemoins = el("v-temoins");
  conteneurTemoins.innerHTML = "";
  verdict.identites.forEach((id, i) => {
    const couleur = `var(--encre-${i + 1})`;
    const carte = document.createElement("div");
    carte.className = "pv-temoin-carte";
    if (id.est_personnage_important) carte.style.borderColor = couleur;
    carte.innerHTML =
      '<span class="pv-temoin-accent"></span>' +
      '<div class="pv-temoin-entete"><span class="pv-temoin-numeral"></span><span class="pv-temoin-nom-bloc"><span class="pv-temoin-label"></span><span class="pv-temoin-nom"></span></span></div>' +
      '<p class="pv-temoin-bio"></p><span class="pv-temoin-tag"></span>';
    const accent = carte.querySelector(".pv-temoin-accent");
    accent.style.background = couleur;
    accent.style.opacity = id.est_personnage_important ? "1" : ".35";
    const numeral = carte.querySelector(".pv-temoin-numeral");
    numeral.style.borderColor = couleur;
    numeral.style.color = couleur;
    numeral.textContent = romain(i);
    carte.querySelector(".pv-temoin-label").textContent = `Témoin ${i + 1}`;
    carte.querySelector(".pv-temoin-nom").textContent = id.identite_secrete;
    carte.querySelector(".pv-temoin-bio").textContent = `Connu(e) pendant l'enquête comme « ${id.tag_public} ».`;
    const tag = carte.querySelector(".pv-temoin-tag");
    tag.style.color = couleur;
    tag.textContent = id.est_personnage_important ? "★ PERSONNAGE HISTORIQUE" : "ANONYME";
    conteneurTemoins.appendChild(carte);
  });

  const conteneurFaits = el("v-faits");
  conteneurFaits.innerHTML = "";
  [
    ["Événement", verdict.evenement_reel],
    ["Époque", verdict.epoque_reelle],
    ["Personnage caché", verdict.identites.find((id) => id.est_personnage_important)?.identite_secrete || ""],
  ].forEach(([cle, valeur]) => {
    const fait = document.createElement("div");
    fait.className = "pv-fait";
    fait.innerHTML = '<div class="pv-fait-cle"></div><div class="pv-fait-valeur"></div>';
    fait.querySelector(".pv-fait-cle").textContent = cle.toUpperCase();
    fait.querySelector(".pv-fait-valeur").textContent = valeur;
    conteneurFaits.appendChild(fait);
  });

  el("v-debriefing").textContent = verdict.debriefing;

  const dossierTexte = el("numero-dossier-jeu").textContent;
  el("v-dossier-tag").textContent = `Dossier ${dossierTexte}`;
  el("v-piece-scellee").textContent = `Pièce scellée · ${dossierTexte}`;
  el("v-cloture-tag").textContent =
    "Clôturé le " + new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  afficherEcran("ecran-verdict");
}

async function sceller() {
  const guesses = {
    evenement: el("input-evenement").value.trim(),
    epoque: el("input-epoque").value.trim(),
    personnage: el("input-personnage").value.trim(),
    temoin_associe: cibleTemoinVerdict + 1,
  };
  el("btn-sceller").disabled = true;
  try {
    const verdict = await api(`/parties/${sessionId}/verdict`, "POST", guesses);
    rendreVerdict(verdict);
  } finally {
    el("btn-sceller").disabled = false;
  }
}

function nouvelleEnquete() {
  sessionId = null;
  afficherEcran("ecran-couverture");
}

function initEcouteurs() {
  el("btn-lancer").addEventListener("click", lancerEnquete);
  el("btn-entrer-salle").addEventListener("click", entrerDansLaSalle);
  el("btn-reglement").addEventListener("click", () => {
    rendreReglement();
    afficherEcran("ecran-reglement");
  });
  el("btn-retour-cartons").addEventListener("click", () => afficherEcran("ecran-couverture"));
  el("btn-choisir-dossier").addEventListener("click", () => afficherEcran("ecran-couverture"));

  el("form-question").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = el("input-question");
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    poserQuestion(question);
  });

  el("btn-tiroir").addEventListener("click", () => el("tiroir").classList.toggle("ouvert"));
  el("btn-fermer-tiroir").addEventListener("click", () => el("tiroir").classList.remove("ouvert"));

  ["input-evenement", "input-epoque", "input-personnage"].forEach((id) => {
    el(id).addEventListener("input", validerFormulaireVerdict);
  });

  el("form-verdict").addEventListener("submit", (e) => {
    e.preventDefault();
    sceller();
  });

  el("btn-nouvelle-enquete").addEventListener("click", nouvelleEnquete);
  el("btn-relire-registre").addEventListener("click", () => afficherEcran("ecran-jeu"));
}

async function tenterRestauration() {
  const stocke = localStorage.getItem("session_id");
  if (!stocke) return false;
  try {
    const data = await api(`/parties/${stocke}`, "GET");
    sessionId = stocke;
    tags = data.tags_temoins;
    demarrerEcranJeu(data.numero_dossier, data.numero_dossier_suffixe, data.contexte_ambiance);
    reconstruireDepuisLog(data.log);
    rendreCarnet(data.carnet);
    el("prochain-numero").textContent = data.nb_questions;
    return true;
  } catch {
    localStorage.removeItem("session_id");
    return false;
  }
}

// Conserve le session_id courant pour permettre une restauration après rafraîchissement.
window.addEventListener("beforeunload", () => {
  if (sessionId) localStorage.setItem("session_id", sessionId);
  else localStorage.removeItem("session_id");
});

initEcouteurs();
initEcranAccueil();
tenterRestauration().then((restaure) => {
  if (!restaure) afficherEcran("ecran-couverture");
});
