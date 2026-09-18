window.TA = window.TA || {};

TA.TABS = [
  { id: "river", name: "河岸" },
  { id: "village", name: "聚落", need: "construction" },
  { id: "explore", name: "探索", need: "construction" },
  { id: "workshop", name: "工坊", need: "construction" },
  { id: "science", name: "智库" },
  { id: "space", name: "星空", need: "rocketry" },
  { id: "anchor", name: "锚点" },
];

TA.UI = {
  game: null,
  tab: "river",
  introStep: 0,
  typed: 0,
  lastFull: 0,
  _layoutKey: "",
  _logHead: "",

  boot(game, resume) {
    this.game = game;
    const happy = document.getElementById("happiness-label");
    const conceal = document.getElementById("conceal-label");
    if (happy) happy.innerHTML = `${TA.icon("happiness", "ico-cost")}安定`;
    if (conceal) conceal.innerHTML = `${TA.icon("concealment", "ico-cost")}隐蔽`;
    if (resume) this.enterGame();
    else this.showIntro();
    this.bind();
  },

  bind() {
    document.getElementById("intro-next").onclick = () => this.advanceIntro();
    document.getElementById("intro-skip").onclick = () => this.enterGame();
    document.getElementById("tabs").onclick = (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn || btn.classList.contains("locked")) return;
      this.tab = btn.dataset.tab;
      this._layoutKey = "";
      this.renderAll(true);
    };
    document.getElementById("tab-content").onclick = (e) => this.onMainClick(e);
    document.getElementById("tab-content").onchange = (e) => {
      const sel = e.target.closest("[data-elite-job]");
      if (!sel) return;
      this.game.setEliteJob(sel.dataset.eliteJob, sel.value);
      this.renderAll(true);
    };
    document.getElementById("btn-save").onclick = () => {
      this.game.save();
      this.toast("已写入本地锚点。");
    };
    document.getElementById("btn-settings").onclick = () => this.openSettings();
    document.getElementById("modal-close").onclick = () => {
      document.getElementById("modal").hidden = true;
    };
    document.getElementById("btn-clear-log").onclick = () => {
      this.game.s.log = [];
      this.renderLog();
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.getElementById("modal").hidden = true;
    });
  },

  showIntro() {
    this.introStep = 0;
    this.typed = 0;
    document.getElementById("intro").hidden = false;
    document.getElementById("app").hidden = true;
    this.typeIntro();
    this.stars();
  },

  typeIntro() {
    const text = TA.DATA.intro[this.introStep] || "";
    const el = document.getElementById("intro-text");
    const step = () => {
      this.typed += 1;
      el.textContent = text.slice(0, this.typed);
      if (this.typed < text.length) {
        const ch = text[this.typed - 1];
        const delay = ch === "\n" ? 40 : ch === "。" || ch === "」" ? 55 : 18;
        this._introTimer = setTimeout(step, delay);
      }
    };
    clearTimeout(this._introTimer);
    el.textContent = "";
    this.typed = 0;
    step();
  },

  advanceIntro() {
    const full = TA.DATA.intro[this.introStep];
    if (this.typed < full.length) {
      this.typed = full.length;
      document.getElementById("intro-text").textContent = full;
      clearTimeout(this._introTimer);
      return;
    }
    this.introStep += 1;
    if (this.introStep >= TA.DATA.intro.length) this.enterGame();
    else this.typeIntro();
  },

  enterGame() {
    clearTimeout(this._introTimer);
    document.getElementById("intro").hidden = true;
    document.getElementById("app").hidden = false;
    const g = this.game;
    g.s.introDone = true;
    g.checkStories();
    this.renderAll(true);
    TA.audio.ensure();
  },

  onMainClick(e) {
    const g = this.game;
    const gather = e.target.closest("[data-gather]");
    if (gather) {
      g.gather(gather.dataset.gather);
      this.renderResources();
      this.renderTop();
      return;
    }
    const build = e.target.closest("[data-build]");
    if (build) {
      g.build(build.dataset.build, build.dataset.qty === "max" ? g.maxBuild(build.dataset.build) : 1);
      this.renderAll(true);
      return;
    }
    const tech = e.target.closest("[data-tech]");
    if (tech) {
      g.research(tech.dataset.tech);
      this.renderAll(true);
      return;
    }
    const up = e.target.closest("[data-up]");
    if (up) {
      g.buyUpgrade(up.dataset.up);
      this.renderAll(true);
      return;
    }
    const craft = e.target.closest("[data-craft]");
    if (craft) {
      const n = craft.dataset.qty === "max" ? 50 : Number(craft.dataset.qty || 1);
      g.craft(craft.dataset.craft, n);
      this.renderAll(true);
      return;
    }
    const job = e.target.closest("[data-job]");
    if (job) {
      g.assign(job.dataset.job, Number(job.dataset.d));
      this.renderAll(true);
      return;
    }
    const stake = e.target.closest("[data-stake]");
    if (stake) {
      g.s.drawStake = Number(stake.dataset.stake);
      this.renderAll(true);
      return;
    }
    if (e.target.closest("[data-draw]")) {
      const elite = g.drawElite();
      this.renderAll(true);
      if (elite) {
        const r = TA.DATA.rarities[elite.rarity];
        this.toast(`抽签遇见${r.name}居民「${elite.name}」。`);
      }
      return;
    }
    if (e.target.closest("[data-keep-draw]")) {
      const elite = g.keepPendingElite();
      this.renderAll(true);
      if (elite) this.toast(`「${elite.name}」留下。`);
      return;
    }
    if (e.target.closest("[data-abandon-draw]")) {
      const elite = g.abandonPendingElite();
      this.renderAll(true);
      if (elite) this.toast(`「${elite.name}」被送回河岸。`);
      return;
    }
    if (e.target.closest("[data-redraw]")) {
      const elite = g.redrawElite();
      this.renderAll(true);
      if (elite) {
        const r = TA.DATA.rarities[elite.rarity];
        this.toast(`再次抽签遇见${r.name}居民「${elite.name}」。`);
      }
      return;
    }
    const dismiss = e.target.closest("[data-dismiss-elite]");
    if (dismiss) {
      const id = dismiss.dataset.dismissElite;
      const target = (g.s.elites || []).find((el) => el.id === id);
      if (!target) return;
      if (target.away) {
        this.toast("小队仍在外出，无法遣返。");
        return;
      }
      if (!confirm(`遣返「${target.name}」？专属居所会空出。`)) return;
      g.dismissElite(id);
      this.renderAll(true);
      this.toast(`「${target.name}」被遣返。`);
      return;
    }
    const meta = e.target.closest("[data-meta]");
    if (meta) {
      g.buyMeta(meta.dataset.meta);
      this.renderAll(true);
      return;
    }
    if (e.target.closest("[data-prestige]")) {
      if (confirm("启动时间之锚？你将回到河边这一刻。建筑与物资会消失，余烬与铭刻会留下。")) {
        g.prestige();
        this.tab = "river";
        this.renderAll(true);
        this.toast("你再次听见河声。");
      }
      return;
    }
    if (e.target.closest("[data-victory]")) {
      g.victory();
      this.renderAll(true);
      return;
    }
    const zone = e.target.closest("[data-zone]");
    if (zone) {
      g.selectZone(Number(zone.dataset.zone));
      this.renderAll(true);
      return;
    }
    const squad = e.target.closest("[data-squad]");
    if (squad) {
      g.toggleSquad(squad.dataset.squad);
      this.renderAll(true);
      return;
    }
    const veh = e.target.closest("[data-vehicle]");
    if (veh) {
      g.buyVehicle(veh.dataset.vehicle);
      this.renderAll(true);
      return;
    }
    if (e.target.closest("[data-explore-start]")) {
      if (g.startExplore()) this.toast("小队出发。");
      this.renderAll(true);
      return;
    }
    if (e.target.closest("[data-auto-run]")) {
      const r = g.toggleAutoExplore();
      if (r === "on") this.toast("自动探险开始。小队将持续出发。");
      else if (r === "off") this.toast("自动探险已经停止。");
      this.flushAutoStop();
      this.renderAll(true);
      return;
    }
    if (e.target.closest("[data-auto-advance]")) {
      const on = g.toggleAutoAdvance();
      this.toast(on ? "胜利后自动前进。" : "继续探索当前关。");
      this.renderAll(true);
    }
  },

  renderAll(full) {
    this.flushAutoStop();
    this.renderTop();
    this.renderResources();
    const key = this.layoutKey();
    if (full || key !== this._layoutKey) {
      this._layoutKey = key;
      this.renderTabs();
      this.renderMain();
      this.renderLog();
    } else {
      this.patchActions();
    }
    const head = this.game.s.log[0]?.text || "";
    if (head !== this._logHead) {
      this._logHead = head;
      this.renderLog();
    }
  },

  layoutKey() {
    const g = this.game;
    const visB = Object.keys(TA.DATA.buildings).filter((id) => g.canSeeBuilding(id)).join(",");
    const visT = Object.keys(TA.DATA.techs).filter((id) => g.canSeeTech(id)).map((id) => id + (g.s.techs[id] ? "1" : "0")).join(",");
    const visC = Object.keys(TA.DATA.crafts).filter((id) => !TA.DATA.crafts[id].require?.tech || g.s.techs[TA.DATA.crafts[id].require.tech]).join(",");
    const visU = Object.keys(TA.DATA.upgrades).filter((id) => !TA.DATA.upgrades[id].require?.tech || g.s.techs[TA.DATA.upgrades[id].require.tech]).map((id) => id + (g.s.upgrades[id] ? "1" : "0")).join(",");
    const visJ = Object.keys(TA.DATA.jobs).filter((id) => !TA.DATA.jobs[id].require?.tech || g.s.techs[TA.DATA.jobs[id].require.tech]).join(",");
    const gathers = Object.keys(TA.DATA.resources).filter((id) => {
      const d = TA.DATA.resources[id];
      return d.gather && (!d.gatherUnlock || g.s.techs[d.gatherUnlock]);
    }).join(",");
    const tabs = TA.TABS.map((t) => (t.need && !g.s.techs[t.need] ? "0" : "1")).join("");
    return [this.tab, visB, visT, visC, visU, visJ, gathers, tabs, g.s.victory ? "v" : "", g.s.techs.timeanchor ? "a" : "", g.canVictory() ? "w" : "", `e${(g.s.elites || []).length}-${g.eliteHousing()}-${g.drawStakeValue()}-${g.s.pendingElite?.id || ""}`, `x${g.s.explore?.trip?.phase || ""}-${g.s.explore?.trip?.zone ?? ""}-${(g.s.explore?.squad || []).join(".")}-${g.s.explore?.selected ?? 0}-${Object.keys(g.s.vehicles || {}).length}-${g.s.explore?.autoRun ? 1 : 0}-${g.s.explore?.autoAdvance ? 1 : 0}`].join("|");
  },

  setDisabled(el, off) {
    if (el && el.disabled !== off) el.disabled = off;
  },

  patchActions() {
    const g = this.game;
    const root = document.getElementById("tab-content");
    if (!root || g.s.victory) return;
    const res = g.s.resources;
    const amounts = g.amounts();

    root.querySelectorAll("[data-build]:not([data-qty])").forEach((btn) => {
      const id = btn.dataset.build;
      const cost = g.buildingCost(id, 1);
      const ok = TA.canAfford(res, cost);
      this.setDisabled(btn, !ok);
      const row = btn.closest(".item-row");
      if (row) {
        row.classList.toggle("unaffordable", !ok);
        const costEl = row.querySelector(".item-cost");
        if (costEl) costEl.innerHTML = TA.costText(cost, res);
        const count = row.querySelector(".item-count");
        if (count) count.textContent = String(g.s.buildings[id] || 0);
      }
    });
    root.querySelectorAll("[data-build][data-qty='max']").forEach((btn) => {
      this.setDisabled(btn, g.maxBuild(btn.dataset.build) < 1);
    });

    root.querySelectorAll("[data-tech]").forEach((btn) => {
      const id = btn.dataset.tech;
      const done = !!g.s.techs[id];
      const ok = !done && TA.canAfford(amounts, TA.DATA.techs[id].cost);
      this.setDisabled(btn, !ok);
      const card = btn.closest(".tech-card");
      if (card && !done) {
        const costEl = card.querySelector(".item-cost");
        if (costEl) costEl.innerHTML = TA.costText(TA.DATA.techs[id].cost, amounts);
        card.classList.toggle("unaffordable", !ok);
      }
    });

    root.querySelectorAll("[data-craft][data-qty='1']").forEach((btn) => {
      const id = btn.dataset.craft;
      const ok = TA.canAfford(res, TA.DATA.crafts[id].cost) && g.craftHasRoom(id);
      this.setDisabled(btn, !ok);
      const row = btn.closest(".item-row");
      if (row) {
        row.classList.toggle("unaffordable", !ok);
        const costEl = row.querySelector(".item-cost");
        if (costEl) costEl.innerHTML = TA.costText(TA.DATA.crafts[id].cost, res);
      }
    });
    root.querySelectorAll("[data-craft][data-qty='max']").forEach((btn) => {
      const id = btn.dataset.craft;
      this.setDisabled(btn, !TA.canAfford(res, TA.DATA.crafts[id].cost) || !g.craftHasRoom(id));
    });

    root.querySelectorAll("[data-up]").forEach((btn) => {
      const id = btn.dataset.up;
      const done = !!g.s.upgrades[id];
      const ok = !done && TA.canAfford(res, TA.DATA.upgrades[id].cost);
      this.setDisabled(btn, !ok);
      const row = btn.closest(".item-row");
      if (row && !done) {
        row.classList.toggle("unaffordable", !ok);
        const costEl = row.querySelector(".item-cost");
        if (costEl) costEl.innerHTML = TA.costText(TA.DATA.upgrades[id].cost, res);
      }
    });

    root.querySelectorAll("[data-meta]").forEach((btn) => {
      const id = btn.dataset.meta;
      const done = !!g.s.metaphysics[id];
      const ok = !done && g.s.ember >= TA.DATA.metaphysics[id].cost;
      this.setDisabled(btn, !ok);
      const row = btn.closest(".item-row");
      if (row && !done) row.classList.toggle("unaffordable", !ok);
    });

    root.querySelectorAll("[data-prestige]").forEach((btn) => {
      this.setDisabled(btn, !g.canPrestige());
    });

    const idle = g.idlePop();
    root.querySelectorAll("[data-job][data-d='1']").forEach((btn) => this.setDisabled(btn, idle < 1));
    root.querySelectorAll("[data-job][data-d='-1']").forEach((btn) => {
      this.setDisabled(btn, (g.s.jobs[btn.dataset.job] || 0) < 1);
    });
    root.querySelectorAll("[data-job-count]").forEach((el) => {
      const id = el.dataset.jobCount;
      const extra = g.elitesOnJob(id);
      el.textContent = extra ? `${g.s.jobs[id] || 0} +${extra}` : String(g.s.jobs[id] || 0);
    });
    root.querySelectorAll("[data-draw]").forEach((btn) => this.setDisabled(btn, !g.canDrawElite()));
    root.querySelectorAll("[data-redraw]").forEach((btn) => this.setDisabled(btn, !g.canRedrawElite()));
    const drawCost = root.querySelector("[data-draw-cost]");
    if (drawCost) drawCost.innerHTML = TA.costText(g.drawCost(), res);
    const redrawCost = root.querySelector("[data-redraw-cost]");
    if (redrawCost) redrawCost.innerHTML = TA.costText(g.drawCost(), res);
    const drawHint = root.querySelector("[data-draw-hint]");
    if (drawHint) {
      if (g.s.pendingElite) drawHint.textContent = "抽签结果等待确认。";
      else {
        const free = g.eliteHousing() - (g.s.elites || []).length;
        drawHint.textContent = free < 1 ? "需要空余的专属居所。" : `空余专属居所 ${free}。`;
      }
    }

    const banner = root.querySelector("[data-banner]");
    if (banner) {
      if (this.tab === "village") {
        const eh = g.eliteHousing();
        const en = (g.s.elites || []).length;
        const eat = (g.s.pop + g.eliteEat()) * TA.FOOD_PER_POP;
        banner.textContent = `居民 ${g.s.pop} / ${g.housing()}　闲置 ${idle}　高级 ${en} / ${eh}　食物消耗 ${TA.fmt(eat)}/秒　安定 ${TA.fmt(g.s.happiness, 0)}%`;
      } else if (this.tab === "explore") {
        const trip = g.s.explore?.trip;
        const v = g.bestVehicle();
        const auto = g.s.explore?.autoRun ? "　自动探险" : "";
        const adv = g.s.explore?.autoRun && g.s.explore?.autoAdvance ? " · 自动前进" : "";
        banner.textContent = trip
          ? `${trip.note}　${trip.phase === "go" ? "前往" : trip.phase === "explore" ? "探索" : "返回"}${auto}${adv}`
          : `交通 ${v.name}　载货 ${g.bagCap()}　已探访 ${Object.keys(g.s.explore.visited || {}).length} / 100${auto}${adv}`;
      } else if (this.tab === "space") {
        banner.textContent = `干预准备度 ${TA.fmt(g.readiness(), 0)}%　隐蔽 ${TA.fmt(g.s.concealment, 0)}%　舰队 ${TA.fmt(g.s.resources.fleet || 0)}`;
      } else if (this.tab === "anchor") {
        banner.textContent = `充能 ${TA.fmt(g.s.charge, 0)} / 100　余烬 ${TA.fmt(g.s.ember, 0)}　回溯 ${g.s.prestige.resets} 次　本次可获余烬 ${g.prestigeGain()}`;
      }
    }
    const bar = root.querySelector("[data-progress]");
    if (bar) {
      const trip = g.s.explore?.trip;
      if (this.tab === "explore" && trip && trip.dur > 0) bar.style.width = `${TA.clamp((trip.t / trip.dur) * 100, 0, 100)}%`;
      else {
        const w = this.tab === "anchor" ? g.s.charge : g.readiness();
        bar.style.width = `${w}%`;
      }
    }
    const note = root.querySelector("[data-trip-note]");
    if (note && g.s.explore?.trip) note.textContent = g.s.explore.trip.note;
    const bag = root.querySelector("[data-trip-bag]");
    if (bag && g.s.explore?.trip) {
      const t = g.s.explore.trip;
      const loot = Object.entries(t.bag).filter(([, n]) => n > 0.05).map(([k, n]) => `${TA.DATA.resources[k]?.name || k} ${TA.fmt(n)}`).join("、") || "空";
      bag.textContent = `行囊 ${TA.fmt(g.bagUsed(t.bag))} / ${g.bagCap()}　${loot}`;
    }
    const shp = root.querySelector("[data-squad-hp]");
    if (shp && g.s.explore?.trip) shp.style.width = `${TA.clamp((g.s.explore.trip.squadHp / (g.s.explore.trip.squadHpMax || 1)) * 100, 0, 100)}%`;
    const ehp = root.querySelector("[data-enemy-hp]");
    if (ehp && g.s.explore?.trip) ehp.style.width = `${TA.clamp((g.s.explore.trip.enemyHp / (g.s.explore.trip.enemyHpMax || 1)) * 100, 0, 100)}%`;
    root.querySelectorAll("[data-explore-start]").forEach((btn) => this.setDisabled(btn, !g.canStartExplore()));
    root.querySelectorAll("[data-auto-advance]").forEach((btn) => this.setDisabled(btn, !g.s.explore?.autoRun));
    root.querySelectorAll("[data-vehicle]").forEach((btn) => {
      const id = btn.dataset.vehicle;
      const v = TA.DATA.vehicles[id];
      const owned = !!g.s.vehicles[id];
      const ok = !owned && TA.canAfford(res, v.cost);
      this.setDisabled(btn, owned || !ok);
    });
  },

  renderTop() {
    const g = this.game;
    const t = g.s.time;
    document.getElementById("local-time").textContent =
      `第 ${t.year} 年 · ${g.season().name} · 第 ${t.day} 日`;
    document.getElementById("earth-time").textContent =
      `2300.00 · 干预准备 ${TA.fmt(g.readiness(), 0)}%`;
    document.getElementById("anchor-charge").textContent =
      `充能 ${TA.fmt(g.s.charge, 0)}%`;
  },

  renderResources() {
    const g = this.game;
    const p = g.production();
    const caps = p.caps;
    const house = p.housing;
    const eh = g.eliteHousing();
    const en = (g.s.elites || []).length;
    document.getElementById("pop-summary").textContent = en || eh
      ? `居民 ${g.s.pop} / ${house} · 闲置 ${g.idlePop()} · 高级 ${en} / ${eh}`
      : `居民 ${g.s.pop} / ${house} · 闲置 ${g.idlePop()}`;
    const order = Object.keys(TA.DATA.resources).sort((a, b) => TA.DATA.resources[a].order - TA.DATA.resources[b].order);
    if (g.s.techs.rocketry || (g.s.resources.fleet || 0) > 0) order.push("fleet");
    const names = { ...Object.fromEntries(Object.entries(TA.DATA.resources).map(([k, v]) => [k, v.name])), fleet: "舰队战力" };
    let html = "";
    for (const id of order) {
      if (id !== "fleet" && !g.canSeeResource(id)) continue;
      const amt = g.s.resources[id] || 0;
      const cap = caps[id];
      const rate = p.net[id] || 0;
      const cls = rate > 0.0005 ? "" : rate < -0.0005 ? "neg" : "zero";
      html += `<div class="res-row">${TA.icon(id, "ico-sm")}<span class="res-name">${names[id]}</span><span class="res-amt">${TA.fmt(amt)}${cap && cap < 1e8 ? ` <span class="res-cap">/ ${TA.fmt(cap)}</span>` : ""}</span><span class="res-rate ${cls}">${TA.fmtRate(rate)}</span></div>`;
    }
    if (g.s.ember > 0) {
      html += `<div class="res-row">${TA.icon("ember", "ico-sm")}<span class="res-name">余烬</span><span class="res-amt">${TA.fmt(g.s.ember, 0)}</span><span class="res-rate zero">回溯残留</span></div>`;
    }
    document.getElementById("resource-list").innerHTML = html;
    document.getElementById("happiness-val").textContent = `${TA.fmt(g.s.happiness, 0)}%`;
    document.getElementById("conceal-val").textContent = `${TA.fmt(g.s.concealment, 0)}%`;
    document.getElementById("happiness-bar").style.transform = `scaleX(${g.s.happiness / 100})`;
    document.getElementById("conceal-bar").style.transform = `scaleX(${g.s.concealment / 100})`;
  },

  renderTabs() {
    const g = this.game;
    document.getElementById("tabs").innerHTML = TA.TABS.map((t) => {
      const locked = t.need && !g.s.techs[t.need];
      const ico = { river: "water", village: "hut", explore: "explore", workshop: "tools", science: "knowledge", space: "fleet", anchor: "charge" };
      return `<button type="button" class="tab ${this.tab === t.id ? "active" : ""} ${locked ? "locked" : ""}" data-tab="${t.id}">${TA.icon(ico[t.id], "ico-tab")}${t.name}</button>`;
    }).join("");
  },

  renderMain() {
    const el = document.getElementById("tab-content");
    el.innerHTML = this.mainHTML();
    el.dataset.tab = this.tab;
    this.patchActions();
  },

  mainHTML() {
    const g = this.game;
    if (g.s.victory) {
      return `<div class="ending"><h2>归乡</h2><p>曲率泡沫在河面上绽开。你看见2300年的地球：土星轨道外的三体舰队，谈判桌上未签完的文字，以及仍有人在看天空的城市。</p><p>居民的文明被折叠进舰体。智子干扰塔先于你的声音抵达。这一次，人类不再在黑暗里等待死亡。</p><p>胸腔里，时间之锚仍在跳动。这条河流会成为地球的第二条性命。</p><p class="muted">回溯 ${g.s.prestige.resets} 次 · 余烬 ${TA.fmt(g.s.ember, 0)} · 本地第 ${g.s.time.year} 年</p></div>`;
    }
    switch (this.tab) {
      case "village": return this.villageHTML();
      case "explore": return this.exploreHTML();
      case "workshop": return this.workshopHTML();
      case "science": return this.scienceHTML();
      case "space": return this.spaceHTML();
      case "anchor": return this.anchorHTML();
      default: return this.riverHTML();
    }
  },

  riverHTML() {
    const g = this.game;
    const gathers = Object.entries(TA.DATA.resources).filter(([, d]) => d.gather && (!d.gatherUnlock || g.s.techs[d.gatherUnlock]));
    const fl = g.flags();
    const bonus = 1 + (fl.gatherBonus || 0);
    let html = `<p class="flavor">芯片在胸口跳了一下。它记得要用火，却不能替你拾柴。先积累原木、纤维和食物，解码「用火」。智库从开局就能进入。</p><div class="gather-grid">`;
    for (const [id, d] of gathers) {
      html += `<button type="button" class="btn gather" data-gather="${id}">${TA.icon(id, "ico-gather")}<span class="g-copy"><span class="g-name">${d.gatherName}</span><span class="g-gain">+${TA.fmt(d.gather * bonus)} ${d.name}</span></span></button>`;
    }
    html += `</div>${this.nextTechsHTML()}<h3 class="section-title">营地</h3><div class="row-list">${this.buildingRows("river")}</div>`;
    return html;
  },

  nextTechsHTML() {
    const g = this.game;
    const pending = Object.entries(TA.DATA.techs)
      .filter(([id, t]) => !g.s.techs[id] && g.canSeeTech(id))
      .sort((a, b) => a[1].order - b[1].order)
      .slice(0, 3);
    if (!pending.length) return "";
    let html = `<h3 class="section-title">芯片残档</h3><p class="flavor">知识在胸腔里，要用河边的材料把它拽出来。</p><div class="row-list">`;
    for (const [id, t] of pending) {
      const ok = TA.canAfford(g.amounts(), t.cost);
      html += `<div class="item-row ${ok ? "" : "unaffordable"}">${TA.icon(id, "ico-lg")}<div class="item-body"><div class="item-title">${t.name}</div><p class="item-desc">${t.desc}<br>解锁：${t.unlocks}</p></div>
        <div class="item-cost">${TA.costText(t.cost, g.amounts())}</div>
        <div class="item-actions"><button class="btn btn-anchor" data-tech="${id}" ${ok ? "" : "disabled"}>解码</button></div></div>`;
    }
    html += `</div>`;
    return html;
  },

  eliteSpecHTML(el) {
    const spec = Object.entries(el.specs || {}).map(([id, b]) => `${TA.DATA.jobs[id].name} +${Math.round(b * 100)}%`).join(" · ");
    const pas = el.passive && TA.DATA.elitePassives[el.passive];
    return `${spec}${pas ? `<br>被动：${pas.name}。${pas.desc}` : ""}`;
  },

  villageHTML() {
    const g = this.game;
    const house = g.housing();
    const eh = g.eliteHousing();
    const en = (g.s.elites || []).length;
    const eat = (g.s.pop + g.eliteEat()) * TA.FOOD_PER_POP;
    const stake = g.drawStakeValue();
    const odds = g.drawOdds(stake);
    const cost = g.drawCost(stake);
    const pending = g.s.pendingElite;
    let html = `<p class="flavor">他们不是人类。他们会在火塘边坐下，会把工具放回原处。抽签而来的高级居民，必须住进专属居所。</p>
      <div class="idle-banner" data-banner>居民 ${g.s.pop} / ${house}　闲置 ${g.idlePop()}　高级 ${en} / ${eh}　食物消耗 ${TA.fmt(eat)}/秒　安定 ${TA.fmt(g.s.happiness, 0)}%</div>`;
    if (g.s.techs.construction) {
      let hint = en >= eh ? "需要空余的专属居所。" : `空余专属居所 ${eh - en}。`;
      if (pending) hint = "抽签结果等待确认。";
      html += `<div class="draw-panel">${TA.icon("lottery", "ico-lg")}<div class="draw-body">
        <div class="item-title">招募抽签</div>
        <p class="item-desc">消耗清水与食物。提高投入倍数，高级与神话的概率随之上升。抽中后可留下、放弃，或再次消耗物资重抽。</p>
        <div class="stake-row">`;
      for (let n = 1; n <= 5; n++) {
        html += `<button type="button" class="btn btn-tiny ${n === stake ? "active" : ""}" data-stake="${n}">${n} 倍</button>`;
      }
      html += `</div>
        <div class="odds-row">${Object.values(TA.DATA.rarities).map((r) => `<span class="rarity-tag rarity-${r.id}">${r.name} ${(odds[r.id] * 100).toFixed(1)}%</span>`).join("")}</div>
        <div class="item-cost" data-draw-cost>${TA.costText(cost, g.s.resources)}</div>
        <p class="item-desc" data-draw-hint>${hint}</p>
        <button type="button" class="btn btn-anchor" data-draw ${g.canDrawElite() ? "" : "disabled"}>抽签</button>`;
      if (pending) {
        const r = TA.DATA.rarities[pending.rarity];
        const canRedraw = g.canRedrawElite();
        html += `<div class="draw-result elite-card rarity-${pending.rarity} fresh">
          ${TA.icon(Object.keys(pending.specs || {})[0] || "forager", "ico-lg")}
          <div class="item-body">
            <div class="item-title"><span class="rarity-tag rarity-${pending.rarity}">${r.name}</span>${pending.name}</div>
            <p class="item-desc">${this.eliteSpecHTML(pending)}</p>
          </div>
          <div class="draw-result-actions">
            <button type="button" class="btn btn-anchor" data-keep-draw>确定</button>
            <button type="button" class="btn btn-ghost" data-abandon-draw>放弃</button>
            <button type="button" class="btn" data-redraw ${canRedraw ? "" : "disabled"}>再抽一次</button>
          </div>
          <div class="item-cost">再抽消耗 <span data-redraw-cost>${TA.costText(cost, g.s.resources)}</span></div>
        </div>`;
      }
      html += `</div></div>`;
    }
    html += `<h3 class="section-title">职业</h3><div class="jobs">`;
    for (const [id, job] of Object.entries(TA.DATA.jobs)) {
      if (job.require?.tech && !g.s.techs[job.require.tech]) continue;
      const n = g.s.jobs[id] || 0;
      const extra = g.elitesOnJob(id);
      const prod = Object.entries(job.production || {}).map(([k, v]) => `${TA.DATA.resources[k]?.name || TA.DATA.specialNames[k] || k} ${TA.fmtRate(v)}`).join("、");
      html += `<div class="job-row">${TA.icon(id, "ico-lg")}<div class="item-body"><div class="item-title">${job.name}</div><p class="item-desc">${job.desc}<br>${prod}</p></div>
        <div class="job-ctrl">
          <button class="btn btn-tiny" data-job="${id}" data-d="-1">−</button>
          <strong data-job-count="${id}">${extra ? `${n} +${extra}` : n}</strong>
          <button class="btn btn-tiny" data-job="${id}" data-d="1">+</button>
        </div></div>`;
    }
    html += `</div>`;
    if (en) {
      html += `<h3 class="section-title">高级居民</h3><div class="elite-list">`;
      for (const el of g.s.elites) {
        const r = TA.DATA.rarities[el.rarity];
        const fresh = el.id === g.s.lastDrawId ? " fresh" : "";
        html += `<div class="elite-card rarity-${el.rarity}${fresh}">
          ${TA.icon(Object.keys(el.specs || {})[0] || "forager", "ico-lg")}
          <div class="item-body">
            <div class="item-title"><span class="rarity-tag rarity-${el.rarity}">${r.name}</span>${el.name}</div>
            <p class="item-desc">${this.eliteSpecHTML(el)}</p>
          </div>
          <div class="elite-actions">
            ${el.away ? '<span class="muted">外出探索</span>' : `<select class="elite-job" data-elite-job="${el.id}">
              <option value="" ${el.job ? "" : "selected"}>闲置</option>
              ${Object.entries(TA.DATA.jobs).filter(([, job]) => !job.require?.tech || g.s.techs[job.require.tech]).map(([id, job]) => `<option value="${id}" ${el.job === id ? "selected" : ""}>${job.name}</option>`).join("")}
            </select>
            <button type="button" class="btn btn-tiny" data-dismiss-elite="${el.id}">遣返</button>`}
          </div>
        </div>`;
      }
      html += `</div>`;
    }
    html += `<h3 class="section-title">居所</h3><div class="row-list">${this.buildingRows("river", true)}</div>`;
    return html;
  },

  exploreHTML() {
    const g = this.game;
    g.ensureExplore();
    const ex = g.s.explore;
    const trip = ex.trip;
    const z = g.zoneById(ex.selected);
    const kind = g.zoneKind(z);
    const kdef = TA.DATA.zoneKinds[kind];
    const v = g.bestVehicle();
    const squad = g.squadMembers(ex.squad);
    const pack = g.explorePackCost(ex.selected, Math.max(1, squad.length));
    const visited = Object.keys(ex.visited).length;
    let html = `<p class="flavor">河岸以外仍是智子的盲区。高级居民组成小队，一次只踏入一个区块。路程越远，双腿越不够用。</p>
      <div class="idle-banner" data-banner>${trip ? `${trip.note}　${trip.phase === "go" ? "前往" : trip.phase === "explore" ? "探索" : "返回"}` : `交通 ${v.name}　载货 ${g.bagCap()}　已探访 ${visited} / 100`}${ex.autoRun ? "　自动探险" : ""}${ex.autoRun && ex.autoAdvance ? " · 自动前进" : ""}</div>`;
    html += `<div class="trip-phases">
      ${[["go", "前往"], ["explore", "探索"], ["back", "返回"]].map(([id, name]) => `<span class="${trip?.phase === id ? "on" : ""}">${name}</span>`).join("<i></i>")}
    </div>`;
    if (trip) {
      const pct = trip.dur > 0 ? TA.clamp((trip.t / trip.dur) * 100, 0, 100) : 0;
      html += `<div class="draw-panel">${TA.icon("explore", "ico-lg")}<div class="draw-body">
        <div class="item-title">${g.zoneById(trip.zone).name}</div>
        <p class="item-desc" data-trip-note>${trip.note}</p>
        <div class="progress-inline"><i data-progress data-trip-bar style="width:${pct}%"></i></div>
        <p class="item-desc" data-trip-bag>行囊 ${TA.fmt(g.bagUsed(trip.bag))} / ${g.bagCap()}　${Object.entries(trip.bag).filter(([, n]) => n > 0.05).map(([k, n]) => `${TA.DATA.resources[k]?.name || k} ${TA.fmt(n)}`).join("、") || "空"}</p>`;
      if (trip.phase === "explore" && trip.enemyHpMax > 0 && trip.result !== "win") {
        html += `<div class="hp-row"><span>小队</span><div class="meter-bar"><i data-squad-hp style="width:${TA.clamp((trip.squadHp / trip.squadHpMax) * 100, 0, 100)}%"></i></div></div>
          <div class="hp-row"><span>${trip.enemyName}</span><div class="meter-bar meter-bar-warn"><i data-enemy-hp style="width:${TA.clamp((trip.enemyHp / trip.enemyHpMax) * 100, 0, 100)}%"></i></div></div>`;
      }
      html += `</div></div>`;
    }
    html += `<h3 class="section-title">区块</h3><div class="zone-grid">`;
    for (const zone of TA.DATA.zones) {
      const open = g.zoneUnlocked(zone.id);
      const seen = !!ex.visited[zone.id];
      const sel = zone.id === ex.selected;
      const busy = trip && trip.zone === zone.id;
      const zk = g.zoneKind(zone);
      html += `<button type="button" class="zone-cell ${zk}${seen ? " visited" : ""}${sel ? " selected" : ""}${busy ? " busy" : ""}${open ? "" : " locked"}" data-zone="${zone.id}" ${open && !trip && !ex.autoRun ? "" : "disabled"} title="第 ${zone.id + 1} 关 ${zone.name}">${zone.id + 1}</button>`;
    }
    html += `</div>`;
    if (z) {
      const travel = g.travelSec(z.dist);
      html += `<div class="draw-panel">${TA.icon(kind, "ico-lg")}<div class="draw-body">
        <div class="item-title">第 ${z.id + 1} 关 · ${z.name}<span class="rarity-tag rarity-${kind === "boss" ? "mythic" : kind === "combat" ? "legendary" : kind === "rare" ? "epic" : "common"}">${kdef.name}</span></div>
        <p class="item-desc">${kdef.desc}<br>距离 ${z.dist}　单程 ${TA.fmt(travel, 0)} 秒　${z.enemy && kind !== "rare" ? `遭遇 ${z.enemy.name}` : "以采集为主"}</p>
      </div></div>`;
    }
    html += `<h3 class="section-title">交通工具</h3><div class="row-list">`;
    for (const [id, veh] of Object.entries(TA.DATA.vehicles)) {
      if (!g.canSeeVehicle(id)) continue;
      const owned = !!g.s.vehicles[id];
      const ok = !owned && id !== "foot" && TA.canAfford(g.s.resources, veh.cost);
      const best = v.id === id;
      html += `<div class="item-row ${owned || ok ? "" : "unaffordable"}">${TA.icon(id, "ico-lg")}<div class="item-body"><div class="item-title">${veh.name}${best ? '<span class="item-count">使用中</span>' : owned ? '<span class="item-count">已制成</span>' : ""}</div><p class="item-desc">${veh.desc}<br>速度 ×${TA.fmt(veh.speed)}　载货 +${veh.cargo}</p></div>
        <div class="item-cost">${id === "foot" || owned ? "—" : TA.costText(veh.cost, g.s.resources)}</div>
        <div class="item-actions"><button class="btn btn-build" data-vehicle="${id}" ${owned || id === "foot" || !ok ? "disabled" : ""}>${owned ? "完成" : "制造"}</button></div></div>`;
    }
    html += `</div><h3 class="section-title">探索小队</h3><p class="item-desc">最多五名高级居民。外出期间不在营地工作，归来后自动解散行程。</p>`;
    if (!(g.s.elites || []).length) html += `<p class="muted">先在聚落抽签迎来高级居民。</p>`;
    else {
      html += `<div class="elite-list">`;
      for (const el of g.s.elites) {
        const picked = ex.squad.includes(el.id);
        html += `<button type="button" class="elite-card rarity-${el.rarity}${picked ? " picked" : ""}" data-squad="${el.id}" ${el.away || trip || ex.autoRun ? "disabled" : ""}>
          ${TA.icon(Object.keys(el.specs || {})[0] || "forager", "ico-lg")}
          <div class="item-body">
            <div class="item-title"><span class="rarity-tag rarity-${el.rarity}">${TA.DATA.rarities[el.rarity].name}</span>${el.name}${el.away ? " · 外出" : picked ? " · 已编入" : ""}</div>
            <p class="item-desc">${this.eliteSpecHTML(el)}</p>
          </div>
        </button>`;
      }
      html += `</div>`;
    }
    html += `<div class="item-cost">出行消耗 ${squad.length ? TA.costText(pack, g.s.resources) : "需要编入小队"}</div>
      <div class="explore-actions">
        <button type="button" class="btn btn-anchor" data-explore-start ${g.canStartExplore() ? "" : "disabled"}>出发探索</button>
        <button type="button" class="btn ${ex.autoRun ? "btn-anchor" : ""}" data-auto-run>${ex.autoRun ? "停止自动探险" : "自动探险"}</button>
        <button type="button" class="btn ${ex.autoAdvance ? "btn-anchor" : ""}" data-auto-advance ${ex.autoRun ? "" : "disabled"}>自动前进：${ex.autoAdvance ? "开启" : "关闭"}</button>
      </div>`;
    return html;
  },

  workshopHTML() {
    const g = this.game;
    let html = `<p class="flavor">工坊里没有智子锁死的物理。只有双手、火焰、以及芯片里不肯死去的工艺。</p><h3 class="section-title">制造</h3><div class="row-list">`;
    for (const [id, c] of Object.entries(TA.DATA.crafts)) {
      if (c.require?.tech && !g.s.techs[c.require.tech]) continue;
      const ok = TA.canAfford(g.s.resources, c.cost) && g.craftHasRoom(id);
      const gain = Object.keys(c.gain).length ? Object.entries(c.gain).map(([k, v]) => `${TA.DATA.resources[k].name} +${TA.fmt(v)}`).join(" ") : "加固仓储";
      html += `<div class="item-row ${ok ? "" : "unaffordable"}">${TA.icon(id, "ico-lg")}<div class="item-body"><div class="item-title">${c.name}</div><p class="item-desc">${c.desc}<br>${gain}</p></div>
        <div class="item-cost">${TA.costText(c.cost, g.s.resources)}</div>
        <div class="item-actions">
          <button class="btn btn-build" data-craft="${id}" data-qty="1" ${ok ? "" : "disabled"}>制作</button>
          <button class="btn btn-build" data-craft="${id}" data-qty="max">×50</button>
        </div></div>`;
    }
    html += `</div><h3 class="section-title">工艺</h3><div class="row-list">`;
    for (const [id, u] of Object.entries(TA.DATA.upgrades)) {
      if (u.require?.tech && !g.s.techs[u.require.tech]) continue;
      const done = g.s.upgrades[id];
      const ok = !done && TA.canAfford(g.s.resources, u.cost);
      html += `<div class="item-row ${done || ok ? "" : "unaffordable"}">${TA.icon(id, "ico-lg")}<div class="item-body"><div class="item-title">${u.name}${done ? '<span class="item-count">已完成</span>' : ""}</div><p class="item-desc">${u.desc}</p></div>
        <div class="item-cost">${done ? "—" : TA.costText(u.cost, g.s.resources)}</div>
        <div class="item-actions"><button class="btn btn-build" data-up="${id}" ${ok ? "" : "disabled"}>${done ? "完成" : "升级"}</button></div></div>`;
    }
    html += `</div>`;
    return html;
  },

  scienceHTML() {
    const g = this.game;
    let html = `<p class="flavor">人类的全部知识都在你胸口。你必须用这条河流的材料，把它们重新变成世界。</p><div class="tech-grid">`;
    const list = Object.entries(TA.DATA.techs).sort((a, b) => a[1].order - b[1].order);
    for (const [id, t] of list) {
      if (!g.canSeeTech(id)) continue;
      const done = g.s.techs[id];
      const ok = !done && TA.canAfford(g.amounts(), t.cost);
      html += `<article class="tech-card ${done ? "done" : ""}"><div class="tech-era">${t.era}</div><h3>${TA.icon(id)}<span>${t.name}</span></h3>
        <p class="item-desc">${t.desc}</p>
        <p class="item-desc">解锁：${t.unlocks}</p>
        <div class="item-cost">${done ? "已编目" : TA.costText(t.cost, g.amounts())}</div>
        <button class="btn btn-anchor" data-tech="${id}" ${ok ? "" : "disabled"}>${done ? "已掌握" : "解码"}</button></article>`;
    }
    html += `</div>`;
    return html;
  },

  spaceHTML() {
    const g = this.game;
    const ready = g.readiness();
    let html = `<p class="flavor">星空是一条更宽的河流。朝地球挥手会被看见。保持安静，才能把箭矢射出去。</p>
      <div class="idle-banner" data-banner>干预准备度 ${TA.fmt(ready, 0)}%　隐蔽 ${TA.fmt(g.s.concealment, 0)}%　舰队 ${TA.fmt(g.s.resources.fleet || 0)}</div>
      <div class="progress-inline"><i data-progress style="width:${ready}%"></i></div>
      <h3 class="section-title">航天</h3>
      <div class="row-list">${this.buildingRows("space")}</div>`;
    if (g.canVictory()) {
      html += `<p style="margin-top:1.2rem"><button class="btn btn-anchor" data-victory>启动曲率跃迁 · 拯救地球</button></p>`;
    } else if (g.s.techs.homecoming) {
      html += `<p class="item-desc" style="margin-top:1rem">跃迁条件：曲率环、舰队战力 ≥ 80、隐蔽 ≥ 30%、干预准备 100%。</p>`;
    }
    return html;
  },

  anchorHTML() {
    const g = this.game;
    const gain = g.prestigeGain();
    let html = `<p class="flavor">时间之锚让你把同一条道路走成刀刃。充能完毕后，你可以回到这个河边，带着余烬。</p>
      <div class="idle-banner" data-banner>充能 ${TA.fmt(g.s.charge, 0)} / 100　余烬 ${TA.fmt(g.s.ember, 0)}　回溯 ${g.s.prestige.resets} 次　本次可获余烬 ${gain}</div>
      <div class="progress-inline"><i data-progress style="width:${g.s.charge}%"></i></div>`;
    if (g.s.techs.timeanchor) {
      html += `<p style="margin:1rem 0"><button class="btn btn-anchor" data-prestige ${g.canPrestige() ? "" : "disabled"}>启动时间之锚 · 回溯河岸</button></p>
        <h3 class="section-title">阵列</h3><div class="row-list">${this.buildingRows("anchor")}</div>`;
    } else {
      html += `<p class="item-desc" style="margin-top:1rem">解码「锚点原理」后，即可在充能完毕时回溯。余烬将永久提高产出。</p>`;
    }
    html += `<h3 class="section-title">余烬铭刻</h3><div class="row-list">`;
    for (const [id, m] of Object.entries(TA.DATA.metaphysics)) {
      const done = g.s.metaphysics[id];
      const ok = !done && g.s.ember >= m.cost;
      html += `<div class="item-row ${done || ok ? "" : "unaffordable"}">${TA.icon(id === "reactor" ? "meta:reactor" : id, "ico-lg")}<div class="item-body"><div class="item-title">${m.name}${done ? '<span class="item-count">已铭刻</span>' : ""}</div><p class="item-desc">${m.desc}</p></div>
        <div class="item-cost">${done ? "—" : TA.icon("ember", "ico-cost") + "余烬 " + m.cost}</div>
        <div class="item-actions"><button class="btn btn-build" data-meta="${id}" ${ok ? "" : "disabled"}>${done ? "完成" : "铭刻"}</button></div></div>`;
    }
    html += `</div>`;
    return html;
  },

  buildingRows(tab, housingOnly) {
    const g = this.game;
    let html = "";
    for (const [id, b] of Object.entries(TA.DATA.buildings)) {
      if (b.tab !== tab && !(housingOnly && (b.housing || b.housingElite) && b.tab === "river")) continue;
      if (housingOnly && !b.housing && !b.housingElite) continue;
      if (b.housingElite && !housingOnly) continue;
      if (!housingOnly && tab === "river" && b.housing && this.tab === "river") {
        /* show housing on river too */
      }
      if (housingOnly && this.tab === "village" && !b.housing && !b.housingElite) continue;
      if (!g.canSeeBuilding(id)) continue;
      const n = g.s.buildings[id] || 0;
      const cost = g.buildingCost(id, 1);
      const ok = TA.canAfford(g.s.resources, cost);
      const bits = [];
      if (b.production) bits.push(Object.entries(b.production).map(([k, v]) => `${TA.DATA.resources[k]?.name || TA.DATA.specialNames[k] || k} ${TA.fmtRate(v)}`).join("、"));
      if (b.housing) bits.push(`居所 +${b.housing}`);
      if (b.housingElite) bits.push(`专属居所 +${b.housingElite}`);
      if (b.storage) bits.push("仓储提升");
      html += `<div class="item-row ${ok ? "" : "unaffordable"}">${TA.icon(id, "ico-lg")}<div class="item-body"><div class="item-title">${b.name}<span class="item-count">${n}</span></div>
        <p class="item-desc">${b.desc}${bits.length ? "<br>" + bits.join(" · ") : ""}</p></div>
        <div class="item-cost">${TA.costText(cost, g.s.resources)}</div>
        <div class="item-actions">
          <button class="btn btn-build btn-anchor" data-build="${id}" ${ok ? "" : "disabled"}>建造</button>
          <button class="btn btn-build" data-build="${id}" data-qty="max" ${g.maxBuild(id) ? "" : "disabled"}>Max</button>
        </div></div>`;
    }
    return html || `<p class="item-desc">尚无可见结构。继续采集与解码。</p>`;
  },

  renderLog() {
    const list = this.game.s.log.slice(0, 40);
    document.getElementById("log-list").innerHTML = list.map((l) =>
      `<div class="log-item ${l.type}"><span class="log-time">${l.at}</span>${l.text}</div>`
    ).join("") || `<div class="log-item">河声取代了一切记录。</div>`;
  },

  openSettings() {
    const g = this.game;
    document.getElementById("modal-title").textContent = "设置";
    document.getElementById("modal-body").innerHTML = `
      <div class="settings-row"><span>安装到主屏幕</span><button class="btn btn-tiny" id="opt-install">${TA.PWA.installed() ? "已安装" : "安装"}</button></div>
      <div class="settings-row"><span>音效</span><button class="btn btn-tiny" id="opt-mute">${g.s.muted ? "已关闭" : "已开启"}</button></div>
      <div class="settings-row"><span>导出存档</span><button class="btn btn-tiny" id="opt-export">复制</button></div>
      <label>导入存档</label>
      <textarea id="opt-import" placeholder="粘贴存档 JSON"></textarea>
      <div class="settings-row">
        <button class="btn" id="opt-do-import">导入</button>
        <button class="btn btn-danger" id="opt-wipe">删除全部进度</button>
      </div>
      <p>时间之锚 · 可安装网页应用。存档在本机。你更新版本后，朋友下次打开会自动同步。</p>`;
    document.getElementById("modal").hidden = false;
    document.getElementById("opt-install").onclick = () => TA.PWA.install();
    document.getElementById("opt-mute").onclick = () => {
      g.s.muted = !g.s.muted;
      document.getElementById("opt-mute").textContent = g.s.muted ? "已关闭" : "已开启";
    };
    document.getElementById("opt-export").onclick = async () => {
      try {
        await navigator.clipboard.writeText(g.exportSave());
        this.toast("存档已复制。");
      } catch {
        document.getElementById("opt-import").value = g.exportSave();
      }
    };
    document.getElementById("opt-do-import").onclick = () => {
      try {
        g.importSave(document.getElementById("opt-import").value);
        g.save();
        document.getElementById("modal").hidden = true;
        this.renderAll(true);
        this.toast("存档已载入。");
      } catch {
        this.toast("无法读取这段存档。");
      }
    };
    document.getElementById("opt-wipe").onclick = () => {
      if (confirm("彻底抹去这条河流的记忆？包括余烬。")) {
        g.resetAll();
        document.getElementById("modal").hidden = true;
        this.tab = "river";
        this.renderAll(true);
      }
    };
  },

  flushAutoStop() {
    const msg = this.game.s.explore?.autoStop;
    if (!msg) return;
    this.game.s.explore.autoStop = "";
    this.toast(msg, 3200);
  },

  toast(msg, ms) {
    const el = document.getElementById("toast");
    el.hidden = false;
    el.textContent = msg;
    clearTimeout(this._toast);
    this._toast = setTimeout(() => { el.hidden = true; }, ms || 1800);
  },

  stars() {
    const c = document.getElementById("intro-stars");
    if (!c) return;
    const ctx = c.getContext("2d");
    const fit = () => { c.width = innerWidth; c.height = innerHeight; };
    fit();
    addEventListener("resize", fit);
    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random(), y: Math.random() * 0.72, r: Math.random() * 1.4 + 0.2, a: Math.random(), s: Math.random() * 0.4 + 0.1,
    }));
    const draw = () => {
      if (document.getElementById("intro").hidden) return;
      ctx.fillStyle = "#06080c";
      ctx.fillRect(0, 0, c.width, c.height);
      for (const st of stars) {
        st.a += st.s * 0.02;
        ctx.fillStyle = `rgba(210,230,230,${0.25 + Math.sin(st.a) * 0.35})`;
        ctx.beginPath();
        ctx.arc(st.x * c.width, st.y * c.height, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(draw);
    };
    draw();
  },
};
