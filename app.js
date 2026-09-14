// Application State
let currentLang = 'greek';
let currentQuizIndex = 0;
let recognition = null;
let isRecording = false;

const LESSON_DATA = {
  greek: {
    badge: "🇬🇷 Grieks • Les 04 (A0)",
    title: "De Drie Geslachten & Lidwoorden (ο, η, το)",
    focus: "Herken direct het geslacht van een Grieks zelfstandig naamwoord aan de uitgang en leer de sleutelwerkwoorden είμαι (zijn) en έχω (hebben).",
    folder: "Grieks",
    vocab: [
      { term: "ο καφές", translit: "o kafés", meaning: "de koffie (mannelijk)" },
      { term: "η ημέρα", translit: "i iméra", meaning: "de dag (vrouwelijk)" },
      { term: "το νερό", translit: "to neró", meaning: "het water (onzijdig)" },
      { term: "είμαι", translit: "íme", meaning: "ik ben" },
      { term: "έχω", translit: "écho", meaning: "ik heb" }
    ],
    speechTarget: {
      greek: "Ο καφές είναι κρύος.",
      translit: "O kafés íne kríos.",
      dutch: "De koffie is koud."
    },
    quizzes: [
      {
        question: "Welk lidwoord hoort bij het woord 'ταβέρνα' (taverne)?",
        options: ["ο ταβέρνα", "η ταβέρνα", "το ταβέρνα", "τον ταβέρνα"],
        correct: 1,
        rule: "Woorden die eindigen op een klinker zoals -α of -η zijn in het Nieuwgrieks vrijwel altijd vrouwelijk en krijgen dus het lidwoord 'η'."
      },
      {
        question: "Welke uitgang duidt typisch op een MANNELIJK woord in de nominatief?",
        options: ["-μα (bv. πρόβλημα)", "-η (bv. μουσική)", "-ος (bv. φίλος)", "-ι (bv. σπίτι)"],
        correct: 2,
        rule: "Mannelijke woorden in het Grieks eindigen in de onderwerpsvorm (nominatief) vrijwel altijd op een sigma (-ς), specifiek op -ος, -ας of -ης."
      },
      {
        question: "Hoe zeg je 'Wij hebben een probleem' in het Grieks?",
        options: ["Έχουμε ένα πρόβλημα.", "Είμαστε ένα πρόβλημα.", "Έχετε το πρόβλημα.", "Έχω ένα πρόβλημα."],
        correct: 0,
        rule: "'Έχουμε' is de wij-vorm (1e persoon meervoud) van het werkwoord 'έχω' (hebben). 'πρόβλημα' is onzijdig (το πρόβλημα), vandaar het onbepaald lidwoord 'ένα'."
      }
    ],
    grammarTitle: "De Drie Geslachten & Het Systeem van Uitgangen",
    grammarHtml: `
      <div class="space-y-3">
        <p>In het Grieks heeft elk zelfstandig naamwoord een geslacht:</p>
        <ul class="list-disc list-inside space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <li><strong>Mannelijk (ο):</strong> Eindigt op <code>-ος</code>, <code>-ας</code> of <code>-ης</code> (bv. <em>ο φίλος, ο άντρας, ο μαθητής</em>).</li>
          <li><strong>Vrouwelijk (η):</strong> Eindigt op <code>-α</code> of <code>-η</code> (bv. <em>η θάλασσα, η μουσική</em>).</li>
          <li><strong>Onzijdig (το):</strong> Eindigt op <code>-ο</code>, <code>-ι</code> of <code>-μα</code> (bv. <em>το βιβλίο, το σπίτι, το πρόβλημα</em>).</li>
        </ul>
        <h4 class="font-bold text-slate-800 pt-2">Vervoeging van είμαι (zijn):</h4>
        <p class="text-xs text-slate-600">είμαι (ik ben), είσαι (jij bent), είναι (hij/zij/het is), είμαστε (wij zijn), είστε (jullie zijn), είναι (zij zijn).</p>
      </div>
    `
  },
  french: {
    badge: "🇫🇷 Français • Perfectionnement C1/C2",
    title: "Stijlregisters & Tournures Idiomatiques Soutenues",
    focus: "Transformeer gesproken omgangstaal naar elegant, diplomatiek Frans en beheers de fijne nuances van de subjonctif in relatieve bijzinnen.",
    folder: "Frans",
    vocab: [
      { term: "Avoir voix au chapitre", meaning: "Recht van spreken / invloed hebben" },
      { term: "Chercher midi à 14h", meaning: "Onnodig ingewikkeld maken" },
      { term: "Faire long feu", meaning: "Mislukken / effect missen" },
      { term: "Au demeurant", meaning: "Overigens / alles in acht genomen" },
      { term: "Péremptoire", meaning: "Beslissend / categorisch" }
    ],
    speechTarget: {
      french: "Il convient de ne point chercher midi à quatorze heures.",
      dutch: "Het past om de zaken niet onnodig ingewikkeld te maken."
    },
    quizzes: [
      {
        question: "Wat is de juiste betekenis van « Ce projet a fait long feu »?",
        options: [
          "Het project was een gigantisch succes.",
          "Het project is snel en roemloos mislukt.",
          "Het project heeft tientallen jaren geduurd.",
          "Het project werd uitgesteld."
        ],
        correct: 1,
        rule: "Let op! 'Faire long feu' betekent historisch dat het kruit vlam vatte zonder dat de kogel werd afgevuurd. Het betekent dus MISLUKKEN. 'Ne pas faire long feu' betekent daarentegen: zeer kort duren."
      },
      {
        question: "Kies de juiste modus: « Je cherche un collègue qui _____ (savoir) coder en Python et en C++. » (Ideaal gewenst profiel, bestaan onzeker)",
        options: ["sait (indicatif)", "sache (subjonctif)", "saura (futur)", "saurait (conditionnel)"],
        correct: 1,
        rule: "In relatieve bijzinnen na een wens/zoektocht drukt het subjonctif ('sache') een hypothetisch ideaalbeeld uit waarvan het bestaan niet gegarandeerd is."
      },
      {
        question: "Welke formulering tilt « C'est clair que ça va rater » naar het hoogste diplomatieke register (soutenu)?",
        options: [
          "C'est évident qu'on va perdre.",
          "Il est indubitable que cette démarche est vouée à l'échec.",
          "On voit bien que ça ne marchera pas du tout.",
          "Franchement, le projet n'a aucune chance."
        ],
        correct: 1,
        rule: "'Il est indubitable que...' en 'vouée à l'échec' verheffen de zin naar een academisch en diplomatiek register zonder vulgair of alledaags te klinken."
      }
    ],
    grammarTitle: "L'art de l'élévation stylistique & le Subjonctif",
    grammarHtml: `
      <div class="space-y-3">
        <p>In het Frans op C1/C2-niveau maak je het verschil door je registerbeheersing:</p>
        <ul class="list-disc list-inside space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <li><strong>Familier:</strong> <em>On laisse tomber</em> ➔ <strong>Soutenu:</strong> <em>Il sied de renoncer</em>.</li>
          <li><strong>Familier:</strong> <em>C'est trop risqué</em> ➔ <strong>Soutenu:</strong> <em>L'aléa est par trop manifeste</em>.</li>
        </ul>
        <h4 class="font-bold text-slate-800 pt-2">Subjonctif dans les relatives :</h4>
        <p class="text-xs text-slate-600">
          - <em>« Je connais quelqu'un qui <strong>peut</strong> le faire »</em> (Réel ➔ indicatif).<br>
          - <em>« Je cherche quelqu'un qui <strong>puisse</strong> le faire »</em> (Hypothèse ➔ subjonctif).
        </p>
      </div>
    `
  }
};

