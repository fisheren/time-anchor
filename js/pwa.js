window.TA = window.TA || {};

TA.PWA = {
  deferred: null,

  init() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.deferred = event;
    });
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      setInterval(() => reg.update(), 30 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update();
      });
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    });
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.game?.save();
      if (TA.UI?.toast) TA.UI.toast("已同步到最新版本。");
      setTimeout(() => location.reload(), 400);
    });
  },

  installed() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  },

  async install() {
    if (this.installed()) {
      TA.UI.toast("已经安装在主屏幕上了。");
      return;
    }
    if (this.deferred) {
      this.deferred.prompt();
      await this.deferred.userChoice;
      this.deferred = null;
      return;
    }
    TA.UI.toast("使用浏览器菜单里的「添加到主屏幕 / 安装应用」。");
  },
};
