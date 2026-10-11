// netlify/functions/resultados.mjs — Función programada: cada 10 minutos busca los resultados de la quiniela.
// Solo actúa si el admin ha activado «Actualizar solo» y dentro del horario (viernes a lunes, desde las 12:00 de Madrid).
import { actualizarResultados } from "./api.mjs";

export default async () => {
  try {
    await actualizarResultados({ forzar: false });
  } catch (e) {
    console.error("resultados:", e);
  }
};

export const config = { schedule: "*/10 * * * *" };
