/* =====================================================================
   nav.js — Cabecera de navegación de "Tu Quiniela"
   Muestra arriba, en todas las páginas, los botones a:
     Inicio · Apuestas · Dinero · Clasificación
   Se marca solo la página en la que estás.
   Uso: <script src="nav.js"></script> justo después de <body>.
   ===================================================================== */
(function () {
  "use strict";
  if (document.getElementById("qnav")) return;

  /* Mismos colores de las tarjetas de la portada: azul, verde, amarillo y morado */
  var LINKS = [
    { id: "index",       href: "index.html",       icono: "🏠", texto: "Inicio",        c: "#0077cc", t: "#ffffff" },
    { id: "pronosticos", href: "pronosticos.html", icono: "📊", texto: "Apuestas",      c: "#22a06b", t: "#ffffff" },
    { id: "escrutinio",  href: "escrutinio.html",  icono: "💰", texto: "Dinero",        c: "#ffb703", t: "#222222" },
    { id: "global",      href: "global.html",      icono: "🏆", texto: "Clasificación", c: "#8e5bd6", t: "#ffffff" }
  ];

  /* ---------- Estilos (todos acotados a #qnav) ---------- */
  var css = [
    "#qnav{position:fixed;top:0;left:0;right:0;z-index:40;padding:8px 10px;padding-top:calc(8px + env(safe-area-inset-top,0px));background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 4px 18px rgba(0,60,120,.14);font-family:'Segoe UI',system-ui,sans-serif}",
    "#qnav *{box-sizing:border-box}",
    "#qnav .qn-in{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}",
    "#qnav a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;padding:7px 4px;border-radius:12px;background:#fff;color:#333;text-decoration:none;font-size:12px;font-weight:700;line-height:1.15;text-align:center;border:1px solid #dbe6f1;border-top:4px solid var(--c);box-shadow:0 4px 12px rgba(0,60,120,.08);transition:transform .18s ease,box-shadow .18s ease,background .2s,color .2s;-webkit-tap-highlight-color:transparent}",
    "#qnav a .qn-i{font-size:20px;line-height:1;transition:transform .25s}",
    "#qnav a .qn-t{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "#qnav a:hover{transform:translateY(-2px);box-shadow:0 8px 16px rgba(0,60,120,.16)}",
    "#qnav a:hover .qn-i{transform:rotate(-8deg) scale(1.1)}",
    "#qnav a:active{transform:scale(.97)}",
    "#qnav a:focus-visible{outline:3px solid rgba(0,119,204,.45);outline-offset:2px}",
    "@media (min-width:560px){#qnav a{flex-direction:row;gap:8px;padding:9px 12px;font-size:14px}#qnav a .qn-i{font-size:18px}}",
    "@media (max-width:360px){#qnav{padding-left:6px;padding-right:6px}#qnav .qn-in{gap:5px}#qnav a{font-size:11px;padding:6px 2px}}",
    /* Modo oscuro (solo si la página es oscura) */
    "#qnav.qn-dark{background:rgba(24,34,51,.92);box-shadow:0 4px 18px rgba(0,0,0,.45)}",
    "#qnav.qn-dark a{background:#182233;color:#eef3f9;border-color:#2a3a52;border-top-color:var(--c);box-shadow:0 4px 12px rgba(0,0,0,.35)}",
    /* Página actual */
    "#qnav a.qn-on,#qnav.qn-dark a.qn-on{background:var(--c);color:var(--t);border-color:var(--c);box-shadow:0 8px 18px rgba(0,0,0,.2)}",
    "@media (prefers-reduced-motion:reduce){#qnav a,#qnav a .qn-i{transition:none}}"
  ].join("\n");
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---------- Página actual ---------- */
  var actual = location.pathname.replace(/\/+$/, "").split("/").pop().toLowerCase().replace(/\.html$/, "");
  if (!actual) actual = "index";
  var esInicio = actual === "index";

  /* ---------- Estructura ---------- */
  var nav = document.createElement("nav");
  nav.id = "qnav";
  nav.setAttribute("aria-label", "Navegación principal");
  var fila = document.createElement("div");
  fila.className = "qn-in";

  LINKS.forEach(function (l) {
    var a = document.createElement("a");
    a.href = l.href;
    a.style.setProperty("--c", l.c);
    a.style.setProperty("--t", l.t);
    if (l.id === actual || (l.id === "index" && esInicio)) {
      a.className = "qn-on";
      a.setAttribute("aria-current", "page");
    }
    var i = document.createElement("span"); i.className = "qn-i"; i.setAttribute("aria-hidden", "true"); i.textContent = l.icono;
    var t = document.createElement("span"); t.className = "qn-t"; t.textContent = l.texto;
    a.appendChild(i); a.appendChild(t);
    fila.appendChild(a);
  });
  nav.appendChild(fila);
  document.body.insertBefore(nav, document.body.firstChild);

  /* ---------- Hueco para que la cabecera no tape el contenido ---------- */
  var base = parseFloat(getComputedStyle(document.body).paddingTop) || 0;
  function ajusta() {
    var h = nav.offsetHeight;
    document.documentElement.style.setProperty("--qnav-h", h + "px");   // por si una página necesita el alto
    document.body.style.paddingTop = (base + h) + "px";
  }
  ajusta();
  window.addEventListener("resize", ajusta);
  window.addEventListener("load", ajusta);
  if (window.ResizeObserver) new ResizeObserver(ajusta).observe(nav);

  /* ---------- Colores claros u oscuros según la página ---------- */
  function esOscuro() {
    var c = getComputedStyle(document.body).backgroundColor;
    var m = c.match(/[\d.]+/g);
    if (!m || (m.length > 3 && parseFloat(m[3]) === 0)) {
      c = getComputedStyle(document.documentElement).backgroundColor;
      m = c.match(/[\d.]+/g);
    }
    if (!m || (m.length > 3 && parseFloat(m[3]) === 0)) return false;
    return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 110;
  }
  function tema() { nav.classList.toggle("qn-dark", esOscuro()); }
  tema();
  if (window.matchMedia) {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) mq.addEventListener("change", tema);
    else if (mq.addListener) mq.addListener(tema);
  }
})();