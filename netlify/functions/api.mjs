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
