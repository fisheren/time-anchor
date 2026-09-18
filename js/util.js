window.TA = window.TA || {};

TA.clamp = (n, a, b) => Math.max(a, Math.min(b, n));

TA.fmt = function fmt(n, digits) {
  if (n == null || Number.isNaN(n)) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs < 10) return sign + abs.toFixed(digits ?? 1);
  if (abs < 1000) return sign + abs.toFixed(abs >= 100 || digits === 0 ? 0 : 1);
  const units = [
    [1e16, "京"],
    [1e12, "兆"],
    [1e8, "亿"],
    [1e4, "万"],
  ];
  for (const [v, u] of units) {
    if (abs >= v) return sign + (abs / v).toFixed(2) + u;
  }
  return sign + Math.floor(abs).toLocaleString("zh-CN");
};

TA.fmtRate = function fmtRate(n) {
  if (Math.abs(n) < 0.0005) return "0/秒";
  const sign = n > 0 ? "+" : "";
  return sign + TA.fmt(n, Math.abs(n) < 1 ? 2 : 1) + "/秒";
};

TA.deepClone = (obj) => JSON.parse(JSON.stringify(obj));

TA.canAfford = function canAfford(have, cost) {
  for (const [k, v] of Object.entries(cost)) {
    if ((have[k] || 0) < v - 1e-9) return false;
  }
  return true;
};

TA.scaleCost = function scaleCost(base, ratio, owned, qty) {
  const out = {};
  for (let i = 0; i < qty; i++) {
    const m = Math.pow(ratio, owned + i);
    for (const [k, v] of Object.entries(base)) {
      out[k] = (out[k] || 0) + v * m;
    }
  }
  return out;
};

TA.costText = function costText(cost, amounts) {
  return Object.entries(cost)
    .map(([k, v]) => {
      const name = TA.DATA.resources[k]?.name || TA.DATA.specialNames[k] || k;
      const lack = (amounts[k] || 0) < v - 1e-9;
      const ico = TA.icon ? TA.icon(k, "ico-cost") : "";
      return `<span class="${lack ? "lack" : ""}">${ico}${name} ${TA.fmt(v)}</span>`;
    })
    .join("<br>");
};
