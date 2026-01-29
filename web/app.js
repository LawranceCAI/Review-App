// Commute Review - simple offline SRS
const $ = (sel) => document.querySelector(sel);

const STORAGE_KEY = "cr_progress_v1";
const SETTINGS_KEY = "cr_settings_v1";

const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};

const defaultSettings = {
  goal: 30,
  batch: 15,
  newRatio: 0.30
};

const loadSettings = () => {
  try { return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY))||{}) }; }
  catch { return { ...defaultSettings }; }
};
const saveSettings = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

const loadProgress = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { cards: {}, history: {} }; }
  catch { return { cards: {}, history: {} }; }
};
const saveProgress = (p) => localStorage.setItem(STORAGE_KEY, JSON.stringify(p));

const nowTs = () => Date.now();
const daysFromNow = (days) => nowTs() + days*24*60*60*1000;

function sm2Update(state, grade){
  // state: {ease, intervalDays, dueTs, reps}
  let ease = state.ease ?? 2.5;
  let interval = state.intervalDays ?? 0;
  let reps = state.reps ?? 0;

  // Map grade to quality (0-5)
  const qMap = { again: 1, hard: 3, good: 4, easy: 5 };
  const q = qMap[grade] ?? 4;

  if(q < 3){
    reps = 0;
    interval = 0.3; // same day
  }else{
    reps += 1;
    if(reps === 1) interval = 1;
    else if(reps === 2) interval = 3;
    else interval = Math.max(1, Math.round(interval * ease));
  }

  // ease update
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.min(2.7, Math.max(1.3, ease));

  let due;
  if(grade === "again") due = daysFromNow(0.15); // ~3.6 hours
  else if(grade === "hard") due = daysFromNow(Math.max(0.5, interval*0.7));
  else due = daysFromNow(interval);

  return { ease, intervalDays: interval, reps, dueTs: due, lastTs: nowTs(), lastGrade: grade };
}

let CARDS = [];
let META = {};
let settings = loadSettings();
let progress = loadProgress();

function getCardState(id){
  return progress.cards[id] || null;
}
function setCardState(id, st){
  progress.cards[id] = st;
}

function getDoneToday(){
  const k = todayKey();
  return progress.history[k]?.done || 0;
}
function incDoneToday(){
  const k = todayKey();
  progress.history[k] = progress.history[k] || { done: 0 };
  progress.history[k].done += 1;
}

function isDue(card){
  const st = getCardState(card.id);
  if(!st) return false;
  return (st.dueTs ?? 0) <= nowTs();
}
function isNew(card){
  return !getCardState(card.id);
}

function chooseSessionCards(){
  const due = CARDS.filter(isDue);
  const newCards = CARDS.filter(isNew);

  const batch = settings.batch;
  const wantNew = Math.round(batch * settings.newRatio);
  const wantDue = batch - wantNew;

  // shuffle
  const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);

  const pickedDue = shuffle(due).slice(0, wantDue);
  const pickedNew = shuffle(newCards).slice(0, wantNew);

  // if not enough, fill from the other bucket
  let picked = [...pickedDue, ...pickedNew];
  if(picked.length < batch){
    const remaining = shuffle(CARDS.filter(c => !picked.find(p => p.id===c.id)));
    picked = picked.concat(remaining.slice(0, batch - picked.length));
  }

  // final shuffle to mix
  return shuffle(picked);
}

function computeCounts(){
  const dueCount = CARDS.filter(isDue).length;
  const newCount = CARDS.filter(isNew).length;
  return { dueCount, newCount };
}

function renderHome(){
  const { dueCount, newCount } = computeCounts();
  $("#dueCount").textContent = String(dueCount);
  $("#newCount").textContent = String(newCount);
  $("#doneToday").textContent = String(getDoneToday());
  $("#goalToday").textContent = String(settings.goal);
  $("#footerMeta").textContent = `卡片：${META.card_count ?? CARDS.length} · 來源：${META.source_file ?? "local"} · 生成：${META.generated_at ?? "-"}`;
}