function switchLanguage(lang) {
  currentLang = lang;
  currentQuizIndex = 0;

  // Toggle tab buttons
  const tabGreek = document.getElementById('tab-greek');
  const tabFrench = document.getElementById('tab-french');
  
  if (lang === 'greek') {
    tabGreek.className = "px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 bg-white text-indigo-600 shadow-sm";
    tabFrench.className = "px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 text-slate-600 hover:text-slate-900";
    document.getElementById('lesson-badge').className = "inline-flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200";
  } else {
    tabFrench.className = "px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 bg-white text-indigo-600 shadow-sm";
    tabGreek.className = "px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 text-slate-600 hover:text-slate-900";
    document.getElementById('lesson-badge').className = "inline-flex items-center space-x-2 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200";
  }

  renderLesson();
}

function renderLesson() {
  const data = LESSON_DATA[currentLang];

  document.getElementById('lesson-badge').textContent = data.badge;
  document.getElementById('lesson-title').textContent = data.title;
  document.getElementById('lesson-focus').textContent = data.focus;
  document.getElementById('onedrive-folder-name').textContent = data.folder;

  // Vocabulary Pills
  const vocabContainer = document.getElementById('vocab-container');
  vocabContainer.innerHTML = '';
  data.vocab.forEach(v => {
    const btn = document.createElement('button');
    btn.className = "group px-3 py-2 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-xl text-xs font-semibold flex items-center space-x-2 transition border border-slate-200";
    btn.onclick = () => speak(v.term, currentLang === 'greek' ? 'el-GR' : 'fr-FR');
    btn.innerHTML = `
      <i class="fa-solid fa-volume-low opacity-60 group-hover:opacity-100"></i>
      <span class="font-bold">${v.term}</span>
      <span class="text-slate-400 font-normal">(${v.meaning})</span>
    `;
    vocabContainer.appendChild(btn);
  });

  // Speech practice target
  const targetText = currentLang === 'greek' ? data.speechTarget.greek : data.speechTarget.french;
  const subText = currentLang === 'greek' 
    ? `${data.speechTarget.translit} — ${data.speechTarget.dutch}`
    : data.speechTarget.dutch;

  document.getElementById('speech-target-phrase').textContent = targetText;
  document.getElementById('speech-target-translation').textContent = subText;
  document.getElementById('speech-feedback').textContent = '';

  // Grammar Modal details
  document.getElementById('modal-grammar-title').textContent = data.grammarTitle;
  document.getElementById('modal-grammar-content').innerHTML = data.grammarHtml;

  renderQuiz();
}

