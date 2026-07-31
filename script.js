const cat = document.getElementById("cat");
const stage = document.getElementById("stage");
const speech = document.getElementById("speech");
const soundBtn = document.getElementById("btn-sound");
const nameEl = document.getElementById("catname");
const renameBtn = document.getElementById("btn-rename");

/* ---------------- prefs (localStorage AND cookie) ---------------- */
function savePref(k, v) {
  try { localStorage.setItem(k, v); } catch (e) {}
  try {
    document.cookie = k + "=" + encodeURIComponent(v) + "; max-age=31536000; path=/; SameSite=Lax";
  } catch (e) {}
}
function readPref(k) {
  try { const v = localStorage.getItem(k); if (v !== null && v !== "") return v; } catch (e) {}
  const m = document.cookie.match(new RegExp("(?:^|;\\s*)" + k + "=([^;]*)"));
  if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
  return null;
}

/* ---------------- name ---------------- */
let catName = readPref("mikanName") || "Mikan";
nameEl.textContent = catName;

renameBtn.addEventListener("click", () => {
  const n = prompt("What should I name your cat?", catName);
  if (n && n.trim()) {
    catName = n.trim().slice(0, 20);
    nameEl.textContent = catName;
    savePref("mikanName", catName);
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
let tickCount = 0;
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
  purr() { tone(110, 0, 0.45, "triangle", 0.12); tone(145, 0.12, 0.45, "triangle", 0.1); tone(115, 0.28, 0.4, "triangle", 0.1); },
  pop() { tone(700, 0, 0.06, "sine", 0.12); tone(880, 0.06, 0.07, "sine", 0.1); },
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

function miniAction(effects, msg, emojis, duration = 1800) {
  if (busy || sleeping) return;
  setBusy(true);
  for (const k in effects) adjust(k, effects[k]);
  cat.dataset.state = "eat";
  say(msg);
  popEmoji(emojis);
  sounds.eat();
  setTimeout(() => { setBusy(false); refreshMood(); }, duration);
}

/* ---------------- main actions ---------------- */
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

/* ---------------- snacks ---------------- */
const SNACKS = {
  fish:     { effects: { hunger: 30, happiness: 5 },  msg: "fresh fishy! 🐟",      emojis: ["🐟", "🐠"] },
  dumpling: { effects: { hunger: 25 },                msg: "a warm dumpling! 🥟",   emojis: ["🥟", "😋"] },
  cake:     { effects: { hunger: 20, happiness: 15 }, msg: "cake!!! 🍰",           emojis: ["🍰", "🍓"] },
  cookie:   { effects: { hunger: 15, happiness: 10 }, msg: "crunchy cookie! 🍪",   emojis: ["🍪", "🥛"] },
};

document.querySelectorAll(".snack").forEach((btn) => {
  btn.addEventListener("click", () => {
    const s = SNACKS[btn.dataset.snack];
    if (s) miniAction(s.effects, s.msg, s.emojis);
  });
});

/* ---------------- outfits ---------------- */
let outfit = readPref("mikanOutfit") || "bow";
cat.dataset.outfit = outfit;

document.querySelectorAll("#outfits-card .mini").forEach((btn) => {
  if (btn.dataset.outfit === outfit) btn.classList.add("active");
  btn.addEventListener("click", () => {
    outfit = btn.dataset.outfit;
    cat.dataset.outfit = outfit;
    savePref("mikanOutfit", outfit);
    document.querySelectorAll("#outfits-card .mini").forEach((b) =>
      b.classList.toggle("active", b.dataset.outfit === outfit));
    say("fashion!! ✨");
    sounds.pop();
  });
});

/* ---------------- colors ---------------- */
const BG_COLORS = {
  mint:     { bg: "#CDECCF", soft: "#E7F7E6", deep: "#A5D6A7" },
  lavender: { bg: "#D8CFEC", soft: "#ECE7F7", deep: "#B9A7D9" },
  peach:    { bg: "#FBE3CF", soft: "#FFF3E7", deep: "#F5C59A" },
  blue:     { bg: "#CFE3F5", soft: "#E7F1FB", deep: "#A7C8EC" },
  yellow:   { bg: "#F5EBCB", soft: "#FBF6E3", deep: "#E8D9A0" },
};
const CAT_COLORS = {
  orange: { main: "#FFB74D", dark: "#F9A825", belly: "#FFE0B2" },
  cream:  { main: "#F5D9A8", dark: "#E3B878", belly: "#FBEBD3" },
  pink:   { main: "#F5AFC0", dark: "#E8789A", belly: "#FBD3DC" },
  gray:   { main: "#AFC7D8", dark: "#6E8FA8", belly: "#D3E0EA" },
  minty:  { main: "#A8D8B9", dark: "#63A87F", belly: "#CDEBD7" },
};

function applyBg(key) {
  const c = BG_COLORS[key];
  if (!c) return;
  const root = document.documentElement.style;
  root.setProperty("--mint", c.bg);
  root.setProperty("--mint-soft", c.soft);
  root.setProperty("--mint-deep", c.deep);
  savePref("mikanBg", key);
}

function applyCat(key) {
  const c = CAT_COLORS[key];
  if (!c) return;
  const root = document.documentElement.style;
  root.setProperty("--cat-main", c.main);
  root.setProperty("--cat-dark", c.dark);
  root.setProperty("--cat-belly", c.belly);
  savePref("mikanCat", key);
}

function buildSwatches(container, options, current, onPick) {
  container.innerHTML = "";
  for (const key of Object.keys(options)) {
    const b = document.createElement("button");
    b.className = "swatch" + (key === current ? " active" : "");
    b.title = key;
    b.style.background = options[key].main || options[key].bg;
    b.addEventListener("click", () => onPick(key));
    container.appendChild(b);
  }
}

buildSwatches(document.getElementById("bg-swatches"), BG_COLORS, readPref("mikanBg") || "mint", (k) => {
  applyBg(k);
  document.querySelectorAll("#bg-swatches .swatch").forEach((s) =>
    s.classList.toggle("active", s.title === k));
  sounds.pop();
});
buildSwatches(document.getElementById("cat-swatches"), CAT_COLORS, readPref("mikanCat") || "orange", (k) => {
  applyCat(k);
  document.querySelectorAll("#cat-swatches .swatch").forEach((s) =>
    s.classList.toggle("active", s.title === k));
  sounds.pop();
});

applyBg(readPref("mikanBg") || "mint");
applyCat(readPref("mikanCat") || "orange");

/* ---------------- petting ---------------- */
cat.addEventListener("pointerdown", () => {
  if (busy) return;
  stats.happiness = clamp(stats.happiness + 4);
  if (sleeping) {
    say("mrrrp?… 🥱");
  } else {
    popEmoji(["💗", "💖", "✨"], 6);
    sounds.purr();
    say("purrr 🐾");
    cat.classList.add("petted");
    setTimeout(() => cat.classList.remove("petted"), 450);
  }
  render();
});

/* ---------------- garden ---------------- */
function wiggleEl(el) {
  el.classList.remove("wiggle");
  void el.offsetWidth;
  el.classList.add("wiggle");
}

document.getElementById("sun").addEventListener("pointerdown", () => {
  wiggleEl(document.getElementById("sun"));
  popEmoji(["☀️", "✨"], 5);
  sounds.pop();
  say("such a sunny day! ☀️");
});

document.getElementById("window").addEventListener("pointerdown", () => {
  wiggleEl(document.getElementById("window"));
  popEmoji(["☁️", "🌤️"], 5);
  sounds.pop();
  stats.happiness = clamp(stats.happiness + 1);
  say("peek-a-boo! the view is lovely 🌤️");
  render();
});

document.querySelectorAll("#flower1, #flower2").forEach((f) => {
  f.addEventListener("pointerdown", () => {
    wiggleEl(f);
    popEmoji(["🌸", "🌼"], 5);
    sounds.pop();
    stats.happiness = clamp(stats.happiness + 1);
    say("pretty flower! 🌸");
    render();
  });
});

/* butterfly */
const butterfly = document.getElementById("butterfly");
butterfly.addEventListener("pointerdown", () => {
  butterfly.classList.remove("show");
  stats.happiness = clamp(stats.happiness + 2);
  popEmoji(["🦋", "💖"], 5);
  sounds.play();
  say("ooh, a butterfly! 🦋");
  render();
});

function spawnButterfly() {
  butterfly.classList.add("show");
  setTimeout(() => butterfly.classList.remove("show"), 19000);
}
function scheduleButterfly() {
  const delay = 20000 + Math.random() * 25000;
  setTimeout(() => { spawnButterfly(); scheduleButterfly(); }, delay);
}

/* ---------------- history chart ---------------- */
let history = [];
try {
  const raw = readPref("mikanHistory");
  if (raw) history = JSON.parse(raw);
  if (!Array.isArray(history)) history = [];
  history = history.slice(-120);
} catch (e) { history = []; }

function pushHistory() {
  history.push({
    t: Date.now(),
    h: stats.hunger, th: stats.thirst, e: stats.energy, ha: stats.happiness,
  });
  if (history.length > 120) history.shift();
  savePref("mikanHistory", JSON.stringify(history));
}

const CHART_STATS = [
  { key: "h",  color: "#FFB74D", label: "hunger" },
  { key: "th", color: "#4FC3F7", label: "thirst" },
  { key: "e",  color: "#A5D6A7", label: "energy" },
  { key: "ha", color: "#F06292", label: "happiness" },
];

function drawChart() {
  const panel = document.getElementById("history-panel");
  const canvas = document.getElementById("chart");
  const dpr = window.devicePixelRatio || 1;
  const w = panel.clientWidth || 300;
  const h = 150;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "#E8E2D6";
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75].forEach((f) => {
    const y = Math.round(h * f);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  });

  if (history.length < 2) {
    ctx.fillStyle = "#6d8f6e";
    ctx.font = "12px Quicksand, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("not enough history yet — check back in a few minutes", w / 2, h / 2);
    return;
  }

  const n = history.length;
  const step = w / (n - 1);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const s of CHART_STATS) {
    ctx.beginPath();
    history.forEach((d, i) => {
      const x = i * step;
      const y = h - (d[s.key] / 100) * (h - 16) - 8;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  ctx.font = "11px Quicksand, sans-serif";
  let lx = 8;
  CHART_STATS.forEach((s) => {
    ctx.fillStyle = s.color;
    ctx.beginPath(); ctx.arc(lx + 5, h - 8, 4, 0, 7); ctx.fill();
    ctx.fillStyle = "#4e342e";
    ctx.fillText(s.label, lx + 13, h - 4);
    lx += ctx.measureText(s.label).width + 28;
  });
}

const historyBtn = document.getElementById("btn-history");
const historyPanel = document.getElementById("history-panel");
historyBtn.addEventListener("click", () => {
  historyPanel.hidden = !historyPanel.hidden;
  historyBtn.textContent = historyPanel.hidden ? "📈 History" : "🙈 Hide";
  if (!historyPanel.hidden) drawChart();
});
window.addEventListener("resize", () => {
  if (!historyPanel.hidden) drawChart();
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

  tickCount++;
  if (tickCount % 6 === 0) pushHistory();

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

pushHistory();
render();
refreshMood();
scheduleIdle();
scheduleButterfly();
