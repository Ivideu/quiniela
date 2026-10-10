/* =====================================================================
   admin.js — Menú admin oculto de "Tu Quiniela"
   Se activa con 5 clicks seguidos sobre el título (h1). Pide contraseña
   (validada en el servidor, Apps Script) y permite:
     · rotar al azar el usuario especial ⭐
     · poner los resultados de la jornada (columna D de la hoja Partidos)
     · tener a la vista una capa de REFERENCIA con los resultados reales
       (una web, una imagen por dirección, o una captura pegada con Ctrl+V)
   Uso: <script src="admin.js"></script> al final del <body>.
   ===================================================================== */
(function () {
  "use strict";

  var API_URL = "/api";
  var ADMIN_PASS = "";   // solo en memoria; nunca se guarda
  var DATA = null;       // última copia de datos leída del Sheet
  var WIDGET_ID = "5299f18ec310a025d89539a159cc45c327e605ba9604";   // widget de combinacionganadora.com
  var widgetCargado = false;

  /* ---------- Estilos (acotados a #qa-overlay para no chocar con la página) ---------- */
  var css = [
    "#qa-overlay{display:none;position:fixed;inset:0;background:rgba(0,20,40,.65);z-index:10000;justify-content:center;align-items:flex-start;overflow-y:auto;padding:16px;font-family:'Segoe UI',Tahoma,sans-serif}",
    "#qa-overlay *{box-sizing:border-box}",
    "#qa-box{background:#fff;border-radius:14px;width:100%;max-width:560px;padding:22px;margin:16px 0;box-shadow:0 15px 40px rgba(0,0,0,.35);color:#222}",
    "#qa-box.qa-wide{max-width:1180px}",
    "#qa-box h2{margin:0 0 14px;text-align:center;color:#003366;border:0;padding:0;text-transform:none;font-size:1.4em}",
    "#qa-box h3{margin:22px 0 10px;color:#003366;border-bottom:2px solid #b3d7ff;padding-bottom:6px;font-size:1.05em}",
    "#qa-box h3:first-child{margin-top:0}",
    "#qa-box input[type=password],#qa-box input[type=text],#qa-box select{width:100%;padding:10px;margin:0;border:2px solid #b3d7ff;border-radius:8px;font-size:16px;background:#f8fbff}",
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
    "#qa-ref>summary{cursor:pointer;font-weight:bold;color:#003366;font-size:1.05em}",
    ".qa-links{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 4px}",
    ".qa-links a{flex:1 1 auto;text-align:center;padding:8px 10px;border-radius:8px;background:#e3f2fd;color:#0056b3;text-decoration:none;font-size:13px;font-weight:bold;border:1px solid #b3d7ff}",
    ".qa-links a:hover{background:#cfe7fb}",
    "#qa-wbox{margin-top:10px}",
    "#qa-wbox iframe{width:100%;height:62vh;min-height:380px;border:1px solid #b3d7ff;border-radius:8px;background:#fff}",
    /* Importar Excel */
    ".qa-hint{font-size:13px;color:#555;margin:0 0 8px}",
    "#qa-box textarea{width:100%;padding:10px;margin-top:8px;border:2px dashed #7fb4ea;border-radius:8px;font:12px monospace;background:#f8fbff;resize:vertical}",
    "#qa-box input[type=file]{width:100%;padding:8px;border:2px solid #b3d7ff;border-radius:8px;background:#f8fbff;font-size:14px}",
    ".qa-chk{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13px;color:#333;font-weight:normal}",
    ".qa-chk input{margin-top:3px}",
    "#qa-imp-preview{margin-top:10px;overflow-x:auto;max-height:260px;overflow-y:auto}",
    "#qa-imp-preview table{border-collapse:collapse;width:100%;font-size:12px}",
    "#qa-imp-preview th,#qa-imp-preview td{border:1px solid #ccd9e8;padding:4px 6px;text-align:left;white-space:nowrap}",
    "#qa-imp-preview th{background:#003366;color:#fff}",
    ".qa-gl{display:grid;grid-template-columns:1fr auto 64px auto;gap:6px;align-items:center;margin-bottom:6px;font-size:14px}",
    "#qa-box button.qa-mas{width:38px;height:38px;margin:0;padding:0;font-size:20px;line-height:1}",
    "#qa-box .qa-gl input[type=text]{text-align:center;padding:8px 4px}",
    ".qa-prem{display:grid;grid-template-columns:1fr 110px;gap:6px 10px;align-items:center;font-size:14px}"
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
          '<div id="qa-cols">' +
            '<div id="qa-col-ref">' +
              '<details id="qa-ref" open>' +
                '<summary>📺 Resultados de referencia</summary>' +
                '<div class="qa-links">' +
                  '<a id="qa-ref-abrir" href="https://www.combinacionganadora.com/quiniela/" target="_blank" rel="noopener noreferrer">↗ Jornada en pestaña nueva</a>' +
                  '<a id="qa-ref-recargar" href="#">↻ Recargar</a>' +
                '</div>' +
                '<div id="qa-wbox"></div>' +
                '<div class="qa-msg" id="qa-ref-msg"></div>' +
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
                  '<div class="qa-pl-match" id="qa-pleno-label"></div>' +
                  '<div class="qa-pl-grid"><div class="qa-pl-eq" id="qa-pl-l"></div><div class="qa-pl-eq" id="qa-pl-v"></div></div>' +
                  '<div class="qa-pl-res" id="qa-pl-res"></div>' +
                '</div>' +
                '<div class="qa-bol-foot"><span id="qa-contador">Marcados: 0/14</span><button type="button" class="qa-link" id="qa-borrar">Borrar todo</button></div>' +
              '</div>' +
              '<button type="button" id="qa-guardar">💾 Guardar resultados</button>' +
              '<div class="qa-msg" id="qa-res-msg"></div>' +
              '<h3>📥 Importar jornada desde Excel</h3>' +
              '<p class="qa-hint">Sube tu Excel (hoja «Partidos»; opcionalmente «Pronosticos» y «Global») o pega aquí las celdas A:J de Partidos copiadas de Excel.</p>' +
              '<input type="file" id="qa-imp-file" accept=".xlsx,.xls,.csv" />' +
              '<textarea id="qa-imp-text" rows="4" placeholder="…o pega aquí las celdas copiadas de Excel (con o sin la fila de cabecera)"></textarea>' +
              '<label class="qa-chk"><input type="checkbox" id="qa-imp-vaciar" /> Nueva jornada: vaciar las apuestas de los jugadores (se mantienen los nombres)</label>' +
              '<button type="button" class="qa-sec" id="qa-imp-prev">👁 Previsualizar</button>' +
              '<div id="qa-imp-preview"></div>' +
              '<button type="button" id="qa-imp-go">📥 Importar a la base de datos</button>' +
              '<div class="qa-msg" id="qa-imp-msg"></div>' +
              '<h3>🏆 Victorias totales (clasificación general)</h3>' +
              '<p class="qa-hint">Suma una victoria al ganador de la quiniela con «+» y guarda.</p>' +
              '<div id="qa-glob"></div>' +
              '<button type="button" id="qa-glob-go">Guardar victorias</button>' +
              '<div class="qa-msg" id="qa-glob-msg"></div>' +
              '<h3>💶 Premios del escrutinio (€)</h3>' +
              '<div class="qa-prem" id="qa-premios"></div>' +
              '<button type="button" id="qa-premios-go">Guardar premios</button>' +
              '<div class="qa-msg" id="qa-premios-msg"></div>' +
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
      setMsg("qa-login-msg", "Error de conexión (¿está configurada ADMIN_PASS en Netlify?)", "err");
    }
    btn.disabled = false;
  };

  /* ---------- Panel ---------- */
  async function mostrarPanel() {
    $("qa-box").classList.add("qa-wide");
    $("qa-login").style.display = "none";
    $("qa-panel").style.display = "block";
    $("qa-contenido").style.display = "none";
    setMsg("qa-carga-msg", "Cargando datos...");
    setMsg("qa-rotar-msg", ""); setMsg("qa-res-msg", "");
    try {
      DATA = await leerDatos();
      setMsg("qa-carga-msg", "");
      pintarEspecial();
      pintarPartidos();
      pintarPremios(); pintarGlobal();
      $("qa-contenido").style.display = "block";
      restaurarReferencia();
    } catch (e) {
      setMsg("qa-carga-msg", "No se pudieron cargar los datos", "err");
    }
  }

  function pintarEspecial() {
    $("qa-especial").textContent = DATA.usuarioEspecial ? "⭐ " + DATA.usuarioEspecial : "Sin usuario especial";
  }

  /* ---------- Boleto: casillas 1 X 2 y pleno al 15 ---------- */
  var plL = "", plV = "";   // marcador del pleno al 15 (0, 1, 2, M o "")

  // "RAYO VALLECANO (M) (15º)" -> nombre en grande y "(M) (15º)" en pequeño
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
      (function (i) {   // función propia por fila: cada fila necesita sus variables (grp...) independientes
      var p = partidos[i];
      if (!p) return;
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
          Array.prototype.forEach.call(grp.querySelectorAll(".qa-cas"), function (x) { x.classList.remove("on"); });
          if (!yaOn) c.classList.add("on");      // tocar la marcada la quita
          actualizarContador();
        };
        grp.appendChild(c);
      });

      fila.appendChild(num);
      fila.appendChild(eq);
      fila.appendChild(grp);
      lista.appendChild(fila);
      })(i);
    }
    actualizarContador();

    // Pleno al 15 (fila 16 del Sheet): una columna 0/1/2/M por cada equipo
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

  /* ---------- Resultados de referencia: widget de combinacionganadora.com ---------- */
  // El widget vive en widget.html (página propia) y se muestra en un iframe; solo se carga al abrir el panel.
  function fechaJornada() {
    // Próximo domingo (o hoy si es domingo): día del sorteo de la jornada actual
    var d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function cargarWidget() {
    var det = $("qa-ref");
    $("qa-ref-abrir").href = "https://www.combinacionganadora.com/quiniela/resultados/" + fechaJornada() + "/";
    if (!det.open || widgetCargado) return;
    widgetCargado = true;
    var fr = document.createElement("iframe");
    fr.setAttribute("title", "Resultados La Quiniela");
    fr.src = "widget.html";
    $("qa-wbox").innerHTML = "";
    $("qa-wbox").appendChild(fr);
    setMsg("qa-ref-msg", "Si el cuadro sale vacío, usa «Jornada en pestaña nueva».", "");
  }
  function restaurarReferencia() {
    if (window.matchMedia && !window.matchMedia("(min-width:900px)").matches) $("qa-ref").open = false;
    cargarWidget();
  }
  $("qa-ref").addEventListener("toggle", cargarWidget);
  $("qa-ref-recargar").onclick = function (e) {
    e.preventDefault();
    widgetCargado = false;
    $("qa-wbox").innerHTML = "";
    cargarWidget();
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
        setMsg("qa-res-msg", "✅ Resultados guardados", "ok");
      } else {
        setMsg("qa-res-msg", r.error || "Error", "err");
      }
    } catch (e) {
      setMsg("qa-res-msg", "Error de conexión", "err");
    }
    btn.disabled = false;
  };

  /* ---------- Importar Excel / texto pegado ---------- */
  var IMP = null;   // {partidos, pronosticos?, global?}

  function cargarXLSX() {
    return new Promise(function (ok, ko) {
      if (window.XLSX) return ok();
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = ok;
      s.onerror = function () { ko(new Error("No se pudo cargar el lector de Excel")); };
      document.head.appendChild(s);
    });
  }
  function sinTildes(t) { return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
  function filasHoja(wb, nombre) {
    var n = wb.SheetNames.filter(function (x) { return sinTildes(x) === nombre; })[0];
    return n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }) : null;
  }
  function filasPartidos(filas) {
    var out = [];
    filas.forEach(function (r) {
      var n = Number(String(r[0]).trim());
      if (!isFinite(n) || n % 1 !== 0 || n < 1 || n > 15 || String(r[0]).trim() === "") return;
      var f = r.slice(0, 10); while (f.length < 10) f.push("");
      out[n] = f;
    });
    var res = [];
    for (var i = 1; i <= 15; i++) {
      if (!out[i]) throw new Error("Falta el partido con ID " + i + " (hacen falta los IDs 1 a 15)");
      res.push(out[i]);
    }
    return res;
  }
  function filasPronosticos(filas) {
    return filas.filter(function (r) { var n = String(r[0] == null ? "" : r[0]).trim(); return n && sinTildes(n) !== "nombre"; })
      .map(function (r) { var f = r.slice(0, 16); while (f.length < 16) f.push(""); return f; });
  }
  function filasGlobal(filas) {
    return filas.filter(function (r) { var n = String(r[0] == null ? "" : r[0]).trim(); return n && sinTildes(n) !== "nombre"; })
      .map(function (r) { return [r[0], r[1]]; });
  }

  async function leerEntrada() {
    var file = $("qa-imp-file").files && $("qa-imp-file").files[0];
    var texto = $("qa-imp-text").value;
    if (file) {
      await cargarXLSX();
      var buf = await file.arrayBuffer();
      var wb = XLSX.read(buf, { type: "array" });
      var out = {};
      var hp = filasHoja(wb, "partidos");
      if (!hp) {   // CSV o libro de una sola hoja: se toma la primera
        hp = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      }
      out.partidos = filasPartidos(hp);
      var pr = filasHoja(wb, "pronosticos"); if (pr) out.pronosticos = filasPronosticos(pr);
      var gl = filasHoja(wb, "global");      if (gl) out.global = filasGlobal(gl);
      return out;
    }
    if (texto.trim()) {
      var filas = texto.split(/\r?\n/).filter(function (l) { return l.trim(); }).map(function (l) { return l.split("\t"); });
      return { partidos: filasPartidos(filas) };
    }
    throw new Error("Sube un archivo o pega las celdas de Excel");
  }

  function celda(tag, txt) { var e = document.createElement(tag); e.textContent = txt; return e; }
  function pintarPreview(imp) {
    var cont = $("qa-imp-preview");
    cont.innerHTML = "";
    var t = document.createElement("table");
    var tr = document.createElement("tr");
    ["ID", "Local", "Visitante", "Res.", "Hora", "1", "X", "2", "Análisis / Pronóstico"].forEach(function (h) { tr.appendChild(celda("th", h)); });
    t.appendChild(tr);
    imp.partidos.forEach(function (r) {
      var row = document.createElement("tr");
      [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[9] || r[8]].forEach(function (v) { row.appendChild(celda("td", v == null ? "" : String(v))); });
      t.appendChild(row);
    });
    cont.appendChild(t);
  }
  function resumenImp(imp) {
    var t = "15 partidos";
    if (imp.pronosticos) t += " · " + imp.pronosticos.length + " jugadores con sus apuestas";
    if (imp.global) t += " · clasificación global (" + imp.global.length + ")";
    return t;
  }

  $("qa-imp-prev").onclick = async function () {
    setMsg("qa-imp-msg", "Leyendo...");
    try {
      IMP = await leerEntrada();
      pintarPreview(IMP);
      setMsg("qa-imp-msg", "Listo para importar: " + resumenImp(IMP), "ok");
    } catch (e) { IMP = null; $("qa-imp-preview").innerHTML = ""; setMsg("qa-imp-msg", e.message, "err"); }
  };

  $("qa-imp-go").onclick = async function () {
    var btn = $("qa-imp-go");
    btn.disabled = true;
    setMsg("qa-imp-msg", "Leyendo...");
    try {
      IMP = await leerEntrada();
      pintarPreview(IMP);
      var aviso = "Se van a sustituir los partidos" + (IMP.pronosticos ? ", las apuestas de los jugadores" : "") + (IMP.global ? " y la clasificación global" : "") +
        ($("qa-imp-vaciar").checked && !IMP.pronosticos ? " y se vaciarán las apuestas" : "") + ". ¿Continuar?";
      if (!confirm(aviso)) { setMsg("qa-imp-msg", "Cancelado"); btn.disabled = false; return; }
      setMsg("qa-imp-msg", "Importando...");
      var r = await post({ action: "importar", partidos: IMP.partidos, pronosticos: IMP.pronosticos, global: IMP.global, vaciar: $("qa-imp-vaciar").checked });
      if (r.resultado === "ok") {
        DATA = await leerDatos();
        pintarEspecial(); pintarPartidos(); pintarPremios(); pintarGlobal();
        $("qa-imp-file").value = ""; $("qa-imp-text").value = "";
        setMsg("qa-imp-msg", "✅ Importado: " + r.partidos + " partidos y " + r.jugadores + " jugadores. Recarga la página principal para verlo.", "ok");
      } else setMsg("qa-imp-msg", r.error || "Error", "err");
    } catch (e) { setMsg("qa-imp-msg", e.message || "Error", "err"); }
    btn.disabled = false;
  };

  /* ---------- Premios ---------- */
  function pintarPremios() {
    var cont = $("qa-premios");
    cont.innerHTML = "";
    var esc = (DATA && DATA.escrutinio) || [];
    for (var i = 1; i < esc.length; i++) {
      var lab = document.createElement("div"); lab.textContent = esc[i][0] + " (" + esc[i][1] + ")";
      var inp = document.createElement("input");
      inp.type = "text"; inp.setAttribute("data-i", String(i - 1)); inp.value = esc[i][2] || 0;
      cont.appendChild(lab); cont.appendChild(inp);
    }
  }
  $("qa-premios-go").onclick = async function () {
    var vals = [];
    Array.prototype.forEach.call(document.querySelectorAll("#qa-premios input"), function (i) { vals[parseInt(i.getAttribute("data-i"), 10)] = i.value; });
    var btn = $("qa-premios-go");
    btn.disabled = true;
    setMsg("qa-premios-msg", "Guardando...");
    try {
      var r = await post({ action: "guardarPremios", premios: vals });
      setMsg("qa-premios-msg", r.resultado === "ok" ? "✅ Premios guardados" : (r.error || "Error"), r.resultado === "ok" ? "ok" : "err");
    } catch (e) { setMsg("qa-premios-msg", "Error de conexión", "err"); }
    btn.disabled = false;
  };

  /* ---------- Victorias totales (global.html) ---------- */
  function pintarGlobal() {
    var cont = $("qa-glob");
    cont.innerHTML = "";
    var mapa = {}, orden = [];
    function add(n, v) { n = String(n == null ? "" : n).trim(); if (n && !(n in mapa)) { mapa[n] = v; orden.push(n); } }
    ((DATA && DATA.global) || []).slice(1).forEach(function (f) { add(f[0], Math.max(0, Math.floor(Number(f[1]) || 0))); });
    ((DATA && DATA.pronosticos) || []).slice(1).forEach(function (f) { add(f[0], 0); });
    orden.forEach(function (n) {
      var fila = document.createElement("div"); fila.className = "qa-gl";
      var lab = document.createElement("div"); lab.textContent = n;
      var inp = document.createElement("input"); inp.type = "text"; inp.setAttribute("inputmode", "numeric"); inp.value = mapa[n]; inp.setAttribute("data-n", n);
      function cambia(delta) { inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) + delta); }
      var menos = document.createElement("button"); menos.type = "button"; menos.className = "qa-mas qa-sec"; menos.textContent = "−"; menos.onclick = function () { cambia(-1); };
      var mas = document.createElement("button"); mas.type = "button"; mas.className = "qa-mas"; mas.textContent = "+"; mas.onclick = function () { cambia(1); };
      fila.appendChild(lab); fila.appendChild(menos); fila.appendChild(inp); fila.appendChild(mas);
      cont.appendChild(fila);
    });
  }
  $("qa-glob-go").onclick = async function () {
    var filas = [["Nombre", "Aciertos"]];
    Array.prototype.forEach.call(document.querySelectorAll("#qa-glob input"), function (i) { filas.push([i.getAttribute("data-n"), Math.max(0, parseInt(i.value, 10) || 0)]); });
    var btn = $("qa-glob-go");
    btn.disabled = true;
    setMsg("qa-glob-msg", "Guardando...");
    try {
      var r = await post({ action: "guardarGlobal", global: filas });
      if (r.resultado === "ok") { DATA.global = filas; setMsg("qa-glob-msg", "✅ Victorias guardadas", "ok"); }
      else setMsg("qa-glob-msg", r.error || "Error", "err");
    } catch (e) { setMsg("qa-glob-msg", "Error de conexión", "err"); }
    btn.disabled = false;
  };
})();