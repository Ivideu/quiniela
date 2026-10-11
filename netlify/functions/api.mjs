// netlify/functions/api.mjs — sustituye al Apps Script. Datos en Netlify Blobs (gratis).
// Mantiene el mismo contrato que usaban las páginas: GET /api y POST /api.
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

export const config = { path: "/api" };

const HEAD_PARTIDOS = ["ID", "Local", "Visitante", "Resultado", "Hora", "Victoria Local", "Empate", "Victoria Visit.", "I (Prob. 1X2 / Pronóstico)", "PRONOSTICO"];
const HEAD_PRON = ["Nombre", ...Array.from({ length: 15 }, (_, i) => "P" + (i + 1))];
const HEAD_GLOBAL = ["Nombre", "Aciertos"];
const NOMBRES_PREMIO = ["Pleno al 15", "1ª (14 Aciertos)", "2ª (13 Aciertos)", "3ª (12 Aciertos)", "4ª (11 Aciertos)", "5ª (10 Aciertos)"];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });

/* ---------- Almacén ---------- */
const store = () => getStore({ name: "quiniela", consistency: "strong" });
const vacio = () => ({ partidos: [HEAD_PARTIDOS], pronosticos: [HEAD_PRON], global: [HEAD_GLOBAL], premios: [0, 0, 0, 0, 0, 0], config: {} });
async function leer() {
  const d = await store().get("datos", { type: "json" });
  return Object.assign(vacio(), d || {});
}
const guardar = d => store().setJSON("datos", d);

/* ---------- Utilidades ---------- */
const str = v => (v === null || v === undefined) ? "" : String(v).trim();
const norm = v => str(v).toUpperCase();
const norm15 = v => norm(v).replace(/\s/g, "");
const esPleno = v => /^[0-2M]-[0-2M]$/.test(v);

function prob(v) {
  if (typeof v === "string") v = v.replace("%", "").replace(",", ".").trim();
  let n = Number(v);
  if (v === "" || v === null || v === undefined || !isFinite(n)) return 0;
  if (n > 1) n = n / 100;
  return Math.round(n * 10000) / 10000;
}

/* ---------- Semana (empieza el martes, hora de Madrid) ---------- */
function claveSemana() {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = hoy.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 5) % 7));
  return f.toISOString().slice(0, 10);
}
const nombres = d => [...new Set(d.pronosticos.slice(1).map(f => str(f[0])).filter(Boolean))].sort();
function especialSemanal(d) {
  const n = nombres(d);
  if (!n.length) return "";
  const hash = claveSemana().split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return n[hash % n.length];
}
function usuarioEspecial(d) {
  const c = d.config || {};
  return (c.usuarioEspecial && c.semana === claveSemana()) ? c.usuarioEspecial : especialSemanal(d);
}

/* ---------- Abrir / cerrar la quiniela: MANUAL desde el panel admin.
   La fecha (viernes 20:00 Madrid) solo sirve para la cuenta atrás de la pantalla principal. ---------- */
const CIERRE_DIA = 5, CIERRE_HORA = 20, CIERRE_MIN = 0;   // 0=domingo ... 5=viernes

function partesMadrid(ms) {
  const p = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hourCycle: "h23",
    year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"
  }).formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return p;
}
function offsetMadrid(ms) {
  const p = partesMadrid(ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
function madridAUtc(y, m, d, h, mi) {   // hora de pared de Madrid -> instante UTC (respeta horario de verano)
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMadrid(guess);
  t = guess - offsetMadrid(t);
  return t;
}
function proximoCierre(desde) {
  const p = partesMadrid(desde);
  for (let k = 0; k < 8; k++) {
    const f = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + k));
    if (f.getUTCDay() !== CIERRE_DIA) continue;
    const t = madridAUtc(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), CIERRE_HORA, CIERRE_MIN);
    if (t > desde) return t;
  }
  return null;
}
const cerrada = d => {
  const c = d.config || {};
  if (c.abierta === true) return false;
  if (c.abierta === false) return true;
  const t = Number(c.cierre);            // datos anteriores al modo manual: se respeta lo que hubiera
  return !!t && Date.now() >= t;
};