function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

let sessionCards = [];
let idx = 0;
let showingAnswer = false;

function enterSession(cards){
  sessionCards = cards;
  idx = 0;
  showingAnswer = false;
  hide($("#home")); hide($("#browse")); hide($("#settings"));
  show($("#session"));
  renderSessionCard();
}

function maskHighlights(text, highlights){
  if(!highlights || !highlights.length) return text;
  let out = text;
  for(const h of highlights){
    if(!h) continue;
    out = out.split(h).join("_____");
  }
  return out;
}

let hintOrder = [];
let hintShown = 0;

function renderSessionCard(){
  const total = sessionCards.length;
  const card = sessionCards[idx];
  $("#sessionProgress").textContent = `${idx+1}/${total}`;
  $("#sessionTopic").textContent = card.topic || "—";

  hintOrder = [];
  hintShown = 0;

  if(card.type === "direction"){
    $("#prompt").textContent = `${card.topic} — ${card.direction}

${card.topic} 的「${card.direction}」是什麼？`;

    const blocks = card.blocks || [];
    const n = blocks.length;
    hintOrder = [...Array(n).keys()].sort(() => Math.random()-0.5);

    $("#answer").textContent = "";
    hide($("#answer"));
    $("#btnShow").textContent = "提示";
    show($("#btnShow"));
    hide($("#gradeRow"));
    return;
  }

  let prompt = "";
  if(card.type === "qa"){
    prompt = card.prompt;
  }else if(card.type === "cloze"){
    prompt = card.prompt;
  }else{
    prompt = card.prompt + "

（試著用自己的話複述）";
  }

  $("#prompt").textContent = prompt;
  $("#answer").textContent = card.answer;

  hide($("#answer"));
  $("#btnShow").textContent = "看答案";
  show($("#btnShow"));
  hide($("#gradeRow"));
}

function nextCard(){
  idx += 1;
  if(idx >= sessionCards.length){
    // finished
    hide($("#session"));
    show($("#home"));
    renderHome();
    return;
  }
  renderSessionCard();
}

function gradeCurrent(grade){
  const card = sessionCards[idx];
  const st = getCardState(card.id) || { ease: 2.5, intervalDays: 0, reps: 0, dueTs: 0 };
  const updated = sm2Update(st, grade);
  setCardState(card.id, updated);
  incDoneToday();
  saveProgress(progress);
  nextCard();
}

async function loadCards(){
  const res = await fetch("./data/cards.json");
  const data = await res.json();
  META = data.meta || {};
  CARDS = data.cards || [];
}

function renderTopics(filterText=""){
  const map = new Map();
  const q = (filterText||"").trim().toLowerCase();

  for(const c of CARDS){
    const t = c.topic || "General";
    map.set(t, (map.get(t)||0)+1);
  }

  const topics = [...map.entries()].sort((a,b)=>b[1]-a[1]);

  const list = $("#topicList");
  list.innerHTML = "";

  topics
    .filter(([name]) => !q || name.toLowerCase().includes(q))
    .forEach(([name, count]) => {
      const div = document.createElement("div");
      div.className = "topicItem";
      div.innerHTML = `
        <div>
          <div class="topicName">${name}</div>
          <div class="topicMeta">${count} 張</div>
        </div>
        <button class="btn primary">刷這個</button>
      `;
      div.querySelector("button").addEventListener("click", () => {
        const cards = CARDS.filter(c => (c.topic||"General") === name);
        // prefer due+new within topic, but keep it simple: shuffle and take batch
        const shuffled = cards.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
        enterSession(shuffled.slice(0, settings.batch));
      });
      list.appendChild(div);
    });
}

