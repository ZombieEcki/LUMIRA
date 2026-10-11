// LUMIRA Self-Service-Portal – Bild zuschneiden (Profilbilder, Hintergründe).
//
//   LumiraCrop.open({ file, aspects, aspect, round, out, title }) → Promise<Blob|null>
//
//   aspects  [{ label, value }] – value = Breite/Höhe oder "original"
//   aspect   Startwert (Zahl oder "original")
//   round    runde Vorschau (Profilbild)
//   out      { width, height } feste Ausgabe (z. B. 256 × 256) oder
//            { maxSide } – lange Seite höchstens so groß, sonst Originalauflösung
//
// Bedienung: Bild ziehen (Maus/Finger), Zoom per Regler, Mausrad oder zwei
// Fingern, Pfeiltasten verschieben, +/− zoomen, Enter übernimmt, Esc bricht ab.
// Alles im Browser – der Pi braucht keine Bildbibliothek.
(function () {
  "use strict";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Bild konnte nicht gelesen werden")); };
      img.src = url;
    });
  }

  function open(opts) {
    opts = opts || {};
    return loadImage(opts.file).then(function (loaded) {
      return new Promise(function (resolve) { show(opts, loaded, resolve); });
    });
  }

  function show(opts, loaded, resolve) {
    var img = loaded.img;
    var iw = img.naturalWidth, ih = img.naturalHeight;
    var aspects = opts.aspects || [];
    var aspect = opts.aspect != null ? opts.aspect : (aspects[0] ? aspects[0].value : 1);
    var lastFocus = document.activeElement;

    // ---------- Aufbau ----------
    var back = el("div", "crop-backdrop");
    var dlg = el("div", "crop-dialog");
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-label", opts.title || "Bild zuschneiden");
    dlg.tabIndex = -1;
    var head = el("div", "crop-head");
    head.appendChild(el("h2", null, opts.title || "Bild zuschneiden"));
    var x = el("button", "icon-btn crop-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Abbrechen");
    head.appendChild(x);
    dlg.appendChild(head);

    var seg = null;
    if (aspects.length > 1) {
      seg = el("div", "seg crop-aspects");
      seg.setAttribute("role", "tablist");
      aspects.forEach(function (a) {
        var b = el("button", null, a.label); b.type = "button"; b.setAttribute("role", "tab");
        b.addEventListener("click", function () { setAspect(a.value); });
        b._value = a.value;
        seg.appendChild(b);
      });
      dlg.appendChild(seg);
    }

    var stage = el("div", "crop-stage");
    var view = el("div", "crop-view" + (opts.round ? " is-round" : ""));
    view.tabIndex = 0;
    view.setAttribute("aria-label", "Bildausschnitt – mit Pfeiltasten verschieben, Plus/Minus zoomen");
    var pic = img; pic.className = "crop-img"; pic.alt = ""; pic.draggable = false;
    view.appendChild(pic);
    stage.appendChild(view);
    dlg.appendChild(stage);

    var zoomRow = el("div", "crop-zoom-row");
    zoomRow.appendChild(el("span", "crop-zoom-ic", "−"));
    var zoom = el("input", "crop-zoom"); zoom.type = "range"; zoom.min = "1"; zoom.max = "5"; zoom.step = "0.01"; zoom.value = "1";
    zoom.setAttribute("aria-label", "Zoom");
    zoomRow.appendChild(zoom);
    zoomRow.appendChild(el("span", "crop-zoom-ic", "+"));
    dlg.appendChild(zoomRow);
    dlg.appendChild(el("p", "save-hint crop-hint", "Bild ziehen zum Verschieben · Zoom mit Regler, Mausrad oder zwei Fingern"));

    var actions = el("div", "save-row crop-actions");
    var cancel = el("button", "btn", "Abbrechen"); cancel.type = "button";
    var ok = el("button", "btn primary", "Übernehmen"); ok.type = "button";
    actions.appendChild(cancel); actions.appendChild(ok);
    dlg.appendChild(actions);
    back.appendChild(dlg);
    document.body.appendChild(back);
    document.body.classList.add("crop-open");

    // ---------- Geometrie ----------
    var W = 0, H = 0, base = 1, z = 1, ox = 0, oy = 0; // ox/oy: linke obere Bildecke im Ausschnitt

    function curAspect() { return aspect === "original" ? iw / ih : aspect; }

    function layout(keepCenter) {
      // Mittelpunkt im Bild merken, damit ein Formatwechsel nicht springt
      var cx = keepCenter && W ? (W / 2 - ox) / (base * z) : iw / 2;
      var cy = keepCenter && H ? (H / 2 - oy) / (base * z) : ih / 2;
      var maxW = Math.min(stage.clientWidth || 520, 560);
      var maxH = Math.max(220, Math.min(window.innerHeight * 0.55, 560));
      var a = curAspect();
      W = maxW; H = W / a;
      if (H > maxH) { H = maxH; W = H * a; }
      view.style.width = Math.round(W) + "px";
      view.style.height = Math.round(H) + "px";
      base = Math.max(W / iw, H / ih); // „cover“: der Ausschnitt ist immer voll
      ox = W / 2 - cx * base * z;
      oy = H / 2 - cy * base * z;
      clamp(); draw();
      if (seg) Array.prototype.forEach.call(seg.children, function (b) { b.setAttribute("aria-selected", b._value === aspect ? "true" : "false"); });
    }

    function clamp() {
      var s = base * z;
      ox = Math.min(0, Math.max(W - iw * s, ox));
      oy = Math.min(0, Math.max(H - ih * s, oy));
    }

    function draw() {
      var s = base * z;
      pic.style.width = iw + "px";
      pic.style.height = ih + "px";
      pic.style.transform = "translate(" + ox.toFixed(2) + "px," + oy.toFixed(2) + "px) scale(" + s.toFixed(5) + ")";
      zoom.value = String(z);
    }

    // Zoom um einen Punkt im Ausschnitt (px, py), dieser Punkt bleibt stehen
    function zoomTo(nz, px, py) {
      nz = Math.min(5, Math.max(1, nz));
      if (px == null) { px = W / 2; py = H / 2; }
      var s0 = base * z, s1 = base * nz;
      ox = px - (px - ox) * (s1 / s0);
      oy = py - (py - oy) * (s1 / s0);
      z = nz;
      clamp(); draw();
    }

    function setAspect(v) { aspect = v; layout(true); }

    // ---------- Bedienung ----------
    var pointers = {};
    var pinch = null;
    function local(e) { var r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    view.addEventListener("pointerdown", function (e) {
      view.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = local(e);
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: z };
      }
      view.classList.add("is-dragging");
      e.preventDefault();
    });
    view.addEventListener("pointermove", function (e) {
      if (!pointers[e.pointerId]) return;
      var p = local(e), prev = pointers[e.pointerId];
      pointers[e.pointerId] = p;
      var ids = Object.keys(pointers);
      if (ids.length === 2 && pinch) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomTo(pinch.z * d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (ids.length === 1) {
        ox += p.x - prev.x; oy += p.y - prev.y;
        clamp(); draw();
      }
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinch = null;
      if (!Object.keys(pointers).length) view.classList.remove("is-dragging");
    }
    view.addEventListener("pointerup", up);
    view.addEventListener("pointercancel", up);
    view.addEventListener("wheel", function (e) {
      e.preventDefault();
      var p = local(e);
      zoomTo(z * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });
    zoom.addEventListener("input", function () { zoomTo(Number(zoom.value)); });
    view.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 40 : 10;
      if (e.key === "ArrowLeft") { ox += step; } else if (e.key === "ArrowRight") { ox -= step; }
      else if (e.key === "ArrowUp") { oy += step; } else if (e.key === "ArrowDown") { oy -= step; }
      else if (e.key === "+" || e.key === "=") { zoomTo(z * 1.1); return; }
      else if (e.key === "-") { zoomTo(z / 1.1); return; }
      else return;
      e.preventDefault(); clamp(); draw();
    });

    function onResize() { layout(true); }
    window.addEventListener("resize", onResize);

    function close(result) {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey, true);
      back.remove();
      document.body.classList.remove("crop-open");
      URL.revokeObjectURL(loaded.url);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
      resolve(result);
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(null); }
      else if (e.key === "Enter" && e.target.tagName !== "BUTTON") { e.preventDefault(); finish(); }
    }
    document.addEventListener("keydown", onKey, true);
    x.addEventListener("click", function () { close(null); });
    cancel.addEventListener("click", function () { close(null); });
    back.addEventListener("pointerdown", function (e) { if (e.target === back) close(null); });

    // ---------- Ergebnis ----------
    function finish() {
      var s = base * z;
      var sx = -ox / s, sy = -oy / s, sw = W / s, sh = H / s;
      var out = opts.out || {};
      var w, h;
      if (out.width && out.height) { w = out.width; h = out.height; }
      else {
        var k = out.maxSide ? Math.min(1, out.maxSide / Math.max(sw, sh)) : 1;
        w = Math.max(1, Math.round(sw * k)); h = Math.max(1, Math.round(sh * k));
      }
      var c = document.createElement("canvas"); c.width = w; c.height = h;
      var g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.fillStyle = "#000"; g.fillRect(0, 0, w, h); // JPEG: transparente Stellen schwarz statt grau
      g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      ok.disabled = true;
      c.toBlob(function (blob) { close(blob); }, opts.type || "image/jpeg", opts.quality || 0.9);
    }
    ok.addEventListener("click", finish);

    requestAnimationFrame(function () { layout(false); view.focus(); });
  }

  window.LumiraCrop = { open: open };
})();
