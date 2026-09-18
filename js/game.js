window.TA = window.TA || {};

TA.SAVE_KEY = "time-anchor-v1";
TA.TICK_MS = 100;
TA.DAY_SEC = 6;
TA.FOOD_PER_POP = 0.048;
TA.MAX_OFFLINE = 8 * 3600;

TA.defaultState = function defaultState() {
  const resources = {};
  for (const id of Object.keys(TA.DATA.resources)) resources[id] = 0;
  resources.fleet = 0;
  const jobs = {};
  for (const id of Object.keys(TA.DATA.jobs)) jobs[id] = 0;
  return {
    version: 1,
    resources,
    seenMax: {},
    buildings: {},
    techs: {},
    upgrades: {},
    metaphysics: {},
    jobs,
    pop: 0,
    elites: [],
    pendingElite: null,
    drawStake: 1,
    lastDrawId: "",
    happiness: 72,
    concealment: 100,
    charge: 0,
    ember: 0,
    ropeBonus: 0,
    time: { totalDays: 0, frac: 0, year: 1, season: 0, day: 1 },
    prestige: { resets: 0, spentEmber: 0 },
    log: [],
    stories: {},
    victory: false,
    lastEventAt: 0,
    nextEventIn: 12,
    stats: { clicks: 0, maxPop: 0, days: 0 },
    lastTick: Date.now(),
    muted: false,
    introDone: false,
  };
};