function openSettings(){
  $("#setGoal").value = settings.goal;
  $("#setBatch").value = settings.batch;
  $("#setNewRatio").value = settings.newRatio;
  hide($("#home")); hide($("#session")); hide($("#browse"));
  show($("#settings"));
}

function closeSettings(){
  hide($("#settings"));
  show($("#home"));
  renderHome();
}

function exportProgress(){
  const blob = new Blob([JSON.stringify(progress, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `commute-review-progress-${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importProgress(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const obj = JSON.parse(String(reader.result||"{}"));
      if(obj && obj.cards && obj.history){
        progress = obj;
        saveProgress(progress);
        renderHome();
        alert("匯入完成！");
      }else{
        alert("檔案格式不對。");
      }
    }catch(e){
      alert("解析失敗。");
    }
  };
  reader.readAsText(file);
}

async function main(){
  await loadCards();

  // Register SW
  if("serviceWorker" in navigator){
    try { await navigator.serviceWorker.register("./service-worker.js"); } catch {}
  }

  // Home actions
  $("#btnStart").addEventListener("click", () => enterSession(chooseSessionCards()));
  $("#btnBrowse").addEventListener("click", () => {
    hide($("#home")); hide($("#session")); hide($("#settings"));
    show($("#browse"));
    renderTopics();
  });
  $("#btnSettings").addEventListener("click", openSettings);

  // Session actions
  $("#btnExit").addEventListener("click", () => {
    hide($("#session"));
    show($("#home"));
    renderHome();
  });

  $("#btnShow").addEventListener("click", () => {
    const card = sessionCards[idx];

    if(card.type === "direction"){
      const blocks = card.blocks || [];
      if(!blocks.length){
        show($("#gradeRow"));
        hide($("#btnShow"));
        return;
      }

      const hintMax = Math.min(3, blocks.length);

      if(hintShown < hintMax){
        const b = blocks[hintOrder[hintShown]];
        const masked = maskHighlights(b.text, b.highlights);
        const prefix = (hintShown === 0) ? "提示：
" : "

";
        $("#answer").textContent += prefix + masked;
        show($("#answer"));
        hintShown += 1;

        if(hintShown >= hintMax){
          $("#btnShow").textContent = "看完整答案";
        }
        return;
      }

      $("#answer").textContent = "完整答案：
" + blocks.map(b => "• " + b.text).join("

");
      show($("#answer"));
      hide($("#btnShow"));
      show($("#gradeRow"));
      return;
    }

    show($("#answer"));
    hide($("#btnShow"));
    show($("#gradeRow"));
  });

$("#gradeRow").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-grade]");
    if(!btn) return;
    gradeCurrent(btn.dataset.grade);
  });

  // Browse actions
  $("#btnBackHome").addEventListener("click", () => {
    hide($("#browse"));
    show($("#home"));
    renderHome();
  });
  $("#topicFilter").addEventListener("input", (e) => renderTopics(e.target.value));

  // Settings actions
  $("#btnCloseSettings").addEventListener("click", closeSettings);
  $("#setGoal").addEventListener("change", (e) => {
    settings.goal = Math.max(5, Math.min(200, Number(e.target.value)||30));
    saveSettings(settings);
  });
  $("#setBatch").addEventListener("change", (e) => {
    settings.batch = Math.max(5, Math.min(50, Number(e.target.value)||15));
    saveSettings(settings);
  });
  $("#setNewRatio").addEventListener("change", (e) => {
    settings.newRatio = Math.max(0, Math.min(1, Number(e.target.value)||0.3));
    saveSettings(settings);
  });

  $("#btnResetProgress").addEventListener("click", () => {
    if(confirm("確定要重置嗎？（不會刪除卡片）")){
      progress = { cards: {}, history: {} };
      saveProgress(progress);
      renderHome();
    }
  });

  $("#btnExport").addEventListener("click", exportProgress);
  $("#importFile").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if(f) importProgress(f);
    e.target.value = "";
  });

  // Render first
  renderHome();
}

main();
