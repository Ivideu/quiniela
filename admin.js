/* =====================================================================
   admin.js — Menú admin oculto de "Tu Quiniela"
   Se activa con 5 clicks seguidos sobre el título (h1). Pide contraseña
   (validada en el servidor, Apps Script) y permite:
     · rotar al azar el usuario especial ⭐
     · poner los resultados de la jornada (columna D de la hoja Partidos)
   Uso: <script src="admin.js"></script> al final del <body>.
   ===================================================================== */
(function () {
  "use strict";

  var API_URL = "/api";
  var ADMIN_PASS = "";   // solo en memoria; nunca se guarda
  var DATA = null;       // última copia de datos leída del Sheet

  /* ---------- Estilos (acotados a #qa-overlay para no chocar con la página) ---------- */
  var css = [
    "#qa-overlay{display:none;position:fixed;inset:0;background:rgba(0,20,40,.65);z-index:10000;justify-content:center;align-items:flex-start;overflow-y:auto;padding:16px;font-family:'Segoe UI',Tahoma,sans-serif}",
    "#qa-overlay *{box-sizing:border-box}",
    "#qa-box{background:#fff;border-radius:14px;width:100%;max-width:560px;padding:22px;margin:16px 0;box-shadow:0 15px 40px rgba(0,0,0,.35);color:#222}",
    "#qa-box h2{margin:0 0 14px;text-align:center;color:#003366;border:0;padding:0;text-transform:none;font-size:1.4em}",
    "#qa-box h3{margin:22px 0 10px;color:#003366;border-bottom:2px solid #b3d7ff;padding-bottom:6px;font-size:1.05em}",
    "#qa-box input,#qa-box select{width:100%;padding:10px;margin:0;border:2px solid #b3d7ff;border-radius:8px;font-size:16px;background:#f8fbff}",
    "#qa-box button{display:block;width:100%;padding:12px;margin:12px 0 0;border:0;border-radius:8px;background:#0056b3;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;transform:none;box-shadow:none}",
    "#qa-box button:hover{background:#003d80;transform:none;box-shadow:none}",
    "#qa-box button:disabled{opacity:.6;cursor:wait}",
    "#qa-box button.qa-sec{background:#6c757d}#qa-box button.qa-sec:hover{background:#545b62}",
    "#qa-box button.qa-gold{background:#d39e00}#qa-box button.qa-gold:hover{background:#a67c00}",
    ".qa-msg{margin-top:10px;font-size:14px;text-align:center;min-height:18px;color:#555}",
    ".qa-msg.err{color:#c82333}.qa-msg.ok{color:#218838}",
    ".qa-especial{text-align:center;font-size:1.2em;font-weight:bold;background:#fffcf0;border:2px solid #ffd700;border-radius:10px;padding:12px;color:#003366}",
    ".qa-row{display:grid;grid-template-columns:1fr 84px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid #e3edf7;font-size:14px;color:#003366}",
    ".qa-row small{display:block;color:#6c757d}",
    ".qa-row select{padding:8px!important;font-size:15px!important}",
    "#qa-pleno{margin-top:14px;padding:12px;background:#fffcf0;border:2px solid #ffd700;border-radius:10px}",
    "#qa-pleno label{display:block;margin:0 0 8px;font-weight:bold;color:#856404;font-size:14px}",
    "h1[data-qa-trigger]{cursor:default;user-select:none;-webkit-user-select:none}"
  ].join("\n");
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- Estructura del modal (solo HTML estático) ---------- */
  var overlay = document.createElement("div");
  overlay.id = "qa-overlay";
  overlay.innerHTML =
    '<div id="qa-box">' +
      '<div id="qa-login">' +
        '<h2>🔒 Acceso admin</h2>' +
        '<input type="password" id="qa-pass" placeholder="Contraseña" autocomplete="off" />' +
        '<button type="button" id="qa-entrar">Entrar</button>' +
        '<button type="button" class="qa-sec" id="qa-cancelar">Cancelar</button>' +
        '<div class="qa-msg" id="qa-login-msg"></div>' +
      '</div>' +
      '<div id="qa-panel" style="display:none">' +
        '<h2>⚙️ Panel admin</h2>' +
        '<div class="qa-msg" id="qa-carga-msg"></div>' +
        '<div id="qa-contenido" style="display:none">' +
          '<h3>⭐ Usuario especial</h3>' +
          '<div class="qa-especial" id="qa-especial">-</div>' +
          '<button type="button" class="qa-gold" id="qa-rotar">🎲 Rotar al azar</button>' +
          '<div class="qa-msg" id="qa-rotar-msg"></div>' +
          '<h3>⚽ Resultados de la jornada</h3>' +
          '<div id="qa-lista"></div>' +
          '<div id="qa-pleno" style="display:none"><label id="qa-pleno-label"></label><select id="qa-pleno-sel"></select></div>' +
          '<button type="button" id="qa-guardar">💾 Guardar resultados</button>' +
          '<div class="qa-msg" id="qa-res-msg"></div>' +
        '</div>' +
        '<button type="button" class="qa-sec" id="qa-cerrar">Cerrar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  function $(id) { return document.getElementById(id); }
  function setMsg(id, text, tipo) {
    var el = $(id);
    el.textContent = text || "";
    el.className = "qa-msg" + (tipo ? " " + tipo : "");
  }

  /* ---------- Comunicación con la API ---------- */
  async function post(payload) {
    var body = Object.assign({}, payload, { password: ADMIN_PASS });
    var res = await fetch(API_URL, { method: "POST", body: JSON.stringify(body) });
    return res.json();
  }
  async function leerDatos() {
    var res = await fetch(API_URL + "?t=" + Date.now(), { cache: "no-store" });
    return res.json();
  }

  /* ---------- Normalización de lo que hay en el Sheet ---------- */
  function limpiaRes(v) {
    v = (v == null ? "" : String(v)).trim().toUpperCase();
    return (v === "1" || v === "X" || v === "2") ? v : "";
  }
  function limpiaPleno(v) {
    v = (v == null ? "" : String(v)).replace(/\s/g, "").toUpperCase();
    return /^[0-2M]-[0-2M]$/.test(v) ? v : "";
  }

  /* ---------- Apertura / cierre ---------- */
  function abrir() {
    overlay.style.display = "flex";
    if (ADMIN_PASS) { mostrarPanel(); return; }
    $("qa-login").style.display = "block";
    $("qa-panel").style.display = "none";
    $("qa-pass").value = "";
    setMsg("qa-login-msg", "");
    setTimeout(function () { $("qa-pass").focus(); }, 50);
  }
  function cerrar() { overlay.style.display = "none"; }

  $("qa-cancelar").onclick = cerrar;
  $("qa-cerrar").onclick = cerrar;
  overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) cerrar(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.style.display === "flex") cerrar();
  });
  $("qa-pass").addEventListener("keydown", function (e) {
    if (e.key === "Enter") $("qa-entrar").click();
  });

  /* ---------- 5 clicks sobre el título ---------- */
  var titulo = document.querySelector("h1");
  if (titulo) {
    titulo.setAttribute("data-qa-trigger", "1");
    var clicks = 0, timer = null;
    titulo.addEventListener("click", function () {
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(function () { clicks = 0; }, 1500);
      if (clicks >= 5) { clicks = 0; abrir(); }
    });
  }

  /* ---------- Login ---------- */
  $("qa-entrar").onclick = async function () {
    var pass = $("qa-pass").value;
    if (!pass) return;
    var btn = $("qa-entrar");
    btn.disabled = true;
    setMsg("qa-login-msg", "Comprobando...");
    try {
      ADMIN_PASS = pass;
      var r = await post({ action: "login" });
      if (r.resultado === "ok") { mostrarPanel(); }
      else { ADMIN_PASS = ""; setMsg("qa-login-msg", "Contraseña incorrecta", "err"); }
    } catch (e) {
      ADMIN_PASS = "";
      setMsg("qa-login-msg", "Error de conexión (¿publicaste la nueva versión del Apps Script?)", "err");
    }
    btn.disabled = false;
  };

  /* ---------- Panel ---------- */
  async function mostrarPanel() {
    $("qa-login").style.display = "none";
    $("qa-panel").style.display = "block";
    $("qa-contenido").style.display = "none";
    setMsg("qa-carga-msg", "Cargando datos del Sheet...");
    setMsg("qa-rotar-msg", ""); setMsg("qa-res-msg", "");
    try {
      DATA = await leerDatos();
      setMsg("qa-carga-msg", "");
      pintarEspecial();
      pintarPartidos();
      $("qa-contenido").style.display = "block";
    } catch (e) {
      setMsg("qa-carga-msg", "No se pudieron cargar los datos", "err");
    }
  }

  function pintarEspecial() {
    $("qa-especial").textContent = DATA.usuarioEspecial ? "⭐ " + DATA.usuarioEspecial : "Sin usuario especial";
  }

  function pintarPartidos() {
    var lista = $("qa-lista");
    lista.innerHTML = "";
    var partidos = DATA.partidos || [];

    for (var i = 1; i <= 14; i++) {
      var p = partidos[i];
      if (!p) continue;
      var row = document.createElement("div");
      row.className = "qa-row";

      var info = document.createElement("span");
      var b = document.createElement("b");
      b.textContent = (p[0] || i) + ". ";
      info.appendChild(b);
      info.appendChild(document.createTextNode(p[1] + " vs " + p[2]));
      if (p[4]) { var s = document.createElement("small"); s.textContent = p[4]; info.appendChild(s); }

      var sel = document.createElement("select");
      sel.setAttribute("data-idx", String(i - 1));
      ["", "1", "X", "2"].forEach(function (v) {
        var o = document.createElement("option");
        o.value = v; o.textContent = v === "" ? "—" : v;
        sel.appendChild(o);
      });
      sel.value = limpiaRes(p[3]);

      row.appendChild(info);
      row.appendChild(sel);
      lista.appendChild(row);
    }

    // Pleno al 15 (fila 16 del Sheet)
    var p15 = partidos[15];
    var caja = $("qa-pleno");
    if (p15) {
      caja.style.display = "block";
      $("qa-pleno-label").textContent = "🔥 Pleno al 15: " + p15[1] + " vs " + p15[2];
      var s15 = $("qa-pleno-sel");
      s15.innerHTML = "";
      var vacio = document.createElement("option");
      vacio.value = ""; vacio.textContent = "—";
      s15.appendChild(vacio);
      var marc = ["0", "1", "2", "M"];
      marc.forEach(function (l) { marc.forEach(function (v) {
        var o = document.createElement("option");
        o.value = l + "-" + v; o.textContent = l + " - " + v;
        s15.appendChild(o);
      }); });
      s15.value = limpiaPleno(p15[3]);
    } else {
      caja.style.display = "none";
    }
  }

  /* ---------- Rotar usuario especial ---------- */
  $("qa-rotar").onclick = async function () {
    if (!confirm("¿Elegir un nuevo usuario especial al azar?")) return;
    var btn = $("qa-rotar");
    btn.disabled = true;
    setMsg("qa-rotar-msg", "Sorteando...");
    try {
      var r = await post({ action: "rotarEspecial" });
      if (r.resultado === "ok") {
        DATA.usuarioEspecial = r.usuarioEspecial;
        pintarEspecial();
        setMsg("qa-rotar-msg", "Nuevo usuario especial: " + r.usuarioEspecial, "ok");
        // Avisa a la página (enviar.html lo usa para repintar la ⭐)
        window.dispatchEvent(new CustomEvent("quiniela:especial", { detail: { usuario: r.usuarioEspecial } }));
      } else {
        setMsg("qa-rotar-msg", r.error || "Error", "err");
      }
    } catch (e) {
      setMsg("qa-rotar-msg", "Error de conexión", "err");
    }
    btn.disabled = false;
  };

  /* ---------- Guardar resultados ---------- */
  $("qa-guardar").onclick = async function () {
    var resultados = [];
    for (var i = 0; i < 14; i++) resultados.push("");
    Array.prototype.forEach.call(document.querySelectorAll("#qa-lista select"), function (s) {
      resultados[parseInt(s.getAttribute("data-idx"), 10)] = s.value;
    });
    var p15 = $("qa-pleno").style.display !== "none" ? $("qa-pleno-sel").value : "";

    var btn = $("qa-guardar");
    btn.disabled = true;
    setMsg("qa-res-msg", "Guardando...");
    try {
      var r = await post({ action: "guardarResultados", resultados: resultados, p15: p15 });
      if (r.resultado === "ok") {
        setMsg("qa-res-msg", "✅ Guardado en el Sheet (columna D) y datos refrescados", "ok");
      } else {
        setMsg("qa-res-msg", r.error || "Error", "err");
      }
    } catch (e) {
      setMsg("qa-res-msg", "Error de conexión", "err");
    }
    btn.disabled = false;
  };
})();