function renderQuiz() {
  const data = LESSON_DATA[currentLang];
  const q = data.quizzes[currentQuizIndex];

  document.getElementById('quiz-counter').textContent = `Vraag ${currentQuizIndex + 1} van ${data.quizzes.length}`;
  document.getElementById('quiz-question-text').textContent = q.question;

  const feedbackBox = document.getElementById('quiz-feedback-box');
  feedbackBox.className = "hidden rounded-2xl p-4 text-sm font-medium transition-all";
  feedbackBox.innerHTML = '';

  const optionsContainer = document.getElementById('quiz-options-container');
  optionsContainer.innerHTML = '';

  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = "w-full text-left p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-800 text-sm font-semibold transition active:scale-[0.99] flex items-center justify-between";
    btn.innerHTML = `<span>${opt}</span> <i class="fa-regular fa-circle text-slate-300"></i>`;
    btn.onclick = () => handleAnswer(idx, btn);
    optionsContainer.appendChild(btn);
  });
}

function handleAnswer(selectedIdx, btn) {
  const data = LESSON_DATA[currentLang];
  const q = data.quizzes[currentQuizIndex];
  const feedbackBox = document.getElementById('quiz-feedback-box');
  const allBtns = document.getElementById('quiz-options-container').querySelectorAll('button');

  allBtns.forEach(b => b.disabled = true);

  if (selectedIdx === q.correct) {
    btn.className = "w-full text-left p-3.5 rounded-2xl border-2 border-emerald-500 bg-emerald-50 text-emerald-900 text-sm font-bold flex items-center justify-between";
    btn.querySelector('i').className = "fa-solid fa-circle-check text-emerald-600";
    
    feedbackBox.className = "rounded-2xl p-4 text-sm bg-emerald-50 text-emerald-900 border border-emerald-200 block space-y-2";
    feedbackBox.innerHTML = `
      <div class="flex items-center space-x-2 font-bold text-emerald-800">
        <i class="fa-solid fa-circle-check"></i>
        <span>Uitstekend! Dat is helemaal juist.</span>
      </div>
      <p class="text-xs text-emerald-800 leading-relaxed">${q.rule}</p>
      ${currentQuizIndex < data.quizzes.length - 1 ? '<button onclick="nextQuestion()" class="mt-2 px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition">Volgende vraag ➔</button>' : '<div class="text-xs font-bold text-emerald-700 mt-2">🎉 Je hebt alle vragen voor vandaag voltooid!</div>'}
    `;
  } else {
    btn.className = "w-full text-left p-3.5 rounded-2xl border-2 border-rose-400 bg-rose-50 text-rose-900 text-sm font-semibold flex items-center justify-between";
    btn.querySelector('i').className = "fa-solid fa-circle-xmark text-rose-600";

    const correctBtn = allBtns[q.correct];
    correctBtn.className = "w-full text-left p-3.5 rounded-2xl border-2 border-emerald-500 bg-emerald-50/50 text-emerald-900 text-sm font-semibold flex items-center justify-between";

    feedbackBox.className = "rounded-2xl p-4 text-sm bg-amber-50 text-amber-900 border border-amber-200 block space-y-2";
    feedbackBox.innerHTML = `
      <div class="flex items-center space-x-2 font-bold text-amber-800">
        <i class="fa-solid fa-circle-info"></i>
        <span>Nog niet helemaal, maar een heel leerzaam moment:</span>
      </div>
      <p class="text-xs text-amber-800 leading-relaxed">${q.rule}</p>
      <button onclick="renderQuiz()" class="mt-2 px-4 py-2 bg-amber-600 text-white font-bold text-xs rounded-xl hover:bg-amber-700 transition">Opnieuw proberen</button>
    `;
  }
}