/* ---------- Cálculos (antes eran fórmulas del Sheet) ---------- */
function aciertos(d, fila) {
  let n = 0;
  for (let i = 1; i <= 14; i++) {
    const r = norm(d.partidos[i] && d.partidos[i][3]);
    if ((r === "1" || r === "X" || r === "2") && norm(fila[i]) === r) n++;
  }
  return n;
}
function clasificacion(d) {
  return [["Nombre", "Aciertos"], ...d.pronosticos.slice(1).filter(f => str(f[0])).map(f => [str(f[0]), aciertos(d, f)])];
}
function escrutinio(d) {
  const res15 = norm15(d.partidos[15] && d.partidos[15][3]);
  const jug = d.pronosticos.slice(1).filter(f => str(f[0])).map(f => ({ n: aciertos(d, f), p15: norm15(f[15]) }));
  const pleno = jug.filter(j => j.n === 14 && esPleno(res15) && j.p15 === res15).length;
  const cat = k => jug.filter(j => j.n === k).length;
  const cuenta = [pleno, cat(14), cat(13), cat(12), cat(11), cat(10)];
  return [["Aciertos", "Acertantes", "Premio"], ...NOMBRES_PREMIO.map((n, i) => [n, cuenta[i], Number(d.premios[i]) || 0])];
}

function respuestaGET(d) {
  const p15 = d.partidos[15] || [];
  return {
    partidos: d.partidos,
    pronosticos: d.pronosticos.map(f => f.map(c => str(c))),
    clasificacion: clasificacion(d),
    escrutinio: escrutinio(d),
    global: d.global, Global: d.global,
    usuarioEspecial: usuarioEspecial(d),
    datosPartido15: { local: p15[1] || "", visitante: p15[2] || "" },
    abierta: !cerrada(d),
    cierre: (!cerrada(d) && Number((d.config || {}).cierre)) || null,   // destino de la cuenta atrás (solo con la quiniela abierta)
    ahora: Date.now()
  };
}

/* ---------- Normalización de lo importado ---------- */
function normPartidos(rows) {
  if (!Array.isArray(rows) || rows.length !== 15) throw new Error("Hacen falta exactamente 15 partidos (14 + pleno al 15). Recibidos: " + (Array.isArray(rows) ? rows.length : 0));
  return [HEAD_PARTIDOS, ...rows.map((r, i) => {
    r = Array.isArray(r) ? r : [];
    let res = i < 14 ? norm(r[3]) : norm15(r[3]);
    res = i < 14 ? ((res === "1" || res === "X" || res === "2") ? res : "-") : (esPleno(res) ? res : "");
    return [i + 1, str(r[1]), str(r[2]), res, str(r[4]), prob(r[5]), prob(r[6]), prob(r[7]), str(r[8]), str(r[9])];
  })];
}
function normPronosticos(rows) {
  if (!Array.isArray(rows) || rows.length > 500) throw new Error("Pronósticos no válidos");
  const vistos = new Set(), out = [];
  rows.forEach(r => {
    const nombre = str(r && r[0]);
    if (!nombre || vistos.has(nombre.toLowerCase())) return;
    vistos.add(nombre.toLowerCase());
    const fila = [nombre];
    for (let i = 1; i <= 14; i++) { const v = norm(r[i]); fila.push(v === "1" || v === "X" || v === "2" ? v : ""); }
    const p = norm15(r[15]);
    fila.push(esPleno(p) ? p : "");
    out.push(fila);
  });
  return [HEAD_PRON, ...out];
}
function normGlobal(rows) {
  if (!Array.isArray(rows) || rows.length > 500) throw new Error("Datos globales no válidos");
  return [HEAD_GLOBAL, ...rows.filter(r => r && str(r[0])).map(r => [str(r[0]), Math.max(0, Math.floor(Number(r[1]) || 0))])];
}

