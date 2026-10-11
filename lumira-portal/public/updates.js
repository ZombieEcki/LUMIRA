// LUMIRA Self-Service-Portal – Updates für LUMIRA, MagicMirror² und externe Module
// (Seite „Info“, Hinweis-Punkt im Menü, Banner auf „Steuerung“).
// Siehe lumira-portal/lib/updates.js. Vanilla-JS, Texte nur per textContent.
(function () {
  "use strict";

  var ctx = null;   // { toast, goPage }
  var S = null;     // letzter Stand von GET /api/updates
  var pollTimer = null;
  var openChanges = {};

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  function api(path, method) {
    return fetch(path, { method: method || "GET", credentials: "same-origin", headers: { "Content-Type": "application/json" } })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
          return data;
        });
      });
  }

  function busy() { return S && (S.checking || (S.job && S.job.status === "running")); }
  // Während eines LUMIRA-Updates (oder kurz danach) schnell abfragen, um den Neustart mitzubekommen
  function fastPoll() { return busy() || waitingForRestart; }

  function when(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  }

  function versionText(c) {
    if (c.kind === "lumira") {
      var d = c.headDate ? new Date(c.headDate).toLocaleDateString("de-DE", { dateStyle: "medium" }) + " · " : "";
      return "Stand " + d + (c.head || "?");
    }
    if (c.currentVersion && c.latestVersion && c.currentVersion !== c.latestVersion) return c.currentVersion + " → " + c.latestVersion;
    return (c.currentVersion ? "Version " + c.currentVersion : "Stand " + (c.head || "?"));
  }

  // Nach einem LUMIRA-Update startet das Portal neu – das Ergebnis steht
  // dann nur noch in lastJob. Bis zu 30 Minuten danach weiter anzeigen.
  function shownJob() {
    if (S.job) return S.job;
    var lj = S.lastJob;
    if (lj && lj.kind === "lumira" && lj.finishedAt && Date.now() - Date.parse(lj.finishedAt) < 30 * 60 * 1000) return lj;
    return null;
  }

  // ---------------------------------------------------------------------
  // Anzeige
  // ---------------------------------------------------------------------
  function render() {
    if (!S) return;
    var n = S.available || 0;

    var badge = $("#upd-badge");
    badge.hidden = !n;
    badge.textContent = String(n);
    badge.title = n + (n === 1 ? " Update verfügbar" : " Updates verfügbar");

    var banner = $("#upd-banner");
    banner.hidden = !n;
    if (n) {
      var names = S.components.filter(function (c) { return c.updateAvailable; }).map(function (c) { return c.name; });
      $("#upd-banner-text").textContent = (n === 1 ? "Update verfügbar: " : n + " Updates verfügbar: ") + names.join(", ");
    }

    $("#upd-check").disabled = busy();
    $("#upd-checked").textContent = S.checking ? "Prüfe gerade auf Updates …"
      : S.checkedAt ? "Zuletzt geprüft: " + when(S.checkedAt) : "Noch nicht geprüft – die erste Prüfung läuft ein paar Minuten nach dem Start automatisch.";

    var list = $("#upd-list");
    list.replaceChildren();
    if (!S.components.length) {
      list.appendChild(el("p", "save-hint", S.checkedAt ? "Keine überwachten Komponenten gefunden (MagicMirror bzw. Module nicht per git installiert)." : ""));
    }
    S.components.forEach(function (c) { list.appendChild(row(c)); });

    renderJob();
    if (ctx && ctx.onStatus) ctx.onStatus(S);
  }

  function row(c) {
    var box = el("div", "upd-row" + (c.kind === "lumira" ? " is-lumira" : ""));
    var top = el("div", "upd-top");
    var info = el("div", "upd-info");
    if (c.kind === "lumira") {
      var logo = el("img", "upd-logo"); logo.src = "img/icon-192.png"; logo.alt = "";
      top.appendChild(logo);
    }
    info.appendChild(el("b", null, c.name));
    info.appendChild(el("span", "upd-ver", versionText(c)));
    if (c.remote) info.appendChild(el("span", "upd-remote mono-in", c.remote.replace(/^https?:\/\//, "").replace(/\.git$/, "")));
    if (c.electron) info.appendChild(el("span", "upd-remote", "Electron " + c.electron));
    top.appendChild(info);

    var state = el("span", "upd-state");
    if (c.error) { state.classList.add("err"); state.textContent = "Prüfung fehlgeschlagen"; }
    else if (c.updateAvailable) { state.classList.add("new"); state.textContent = c.behind + (c.behind === 1 ? " neue Änderung" : " neue Änderungen"); }
    else { state.classList.add("ok"); state.textContent = "✓ aktuell"; }
    top.appendChild(state);
    box.appendChild(top);

    if (c.error) box.appendChild(el("p", "save-hint", c.error));
    if (c.note) box.appendChild(el("p", "upd-note", c.note));
    if (c.electronFix) {
      box.appendChild(el("p", "upd-note warn", "Electron " + c.electronFix.from + " ist fehlerhaft: " + c.electronFix.reason +
        ". LUMIRA tauscht es gegen " + c.electronFix.to + " – bei jedem MagicMirror-Update automatisch, hier sofort per Knopf."));
    }

    if (c.changes && c.changes.length) {
      var det = el("details", "upd-changes");
      if (openChanges[c.id]) det.open = true;
      det.addEventListener("toggle", function () { openChanges[c.id] = det.open; });
      det.appendChild(el("summary", null, "Was ist neu?"));
      var ul = el("ul");
      c.changes.forEach(function (ch) {
        var li = el("li");
        li.appendChild(el("span", "mono-in", ch.hash + " "));
        li.appendChild(document.createTextNode(ch.subject));
        ul.appendChild(li);
      });
      if (c.behind > c.changes.length) ul.appendChild(el("li", "save-hint", "… und " + (c.behind - c.changes.length) + " weitere"));
      det.appendChild(ul);
      box.appendChild(det);
    }

    var actions = el("div", "upd-actions");
    if (c.updateAvailable && c.canUpdate) {
      var up = el("button", "btn primary", "Aktualisieren"); up.type = "button"; up.disabled = busy();
      up.addEventListener("click", function () { startUpdate(c); });
      actions.appendChild(up);
    }
    if (c.electronFix) {
      var fx = el("button", "btn primary", "Electron reparieren (" + c.electronFix.from + " → " + c.electronFix.to + ")");
      fx.type = "button"; fx.disabled = busy();
      fx.addEventListener("click", function () { startRepair(c); });
      actions.appendChild(fx);
    }
    if (c.rollback) {
      var rb = el("button", "btn", "↺ Zurück zu " + (c.rollback.fromVersion ? "Version " + c.rollback.fromVersion : "vorherigem Stand"));
      rb.type = "button"; rb.disabled = busy();
      rb.title = "Aktualisiert am " + when(c.rollback.at);
      rb.addEventListener("click", function () { startRollback(c); });
      actions.appendChild(rb);
    }
    if (actions.children.length) box.appendChild(actions);
    return box;
  }

  function renderJob() {
    var wrap = $("#upd-job");
    wrap.replaceChildren();
    var job = shownJob();
    if (!job) return;
    var box = el("div", "upd-job " + job.status);
    var label = job.action === "rollback" ? "Zurücksetzen" : job.action === "repair" ? "Reparatur" : "Update";
    var head = job.status === "running"
        ? (job.kind === "lumira"
          ? label + " läuft: LUMIRA … das dauert einige Minuten. Am Ende startet das Portal kurz neu, die Seite lädt dann von selbst."
          : label + " läuft: " + job.name + " … (Seite kann offen bleiben, der Spiegel ist kurz dunkel)")
      : job.status === "success" ? label + " abgeschlossen: " + job.name
      : label + " fehlgeschlagen: " + job.name + (job.error ? " – " + job.error : "");
    box.appendChild(el("b", null, head));
    if (job.notice) box.appendChild(el("p", "upd-note warn", job.notice));
    if (job.log && job.log.length) {
      var det = el("details");
      if (job.status !== "success") det.open = true;
      det.appendChild(el("summary", "save-hint", "Protokoll"));
      det.appendChild(el("pre", "upd-log", job.log.slice(-30).join("\n")));
      box.appendChild(det);
    }
    wrap.appendChild(box);
  }

  // ---------------------------------------------------------------------
  // Aktionen
  // ---------------------------------------------------------------------
  function startUpdate(c) {
    var msg = c.kind === "lumira"
      ? "LUMIRA aktualisieren?\n\nDabei werden die eigenen Module, das Portal und die Spiegel-Einstellungen (config.js) erneuert. Das dauert einige Minuten. MagicMirror und das Portal starten kurz neu – deine Einstellungen bleiben erhalten."
      : c.kind === "core"
      ? "MagicMirror² aktualisieren (" + versionText(c) + ")?\n\nDas dauert auf dem Raspberry Pi einige Minuten, der Spiegel ist währenddessen kurz dunkel. Neue MagicMirror-Versionen können ältere Hardware (z. B. Raspberry Pi 3) oder Module beeinträchtigen – bei Problemen hier „Zurück“ wählen."
      : c.name + " aktualisieren (" + versionText(c) + ")? Der Spiegel startet danach einmal neu.";
    if (!confirm(msg)) return;
    api("/api/updates/" + encodeURIComponent(c.id) + "/apply", "POST")
      .then(function (s) { noteJob(s); S = s; render(); poll(); ctx.toast("Update gestartet"); })
      .catch(function (err) { ctx.toast(err.message); });
  }

  function startRepair(c) {
    if (!confirm("Electron " + c.electronFix.from + " gegen " + c.electronFix.to + " tauschen?\n\nDas lädt rund 100 MB und dauert auf dem Raspberry Pi einige Minuten. Danach startet MagicMirror neu.")) return;
    api("/api/updates/" + encodeURIComponent(c.id) + "/repair-electron", "POST")
      .then(function (s) { S = s; render(); poll(); ctx.toast("Reparatur gestartet"); })
      .catch(function (err) { ctx.toast(err.message); });
  }

  function startRollback(c) {
    if (!confirm(c.name + " auf " + (c.rollback.fromVersion ? "Version " + c.rollback.fromVersion : "den Stand vor dem letzten Update") + " zurücksetzen? Der Spiegel startet danach einmal neu.")) return;
    api("/api/updates/" + encodeURIComponent(c.id) + "/rollback", "POST")
      .then(function (s) { noteJob(s); S = s; render(); poll(); ctx.toast("Zurücksetzen gestartet"); })
      .catch(function (err) { ctx.toast(err.message); });
  }

  var waitingForRestart = false;
  // Ein LUMIRA-Job (laufend oder gerade fertig) heißt: gleich startet das Portal neu
  function noteJob(s) { if (s && s.job && s.job.kind === "lumira") waitingForRestart = true; }
  function load() {
    return api("/api/updates").then(function (s) {
      // Portal war wegen LUMIRA-Update weg und ist wieder da: Seite neu laden,
      // damit auch im Browser der neue Stand läuft
      if (waitingForRestart && !s.job) { location.reload(); return; }
      noteJob(s);
      S = s; render();
    }).catch(function () {});
  }

  // Schnell abfragen, solange etwas läuft, sonst alle 5 Minuten (für Menü-Punkt/Banner).
  function poll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(function () {
      load().then(function () { poll(); });
    }, fastPoll() ? 3000 : 5 * 60 * 1000);
  }

  window.LumiraUpdates = {
    init: function (context) {
      ctx = context;
      $("#upd-check").addEventListener("click", function () {
        api("/api/updates/check", "POST").then(function (s) { S = s; render(); poll(); }).catch(function (err) { ctx.toast(err.message); });
      });
      $("#upd-banner-btn").addEventListener("click", function () {
        ctx.goPage("info");
        var card = $("#updates-card");
        if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      load().then(poll);
    }
  };
})();