function nextQuestion() {
  currentQuizIndex++;
  renderQuiz();
}

// Speech Synthesis (Audio uitspraak)
function speak(text, lang) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9; // Slightly slower for crisp clarity
    window.speechSynthesis.speak(utterance);
  } else {
    alert("Spraaksynthese wordt niet ondersteund in deze browser.");
  }
}

function speakTargetPhrase() {
  const data = LESSON_DATA[currentLang];
  const phrase = currentLang === 'greek' ? data.speechTarget.greek : data.speechTarget.french;
  speak(phrase, currentLang === 'greek' ? 'el-GR' : 'fr-FR');
}

// Speech Recognition (Spraakherkenning)
function toggleSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert("Spraakherkenning vereist Safari of Chrome op iOS / macOS.");
    return;
  }

  const micBtn = document.getElementById('mic-btn');
  const micLabel = document.getElementById('mic-label');
  const feedback = document.getElementById('speech-feedback');

  if (isRecording) {
    recognition.stop();
    return;
  }

  recognition = new SpeechRec();
  recognition.lang = currentLang === 'greek' ? 'el-GR' : 'fr-FR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isRecording = true;
    micBtn.className = "px-4 py-2 bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition shadow animate-pulse";
    micLabel.textContent = "Luistert... spreek nu!";
    feedback.textContent = "Aan het luisteren...";
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    feedback.textContent = `Gehoord: "${transcript}"`;

    const target = currentLang === 'greek' ? LESSON_DATA.greek.speechTarget.greek : LESSON_DATA.french.speechTarget.french;
    
    // Simple similarity check
    const cleanT = transcript.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    const cleanTarget = target.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");

    if (cleanT === cleanTarget || cleanTarget.includes(cleanT) || cleanT.includes(cleanTarget)) {
      feedback.innerHTML = `✅ <strong>Geweldig gearticuleerd!</strong> ("${transcript}")`;
    } else {
      feedback.innerHTML = `👍 Bijna! Gehoord: <em>"${transcript}"</em>`;
    }
  };

  recognition.onerror = (event) => {
    feedback.textContent = "Geen spraak waargenomen of permissie geweigerd.";
  };

  recognition.onend = () => {
    isRecording = false;
    micBtn.className = "px-4 py-2 bg-white text-indigo-600 hover:bg-indigo-50 font-bold text-xs rounded-xl flex items-center space-x-2 transition shadow";
    micLabel.textContent = "Opnieuw inspreken";
  };

  recognition.start();
}

function toggleGrammarModal() {
  const modal = document.getElementById('grammar-modal');
  modal.classList.toggle('hidden');
}

// Initial boot
document.addEventListener('DOMContentLoaded', () => {
  renderLesson();
});