/* ---------- Resultados automáticos (API-Football) ----------
   Usa la variable de entorno FOOTBALL_API_KEY (Netlify). Una sola consulta por día de partidos
   devuelve todos los encuentros del mundo; aquí se emparejan con los de la quiniela por el nombre. */
const LIVE_URL = "https://v3.football.api-sports.io";
const LIVE_MAX_DIA = 90;               // tope propio de consultas al día (el plan gratis permite 100)
const VENTANA_DIAS = [5, 6, 0, 1];     // viernes, sábado, domingo y lunes (0 = domingo)
const VENTANA_DESDE = 12;              // desde las 12:00 (hora de Madrid) hasta medianoche

const esSigno = v => v === "1" || v === "X" || v === "2";
const nombreCorto = t => str(t).replace(/\s*\(.*$/, "");
const sinAcentos = t => String(t == null ? "" : t).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const VACIAS = new Set(["cd", "fc", "ud", "sd", "cf", "ca", "ad", "rcd", "rc", "sad", "club", "de", "del", "la", "el", "los", "las", "the"]);
const ABREV = { at: "atletico", atl: "atletico", ath: "athletic", r: "real", dep: "deportivo", b: "ii", c: "iii" };
// Selecciones: nombre en español (sin tildes) -> nombre(s) en inglés separados por "|". Añade aquí las que te falten.
const PAISES = {
  "alemania": "germany", "espana": "spain", "francia": "france", "inglaterra": "england", "italia": "italy",
  "portugal": "portugal", "paises bajos": "netherlands|holland", "belgica": "belgium", "croacia": "croatia",
  "dinamarca": "denmark", "suiza": "switzerland", "escocia": "scotland", "gales": "wales",
  "irlanda": "ireland|republic of ireland", "irlanda del norte": "northern ireland", "polonia": "poland",
  "chequia": "czech republic|czechia", "republica checa": "czech republic|czechia", "turquia": "turkey|turkiye",
  "grecia": "greece", "suecia": "sweden", "noruega": "norway", "finlandia": "finland", "hungria": "hungary",
  "eslovenia": "slovenia", "eslovaquia": "slovakia", "rumania": "romania", "ucrania": "ukraine", "islandia": "iceland",
  "mexico": "mexico", "estados unidos": "usa|united states", "canada": "canada", "brasil": "brazil",
  "marruecos": "morocco", "japon": "japan", "corea del sur": "south korea|korea republic", "arabia saudi": "saudi arabia",
  "iran": "iran", "egipto": "egypt", "camerun": "cameroon", "costa de marfil": "ivory coast|cote d ivoire",
  "argelia": "algeria", "tunez": "tunisia", "sudafrica": "south africa", "nueva zelanda": "new zealand",
  "catar": "qatar", "qatar": "qatar", "panama": "panama"
};

function equipoQuiniela(txt) {
  const raw = String(txt == null ? "" : txt);
  const fem = /\(\s*f\s*\)/i.test(raw);                                   // "(f)" = femenino
  const base = sinAcentos(raw.replace(/\(.*?\)/g, " ")).replace(/[^a-z0-9]+/g, " ").trim();
  const alts = (PAISES[base] || base).split("|").map(v =>
    new Set(v.split(" ").filter(Boolean).map(x => ABREV[x] || x).filter(x => !VACIAS.has(x))));
  return { fem, alts };
}
function equipoApi(nombre) {
  const toks = sinAcentos(nombre).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const fem = toks[toks.length - 1] === "w" || toks.includes("women");
  const t = new Set(toks.filter(x => x !== "w" && x !== "women").map(x => ABREV[x] || x).filter(x => !VACIAS.has(x)));
  return { fem, t };
}
function similitud(q, a) {
  if (q.fem !== a.fem || !a.t.size) return 0;
  let mejor = 0;
  q.alts.forEach(alt => {
    if (!alt.size) return;
    let n = 0;
    alt.forEach(x => { if (a.t.has(x)) n++; });
    const v = n / Math.min(alt.size, a.t.size) - 0.01 * Math.abs(alt.size - a.t.size);
    if (v > mejor) mejor = v;
  });
  return mejor;
}

async function llamarApi(ruta, params) {
  const key = process.env.FOOTBALL_API_KEY || "";
  if (!key) throw new Error("Falta la variable FOOTBALL_API_KEY en Netlify");
  const res = await fetch(LIVE_URL + ruta + "?" + new URLSearchParams(params), { headers: { "x-apisports-key": key } });
  if (!res.ok) throw new Error("API-Football respondió " + res.status);
  const j = await res.json();
  const errs = j.errors ? (Array.isArray(j.errors) ? j.errors : Object.values(j.errors)) : [];
  if (errs.length) throw new Error("API-Football: " + errs.join(" · "));
  const rest = Number(res.headers.get("x-ratelimit-requests-remaining"));
  return { lista: j.response || [], restantes: isFinite(rest) && res.headers.get("x-ratelimit-requests-remaining") !== null ? rest : null };
}

function leerFixture(f) {
  const st = (f.fixture && f.fixture.status) || {};
  const corto = st.short || "";
  const fin = ["FT", "AET", "PEN"].includes(corto);
  const vivo = ["1H", "HT", "2H", "ET", "BT", "P", "INT", "LIVE", "SUSP"].includes(corto);
  const susp = ["PST", "CANC", "ABD", "AWD", "WO"].includes(corto);
  const g = f.goals || {}, ft = (f.score && f.score.fulltime) || {};
  // Resultado a los 90 minutos (sin prórroga ni penaltis) cuando el partido ha terminado
  const gl = fin && ft.home != null && ft.away != null ? ft.home : g.home;
  const gv = fin && ft.home != null && ft.away != null ? ft.away : g.away;
  return { local: equipoApi(f.teams && f.teams.home && f.teams.home.name), visit: equipoApi(f.teams && f.teams.away && f.teams.away.name), nl: str(f.teams && f.teams.home && f.teams.home.name), nv: str(f.teams && f.teams.away && f.teams.away.name), fin, vivo, susp, min: st.elapsed, gl, gv };
}

const signoDe = (a, b) => a > b ? "1" : a < b ? "2" : "X";
const golPleno = g => g >= 3 ? "M" : String(g);

// Busca los resultados de los partidos pendientes y rellena los que ya han terminado.
// forzar=true: lo pide el admin (ignora el interruptor automático y el horario).
export async function actualizarResultados({ forzar = false } = {}) {
  if (!process.env.FOOTBALL_API_KEY) return { ok: false, mensaje: "Falta la variable FOOTBALL_API_KEY en Netlify" };
  let d = await leer();
  const c0 = d.config || {};
  if (d.partidos.length < 16) return { ok: false, mensaje: "Primero importa los partidos" };

  const pendientes = [];
  for (let i = 1; i <= 14; i++) if (!esSigno(norm(d.partidos[i][3]))) pendientes.push(i);
  if (!esPleno(norm15(d.partidos[15][3]))) pendientes.push(15);
  if (!pendientes.length) return { ok: true, mensaje: "Ya están todos los resultados", cambios: [] };

  const p = partesMadrid(Date.now());
  const dow = new Date(Date.UTC(+p.year, +p.month - 1, +p.day)).getUTCDay();
  if (!forzar) {
    if (c0.autoResultados !== true) return { ok: true, omitido: true, mensaje: "Automático desactivado", cambios: [] };
    if (!VENTANA_DIAS.includes(dow) || +p.hour < VENTANA_DESDE) return { ok: true, omitido: true, mensaje: "Fuera de horario", cambios: [] };
  }

  const dia = new Date().toISOString().slice(0, 10);   // la API cuenta por día UTC
  const uso0 = (c0.apiUso && c0.apiUso.dia === dia) ? (Number(c0.apiUso.n) || 0) : 0;
  if (uso0 >= LIVE_MAX_DIA) return { ok: false, mensaje: "Tope de consultas de hoy alcanzado (" + uso0 + ")", cambios: [] };

  const f2 = n => String(n).padStart(2, "0");
  const fechaDe = desfase => {
    const x = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + desfase));
    return x.getUTCFullYear() + "-" + f2(x.getUTCMonth() + 1) + "-" + f2(x.getUTCDate());
  };
  let fechas = [];
  if (forzar) {
    // Búsqueda manual: toda la jornada (desde el viernes hasta hoy y, salvo el lunes, mañana),
    // para encontrar partidos de otros días de la misma jornada
    // El plan gratis de la API solo da ayer, hoy y mañana. Con un plan de pago, FOOTBALL_API_ATRAS=3 amplía a toda la jornada
    const maxAtras = Math.max(0, Number(process.env.FOOTBALL_API_ATRAS ?? 1) || 0);
    const atras = { 5: 0, 6: 1, 0: 2, 1: 3 }[dow];
    const desde = atras === undefined ? 0 : -Math.min(atras, maxAtras);
    const hasta = dow === 1 ? 0 : 1;
    for (let k = desde; k <= hasta; k++) fechas.push(fechaDe(k));
  } else {
    fechas = [fechaDe(0)];
    if (+p.hour < 9) fechas.push(fechaDe(-1));   // partidos de madrugada: también los de ayer
  }
  if (uso0 + fechas.length > LIVE_MAX_DIA) return { ok: false, mensaje: "Hoy quedan pocas consultas (" + uso0 + "/" + LIVE_MAX_DIA + "). Inténtalo mañana", cambios: [] };

  let fixtures = [], restantes = null, usadas = 0, correctas = 0;
  const errores = [];
  for (const fecha of fechas) {
    try {
      const r = await llamarApi("/fixtures", { date: fecha, timezone: "Europe/Madrid" });
      usadas++; correctas++;
      fixtures = fixtures.concat(r.lista);
      if (r.restantes !== null) restantes = r.restantes;
    } catch (e) {
      usadas++;
      errores.push(e.message);
      // Una fecha fuera del plan no impide mirar las demás; cualquier otro error corta la búsqueda
      if (!/access to this date/i.test(e.message)) break;
    }
  }
  if (!correctas) {
    const msg = errores[0] || "No se pudo consultar la API";
    const dd = await leer();
    const prev = (dd.config || {}).live || {};
    dd.config = { ...(dd.config || {}), apiUso: { dia, n: uso0 + usadas, restantes }, live: { ...prev, ts: Date.now(), ok: false, error: msg } };
    await guardar(dd);
    return { ok: false, mensaje: msg, cambios: [] };
  }

  const lista = fixtures.map(leerFixture);
  const estado = [], cambios = [];
  pendientes.forEach(i => {
    const fila = d.partidos[i];
    const ql = equipoQuiniela(fila[1]), qv = equipoQuiniela(fila[2]);
    let mejor = null, mejorS = 0;
    lista.forEach(fx => {
      const a = similitud(ql, fx.local), b = similitud(qv, fx.visit);
      if (a >= 0.8 && b >= 0.8 && a + b > mejorS) { mejorS = a + b; mejor = fx; }
    });
    if (!mejor) {
      // Diagnóstico: si la API tiene un partido donde coincide UN equipo, probablemente es solo un nombre distinto
      let cerca = null, cs = 0;
      lista.forEach(fx => {
        const a = similitud(ql, fx.local), b = similitud(qv, fx.visit);
        if (Math.max(a, b) >= 0.8 && a + b > cs) { cs = a + b; cerca = fx.nl + " – " + fx.nv; }
      });
      estado.push({ n: i, est: "nada", cerca });
      return;
    }
    if (mejor.susp) { estado.push({ n: i, est: "susp" }); return; }
    if (mejor.gl == null || mejor.gv == null) { estado.push({ n: i, est: "prog" }); return; }
    const marcador = mejor.gl + "-" + mejor.gv;
    if (mejor.fin) {
      const valor = i === 15 ? golPleno(mejor.gl) + "-" + golPleno(mejor.gv) : signoDe(mejor.gl, mejor.gv);
      cambios.push({ n: i, local: nombreCorto(fila[1]), visitante: nombreCorto(fila[2]), valor, marcador });
      estado.push({ n: i, est: "fin", marcador });
    } else if (mejor.vivo) {
      estado.push({ n: i, est: "vivo", marcador, min: mejor.min || null });
    } else {
      estado.push({ n: i, est: "prog" });
    }
  });

  // Se vuelve a leer justo antes de guardar y solo se rellena lo que siga vacío (por si el admin lo ha puesto a mano)
  d = await leer();
  const aplicados = [];
  cambios.forEach(ch => {
    const fila = d.partidos[ch.n];
    if (!fila) return;
    const vacio = ch.n === 15 ? !esPleno(norm15(fila[3])) : !esSigno(norm(fila[3]));
    if (!vacio) return;
    fila[3] = ch.valor;
    aplicados.push(ch);
  });
  const prev = (d.config || {}).live || {};
  const log = (prev.log || []).concat(aplicados.map(a => ({ ts: Date.now(), n: a.n, texto: a.local + " " + a.marcador + " " + a.visitante + " → " + a.valor }))).slice(-30);
  d.config = { ...(d.config || {}), apiUso: { dia, n: uso0 + usadas, restantes }, live: { ts: Date.now(), ok: true, estado, log, fechas, errores } };
  await guardar(d);

  const sinEmp = estado.filter(e => e.est === "nada").map(e => e.n);
  return {
    ok: true, cambios: aplicados, estado, sinEmparejar: sinEmp,
    mensaje: aplicados.length ? "" : "Ningún partido ha terminado todavía" + (sinEmp.length ? " (no encuentro: " + sinEmp.join(", ") + ")" : "")
  };
}