TA.Game = class Game {
  constructor(state) {
    this.s = state || TA.defaultState();
    this._prod = null;
  }

  amounts() {
    const a = { ...this.s.resources };
    a.charge = this.s.charge;
    a.ember = this.s.ember;
    a.population = this.s.pop;
    a.happiness = this.s.happiness;
    a.concealment = this.s.concealment;
    a.fleet = this.s.resources.fleet || 0;
    return a;
  }

  flags() {
    const f = {};
    const add = (src) => {
      if (!src) return;
      for (const [k, v] of Object.entries(src)) {
        if (typeof v === "number") f[k] = (f[k] || 0) + v;
        else if (typeof v === "boolean") f[k] = f[k] || v;
        else f[k] = v;
      }
    };
    for (const id of Object.keys(this.s.techs)) add(TA.DATA.techs[id]?.flags);
    for (const id of Object.keys(this.s.upgrades)) add(TA.DATA.upgrades[id]?.flags);
    for (const id of Object.keys(this.s.metaphysics)) add(TA.DATA.metaphysics[id]?.flags);
    for (const [id, n] of Object.entries(this.s.buildings)) {
      const fl = TA.DATA.buildings[id]?.flags;
      if (!fl || !n) continue;
      for (const [k, v] of Object.entries(fl)) {
        if (typeof v === "number") f[k] = (f[k] || 0) + v * n;
        else f[k] = v;
      }
    }
    for (const [id, n] of Object.entries(this.s.jobs)) {
      const fl = TA.DATA.jobs[id]?.flags;
      if (!fl || !n) continue;
      for (const [k, v] of Object.entries(fl)) {
        if (typeof v === "number") f[k] = (f[k] || 0) + v * n;
      }
    }
    for (const el of this.s.elites || []) {
      if (!el.passive) continue;
      add(TA.DATA.elitePassives[el.passive]?.flags);
    }
    return f;
  }

  season() {
    return TA.DATA.seasons[this.s.time.season];
  }

  housing() {
    let h = 0;
    for (const [id, n] of Object.entries(this.s.buildings)) {
      h += (TA.DATA.buildings[id]?.housing || 0) * n;
    }
    return h;
  }

  eliteHousing() {
    let h = 0;
    for (const [id, n] of Object.entries(this.s.buildings)) {
      h += (TA.DATA.buildings[id]?.housingElite || 0) * n;
    }
    return h;
  }

  eliteEat() {
    let n = 0;
    for (const el of this.s.elites || []) {
      n += TA.DATA.rarities[el.rarity]?.eat || 1;
    }
    return n;
  }

  idlePop() {
    const used = Object.values(this.s.jobs).reduce((a, b) => a + b, 0);
    return Math.max(0, this.s.pop - used);
  }

  emberMult() {
    const e = this.s.ember;
    return 1 + (0.018 * e) / (1 + e / 180);
  }

  caps() {
    const caps = {};
    for (const [id, def] of Object.entries(TA.DATA.resources)) caps[id] = def.cap;
    caps.fleet = 1e9;
    const fl = this.flags();
    for (const [id, n] of Object.entries(this.s.buildings)) {
      const st = TA.DATA.buildings[id]?.storage;
      if (!st || !n) continue;
      for (const [k, v] of Object.entries(st)) caps[k] = (caps[k] || 0) + v * n;
    }
    const all = 1 + (fl.allCap || 0) + (this.s.ropeBonus || 0);
    for (const k of Object.keys(caps)) caps[k] *= all;
    if (fl.knowledgeCap) caps.knowledge *= 1 + fl.knowledgeCap;
    caps.knowledge += (this.s.resources.remnant || 0) * 8;
    return caps;
  }

  resourceAtCap(id, caps) {
    const cap = (caps || this.caps())[id];
    if (cap == null || !isFinite(cap)) return false;
    const have = this.s.resources[id] || 0;
    return have + 0.001 >= cap;
  }

  production() {
    const season = this.season();
    const fl = this.flags();
    const caps = this.caps();
    let global = (1 + (fl.globalProd || 0)) * this.emberMult();
    if (this.s.concealment <= 0.5) global *= 0.45;
    const prod = {};
    const cons = {};
    const add = (obj, k, v) => { obj[k] = (obj[k] || 0) + v; };

    const seasonize = (res, v) => {
      if (res === "food") return v * season.food * (1 + (fl.foodProd || 0));
      if (res === "water") return v * season.water * (1 + (fl.waterProd || 0));
      if (res === "wood") return v * season.wood * (1 + (fl.woodStoneProd || 0));
      if (res === "stone") return v * (1 + (fl.woodStoneProd || 0));
      if (res === "energy") return v * season.energy * (1 + (fl.energyProd || 0));
      if (res === "metal") return v * (1 + (fl.metalProd || 0));
      if (res === "ore") return v * (1 + (fl.oreProd || 0));
      if (res === "knowledge") return v * (1 + (fl.knowledgeProd || 0));
      if (res === "fleet") return v * (1 + (fl.fleetBonus || 0));
      if (res === "charge") return v * (1 + (fl.chargeBonus || 0));
      return v;
    };

    for (const [id, n] of Object.entries(this.s.buildings)) {
      if (!n) continue;
      const b = TA.DATA.buildings[id];
      if (!b) continue;
      let run = n;
      const outs = Object.entries(b.production || {}).filter(([, v]) => v > 0).map(([k]) => k);
      if (outs.length && outs.every((k) => this.resourceAtCap(k, caps))) run = 0;
      if (run && b.consumption) {
        for (const [k, v] of Object.entries(b.consumption)) {
          const need = v * n;
          const have = this.s.resources[k] || 0;
          if (need > 0) run = Math.min(run, (have / need) * n);
        }
        run = Math.max(0, run);
      }
      if (b.production) {
        for (const [k, v] of Object.entries(b.production)) {
          add(prod, k, seasonize(k, v * run) * global);
        }
      }
      if (b.consumption) {
        for (const [k, v] of Object.entries(b.consumption)) add(cons, k, v * run);
      }
    }

    const scholar = 1 + (fl.scholarBonus || 0);
    for (const [id, n] of Object.entries(this.s.jobs)) {
      if (!n) continue;
      const job = TA.DATA.jobs[id];
      if (!job) continue;
      for (const [k, v] of Object.entries(job.production || {})) {
        let amt = v * n * global;
        if (k === "knowledge") amt *= scholar;
        add(prod, k, seasonize(k, amt));
      }
    }
    for (const el of this.s.elites || []) {
      if (!el.job) continue;
      const job = TA.DATA.jobs[el.job];
      if (!job) continue;
      const spec = el.specs?.[el.job] || 0;
      const mult = 1 + spec;
      for (const [k, v] of Object.entries(job.production || {})) {
        let amt = v * mult * global;
        if (k === "knowledge") amt *= scholar;
        add(prod, k, seasonize(k, amt));
      }
    }

    const eat = (this.s.pop + this.eliteEat()) * TA.FOOD_PER_POP;
    add(cons, "food", eat);

    const net = {};
    const keys = new Set([...Object.keys(prod), ...Object.keys(cons), "food"]);
    for (const k of keys) net[k] = (prod[k] || 0) - (cons[k] || 0);

    let conceal = 0.06 + (fl.concealRegen || 0) * 0.12;
    let drain = 0;
    for (const [id, n] of Object.entries(this.s.buildings)) {
      const bf = TA.DATA.buildings[id]?.flags;
      if (!bf || !n) continue;
      if (bf.concealment) {
        if (bf.concealment < 0) drain += -bf.concealment * n * 0.02;
        else conceal += bf.concealment * n * 0.015;
      }
    }
    drain *= 1 - (fl.concealRelief || 0);
    net._conceal = conceal - drain;
    net._happy = (fl.happiness || 0) * 0.015;
    if (this.s.pop + (this.s.elites || []).length > 0) {
      const foodNet = net.food || 0;
      if (foodNet >= 0 && (this.s.resources.food || 0) > 1) net._happy += 0.08;
      else net._happy -= 0.35;
    }

    this._prod = { prod, cons, net, caps, housing: this.housing(), flags: fl };
    return this._prod;
  }

  readiness() {
    const fl = this.flags();
    const fleet = this.s.resources.fleet || 0;
    let r = Math.min(50, (fleet / 100) * 50);
    if ((this.s.buildings.jammer || 0) >= 1) r += 12;
    if ((this.s.buildings.drive || 0) >= 1) r += 18;
    if (this.s.techs.homecoming) r += 20;
    r += fl.readyBonus || 0;
    if (this.s.concealment < 35) r *= 0.65;
    return TA.clamp(r, 0, 100);
  }

  canSeeResource(id) {
    if (id === "fleet") return !!this.s.techs.rocketry || (this.s.resources.fleet || 0) > 0;
    const def = TA.DATA.resources[id];
    if (!def) return false;
    if ((this.s.resources[id] || 0) > 0.01) return true;
    if ((this.s.seenMax[id] || 0) > 0) return true;
    if (def.gather && (!def.gatherUnlock || this.s.techs[def.gatherUnlock])) return true;
    return false;
  }

  canSeeBuilding(id) {
    const b = TA.DATA.buildings[id];
    if (b.require?.tech && !this.s.techs[b.require.tech]) return false;
    if (b.tab === "space" && !this.s.techs.rocketry) return false;
    if (b.tab === "anchor" && !this.s.techs.timeanchor && !(this.s.buildings[id] > 0)) return false;
    if ((this.s.buildings[id] || 0) > 0) return true;
    const cost = b.cost;
    return Object.entries(cost).every(([k, v]) => (this.s.seenMax[k] || 0) >= v * 0.28 || (this.s.resources[k] || 0) >= v * 0.28);
  }

  canSeeTech(id) {
    const t = TA.DATA.techs[id];
    if (this.s.techs[id]) return true;
    if (t.require?.tech && !this.s.techs[t.require.tech]) return false;
    const kn = t.cost.knowledge || 0;
    if (kn && (this.s.seenMax.knowledge || 0) < kn * 0.22 && !this.s.techs.fire) return false;
    return true;
  }

  buildingCost(id, qty = 1) {
    const b = TA.DATA.buildings[id];
    return TA.scaleCost(b.cost, b.ratio, this.s.buildings[id] || 0, qty);
  }

  maxBuild(id) {
    const b = TA.DATA.buildings[id];
    let n = 0;
    const owned = this.s.buildings[id] || 0;
    while (n < 100) {
      const c = TA.scaleCost(b.cost, b.ratio, owned + n, 1);
      if (!TA.canAfford(this.s.resources, c)) break;
      n++;
    }
    return n;
  }

  pay(cost) {
    for (const [k, v] of Object.entries(cost)) {
      if (k === "charge") this.s.charge = Math.max(0, this.s.charge - v);
      else this.s.resources[k] = (this.s.resources[k] || 0) - v;
    }
  }

  grant(gain, uncap) {
    const caps = this.caps();
    for (const [k, v] of Object.entries(gain)) {
      if (!v) continue;
      if (k === "charge") this.s.charge = TA.clamp(this.s.charge + v, 0, 100);
      else if (k === "ember") this.s.ember += v;
      else {
        const cap = uncap ? Infinity : (caps[k] ?? Infinity);
        this.s.resources[k] = Math.min(cap, (this.s.resources[k] || 0) + v);
        this.s.seenMax[k] = Math.max(this.s.seenMax[k] || 0, this.s.resources[k]);
      }
    }
  }

  gather(id) {
    const def = TA.DATA.resources[id];
    if (!def?.gather) return false;
    if (def.gatherUnlock && !this.s.techs[def.gatherUnlock]) return false;
    const fl = this.flags();
    const bonus = 1 + (fl.gatherBonus || 0);
    this.grant({ [id]: def.gather * bonus });
    this.s.stats.clicks++;
    this.tone(id === "knowledge" ? 520 : 380);
    return true;
  }

  build(id, qty = 1) {
    if (!this.canSeeBuilding(id)) return false;
    qty = Math.min(qty, Math.max(1, this.maxBuild(id)));
    const cost = this.buildingCost(id, qty);
    if (!TA.canAfford(this.s.resources, cost)) return false;
    this.pay(cost);
    this.s.buildings[id] = (this.s.buildings[id] || 0) + qty;
    this.log("event", `建造 ${TA.DATA.buildings[id].name} ×${qty}`);
    this.tone(240);
    this.checkStories();
    return true;
  }

  research(id) {
    if (this.s.techs[id] || !this.canSeeTech(id)) return false;
    const t = TA.DATA.techs[id];
    if (!TA.canAfford(this.amounts(), t.cost)) return false;
    this.pay(t.cost);
    this.s.techs[id] = true;
    this.log("story", `智库解锁：${t.name}。${t.unlocks}`);
    this.tone(600);
    this.checkStories();
    return true;
  }

  buyUpgrade(id) {
    if (this.s.upgrades[id]) return false;
    const u = TA.DATA.upgrades[id];
    if (u.require?.tech && !this.s.techs[u.require.tech]) return false;
    if (!TA.canAfford(this.s.resources, u.cost)) return false;
    this.pay(u.cost);
    this.s.upgrades[id] = true;
    this.log("event", `工坊升级：${u.name}`);
    this.tone(480);
    return true;
  }

  craftHasRoom(id) {
    const c = TA.DATA.crafts[id];
    if (!c) return false;
    const keys = Object.keys(c.gain || {}).filter((k) => (c.gain[k] || 0) > 0);
    if (!keys.length) return true;
    const caps = this.caps();
    const extra = 1 + (this.flags().extraCraft || 0);
    return keys.every((k) => {
      const cap = caps[k];
      if (cap == null || !isFinite(cap)) return true;
      const room = cap - (this.s.resources[k] || 0);
      return room + 1e-9 >= (c.gain[k] || 0) * extra;
    });
  }

  craft(id, qty = 1, opts = {}) {
    const c = TA.DATA.crafts[id];
    if (!c) return false;
    if (c.require?.tech && !this.s.techs[c.require.tech]) return false;
    const fl = this.flags();
    let made = 0;
    for (let i = 0; i < qty; i++) {
      if (!TA.canAfford(this.s.resources, c.cost)) break;
      if (!this.craftHasRoom(id)) break;
      this.pay(c.cost);
      const gain = { ...c.gain };
      if (fl.extraCraft && Object.keys(gain).length) {
        for (const k of Object.keys(gain)) gain[k] *= 1 + fl.extraCraft;
      }
      this.grant(gain);
      if (c.flags?.ropeCap) this.s.ropeBonus = Math.min(0.2, this.s.ropeBonus + c.flags.ropeCap);
      made++;
    }
    if (made && !opts.silent) this.tone(310);
    return made > 0;
  }

  autoCraftTick(dt) {
    if (!this.s.upgrades.autoCraft) return;
    this._autoT = (this._autoT || 0) + dt;
    while (this._autoT >= 1) {
      this._autoT -= 1;
      this.craft("plank", 1, { silent: true });
      this.craft("brick", 1, { silent: true });
      this.craft("fuel", 1, { silent: true });
    }
  }

  assign(job, delta) {
    const def = TA.DATA.jobs[job];
    if (def.require?.tech && !this.s.techs[def.require.tech]) return;
    if (delta > 0) {
      const idle = this.idlePop();
      delta = Math.min(delta, idle);
      this.s.jobs[job] = (this.s.jobs[job] || 0) + delta;
    } else {
      this.s.jobs[job] = Math.max(0, (this.s.jobs[job] || 0) + delta);
    }
  }

  drawStakeValue() {
    return TA.clamp(Math.round(this.s.drawStake || 1), 1, 5);
  }

  drawCost(stake) {
    const n = stake ?? this.drawStakeValue();
    const b = TA.DATA.drawBase;
    return { food: b.food * n, water: b.water * n };
  }

  drawWeights(stake) {
    const t = ((stake ?? this.drawStakeValue()) - 1) / 4;
    const lerp = (a, b) => a + (b - a) * t;
    return [
      ["common", lerp(60, 28)],
      ["expert", lerp(26, 30)],
      ["epic", lerp(10, 22)],
      ["legendary", lerp(3.4, 14)],
      ["mythic", lerp(0.6, 6)],
    ];
  }

  drawOdds(stake) {
    const w = this.drawWeights(stake);
    const sum = w.reduce((a, x) => a + x[1], 0);
    return Object.fromEntries(w.map(([id, n]) => [id, n / sum]));
  }

  canDrawElite() {
    if (!this.s.techs.construction) return false;
    if (this.s.pendingElite) return false;
    if ((this.s.elites || []).length >= this.eliteHousing()) return false;
    return TA.canAfford(this.s.resources, this.drawCost());
  }

  canRedrawElite() {
    if (!this.s.pendingElite) return false;
    return TA.canAfford(this.s.resources, this.drawCost());
  }

  rollRarity(stake) {
    const w = this.drawWeights(stake);
    const sum = w.reduce((a, x) => a + x[1], 0);
    let r = Math.random() * sum;
    for (const [id, n] of w) {
      r -= n;
      if (r <= 0) return id;
    }
    return "common";
  }

  shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  pickEliteName(rarityId) {
    const used = new Set((this.s.elites || []).map((e) => e.name));
    if (this.s.pendingElite?.name) used.add(this.s.pendingElite.name);
    const pool = TA.DATA.eliteNamesByRarity[rarityId] || TA.DATA.eliteNamesByRarity.common;
    const names = this.shuffle(pool);
    return names.find((n) => !used.has(n)) || names[0] + "·" + ((this.s.elites || []).length + 1);
  }

  makeElite(rarityId) {
    const r = TA.DATA.rarities[rarityId];
    const jobs = this.shuffle(Object.keys(TA.DATA.jobs));
    const specs = {};
    for (const id of jobs.slice(0, r.jobs)) specs[id] = r.bonus;
    let passive = "";
    if (r.passive) {
      const ids = Object.keys(TA.DATA.elitePassives);
      passive = ids[Math.floor(Math.random() * ids.length)];
    }
    return {
      id: "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: this.pickEliteName(rarityId),
      rarity: rarityId,
      specs,
      job: "",
      passive,
    };
  }

  drawElite() {
    if (!this.canDrawElite()) return null;
    const stake = this.drawStakeValue();
    this.pay(this.drawCost(stake));
    const elite = this.makeElite(this.rollRarity(stake));
    this.s.pendingElite = elite;
    const r = TA.DATA.rarities[elite.rarity];
    this.log("event", `抽签遇见${r.name}居民「${elite.name}」，等待确认。`);
    this.tone(elite.rarity === "mythic" ? 880 : elite.rarity === "legendary" ? 720 : 540);
    return elite;
  }

  redrawElite() {
    if (!this.canRedrawElite()) return null;
    const prev = this.s.pendingElite;
    const stake = this.drawStakeValue();
    this.pay(this.drawCost(stake));
    const elite = this.makeElite(this.rollRarity(stake));
    this.s.pendingElite = elite;
    const r = TA.DATA.rarities[elite.rarity];
    this.log("event", `放弃「${prev.name}」，再次抽签遇见${r.name}居民「${elite.name}」。`);
    this.tone(elite.rarity === "mythic" ? 880 : elite.rarity === "legendary" ? 720 : 540);
    return elite;
  }

  keepPendingElite() {
    const elite = this.s.pendingElite;
    if (!elite) return null;
    if ((this.s.elites || []).length >= this.eliteHousing()) return null;
    if (!this.s.elites) this.s.elites = [];
    this.s.elites.push(elite);
    this.s.lastDrawId = elite.id;
    this.s.pendingElite = null;
    this.log("story", `「${elite.name}」留下，住进专属居所。`);
    return elite;
  }

  abandonPendingElite() {
    const elite = this.s.pendingElite;
    if (!elite) return null;
    this.s.pendingElite = null;
    this.log("event", `「${elite.name}」被送回河岸。`);
    return elite;
  }

  dismissElite(id) {
    const list = this.s.elites || [];
    const i = list.findIndex((e) => e.id === id);
    if (i < 0) return null;
    const gone = list.splice(i, 1)[0];
    this.log("event", `${gone.name}被遣返，专属居所空出。`);
    return gone;
  }

  setEliteJob(id, job) {
    const el = (this.s.elites || []).find((e) => e.id === id);
    if (!el) return;
    if (job) {
      const def = TA.DATA.jobs[job];
      if (!def) return;
      if (def.require?.tech && !this.s.techs[def.require.tech]) return;
    }
    el.job = job || "";
  }

  elitesOnJob(job) {
    return (this.s.elites || []).filter((e) => e.job === job).length;
  }

  buyMeta(id) {
    const m = TA.DATA.metaphysics[id];
    if (this.s.metaphysics[id] || this.s.ember < m.cost) return false;
    this.s.ember -= m.cost;
    this.s.prestige.spentEmber += m.cost;
    this.s.metaphysics[id] = true;
    this.log("story", `余烬铭刻：${m.name}`);
    return true;
  }

  prestigeGain() {
    const techN = Object.keys(this.s.techs).length;
    const bN = Object.values(this.s.buildings).reduce((a, b) => a + b, 0);
    const fleet = this.s.resources.fleet || 0;
    return Math.max(0, Math.floor(this.s.pop * 0.9 + (this.s.elites || []).length * 2.4 + techN * 1.6 + bN / 6 + fleet / 18 + (this.s.seenMax.knowledge || 0) / 800));
  }

  canPrestige() {
    return this.s.charge >= 100 && this.s.techs.timeanchor && this.prestigeGain() > 0;
  }

  prestige() {
    if (!this.canPrestige()) return false;
    const gain = this.prestigeGain();
    const meta = { ...this.s.metaphysics };
    const ember = this.s.ember + gain;
    const resets = this.s.prestige.resets + 1;
    const spent = this.s.prestige.spentEmber;
    const muted = this.s.muted;
    this.s = TA.defaultState();
    this.s.metaphysics = meta;
    this.s.ember = ember;
    this.s.prestige = { resets, spentEmber: spent };
    this.s.muted = muted;
    this.s.introDone = true;
    const fl = this.flags();
    if (fl.startBuildings) {
      for (const [id, n] of Object.entries(fl.startBuildings)) this.s.buildings[id] = n;
    }
    if (fl.startTechs) {
      for (const id of fl.startTechs) this.s.techs[id] = true;
    }
    this.log("story", `时间之锚启动。你再次躺在河边。这一次，胸腔里多了 ${gain} 缕余烬。回溯次数：${resets}。`);
    this.checkStories();
    this.save();
    return true;
  }

  canVictory() {
    return this.s.techs.homecoming && (this.s.buildings.drive || 0) >= 1 && (this.s.resources.fleet || 0) >= 80 && this.s.concealment >= 30 && this.readiness() >= 100;
  }

  victory() {
    if (!this.canVictory() || this.s.victory) return false;
    this.s.victory = true;
    this.log("story", "曲率环亮起。河声被抽成一条细线。2300年的地球在门户对面。舰队、投降仪式、尚未熄灭的灯火。你带着一条河流的文明，回家。");
    return true;
  }

  log(type, text) {
    this.s.log.unshift({
      type,
      text,
      at: `${this.s.time.year}年${this.season().name}第${this.s.time.day}日`,
    });
    if (this.s.log.length > 80) this.s.log.length = 80;
  }

  checkStories() {
    for (const st of TA.DATA.stories) {
      if (this.s.stories[st.id]) continue;
      const t = st.trigger;
      let ok = true;
      if (t.day && this.s.time.totalDays < t.day) ok = false;
      if (t.tech && !this.s.techs[t.tech]) ok = false;
      if (t.building && (this.s.buildings[t.building] || 0) < (t.count || 1)) ok = false;
      if (t.pop && this.s.pop < t.pop) ok = false;
      if (ok) {
        this.s.stories[st.id] = true;
        this.log("story", st.text);
      }
    }
  }

  rollEvent() {
    const pool = TA.DATA.events.filter((e) => {
      if (this.s.time.totalDays < e.minDay) return false;
      if (e.require?.tech && !this.s.techs[e.require.tech]) return false;
      if (e.requirePop && this.s.pop < e.requirePop) return false;
      return true;
    });
    if (!pool.length) return;
    const total = pool.reduce((a, e) => a + e.weight, 0);
    let r = Math.random() * total;
    let ev = pool[0];
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) { ev = e; break; }
    }
    if (ev.gain) this.grant(ev.gain);
    if (ev.lose) {
      for (const [k, v] of Object.entries(ev.lose)) {
        this.s.resources[k] = Math.max(0, (this.s.resources[k] || 0) - v);
      }
    }
    if (ev.happiness) this.s.happiness = TA.clamp(this.s.happiness + ev.happiness, 0, 100);
    if (ev.concealment) this.s.concealment = TA.clamp(this.s.concealment + ev.concealment, 0, 100);
    this.log(ev.warn ? "warn" : "event", ev.text);
    this.s.lastEventAt = this.s.time.totalDays;
    this.s.nextEventIn = 10 + Math.floor(Math.random() * 16);
  }

  tick(dt) {
    if (this.s.victory) return;
    const p = this.production();
    const caps = p.caps;

    for (const [k, v] of Object.entries(p.net)) {
      if (k.startsWith("_")) continue;
      if (k === "charge") {
        this.s.charge = TA.clamp(this.s.charge + v * dt, 0, 100);
        continue;
      }
      if (k === "fleet") {
        this.s.resources.fleet = Math.max(0, (this.s.resources.fleet || 0) + v * dt);
        continue;
      }
      let next = (this.s.resources[k] || 0) + v * dt;
      if (v > 0) next = Math.min(caps[k] ?? Infinity, next);
      this.s.resources[k] = Math.max(0, next);
      if (this.s.resources[k] > 0) this.s.seenMax[k] = Math.max(this.s.seenMax[k] || 0, this.s.resources[k]);
    }

    this.s.concealment = TA.clamp(this.s.concealment + (p.net._conceal || 0) * dt, 0, 100);
    this.s.happiness = TA.clamp(this.s.happiness + (p.net._happy || 0) * dt, 0, 100);

    if (this.s.concealment <= 0.5) {
      this.s.happiness = Math.max(0, this.s.happiness - 4 * dt);
      if (Math.random() < dt * 0.02) this.log("warn", "隐蔽归零。智子的视野扫过这片河岸。产出被压制。");
    }

    const house = p.housing;
    if (this.s.pop > house) {
      this.s.pop = house;
      for (const id of Object.keys(this.s.jobs)) this.s.jobs[id] = 0;
    }
    if (!this.s.elites) this.s.elites = [];
    const eh = this.eliteHousing();
    while (this.s.elites.length > eh) {
      const gone = this.s.elites.pop();
      this.log("warn", `${gone.name}失去专属居所，离开营地。`);
    }
    if (this.s.pendingElite && this.s.elites.length >= eh) {
      const gone = this.s.pendingElite;
      this.s.pendingElite = null;
      this.log("warn", `${gone.name}失去专属居所，离开营地。`);
    }
    this._arrive = (this._arrive || 0);
    if (this.s.pop < house && this.s.happiness > 28 && (this.s.resources.food || 0) > 8) {
      this._arrive += dt * (0.06 + this.s.happiness / 1200);
      if (this._arrive >= 1) {
        this._arrive = 0;
        this.s.pop += 1;
        if (this.s.pop === 1) this.log("story", "第一个居民走进棚屋。它把湿草铺在角落，像是早就知道这里会有屋顶。");
        else if (this.s.pop % 5 === 0) this.log("event", `又一名居民迁入。现有 ${this.s.pop} 名居民。`);
      }
    }
    if ((this.s.resources.food || 0) <= 0.05 && (this.s.pop > 0 || (this.s.elites || []).length > 0)) {
      this._starve = (this._starve || 0) + dt;
      if (this._starve > 8) {
        this._starve = 0;
        if (this.s.pop > 0) {
          this.s.pop = Math.max(0, this.s.pop - 1);
          const ids = Object.keys(this.s.jobs);
          for (let i = ids.length - 1; i >= 0; i--) {
            if (this.s.jobs[ids[i]] > 0) { this.s.jobs[ids[i]]--; break; }
          }
          this.log("warn", "食物耗尽。一名居民离开，走回对岸的林中。");
        } else if (this.s.elites.length) {
          this.s.elites.sort((a, b) => (TA.DATA.rarities[a.rarity]?.order || 0) - (TA.DATA.rarities[b.rarity]?.order || 0));
          const gone = this.s.elites.shift();
          this.log("warn", `食物耗尽。${gone.name}离开专属居所。`);
        }
      }
    } else this._starve = 0;

    this.s.stats.maxPop = Math.max(this.s.stats.maxPop, this.s.pop);

    this.autoCraftTick(dt);

    this.s.time.frac += dt / TA.DAY_SEC;
    while (this.s.time.frac >= 1) {
      this.s.time.frac -= 1;
      this.advanceDay();
    }
    this.checkStories();
  }

  advanceDay() {
    this.s.time.totalDays += 1;
    this.s.time.day += 1;
    this.s.stats.days = this.s.time.totalDays;
    const season = this.season();
    if (this.s.time.day > season.days) {
      this.s.time.day = 1;
      this.s.time.season = (this.s.time.season + 1) % 4;
      if (this.s.time.season === 0) this.s.time.year += 1;
      const ns = this.season();
      this.log("event", `${ns.name}到了。${ns.desc}`);
    }
    this.s.nextEventIn -= 1;
    if (this.s.nextEventIn <= 0) this.rollEvent();
  }

  catchUp() {
    const now = Date.now();
    let dt = (now - this.s.lastTick) / 1000;
    if (dt > TA.MAX_OFFLINE) dt = TA.MAX_OFFLINE;
    if (dt > 2) {
      const step = 0.25;
      let left = dt;
      while (left > 0) {
        const s = Math.min(step, left);
        this.tick(s);
        left -= s;
      }
      if (dt > 15) this.log("event", `离线 ${Math.floor(dt / 60)} 分 ${Math.floor(dt % 60)} 秒。河水仍在流动。`);
    }
    this.s.lastTick = now;
  }

  tone(freq) {
    if (this.s.muted || !TA.audio) return;
    TA.audio.click(freq);
  }

  save() {
    this.s.lastTick = Date.now();
    try {
      localStorage.setItem(TA.SAVE_KEY, JSON.stringify(this.s));
      return true;
    } catch {
      return false;
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(TA.SAVE_KEY);
      if (!raw) return new TA.Game();
      const s = JSON.parse(raw);
      const base = TA.defaultState();
      const merged = { ...base, ...s, resources: { ...base.resources, ...s.resources }, jobs: { ...base.jobs, ...s.jobs }, time: { ...base.time, ...s.time }, prestige: { ...base.prestige, ...s.prestige }, elites: Array.isArray(s.elites) ? s.elites : [], pendingElite: s.pendingElite && s.pendingElite.id ? s.pendingElite : null };
      return new TA.Game(merged);
    } catch {
      return new TA.Game();
    }
  }

  exportSave() {
    return JSON.stringify(this.s);
  }

  importSave(text) {
    const s = JSON.parse(text);
    if (!s || !s.resources) throw new Error("无效存档");
    this.s = { ...TA.defaultState(), ...s };
  }

  resetAll() {
    const muted = this.s.muted;
    this.s = TA.defaultState();
    this.s.muted = muted;
    this.save();
  }
};

TA.audio = {
  ctx: null,
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  click(freq) {
    try {
      this.ensure();
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.value = 0.03;
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);
      o.stop(this.ctx.currentTime + 0.09);
    } catch {}
  },
};
