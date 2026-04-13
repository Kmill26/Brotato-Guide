const state = {
  data: null,
  query: "",
  showDlc: true,
  characterSort: "alpha-asc",
  weaponSort: "alpha-asc",
  musicOn: false,
  sfxOn: true,
  musicTheme: "ambienttech",
  musicVolume: 0.28,
  sfxVolume: 0.45,
  reducedMotion: false
};

const els = {
  search: document.querySelector("#search"),
  showDlc: document.querySelector("#showDlc"),
  musicToggle: document.querySelector("#musicToggle"),
  sfxToggle: document.querySelector("#sfxToggle"),
  reducedMotionToggle: document.querySelector("#reducedMotionToggle"),
  musicTheme: document.querySelector("#musicTheme"),
  musicVolume: document.querySelector("#musicVolume"),
  sfxVolume: document.querySelector("#sfxVolume"),
  characterSort: document.querySelector("#characterSort"),
  weaponSort: document.querySelector("#weaponSort"),
  plannerCharacter: document.querySelector("#plannerCharacter"),
  plannerWeapon: document.querySelector("#plannerWeapon"),
  plannerGenerate: document.querySelector("#plannerGenerate"),
  plannerOutput: document.querySelector("#plannerOutput"),
  characterGrid: document.querySelector("#characterGrid"),
  weaponGrid: document.querySelector("#weaponGrid"),
  characterCount: document.querySelector("#characterCount"),
  weaponCount: document.querySelector("#weaponCount"),
  modal: document.querySelector("#detailModal"),
  modalContent: document.querySelector("#modalContent"),
  closeModal: document.querySelector("#closeModal")
};

const audio = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  clock: null,
  step: 0,
  bassStep: 0
};
const PREFERENCES_KEY = "brotatoGuidePrefs";
let parallaxRaf = null;

function includeEntity(entity) {
  if (state.showDlc) return true;
  return !entity.isDlc;
}

function matchesQuery(text) {
  if (!state.query) return true;
  return text.toLowerCase().includes(state.query);
}

function render() {
  const chars = state.data.characters.filter((c) => {
    return includeEntity(c) && matchesQuery(`${c.name} ${c.stats} ${c.wantedTags}`);
  });
  const weapons = state.data.weapons.filter((w) => {
    return includeEntity(w) && matchesQuery(`${w.name} ${w.types.join(" ")} ${w.special}`);
  });

  sortCharacters(chars);
  sortWeapons(weapons);

  els.characterCount.textContent = `${chars.length} shown / ${state.data.characters.length} total`;
  els.weaponCount.textContent = `${weapons.length} shown / ${state.data.weapons.length} total`;

  els.characterGrid.innerHTML = chars
    .map(
      (c, i) => `<button class="card" data-kind="character" data-index="${i}">
        <img class="portrait" src="${getCharacterImageUrl(c.name)}" alt="${c.name} portrait" loading="lazy" onerror="this.onerror=null;this.src='${getFallbackPortrait(c.name)}';" />
        <h3>${c.name}</h3>
        <div class="tag">${c.isDlc ? "DLC" : "Base"}</div>
        <div class="mini">${c.unlockedBy}</div>
      </button>`
    )
    .join("");

  els.weaponGrid.innerHTML = weapons
    .map(
      (w, i) => `<button class="card" data-kind="weapon" data-index="${i}">
        <h3>${w.name}</h3>
        <div class="tag">${w.types.join(", ") || "Unknown type"}</div>
        <div class="mini">${w.unlockedBy || "Default"}</div>
      </button>`
    )
    .join("");

  bindCardClicks(chars, weapons);
  renderPlannerOptions(chars, weapons);
}

