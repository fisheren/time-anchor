window.TA = window.TA || {};

(function boot() {
  const hadSave = !!localStorage.getItem(TA.SAVE_KEY);
  const game = TA.Game.load();
  window.game = game;
  game.catchUp();
  TA.UI.boot(game, !!(game.s.introDone || (hadSave && game.s.stats.clicks > 0)));

  TA.PWA.init();
  let acc = 0;
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    while (acc >= TA.TICK_MS / 1000) {
      game.tick(TA.TICK_MS / 1000);
      acc -= TA.TICK_MS / 1000;
    }
    if (!document.getElementById("app").hidden) TA.UI.renderAll(false);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  setInterval(() => game.save(), 20000);
  addEventListener("beforeunload", () => game.save());
})();
