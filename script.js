const cat = document.getElementById("cat");
const stage = document.getElementById("stage");
const speech = document.getElementById("speech");
const soundBtn = document.getElementById("btn-sound");
const nameEl = document.getElementById("catname");
const renameBtn = document.getElementById("btn-rename");

/* ---------------- name (saved in localStorage AND cookie) ---------------- */
function readName() {
  let n = null;
  try { n = localStorage.getItem("mikanName"); } catch (e) {}
  if (n) return n;
  const m = document.cookie.match(/(?:^|;\s*)mikanName=([^;]*)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
  return "Mikan";
}

function saveName(n) {
  try { localStorage.setItem("mikanName", n); } catch (e) {}
  try {
    document.cookie = "mikanName=" + encodeURIComponent(n) +
      "; max-age=31536000; path=/; SameSite=Lax";
  } catch (e) {}
}

let catName = readName();
nameEl.textContent = catName;

renameBtn.addEventListener("click", () => {
  const n = prompt("What should I name your cat?", catName);
  if (n && n.trim()) {
    catName = n.trim().slice(0, 20);
    nameEl.textContent = catName;
    saveName(catName);
    say(`ok, I'm ${catName}! 🐱`);
  }
});

const stats = { hunger: 100, thirst: 100, energy: 100, happiness: 100 };
const MAX = 100;
const MIN = 0;

const statsEl = {
  hunger: document.querySelector('.fill.hunger'),
  thirst: document.querySelector('.fill.thirst'),
  energy: document.querySelector('.fill.energy'),
  happiness: document.querySelector('.fill.happiness'),
};
const numEl = {
  hunger: document.querySelector('.stat[data-stat="hunger"] .stat-num'),
  thirst: document.querySelector('.stat[data-stat="thirst"] .stat-num'),
  energy: document.querySelector('.stat[data-stat="energy"] .stat-num'),
  happiness: document.querySelector('.stat[data-stat="happiness"] .stat-num'),
};

const btnEat = document.getElementById("btn-eat");
const btnDrink = document.getElementById("btn-drink");
const btnSleep = document.getElementById("btn-sleep");
const btnPlay = document.getElementById("btn-play");

let sleeping = false;
let busy = false;
let wasLow = false;
let speechTimer = null;
let lastNotify = 0;
const NOTIFY_GAP = 10 * 60 * 1000;

function clamp(n) { return Math.max(MIN, Math.min(MAX, n)); }

/* ---------------- sound ---------------- */
let audioCtx = null;
let muted = false;

function ensureAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function tone(freq, start, dur, type = "sine", vol = 0.15) {
  const ctx = ensureAudio();
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.05);
}

const sounds = {
  eat() { tone(520, 0, 0.12, "triangle"); tone(620, 0.13, 0.12, "triangle"); tone(440, 0.26, 0.14, "triangle"); },
  drink() { tone(880, 0, 0.08, "sine", 0.12); tone(990, 0.09, 0.08, "sine", 0.12); tone(1180, 0.18, 0.12, "sine", 0.12); },
  play() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.14, "triangle", 0.14)); },
  sleep() { tone(660, 0, 0.3, "sine", 0.1); tone(550, 0.35, 0.4, "sine", 0.1); },
  wake() { tone(784, 0, 0.12, "triangle"); tone(1047, 0.13, 0.22, "triangle"); },
  sad() { tone(330, 0, 0.25, "sine", 0.1); tone(262, 0.28, 0.35, "sine", 0.1); },
};

soundBtn.addEventListener("click", () => {
  muted = !muted;
  soundBtn.textContent = muted ? "🔇" : "🔊";
  if (!muted) { ensureAudio(); sounds.wake(); }
});

/* ---------------- notifications ---------------- */
function ensureNotifPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
document.addEventListener("pointerdown", ensureNotifPermission, { once: true });

function tryNotify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!document.hidden) return;
  if (Date.now() - lastNotify < NOTIFY_GAP) return;
  lastNotify = Date.now();
  const opt = { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png" };
  if (navigator.serviceWorker) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, opt)).catch(() => {});
  } else {
    new Notification(title, opt);
  }
}

/* ---------------- speech + particles ---------------- */
function say(text, ms = 2400) {
  speech.textContent = text;
  speech.classList.add("show");
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => speech.classList.remove("show"), ms);
}

function popEmoji(emojis, count = 8) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = "particle";
    p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    p.style.left = (14 + Math.random() * 68) + "%";
    p.style.top = (35 + Math.random() * 45) + "%";
    p.style.animationDelay = (Math.random() * 0.5) + "s";
    p.style.fontSize = (1.6 + Math.random() * 1.6) + "rem";
    stage.appendChild(p);
    setTimeout(() => p.remove(), 2200);
  }
}

/* ---------------- stats ---------------- */
function render() {
  for (const key of Object.keys(stats)) {
    const val = Math.round(stats[key]);
    statsEl[key].style.width = val + "%";
    statsEl[key].classList.toggle("low", val <= 25);
    numEl[key].textContent = val;
  }
}

function mood() {
  if (sleeping) return "sleep";
  if (busy) return;
  const lowest = Math.min(...Object.values(stats));
  if (lowest <= 25) return "sad";
  return "idle";
}

function refreshMood() {
  const m = mood();
  if (m) cat.dataset.state = m;
  stage.classList.toggle("sleeping", sleeping);
}

function adjust(key, amount) {
  stats[key] = clamp(stats[key] + amount);
  render();
  if (!busy && !sleeping) refreshMood();
}

function setBusy(on) {
  busy = on;
  btnEat.disabled = on || sleeping;
  btnDrink.disabled = on || sleeping;
  btnPlay.disabled = on || sleeping;
  btnSleep.disabled = on;
}