function sortCharacters(chars) {
  if (state.characterSort === "alpha-desc") {
    chars.sort((a, b) => b.name.localeCompare(a.name));
    return;
  }
  if (state.characterSort === "confidence") {
    const weight = { High: 0, Medium: 1, Low: 2 };
    chars.sort((a, b) => {
      const diff = (weight[a.recommendedStartConfidence] ?? 9) - (weight[b.recommendedStartConfidence] ?? 9);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
    return;
  }
  chars.sort((a, b) => a.name.localeCompare(b.name));
}

function sortWeapons(weapons) {
  if (state.weaponSort === "alpha-desc") {
    weapons.sort((a, b) => b.name.localeCompare(a.name));
    return;
  }
  if (state.weaponSort === "tier-asc") {
    weapons.sort((a, b) => Number(a.rarity || 99) - Number(b.rarity || 99) || a.name.localeCompare(b.name));
    return;
  }
  if (state.weaponSort === "tier-desc") {
    weapons.sort((a, b) => Number(b.rarity || -1) - Number(a.rarity || -1) || a.name.localeCompare(b.name));
    return;
  }
  if (state.weaponSort === "class") {
    weapons.sort((a, b) => {
      const aClass = (a.types[0] || "zzz").toLowerCase();
      const bClass = (b.types[0] || "zzz").toLowerCase();
      return aClass.localeCompare(bClass) || a.name.localeCompare(b.name);
    });
    return;
  }
  weapons.sort((a, b) => a.name.localeCompare(b.name));
}

function bindCardClicks(chars, weapons) {
  document.querySelectorAll(".card").forEach((button) => {
    button.addEventListener("mouseenter", playHover);
    button.addEventListener("click", () => {
      playSelect();
      const kind = button.dataset.kind;
      const index = Number(button.dataset.index);
      if (kind === "character") openCharacter(chars[index]);
      else openWeapon(weapons[index]);
    });
  });
}

function openCharacter(c) {
  const strategy = c.strategy.map((s) => `<li>${s}</li>`).join("");
  const startWeapons = c.startingWeapons.slice(0, 12).join(", ");
  const cephLink = createCephalLink(c.name);
  els.modalContent.innerHTML = `
    <img class="portrait portrait-lg" src="${getCharacterImageUrl(c.name)}" alt="${c.name} portrait" onerror="this.onerror=null;this.src='${getFallbackPortrait(c.name)}';" />
    <h2>${c.name}</h2>
    <p><strong>Unlocked by:</strong> ${c.unlockedBy}</p>
    <p><strong>Stats:</strong> ${c.stats}</p>
    <p><strong>Preferred tags:</strong> ${c.wantedTags || "None"}</p>
    <p><strong>Recommended starting weapon:</strong> ${c.recommendedStartingWeapon || "-"}</p>
    <p><strong>Start confidence:</strong> ${c.recommendedStartConfidence || "-"}</p>
    <p><strong>Why this start:</strong> ${c.recommendedStartReason || "-"}</p>
    <p><strong>Stat priority:</strong> ${c.statPriority.join(" > ")}</p>
    <p><strong>Starting weapons:</strong> ${startWeapons || "-"}</p>
    <p><strong>Video guide:</strong> <a href="${cephLink}" target="_blank" rel="noopener noreferrer">Cephalopocalypse on YouTube</a></p>
    <h3>Strategy</h3>
    <ul>${strategy}</ul>
  `;
  playModalOpen();
  els.modal.showModal();
}

function openWeapon(w) {
  const tiers = Object.entries(w.tiers)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([tier, values]) => {
      return `<li>Tier ${tier}: DMG ${values.damage || "-"}, AS ${values.attackspeed || "-"}, DPS ${
        values.dps || "-"
      }</li>`;
    })
    .join("");

  els.modalContent.innerHTML = `
    <h2>${w.name}</h2>
    <p><strong>Types:</strong> ${w.types.join(", ") || "-"}</p>
    <p><strong>Unlocked by:</strong> ${w.unlockedBy || "Default"}</p>
    <p><strong>Special:</strong> ${w.special || "-"}</p>
    <h3>Tiers</h3>
    <ul>${tiers || "<li>No tier data</li>"}</ul>
  `;
  playModalOpen();
  els.modal.showModal();
}

function createCephalLink(characterName) {
  const q = encodeURIComponent(`Cephalopocalypse Brotato ${characterName} guide`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

function ensureAudioContext() {
  if (audio.ctx) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  audio.ctx = new AudioCtx();
  audio.master = audio.ctx.createGain();
  audio.musicGain = audio.ctx.createGain();
  audio.sfxGain = audio.ctx.createGain();
  audio.master.gain.value = 0.55;
  audio.musicGain.gain.value = state.musicVolume;
  audio.sfxGain.gain.value = state.sfxVolume;
  audio.musicGain.connect(audio.master);
  audio.sfxGain.connect(audio.master);
  audio.master.connect(audio.ctx.destination);
}

function playTone(freq, duration, type = "square", gainNode = audio.musicGain, volume = 0.05) {
  if (!audio.ctx || !gainNode) return;
  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(gainNode);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function startMusic() {
  ensureAudioContext();
  if (!audio.ctx || audio.clock) return;
  audio.step = 0;
  audio.bassStep = 0;
  const seq = getMusicSequence(state.musicTheme);
  audio.clock = setInterval(() => {
    const note = seq.melody[audio.step % seq.melody.length];
    const bass = seq.bass[audio.bassStep % seq.bass.length];
    playTone(note, seq.leadDur, seq.leadType, audio.musicGain, seq.leadVol);
    if (audio.step % seq.bassEvery === 0) {
      playTone(bass, seq.bassDur, seq.bassType, audio.musicGain, seq.bassVol);
      audio.bassStep += 1;
    }
    audio.step += 1;
  }, seq.intervalMs);
}

function stopMusic() {
  if (audio.clock) {
    clearInterval(audio.clock);
    audio.clock = null;
  }
}

function playClick() {
  if (!state.sfxOn) return;
  ensureAudioContext();
  playTone(620, 0.05, "triangle", audio.sfxGain, 0.06);
}

function playHover() {
  if (!state.sfxOn) return;
  ensureAudioContext();
  playTone(420, 0.03, "sine", audio.sfxGain, 0.03);
}

function playSelect() {
  if (!state.sfxOn) return;
  ensureAudioContext();
  playTone(740, 0.06, "square", audio.sfxGain, 0.07);
  setTimeout(() => playTone(930, 0.04, "triangle", audio.sfxGain, 0.05), 30);
}

function playModalOpen() {
  if (!state.sfxOn) return;
  ensureAudioContext();
  playTone(520, 0.05, "triangle", audio.sfxGain, 0.06);
  setTimeout(() => playTone(690, 0.06, "triangle", audio.sfxGain, 0.05), 40);
}

function playModalClose() {
  if (!state.sfxOn) return;
  ensureAudioContext();
  playTone(520, 0.05, "triangle", audio.sfxGain, 0.05);
  setTimeout(() => playTone(390, 0.05, "sine", audio.sfxGain, 0.04), 30);
}

/** Dark ambient only: soft waveforms, slow tempo, low gain — presence without distraction. */
function getMusicSequence(theme) {
  const ambient = {
    ambienttech: {
      melody: [246.94, 277.18, 311.13, 349.23, 311.13, 277.18, 246.94, 233.08],
      bass: [61.74, 69.3, 73.42, 82.41],
      leadType: "sine",
      bassType: "triangle",
      leadDur: 0.42,
      bassDur: 0.5,
      leadVol: 0.032,
      bassVol: 0.02,
      bassEvery: 2,
      intervalMs: 340
    },
    voiddrift: {
      melody: [220.0, 233.08, 246.94, 261.63, 246.94, 233.08, 220.0, 207.65],
      bass: [55.0, 58.27, 61.74, 65.41],
      leadType: "sine",
      bassType: "sine",
      leadDur: 0.48,
      bassDur: 0.58,
      leadVol: 0.028,
      bassVol: 0.016,
      bassEvery: 3,
      intervalMs: 400
    },
    midnight: {
      melody: [233.08, 246.94, 261.63, 277.18, 261.63, 246.94, 233.08, 220.0],
      bass: [58.27, 61.74, 65.41, 69.3],
      leadType: "triangle",
      bassType: "sine",
      leadDur: 0.45,
      bassDur: 0.55,
      leadVol: 0.03,
      bassVol: 0.018,
      bassEvery: 2,
      intervalMs: 360
    },
    glasshaze: {
      melody: [277.18, 311.13, 329.63, 349.23, 329.63, 311.13, 293.66, 277.18],
      bass: [69.3, 77.78, 82.41, 87.31],
      leadType: "sine",
      bassType: "triangle",
      leadDur: 0.38,
      bassDur: 0.46,
      leadVol: 0.026,
      bassVol: 0.017,
      bassEvery: 2,
      intervalMs: 320
    },
    depth: {
      melody: [196.0, 207.65, 220.0, 233.08, 220.0, 207.65, 196.0, 185.0],
      bass: [49.0, 51.91, 55.0, 58.27],
      leadType: "sine",
      bassType: "triangle",
      leadDur: 0.52,
      bassDur: 0.62,
      leadVol: 0.034,
      bassVol: 0.022,
      bassEvery: 2,
      intervalMs: 380
    }
  };
  return ambient[theme] || ambient.ambienttech;
}

function normalizeMusicTheme(theme) {
  const allowed = ["ambienttech", "voiddrift", "midnight", "glasshaze", "depth"];
  if (allowed.includes(theme)) return theme;
  if (theme === "synthwave" || theme === "lofipulse") return "ambienttech";
  return "ambienttech";
}

function restartMusicIfPlaying() {
  if (!state.musicOn) return;
  stopMusic();
  startMusic();
}

function savePrefs() {
  const payload = {
    musicOn: state.musicOn,
    sfxOn: state.sfxOn,
    musicTheme: state.musicTheme,
    musicVolume: state.musicVolume,
    sfxVolume: state.sfxVolume,
    reducedMotion: state.reducedMotion
  };
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(payload));
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    state.musicOn = Boolean(p.musicOn);
    state.sfxOn = p.sfxOn !== false;
    state.musicTheme = normalizeMusicTheme(p.musicTheme || "ambienttech");
    state.musicVolume = Number.isFinite(p.musicVolume) ? p.musicVolume : 0.35;
    state.sfxVolume = Number.isFinite(p.sfxVolume) ? p.sfxVolume : 0.45;
    state.reducedMotion = Boolean(p.reducedMotion);
  } catch {
    // ignore malformed preferences
  }
}

function applyMotionMode() {
  document.body.classList.toggle("reduced-motion", state.reducedMotion);
  if (state.reducedMotion) {
    document.body.style.setProperty("--parallax-x", "0px");
    document.body.style.setProperty("--parallax-y", "0px");
  }
}

function setupParallax() {
  window.addEventListener("pointermove", (event) => {
    if (state.reducedMotion) return;
    if (parallaxRaf) cancelAnimationFrame(parallaxRaf);
    parallaxRaf = requestAnimationFrame(() => {
      const nx = (event.clientX / window.innerWidth - 0.5) * 14;
      const ny = (event.clientY / window.innerHeight - 0.5) * 12;
      document.body.style.setProperty("--parallax-x", `${nx.toFixed(2)}px`);
      document.body.style.setProperty("--parallax-y", `${ny.toFixed(2)}px`);
    });
  });
}

function getCharacterImageUrl(characterName) {
  const fileName = `${characterName.replaceAll(" ", "_")}.png`;
  return `https://brotato.wiki.spellsandguns.com/index.php?title=Special:FilePath/${encodeURIComponent(fileName)}`;
}

function getFallbackPortrait(characterName) {
  const initials = characterName
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><defs><linearGradient id='g' x1='0' x2='1' y1='0' y2='1'><stop stop-color='%2308f7fe'/><stop offset='1' stop-color='%23fe53bb'/></linearGradient></defs><rect width='240' height='240' fill='%23111620'/><rect x='8' y='8' width='224' height='224' rx='18' fill='url(%23g)' opacity='0.18'/><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='%23d7f8ff' font-size='72' font-family='Arial'>${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

function renderPlannerOptions(chars, weapons) {
  const currentCharacter = els.plannerCharacter.value;
  const currentWeapon = els.plannerWeapon.value;

  els.plannerCharacter.innerHTML = chars
    .map((c) => `<option value="${c.name}">${c.name}${c.isDlc ? " (DLC)" : ""}</option>`)
    .join("");
  els.plannerWeapon.innerHTML = weapons
    .map((w) => `<option value="${w.name}">${w.name}</option>`)
    .join("");

  if (currentCharacter) els.plannerCharacter.value = currentCharacter;
  if (currentWeapon) els.plannerWeapon.value = currentWeapon;
}

function generateBuildPlan() {
  const character = state.data.characters.find((c) => c.name === els.plannerCharacter.value);
  const weapon = state.data.weapons.find((w) => w.name === els.plannerWeapon.value);
  if (!character || !weapon) return;

  const opening = [
    `Open with ${character.recommendedStartingWeapon || character.startingWeapons[0] || "core starter"}, then pivot into ${weapon.name} only if shop RNG supports merges by wave 7-8.`,
    `Prioritize stats in this order: ${character.statPriority.join(" > ")}.`,
    `Stabilize with defensive breakpoints before greed: at least one sustain source and armor/hp scaling before wave 11 elite.`,
    `Keep class synergy tight (${weapon.types.join(", ") || "neutral"}), avoid diluting shop odds with unrelated classes.`
  ];

  const cephLink = createCephalLink(character.name);
  els.plannerOutput.innerHTML = `
    <h3>${character.name} Planner</h3>
    <p><strong>Recommended start:</strong> ${character.recommendedStartingWeapon || "-"}</p>
    <p><strong>Confidence:</strong> ${character.recommendedStartConfidence || "-"}</p>
    <p><strong>Why:</strong> ${character.recommendedStartReason || "-"}</p>
    <p><strong>Recommended primary weapon:</strong> ${weapon.name}</p>
    <p><strong>Character strengths:</strong> ${character.stats}</p>
    <p><strong>Stat priority:</strong> ${character.statPriority.join(" > ")}</p>
    <ul>${opening.map((step) => `<li>${step}</li>`).join("")}</ul>
    <p><strong>Watch:</strong> <a href="${cephLink}" target="_blank" rel="noopener noreferrer">Cephalopocalypse ${character.name} guide search</a></p>
  `;
}

els.search.addEventListener("input", (event) => {
  state.query = event.target.value.trim().toLowerCase();
  playClick();
  render();
});

els.showDlc.addEventListener("change", (event) => {
  state.showDlc = event.target.checked;
  playClick();
  render();
});

els.characterSort.addEventListener("change", (event) => {
  state.characterSort = event.target.value;
  playClick();
  render();
});

els.weaponSort.addEventListener("change", (event) => {
  state.weaponSort = event.target.value;
  playClick();
  render();
});

els.musicToggle.addEventListener("change", (event) => {
  state.musicOn = event.target.checked;
  playClick();
  if (state.musicOn) startMusic();
  else stopMusic();
  savePrefs();
});

els.sfxToggle.addEventListener("change", (event) => {
  state.sfxOn = event.target.checked;
  if (state.sfxOn) playClick();
  savePrefs();
});

els.reducedMotionToggle.addEventListener("change", (event) => {
  state.reducedMotion = event.target.checked;
  playClick();
  applyMotionMode();
  savePrefs();
});

els.musicTheme.addEventListener("change", (event) => {
  state.musicTheme = event.target.value;
  playSelect();
  restartMusicIfPlaying();
  savePrefs();
});

els.musicVolume.addEventListener("input", (event) => {
  state.musicVolume = Number(event.target.value) / 100;
  ensureAudioContext();
  if (audio.musicGain) audio.musicGain.gain.value = state.musicVolume;
  savePrefs();
});

els.sfxVolume.addEventListener("input", (event) => {
  state.sfxVolume = Number(event.target.value) / 100;
  ensureAudioContext();
  if (audio.sfxGain) audio.sfxGain.gain.value = state.sfxVolume;
  savePrefs();
});

els.plannerGenerate.addEventListener("click", () => {
  playSelect();
  generateBuildPlan();
});

els.closeModal.addEventListener("click", () => {
  playModalClose();
  els.modal.close();
});

loadPrefs();
setupParallax();
applyMotionMode();
els.musicToggle.checked = state.musicOn;
els.sfxToggle.checked = state.sfxOn;
els.reducedMotionToggle.checked = state.reducedMotion;
els.musicTheme.value = state.musicTheme;
els.musicVolume.value = String(Math.round(state.musicVolume * 100));
els.sfxVolume.value = String(Math.round(state.sfxVolume * 100));

const response = await fetch("./data/brotato-data.json");
state.data = await response.json();
render();
generateBuildPlan();
