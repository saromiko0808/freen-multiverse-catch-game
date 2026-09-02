(() => {
  "use strict";

  const ROLE_NAMES = ["冷豔角色", "溫柔角色", "帥氣角色"];
  const ROLE_IMAGES = ["tv-role-1.png", "tv-role-2.png", "tv-role-3.png"];
  const STORE_KEY = "freenMultiverseCatchV1";
  const LEVELS = [
    { title: "初次相遇", desc: "跟著傳送門，捕捉第一位角色", duration: 20, roles: [0], interval: 900, visible: 1100, maxActive: 1, dogChance: .04, cactusChance: 0, guestChance: 0, roleScore: 1, goal: 12, stars: [12,17,22] },
    { title: "雙角色登場", desc: "友情客串與仙人掌開始亂入", duration: 25, roles: [0,1], interval: 720, visible: 920, maxActive: 1, dogChance: .08, cactusChance: .20, guestChance: .12, roleScore: 2, goal: 22, stars: [22,30,38] },
    { title: "角色雷達", desc: "鎖定目標，其他 Freen 不扣分", duration: 30, roles: [0,1,2], interval: 650, visible: 850, maxActive: 1, dogChance: .10, cactusChance: .18, guestChance: .18, roleScore: 3, targetMode: true, goal: 32, stars: [32,44,56] },
    { title: "狗狗大亂入", desc: "雙線捕捉，狗狗歡呼、干擾物更常出現", duration: 30, roles: [0,1,2], interval: 560, visible: 760, maxActive: 2, dogChance: .20, cactusChance: .20, guestChance: .18, roleScore: 2, dogScore: 5, dogTime: 1, goal: 45, stars: [45,58,72] },
    { title: "多重宇宙終章", desc: "高速三線挑戰，判斷力與連擊決勝負", duration: 30, roles: [0,1,2], interval: 500, visible: 680, maxActive: 3, dogChance: .09, cactusChance: .22, guestChance: .20, roleScore: 2, dogScore: 8, speedRamp: true, freenTime: true, goal: 60, stars: [60,78,96] }
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    mapScreen: $("mapScreen"), gameScreen: $("gameScreen"), levelList: $("levelList"), totalStars: $("totalStars"),
    soundBtn: $("soundBtn"), resetBtn: $("resetBtn"), backBtn: $("backBtn"), pauseBtn: $("pauseBtn"),
    levelTag: $("levelTag"), missionTitle: $("missionTitle"), timeValue: $("timeValue"), scoreValue: $("scoreValue"),
    comboValue: $("comboValue"), goalValue: $("goalValue"), missionHint: $("missionHint"), targetPanel: $("targetPanel"),
    targetImg: $("targetImg"), targetName: $("targetName"), targetTimer: $("targetTimer"), arena: $("arena"),
    portalGrid: $("portalGrid"), toastLayer: $("toastLayer"), freenTimeBanner: $("freenTimeBanner"),
    pauseOverlay: $("pauseOverlay"), resumeBtn: $("resumeBtn"), pauseMapBtn: $("pauseMapBtn"),
    resultOverlay: $("resultOverlay"), resultBadge: $("resultBadge"), resultTitle: $("resultTitle"), resultStars: $("resultStars"),
    resultScore: $("resultScore"), resultMessage: $("resultMessage"), nextBtn: $("nextBtn"), retryBtn: $("retryBtn"), mapBtn: $("mapBtn")
  };

  let progress = loadProgress();
  let soundOn = true;
  let audioCtx = null;
  let currentLevel = 0;
  let cfg = LEVELS[0];
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let timeLeft = 0;
  let extraTime = 0;
  let running = false;
  let paused = false;
  let lastFrame = 0;
  let nextSpawnAt = 0;
  let targetRole = 0;
  let nextTargetAt = 0;
  let freenTimeUntil = 0;
  let freenTimeReady = true;
  let entities = new Map();
  let animationFrame = 0;

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && saved.levels) return saved;
    } catch (_) {}
    return { unlocked: 1, levels: {} };
  }

  function saveProgress() {
    localStorage.setItem(STORE_KEY, JSON.stringify(progress));
  }

  function renderMap() {
    els.levelList.innerHTML = "";
    let total = 0;
    LEVELS.forEach((level, i) => {
      const data = progress.levels[i] || { best: 0, stars: 0 };
      total += data.stars || 0;
      const locked = i + 1 > progress.unlocked;
      const button = document.createElement("button");
      button.className = `level-card${locked ? " locked" : ""}`;
      button.disabled = locked;
      button.innerHTML = `
        <span class="level-num">${locked ? "🔒" : i + 1}</span>
        <span class="level-copy"><h3>${level.title}</h3><p>${level.desc}</p></span>
        <span class="level-meta">${locked ? `<span class="lock">LOCK</span>` : `<span class="level-stars">${"★".repeat(data.stars)}${"☆".repeat(3-data.stars)}</span><span class="level-best">BEST ${data.best}</span>`}</span>`;
      if (!locked) button.addEventListener("click", () => startLevel(i));
      els.levelList.appendChild(button);
    });
    els.totalStars.textContent = total;
  }

  function showMap() {
    stopGame();
    els.pauseOverlay.classList.add("hidden");
    els.resultOverlay.classList.add("hidden");
    els.gameScreen.classList.remove("active");
    els.mapScreen.classList.add("active");
    renderMap();
    window.scrollTo(0, 0);
  }

  function makePortals() {
    els.portalGrid.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const portal = document.createElement("div");
      portal.className = "portal";
      portal.dataset.index = i;
      els.portalGrid.appendChild(portal);
    }
  }

  function startLevel(index) {
    currentLevel = index;
    cfg = LEVELS[index];
    score = 0; combo = 0; maxCombo = 0; extraTime = 0;
    timeLeft = cfg.duration;
    running = true; paused = false;
    entities.clear();
    targetRole = cfg.roles[Math.floor(Math.random() * cfg.roles.length)];
    freenTimeUntil = 0; freenTimeReady = true;
    els.levelTag.textContent = `LEVEL ${index + 1}`;
    els.missionTitle.textContent = cfg.title;
    els.goalValue.textContent = `目標 ${cfg.goal}`;
    els.missionHint.textContent = cfg.targetMode ? "指定 +3｜其他 Freen +0｜客串 −2｜仙人掌 −3" : (cfg.freenTime ? "漏掉不扣分｜客串 −2｜仙人掌 −3｜10 連擊啟動 Freen Time" : (cfg.cactusChance ? "漏掉不扣分｜客串 −2｜仙人掌 −3｜狗狗加分歡呼" : "教學關：放心捕捉，本關不扣分"));
    els.targetPanel.classList.toggle("hidden", !cfg.targetMode);
    updateTarget();
    updateStats();
    makePortals();
    els.mapScreen.classList.remove("active");
    els.gameScreen.classList.add("active");
    els.resultOverlay.classList.add("hidden");
    els.pauseOverlay.classList.add("hidden");
    els.arena.classList.remove("slow");
    window.scrollTo(0, 0);
    const now = performance.now();
    lastFrame = now;
    nextSpawnAt = now + 350;
    nextTargetAt = now + 5000;
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(gameLoop);
    playTone("start");
  }

  function gameLoop(now) {
    if (!running) return;
    if (paused) { lastFrame = now; animationFrame = requestAnimationFrame(gameLoop); return; }
    const dt = Math.min((now - lastFrame) / 1000, .1);
    lastFrame = now;
    timeLeft -= dt;

    if (cfg.targetMode && now >= nextTargetAt) {
      changeTarget();
      nextTargetAt = now + 5000;
    }

    const inFreenTime = now < freenTimeUntil;
    els.arena.classList.toggle("slow", inFreenTime);
    if (!inFreenTime && combo < 10) freenTimeReady = true;

    if (now >= nextSpawnAt) {
      spawnEntity(now);
      let interval = cfg.interval;
      if (cfg.speedRamp) interval *= Math.max(.55, 1 - Math.floor((cfg.duration - timeLeft) / 8) * .12);
      if (inFreenTime) interval *= 1.55;
      nextSpawnAt = now + interval;
    }

    updateStats();
    if (timeLeft <= 0) finishLevel();
    else animationFrame = requestAnimationFrame(gameLoop);
  }

  function spawnEntity(now) {
    if (entities.size >= cfg.maxActive) return;
    const free = [...Array(9).keys()].filter(i => !entities.has(i));
    if (!free.length) return;
    const portalIndex = free[Math.floor(Math.random() * free.length)];
    const roll = Math.random();
    const isDog = roll < cfg.dogChance;
    const isCactus = !isDog && roll < cfg.dogChance + (cfg.cactusChance || 0);
    const isGuest = !isDog && !isCactus && roll < cfg.dogChance + (cfg.cactusChance || 0) + (cfg.guestChance || 0);
    const role = (isDog || isCactus || isGuest) ? -1 : cfg.roles[Math.floor(Math.random() * cfg.roles.length)];
    const portal = els.portalGrid.children[portalIndex];
    const button = document.createElement("button");
    const kind = isDog ? "dog" : (isCactus ? "cactus" : (isGuest ? "guest" : "role"));
    const asset = isDog ? "lucky-dog.png" : (isCactus ? "cactus.png" : (isGuest ? "guest-role.png" : ROLE_IMAGES[role]));
    const label = isDog ? "捕捉幸運臘腸狗" : (isCactus ? "避開仙人掌" : (isGuest ? "友情客串角色" : `捕捉${ROLE_NAMES[role]}`));
    button.className = `entity ${kind}`;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<img src="${asset}" alt="">`;
    portal.appendChild(button);
    const token = Symbol("entity");
    const visible = cfg.visible * (now < freenTimeUntil ? 1.7 : 1);
    const timeout = window.setTimeout(() => removeEntity(portalIndex, token, false), visible);
    entities.set(portalIndex, { token, button, role, isDog, isCactus, isGuest, timeout, targetAtSpawn: targetRole });
    button.addEventListener("pointerdown", (event) => catchEntity(event, portalIndex, token), { once: true });
  }

  function catchEntity(event, portalIndex, token) {
    event.preventDefault();
    if (!running || paused) return;
    const item = entities.get(portalIndex);
    if (!item || item.token !== token) return;
    const now = performance.now();
    const doubleScore = cfg.freenTime && now < freenTimeUntil;
    let points = 0;
    let correct = true;
    let label = "";

    if (item.isDog) {
      points = cfg.dogScore || 5;
      if (cfg.dogTime) { timeLeft += cfg.dogTime; label = `狗狗 +${points}・+${cfg.dogTime}秒`; }
      else label = `狗狗 +${points}`;
      combo += 1;
      playDogCheer();
    } else if (item.isCactus) {
      correct = false;
      combo = 0;
      score = Math.max(0, score - 3);
      label = "碰到仙人掌 −3";
      playTone("wrong");
    } else if (item.isGuest) {
      correct = false;
      combo = 0;
      score = Math.max(0, score - 2);
      label = "不是本關目標 −2";
      playTone("wrong");
    } else if (cfg.targetMode && item.role !== targetRole) {
      combo = 0;
      label = "非本次目標 +0";
      playTone("target");
    } else {
      points = cfg.roleScore;
      combo += 1;
      label = `+${points}`;
      playTone("hit");
    }

    if (correct && points > 0) {
      if (doubleScore) { points *= 2; label = `×2  +${points}`; }
      score += points;
      maxCombo = Math.max(maxCombo, combo);
      if (cfg.freenTime && combo > 0 && combo % 10 === 0 && freenTimeReady && now >= freenTimeUntil) activateFreenTime(now);
    }

    const portal = els.portalGrid.children[portalIndex];
    portal.classList.remove("hit", "miss");
    void portal.offsetWidth;
    portal.classList.add(correct ? "hit" : "miss");
    showScore(event, label, !correct);
    removeEntity(portalIndex, token, true);
    updateStats();
  }

  function removeEntity(index, token, caught) {
    const item = entities.get(index);
    if (!item || item.token !== token) return;
    clearTimeout(item.timeout);
    entities.delete(index);
    item.button.classList.add("leaving");
    setTimeout(() => item.button.remove(), caught ? 150 : 180);
  }

  function showScore(event, text, bad) {
    const rect = els.arena.getBoundingClientRect();
    const x = Math.max(25, Math.min(rect.width - 25, event.clientX - rect.left));
    const y = Math.max(40, event.clientY - rect.top);
    const pop = document.createElement("span");
    pop.className = `score-pop${bad ? " bad" : ""}`;
    pop.textContent = text;
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
    els.toastLayer.appendChild(pop);
    setTimeout(() => pop.remove(), 760);
    if (!bad) {
      for (let i = 0; i < 5; i++) {
        const spark = document.createElement("span");
        spark.className = "spark";
        spark.textContent = i % 2 ? "✦" : "✨";
        spark.style.left = `${x}px`; spark.style.top = `${y}px`;
        spark.style.setProperty("--tx", `${(Math.random()-.5)*95}px`);
        spark.style.setProperty("--ty", `${-25-Math.random()*75}px`);
        els.toastLayer.appendChild(spark);
        setTimeout(() => spark.remove(), 700);
      }
    }
  }

  function activateFreenTime(now) {
    freenTimeReady = false;
    freenTimeUntil = now + 3200;
    els.freenTimeBanner.classList.remove("show");
    void els.freenTimeBanner.offsetWidth;
    els.freenTimeBanner.classList.add("show");
    playTone("freen");
  }

  function changeTarget() {
    const choices = cfg.roles.filter(r => r !== targetRole);
    targetRole = choices[Math.floor(Math.random() * choices.length)];
    updateTarget();
    els.targetPanel.classList.remove("change");
    void els.targetPanel.offsetWidth;
    els.targetPanel.classList.add("change");
    playTone("target");
  }

  function updateTarget() {
    els.targetImg.src = ROLE_IMAGES[targetRole];
    els.targetName.textContent = ROLE_NAMES[targetRole];
  }

  function updateStats() {
    els.timeValue.textContent = Math.max(0, timeLeft).toFixed(1);
    els.scoreValue.textContent = score;
    els.comboValue.textContent = `×${combo}`;
    const comboStat = els.comboValue.closest(".stat");
    comboStat.classList.toggle("hot", combo >= 5);
    if (cfg.targetMode) {
      const remain = Math.max(0, Math.ceil((nextTargetAt - performance.now()) / 1000));
      els.targetTimer.textContent = `${remain} 秒後切換`;
    }
  }

  function starsFor(value) {
    if (value >= cfg.stars[2]) return 3;
    if (value >= cfg.stars[1]) return 2;
    if (value >= cfg.stars[0]) return 1;
    return 0;
  }

  function finishLevel() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(animationFrame);
    clearEntities();
    const stars = starsFor(score);
    const passed = stars > 0;
    const old = progress.levels[currentLevel] || { best: 0, stars: 0, combo: 0 };
    progress.levels[currentLevel] = { best: Math.max(old.best, score), stars: Math.max(old.stars, stars), combo: Math.max(old.combo || 0, maxCombo) };
    if (passed && currentLevel < LEVELS.length - 1) progress.unlocked = Math.max(progress.unlocked, currentLevel + 2);
    saveProgress();
    els.resultBadge.textContent = passed ? "MISSION CLEAR" : "TRY AGAIN";
    els.resultTitle.textContent = passed ? (currentLevel === 4 ? "多重宇宙制霸！" : "關卡完成！") : "差一點點！";
    els.resultStars.textContent = `${"★".repeat(stars)}${"☆".repeat(3-stars)}`;
    els.resultScore.textContent = score;
    els.resultMessage.textContent = passed ? (currentLevel === 4 ? `最高連擊 ${maxCombo}！你成功完成所有宇宙。` : `最高連擊 ${maxCombo}！下一個宇宙已解鎖。`) : `還差 ${Math.max(0, cfg.goal-score)} 分就能過關，再挑戰一次吧！`;
    els.nextBtn.classList.toggle("hidden", !passed || currentLevel === LEVELS.length - 1);
    els.resultOverlay.classList.remove("hidden");
    playTone(passed ? "clear" : "fail");
  }

  function clearEntities() {
    entities.forEach(item => { clearTimeout(item.timeout); item.button.remove(); });
    entities.clear();
  }

  function stopGame() {
    running = false;
    paused = false;
    cancelAnimationFrame(animationFrame);
    clearEntities();
  }

  function togglePause(force) {
    if (!running) return;
    paused = typeof force === "boolean" ? force : !paused;
    els.pauseOverlay.classList.toggle("hidden", !paused);
    if (!paused) { lastFrame = performance.now(); nextSpawnAt = lastFrame + 250; }
  }

  function playTone(kind) {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const notes = {
        hit: [520,.06], dog: [740,.11], wrong: [155,.13], start: [390,.08], target: [610,.07],
        freen: [880,.2], clear: [660,.25], fail: [210,.18]
      };
      const [freq, duration] = notes[kind] || notes.hit;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = kind === "wrong" || kind === "fail" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      if (["dog","freen","clear"].includes(kind)) osc.frequency.exponentialRampToValueAtTime(freq * 1.45, audioCtx.currentTime + duration);
      gain.gain.setValueAtTime(.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function playDogCheer() {
    if (!soundOn) return;
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const start = audioCtx.currentTime;

      [440, 554, 659].forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = i === 1 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, start + i * .035);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.42, start + .34);
        gain.gain.setValueAtTime(.001, start + i * .035);
        gain.gain.exponentialRampToValueAtTime(.10, start + .05 + i * .035);
        gain.gain.exponentialRampToValueAtTime(.001, start + .42);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(start + i * .035); osc.stop(start + .44);
      });

      const sampleRate = audioCtx.sampleRate;
      const buffer = audioCtx.createBuffer(1, Math.floor(sampleRate * .08), sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      [0, .07, .14, .22, .31].forEach((delay, i) => {
        const noise = audioCtx.createBufferSource();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();
        noise.buffer = buffer;
        filter.type = "bandpass";
        filter.frequency.value = 900 + i * 130;
        filter.Q.value = .8;
        gain.gain.value = .055;
        noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        noise.start(start + delay);
      });
    } catch (_) {
      playTone("dog");
    }
  }

  els.soundBtn.addEventListener("click", () => { soundOn = !soundOn; els.soundBtn.textContent = soundOn ? "🔊" : "🔇"; });
  els.backBtn.addEventListener("click", showMap);
  els.pauseBtn.addEventListener("click", () => togglePause());
  els.resumeBtn.addEventListener("click", () => togglePause(false));
  els.pauseMapBtn.addEventListener("click", showMap);
  els.retryBtn.addEventListener("click", () => startLevel(currentLevel));
  els.mapBtn.addEventListener("click", showMap);
  els.nextBtn.addEventListener("click", () => startLevel(Math.min(currentLevel + 1, LEVELS.length - 1)));
  els.resetBtn.addEventListener("click", () => {
    if (confirm("確定要清除星星與最高分，重新從第一關開始嗎？")) {
      progress = { unlocked: 1, levels: {} };
      saveProgress(); renderMap();
    }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && running && !paused) togglePause(true); });
  window.addEventListener("beforeunload", stopGame);

  renderMap();
})();