/* ---------- Admin ---------- */
function passOK(p) {
  const real = process.env.ADMIN_PASS || "";
  if (!real || typeof p !== "string") return false;
  const h = s => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(p), h(real));
}

async function admin(data) {
  if (!passOK(data.password)) {
    await new Promise(r => setTimeout(r, 1000));
    return json({ resultado: "error", error: "No autorizado" });
  }
  if (data.action === "login") return json({ resultado: "ok" });
  const d = await leer();

  switch (data.action) {
    case "rotarEspecial": {
      let n = nombres(d);
      if (!n.length) return json({ resultado: "error", error: "No hay usuarios" });
      const otros = n.filter(x => x !== usuarioEspecial(d));
      if (otros.length) n = otros;
      const elegido = n[Math.floor(Math.random() * n.length)];
      d.config = { ...(d.config || {}), usuarioEspecial: elegido, semana: claveSemana() };
      await guardar(d);
      return json({ resultado: "ok", usuarioEspecial: elegido });
    }
    case "guardarResultados": {
      if (d.partidos.length < 16) return json({ resultado: "error", error: "Primero importa los partidos" });
      const res = Array.isArray(data.resultados) ? data.resultados.slice(0, 14) : [];
      while (res.length < 14) res.push("");
      const limpios = res.map(norm);
      const p15 = norm15(data.p15);
      if (!limpios.every(v => v === "" || v === "1" || v === "X" || v === "2") || !(p15 === "" || esPleno(p15)))
        return json({ resultado: "error", error: "Resultado no válido" });
      limpios.forEach((v, i) => { d.partidos[i + 1][3] = v || "-"; });
      d.partidos[15][3] = p15;
      await guardar(d);
      return json({ resultado: "ok" });
    }
    case "importar": {
      try {
        if (data.partidos) d.partidos = normPartidos(data.partidos);
        if (data.vaciar && !data.pronosticos) d.pronosticos = [HEAD_PRON, ...d.pronosticos.slice(1).map(f => [f[0], ...Array(15).fill("")])];
        if (data.pronosticos) d.pronosticos = normPronosticos(data.pronosticos);
        if (data.global) d.global = normGlobal(data.global);
      } catch (e) { return json({ resultado: "error", error: e.message }); }
      await guardar(d);
      return json({ resultado: "ok", partidos: d.partidos.length - 1, jugadores: d.pronosticos.length - 1 });
    }
    case "estadoLive": {
      const c = d.config || {};
      return json({ resultado: "ok", clave: !!process.env.FOOTBALL_API_KEY, auto: c.autoResultados === true, uso: c.apiUso || null, max: LIVE_MAX_DIA, live: c.live || null });
    }
    case "autoResultados": {
      d.config = { ...(d.config || {}), autoResultados: data.activo === true };
      await guardar(d);
      return json({ resultado: "ok", auto: d.config.autoResultados });
    }
    case "buscarResultados": {
      const r = await actualizarResultados({ forzar: true });
      return json({ ...r, resultado: r.ok ? "ok" : "error", error: r.ok ? undefined : r.mensaje });
    }
    case "abrirQuiniela": {
      const cierre = proximoCierre(Date.now());   // la cuenta atrás cuenta hasta el próximo viernes 20:00 (Madrid)
      d.config = { ...(d.config || {}), abierta: true, cierre };
      await guardar(d);
      return json({ resultado: "ok", abierta: true, cierre });
    }
    case "cerrarQuiniela": {
      d.config = { ...(d.config || {}), abierta: false };
      await guardar(d);
      return json({ resultado: "ok", abierta: false });
    }
    case "guardarGlobal": {
      try { d.global = normGlobal(data.global); } catch (e) { return json({ resultado: "error", error: e.message }); }
      await guardar(d);
      return json({ resultado: "ok" });
    }
    case "guardarPremios": {
      const p = Array.isArray(data.premios) ? data.premios.slice(0, 6).map(v => Math.max(0, Number(String(v).replace(",", ".")) || 0)) : [];
      while (p.length < 6) p.push(0);
      d.premios = p;
      await guardar(d);
      return json({ resultado: "ok" });
    }
    default:
      return json({ resultado: "error", error: "Acción desconocida" });
  }
}