function doAction(btn, keyAmounts, face, msg, emojis, sound) {
  if (busy || sleeping) return;
  setBusy(true);
  for (const k in keyAmounts) adjust(k, keyAmounts[k]);
  cat.dataset.state = face;
  say(msg);
  popEmoji(emojis);
  sounds[sound]();
  btn.classList.add("busy");
  setTimeout(() => {
    btn.classList.remove("busy");
    setBusy(false);
    refreshMood();
  }, 2400);
}

/* ---------------- actions ---------------- */
btnEat.addEventListener("click", () =>
  doAction(btnEat, { hunger: 35, happiness: 6 }, "eat", "nom nom nom! 🍜", ["🍜", "🐟", "🍥", "🥟"], "eat"));

btnDrink.addEventListener("click", () =>
  doAction(btnDrink, { thirst: 35, energy: 4 }, "drink", "glug glug! 💧", ["💧", "🥛", "🧊"], "drink"));

btnPlay.addEventListener("click", () =>
  doAction(btnPlay, { happiness: 30, energy: -12, hunger: -4, thirst: -4 }, "play", "yayyy! that was so fun! 🐱", ["💖", "✨", "🎾", "⭐"], "play"));

btnSleep.addEventListener("click", () => {
  if (busy) return;
  sleeping = !sleeping;
  if (sleeping) {
    cat.dataset.state = "sleep";
    stage.classList.add("sleeping");
    say("goodnight… 💤");
    btnSleep.textContent = "🌅 Wake";
    sounds.sleep();
  } else {
    cat.dataset.state = "idle";
    stage.classList.remove("sleeping");
    say("meow! good morning! ☀️");
    btnSleep.textContent = "💤 Sleep";
    sounds.wake();
  }
  render();
});

/* ---------------- slow decay — Mikan can never die ---------------- */
const TICK = 10000;
setInterval(() => {
  if (sleeping) {
    stats.energy = clamp(stats.energy + 2);
    stats.hunger = clamp(stats.hunger - 0.4);
    stats.thirst = clamp(stats.thirst - 0.45);
    if (stats.energy >= MAX) {
      sleeping = false;
      cat.dataset.state = "idle";
      stage.classList.remove("sleeping");
      btnSleep.textContent = "💤 Sleep";
      say("all rested up! 🙌");
      sounds.wake();
    }
  } else {
    stats.hunger = clamp(stats.hunger - 0.4);
    stats.thirst = clamp(stats.thirst - 0.45);
    stats.energy = clamp(stats.energy - 0.3);
    stats.happiness = clamp(stats.happiness - 0.35);
  }
  render();
  refreshMood();

  if (document.hidden) {
    const lowest = Object.keys(stats).reduce((a, b) => (stats[a] <= stats[b] ? a : b));
    if (stats[lowest] <= 25) {
      const lines = {
        hunger: `${catName} is hungry! 🥺`,
        thirst: `${catName} is thirsty! 💧`,
        energy: `${catName} is sleepy… 💤`,
        happiness: `${catName} misses you! 💔`,
      };
      tryNotify(`${catName} needs you!`, lines[lowest]);
    }
  }
}, TICK);

/* ---------------- low-stat reminders ---------------- */
setInterval(() => {
  if (busy) return;
  const lowest = Object.keys(stats).reduce((a, b) => (stats[a] <= stats[b] ? a : b));
  const low = stats[lowest] <= 25;
  if (low && !wasLow) sounds.sad();
  wasLow = low;
  if (low) {
    const lines = {
      hunger: "meow… so hungry… 🥺",
      thirst: "prr… thirsty… 💧",
      energy: "so sleepy… zzz",
      happiness: "a little lonely… 💔",
    };
    say(lines[lowest], 2800);
  }
}, 9000);

/* ---------------- random idle animations ---------------- */
function blink() {
  cat.classList.add("blinking");
  setTimeout(() => cat.classList.remove("blinking"), 280);
}
function tailSwish() {
  cat.classList.add("tail-swish");
  setTimeout(() => cat.classList.remove("tail-swish"), 2000);
}
function lookAround() {
  cat.classList.add("look-around");
  setTimeout(() => cat.classList.remove("look-around"), 1800);
}
function stretch() {
  cat.classList.add("stretch");
  setTimeout(() => cat.classList.remove("stretch"), 2200);
}

const chatter = [
  "purrrrr 🐾", "meow?", "just vibin' 🍊", "yawwwn 😺",
  "wanna play? 🎾", "I love you human 💛", "brb, thinking about fish 🐟",
  "this is my pastel kingdom 👑"
];

function randomSay() {
  const lowest = Math.min(...Object.values(stats));
  if (lowest <= 25 || busy || sleeping) return;
  say(chatter[Math.floor(Math.random() * chatter.length)], 2600);
}

function runRandom() {
  if (busy) return;
  if (sleeping) { tailSwish(); return; }
  const r = Math.random();
  if (r < 0.35) blink();
  else if (r < 0.55) tailSwish();
  else if (r < 0.75) lookAround();
  else if (r < 0.9) stretch();
  else randomSay();
}

function scheduleIdle() {
  const delay = 6000 + Math.random() * 9000;
  setTimeout(() => {
    runRandom();
    scheduleIdle();
  }, delay);
}

/* ---------------- random nudge notification ---------------- */
setInterval(() => {
  if (document.hidden) {
    tryNotify(`${catName} is wondering where you are 🥺`, "Tap to come say hi!");
  }
}, 20 * 60 * 1000);

/* ---------------- PWA: work offline + installable ---------------- */
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

render();
refreshMood();
scheduleIdle();
