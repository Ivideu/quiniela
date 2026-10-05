/* =====================================================================
   admin.js — Menú admin oculto de "Tu Quiniela"
   Se activa con 5 clicks seguidos sobre el título (h1). Pide contraseña
   (validada en el servidor, Apps Script) y permite:
     · rotar al azar el usuario especial ⭐
     · poner los resultados de la jornada (columna D de la hoja Partidos)
     · visualizar la web de referencia de Quiniela
   Uso: <script src="admin.js"></script> al final del <body>.
   ===================================================================== */
(function () {
  "use strict";

  var API_URL = "/api";
  var ADMIN_PASS = "";   // solo en memoria; nunca se guarda
  var DATA = null;       // última copia de datos leída del Sheet

  /* ---------- Estilos ---------- */
  var css = [
    "#qa-overlay{display:none;position:fixed;inset:0;background:rgba(0,20,40,.65);z-index:10000;justify-content:center;align-items:flex-start;overflow-y:auto;padding:16px;font-family:'Segoe UI',Tahoma,sans-serif}",
    "#qa-overlay *{box-sizing:border-box}",
    "#qa-box{background:#fff;border-radius:14px;width:100%;max-width:560px;padding:22px;margin:16px 0;box-shadow:0 15px 40px rgba(0,0,0,.35);color:#222}",
    "#qa-box.qa-wide{max-width:1180px}",
    "#qa-box h2{margin:0 0 14px;text-align:center;color:#003366;border:0;padding:0;text-transform:none;font-size:1.4em}",
    "#qa-box h3{margin:22px 0 10px;color:#003366;border-bottom:2px solid #b3d7ff;padding-bottom:6px;font-size:1.05em}",
    "#qa-box h3:first-child{margin-top:0}",
    "#qa-box input[type=password]{width:100%;padding:10px;margin:0;border:2px solid #b3d7ff;border-radius:8px;font-size:16px;background:#f8fbff}",
    "#qa-box button{display:block;width:100%;padding:12px;margin:12px 0 0;border:0;border-radius:8px;background:#0056b3;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;transform:none;box-shadow:none}",
    "#qa-box button:hover{background:#003d80;transform:none;box-shadow:none}",
    "#qa-box button:disabled{opacity:.6;cursor:wait}",
    "#qa-box button.qa-sec{background:#6c757d}#qa-box button.qa-sec:hover{background:#545b62}",
    "#qa-box button.qa-gold{background:#d39e00}#qa-box button.qa-gold:hover{background:#a67c00}",
    ".qa-msg{margin-top:10px;font-size:14px;text-align:center;min-height:18px;color:#555}",
    ".qa-msg.err{color:#c82333}.qa-msg.ok{color:#218838}",
    ".qa-especial{text-align:center;font-size:1.2em;font-weight:bold;background:#fffcf0;border:2px solid #ffd700;border-radius:10px;padding:12px;color:#003366}",
    /* Boleto de quiniela */
    ".qa-boleto{background:#fff6f4;border:3px solid #d62839;border-radius:12px;overflow:hidden;color:#b01e2c}",
    ".qa-bol-head{background:#d62839;color:#fff;padding:10px 12px;text-align:center}",
    ".qa-bol-head b{display:block;font-size:1.25em;letter-spacing:3px}",
    ".qa-bol-head span{display:block;font-size:11px;opacity:.95;margin-top:2px}",
    ".qa-fila{display:grid;grid-template-columns:30px 1fr auto;gap:8px;align-items:center;padding:7px 10px;border-bottom:1px dashed #f0b3ba}",
    ".qa-fila:nth-child(even){background:#ffeceb}",
    ".qa-num{width:26px;height:26px;border-radius:50%;border:2px solid #d62839;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;color:#d62839;background:#fff}",
    ".qa-eq{font-size:13px;font-weight:bold;color:#7a1420;line-height:1.25;min-width:0}",
    ".qa-eq small{font-weight:normal;color:#b45b64;font-size:11px}",
    ".qa-eq .qa-vs{display:block;font-size:10px;color:#b45b64;font-weight:normal;letter-spacing:1px}",
    ".qa-cas-grp{display:flex;gap:6px}",
    "#qa-box button.qa-cas{width:42px;height:42px;margin:0;padding:0;border:2px solid #d62839;border-radius:6px;background:#fff;color:#d62839;font-size:18px;font-weight:bold;line-height:1}",
    "#qa-box button.qa-cas:hover{background:#ffe1e3;border-color:#a8101f;color:#a8101f}",
    "#qa-box button.qa-cas.on,#qa-box button.qa-cas.on:hover{background:#d62839;color:#fff;border-color:#a8101f}",
    "#qa-pleno{margin:0;padding:10px 12px;background:#fffbe6;border-top:3px double #d62839}",
    ".qa-pl-title{font-weight:bold;color:#856404;letter-spacing:2px;text-align:center}",
    ".qa-pl-match{text-align:center;font-size:13px;font-weight:bold;color:#7a1420;margin:4px 0 8px}",
    ".qa-pl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
    ".qa-pl-eq{text-align:center}",
    ".qa-pl-eq>div{font-size:11px;color:#7a1420;font-weight:bold;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".qa-pl-eq .qa-cas-grp{justify-content:center}",
    "#qa-box .qa-pl-eq button.qa-cas{width:38px;height:38px}",
    ".qa-pl-res{text-align:center;margin-top:8px;font-weight:bold;color:#856404;font-size:14px;min-height:18px}",
    ".qa-bol-foot{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#ffeceb;border-top:2px solid #d62839;font-size:13px;font-weight:bold}",
    "#qa-box button.qa-link{width:auto;margin:0;padding:4px 8px;background:transparent;color:#d62839;text-decoration:underline;font-size:13px}",
    "#qa-box button.qa-link:hover{background:#ffe1e3;color:#a8101f}",
    "h1[data-qa-trigger]{cursor:default;user-select:none;-webkit-user-select:none}",
    /* Capa de referencia */
    "#qa-cols{display:block}",
    "@media (min-width:900px){#qa-box.qa-wide #qa-cols{display:grid;grid-template-columns:1.15fr 1fr;gap:22px;align-items:start}#qa-col-ref{position:sticky;top:8px}}",
    "#qa-col-ref{margin-bottom:18px}",
    "#qa-ref{border:2px solid #b3d7ff;border-radius:12px;padding:12px;background:#f8fbff}",
    "#qa-ref>summary{cursor:pointer;font-weight:bold;color:#003366;font-size:1.05em;margin-bottom:8px}",
    "#qa-visor iframe{width:100%;height:65vh;min-height:400px;border:1px solid #b3d7ff;border-radius:8px;background:#fff}",
    ".qa-refbtns{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}",
    "#qa-box .qa-refbtns a{flex:1 1 auto;width:auto;margin:0;padding:8px 10px;font-size:13px;text-align:center;border-radius:8px;text-decoration:none;display:inline-block;background:#0056b3;color:#fff;font-weight:bold}"
  ].join("\n");
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- Estructura del modal ---------- */
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
          '<div id="qa-cols">' +
            '<div id="qa-col-ref">' +
              '<details id="qa-ref" open>' +
                '<summary>📺 Resultados de referencia</summary>' +
                '<div id="qa-visor">' +
                  '<iframe src="https://www.combinacionganadora.com/quiniela/" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe>' +
                '</div>' +
                '<div class="qa-refbtns">' +
                  '<a href="https://www.combinacionganadora.com/quiniela/" target="_blank" rel="noopener noreferrer">↗ Abrir en pestaña nueva</a>' +
                '</div>' +
              '</details>' +
            '</div>' +
            '<div id="qa-col-main">' +
              '<h3>⭐ Usuario especial</h3>' +
              '<div class="qa-especial" id="qa-especial">-</div>' +
              '<button type="button" class="qa-gold" id="qa-rotar">🎲 Rotar al azar</button>' +
              '<div class="qa-msg" id="qa-rotar-msg"></div>' +
              '<h3>🎟️ Boleto de resultados</h3>' +
              '<div class="qa-boleto">' +
                '<div class="qa-bol-head"><b>LA QUINIELA</b><span>1 gana local · X empate · 2 gana visitante</span></div>' +
                '<div id="qa-lista"></div>' +
                '<div id="qa-pleno" style="display:none">' +
                  '<div class="qa-pl-title">🔥 PLENO AL 15</div>' +
                  '<div class="qa-pleno-label" id="qa-pleno-label"></div>' +
                  '<div class="qa-pl-grid"><div class="qa-pl-eq" id="qa-pl-l"></div><div class="qa-pl-eq" id="qa-pl-v"></div></div>' +
                  '<div class="qa-pl-res" id="qa-pl-res"></div>' +
                '</div>' +
                '<div class="qa-bol-foot"><span id="qa-contador">Marcados: 0/14</span><button type="button" class="qa-link" id="qa-borrar">Borrar todo</button></div>' +
              '</div>' +
              '<button type="button" id="qa-guardar">💾 Guardar resultados</button>' +
              '<div class="qa-msg" id="qa-res-msg"></div>' +
            '</div>' +
          '</div>' +
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
    $("qa-box").classList.remove("qa-wide");
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
    $("qa-box").classList.add("qa-wide");
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

  /* ---------- Boleto: casillas 1 X 2 y pleno al 15 ---------- */
  var plL = "", plV = "";   // marcador del pleno al 15 (0, 1, 2, M o "")

  function nombreEquipo(txt) {
    var s = String(txt == null ? "" : txt);
    var m = s.match(/^(.*?)\s*(\(.*)$/);
    var cont = document.createElement("span");
    cont.appendChild(document.createTextNode(m ? m[1] : s));
    if (m && m[2]) { var sm = document.createElement("small"); sm.textContent = " " + m[2]; cont.appendChild(sm); }
    return cont;
  }

  function nuevaCasilla(valor, activa) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "qa-cas" + (activa ? " on" : "");
    b.setAttribute("data-v", valor);
    b.textContent = valor;
    return b;
  }

  function actualizarContador() {
    var n = document.querySelectorAll("#qa-lista .qa-cas.on").length;
    $("qa-contador").textContent = "Marcados: " + n + "/14";
  }

  function actualizarPleno() {
    Array.prototype.forEach.call(document.querySelectorAll("#qa-pl-l .qa-cas"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === plL);
    });
    Array.prototype.forEach.call(document.querySelectorAll("#qa-pl-v .qa-cas"), function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === plV);
    });
    $("qa-pl-res").textContent = (plL || plV) ? "Resultado: " + (plL || "?") + " - " + (plV || "?") : "";
  }

  function pintarPartidos() {
    var lista = $("qa-lista");
    lista.innerHTML = "";
    var partidos = DATA.partidos || [];

    for (var i = 1; i <= 14; i++) {
      var p = partidos[i];
      if (!p) continue;
      var fila = document.createElement("div");
      fila.className = "qa-fila";
      fila.setAttribute("data-idx", String(i - 1));

      var num = document.createElement("div");
      num.className = "qa-num";
      num.textContent = String(p[0] || i);

      var eq = document.createElement("div");
      eq.className = "qa-eq";
      eq.appendChild(nombreEquipo(p[1]));
      var vs = document.createElement("span");
      vs.className = "qa-vs"; vs.textContent = "—  VS  —";
      eq.appendChild(vs);
      eq.appendChild(nombreEquipo(p[2]));

      var grp = document.createElement("div");
      grp.className = "qa-cas-grp";
      var actual = limpiaRes(p[3]);
      ["1", "X", "2"].forEach(function (v) {
        var c = nuevaCasilla(v, v === actual);
        c.onclick = function () {
          var yaOn = c.classList.contains("on");
          Array.prototype.forEach.call(c.parentElement.querySelectorAll(".qa-cas"), function (x) { x.classList.remove("on"); });
          if (!yaOn) c.classList.add("on");
          actualizarContador();
        };
        grp.appendChild(c);
      });

      fila.appendChild(num);
      fila.appendChild(eq);
      fila.appendChild(grp);
      lista.appendChild(fila);
    }
    actualizarContador();

    var p15 = partidos[15];
    var caja = $("qa-pleno");
    if (p15) {
      caja.style.display = "block";
      $("qa-pleno-label").textContent = p15[1] + " vs " + p15[2];
      var marc = limpiaPleno(p15[3]).split("-");
      plL = marc[0] || ""; plV = marc[1] || "";
      [["qa-pl-l", p15[1], "L"], ["qa-pl-v", p15[2], "V"]].forEach(function (cfg) {
        var cont = $(cfg[0]);
        cont.innerHTML = "";
        var tit = document.createElement("div");
        tit.textContent = String(cfg[1]).replace(/\s*\(.*$/, "");
        cont.appendChild(tit);
        var g = document.createElement("div");
        g.className = "qa-cas-grp";
        ["0", "1", "2", "M"].forEach(function (v) {
          var c = nuevaCasilla(v, false);
          c.onclick = function () {
            if (cfg[2] === "L") plL = (plL === v) ? "" : v; else plV = (plV === v) ? "" : v;
            actualizarPleno();
          };
          g.appendChild(c);
        });
        cont.appendChild(g);
      });
      actualizarPleno();
    } else {
      plL = ""; plV = "";
      caja.style.display = "none";
    }
  }

  $("qa-borrar").onclick = function () {
    Array.prototype.forEach.call(document.querySelectorAll("#qa-lista .qa-cas.on"), function (b) { b.classList.remove("on"); });
    plL = ""; plV = "";
    actualizarPleno(); actualizarContador();
    setMsg("qa-res-msg", "");
  };

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
    Array.prototype.forEach.call(document.querySelectorAll("#qa-lista .qa-fila"), function (f) {
      var on = f.querySelector(".qa-cas.on");
      resultados[parseInt(f.getAttribute("data-idx"), 10)] = on ? on.getAttribute("data-v") : "";
    });
    var p15 = "";
    if ($("qa-pleno").style.display !== "none") {
      if (plL && plV) p15 = plL + "-" + plV;
      else if (plL || plV) { setMsg("qa-res-msg", "En el pleno al 15 marca los dos equipos (o ninguno)", "err"); return; }
    }

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