/* ---------- Pronóstico de un jugador (enviar.html) ---------- */
async function guardarPronostico(data) {
  const d = await leer();
  if (cerrada(d)) return json({ resultado: "cerrado", detalle: "La quiniela está cerrada" });

  const nombre = str(data.nombre);
  if (!nombre) return json({ resultado: "error", detalle: "Falta el nombre" });
  const fila = [nombre];
  for (let i = 1; i <= 14; i++) {
    const v = norm(data["p" + i]);
    if (!(v === "1" || v === "X" || v === "2")) return json({ resultado: "error", detalle: "Pronóstico " + i + " no válido" });
    fila.push(v);
  }
  const p15 = norm15(data.p15);
  if (!(p15 === "" || esPleno(p15))) return json({ resultado: "error", detalle: "Pleno al 15 no válido" });
  fila.push(p15);

  const idx = d.pronosticos.findIndex((f, i) => i > 0 && str(f[0]).toLowerCase() === nombre.toLowerCase());
  if (idx > 0) { fila[0] = d.pronosticos[idx][0]; d.pronosticos[idx] = fila; } else d.pronosticos.push(fila);
  await guardar(d);
  return json({ resultado: "ok" });
}

/* ---------- Entrada ---------- */
export default async (req) => {
  try {
    if (req.method === "GET") return json(respuestaGET(await leer()));
    if (req.method === "POST") {
      const data = JSON.parse((await req.text()) || "{}");
      return data.action ? await admin(data) : await guardarPronostico(data);
    }
    return json({ resultado: "error", error: "Método no permitido" }, 405);
  } catch (err) {
    return json({ resultado: "error", error: String(err && err.message || err) }, 500);
  }
};
