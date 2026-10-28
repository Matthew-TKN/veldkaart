// Haalt alle punten en gebieden uit de gedeelde opslag (Firestore) en zet ze in export/:
// veldkaart-magenta.xlsx, punten.csv, gebieden.csv, veldkaart-magenta.geojson en ruwe-data.json.
// Gebruik: cd tools && npm install && npm run export      (of: node export.mjs [uitmap])
// Lezen kan zonder inloggen; het activiteitenlogboek en de leden zijn alleen voor beheerders en zitten er niet bij.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const uit = path.resolve(process.argv[2] || path.join(hier, "..", "export"));

// Dezelfde openbare sleutel als in index.html; de beveiliging zit in de Firestore-regels.
const KEY = "AIzaSyAnt6rTvFzmPMGipVv2MJTa2HTSsNymG0I";
const BASIS = "https://firestore.googleapis.com/v1/projects/veldkaart-magenta/databases/(default)/documents/";

/* ---------- ophalen ---------- */
const waarde = v => {
  const [t, x] = Object.entries(v)[0];
  if (t === "integerValue") return Number(x);
  if (t === "arrayValue") return (x.values || []).map(waarde);
  if (t === "mapValue") return Object.fromEntries(Object.entries(x.fields || {}).map(([k, i]) => [k, waarde(i)]));
  if (t === "nullValue") return null;
  return x;
};
async function haal(collectie) {
  const docs = []; let tok = "";
  do {
    const r = await fetch(BASIS + collectie + "?pageSize=300&key=" + KEY + (tok ? "&pageToken=" + tok : ""));
    const j = await r.json();
    if (!r.ok) throw new Error(`${collectie}: ${r.status} ${j.error?.status || ""}`);
    for (const d of j.documents || []) docs.push({
      id: d.name.split("/").pop(),
      ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, waarde(v)])),
      _aangemaakt: d.createTime, _gewijzigd: d.updateTime,
    });
    tok = j.nextPageToken;
  } while (tok);
  return docs;
}
const opgehaald = new Date().toISOString();
const [ruwePunten, ruweGebieden] = await Promise.all([haal("punten"), haal("gebieden")]);

/* ---------- omzetten ---------- */
const ERN = { "1": "Klein", "2": "Matig", "3": "Ernstig" };
const soortNaam = s => s === "Parklocatie" ? "Parkeerplek" : s || "Overig";
// Volgorde zoals in het formulier van de app
const TAGS = ["goot begroeid","afval in goot","afval langs straat","geen goot","goot lijkt goed","duiker dicht","beschadigde/verstopte kokers","water staat stil","water op weg","kuilen","verzakking","zandweg","asfalt","betegeld","grind","grind/zand"];
// Zelfde lijst als AFWATERING_TAGS in index.html: deze kleuren een punt rood
const NEGATIEF = new Set(["goot begroeid","afval in goot","afval langs straat","geen goot","duiker dicht","beschadigde/verstopte kokers","water staat stil","water op weg","kuilen","verzakking"]);
// Suriname = UTC-3, zonder zomertijd
const lokaal = iso => iso ? new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "";
const maps = (lat, lng) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

const punten = ruwePunten.filter(p => typeof p.lat === "number" && typeof p.lng === "number").sort((a, b) => a.nr - b.nr);
const alleTags = [...TAGS, ...new Set(punten.flatMap(p => p.tags || []).filter(t => !TAGS.includes(t)))];

const rijPunt = p => ({
  "Nr": p.nr,
  "Soort": soortNaam(p.soort),
  "Ernst": ERN[p.ernst] || "",
  "Probleem": (p.ernst || (p.tags || []).some(t => NEGATIEF.has(t))) ? "ja" : "",
  "Kenmerken": (p.tags || []).join(", "),
  "Notitie": p.notitie || "",
  "Breedtegraad": p.lat,
  "Lengtegraad": p.lng,
  "Nauwkeurigheid (m)": p.nauwkeurigheid ?? "",
  "Opgenomen door": p.door || "",
  "Tijdstip (Suriname)": lokaal(p.tijd),
  "Laatst gewijzigd (Suriname)": lokaal(p._gewijzigd),
  "Google Maps": maps(p.lat, p.lng),
  ...Object.fromEntries(alleTags.map(t => [t, (p.tags || []).includes(t) ? "x" : ""])),
  "ID": p.id,
});

// De ring staat plat als [lng,lat,lng,lat,…]
const ring = g => { const r = []; for (let i = 0; i + 1 < (g.ring || []).length; i += 2) r.push([g.ring[i], g.ring[i + 1]]); return r; };
const KLEUR = { groen: "Gecheckt (groen)", geel: "Nog te checken (geel)" };
const gebieden = ruweGebieden.filter(g => ring(g).length >= 3).sort((a, b) => a.nr - b.nr);
const rijGebied = g => ({
  "Nr": g.nr,
  "Status": KLEUR[g.kleur] || g.kleur || "",
  "Notitie": g.notitie || "",
  "Vlak meegeteld": g.vlak === false ? "nee" : "ja",
  "Straten": (g.namen || []).join(", "),
  "Straten uitgevinkt": (g.uit || []).join(", "),
  "Aantal hoekpunten": ring(g).length,
  "Opgenomen door": g.door || "",
  "Tijdstip (Suriname)": lokaal(g.tijd),
  "Hoekpunten (lng lat)": ring(g).map(([x, y]) => `${x.toFixed(6)} ${y.toFixed(6)}`).join("; "),
  "ID": g.id,
});

/* ---------- wegschrijven ---------- */
fs.mkdirSync(uit, { recursive: true });

// CSV zoals de app hem maakt: puntkomma, BOM, komma als decimaalteken voor Belgische Excel
const csv = rijen => {
  const kol = Object.keys(rijen[0] || {});
  const cel = v => { const s = typeof v === "number" ? String(v).replace(".", ",") : String(v ?? ""); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [kol.join(";"), ...rijen.map(r => kol.map(k => cel(r[k])).join(";"))].join("\r\n");
};
fs.writeFileSync(path.join(uit, "punten.csv"), csv(punten.map(rijPunt)));
fs.writeFileSync(path.join(uit, "gebieden.csv"), csv(gebieden.map(rijGebied)));

// GeoJSON voor QGIS / Google Earth / geojson.io
const geo = {
  type: "FeatureCollection",
  features: [
    ...punten.map(p => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { nr: p.nr, soort: soortNaam(p.soort), ernst: ERN[p.ernst] || "", kenmerken: (p.tags || []).join(", "), notitie: p.notitie || "", door: p.door || "", tijd: p.tijd, nauwkeurigheid: p.nauwkeurigheid ?? null, id: p.id } })),
    ...gebieden.map(g => { const r = ring(g); return { type: "Feature", geometry: { type: "Polygon", coordinates: [[...r, r[0]]] },
      properties: { gebied: g.nr, status: KLEUR[g.kleur] || g.kleur, notitie: g.notitie || "", straten: (g.namen || []).join(", "), door: g.door || "", tijd: g.tijd, id: g.id } }; }),
  ],
};
fs.writeFileSync(path.join(uit, "veldkaart-magenta.geojson"), JSON.stringify(geo, null, 1));
fs.writeFileSync(path.join(uit, "ruwe-data.json"), JSON.stringify({ opgehaald, punten: ruwePunten, gebieden: ruweGebieden }, null, 1));

// Excel alleen als exceljs geïnstalleerd is (npm install in tools/)
let ExcelJS = null;
try { ExcelJS = (await import("exceljs")).default; } catch (e) { console.log("exceljs ontbreekt: geen .xlsx. Draai eerst 'npm install' in tools/."); }
if (ExcelJS) {
  const wb = new ExcelJS.Workbook();
  const blad = (naam, rijen, breed) => {
    const ws = wb.addWorksheet(naam, { views: [{ state: "frozen", ySplit: 1 }] });
    const kol = Object.keys(rijen[0] || {});
    ws.columns = kol.map(k => ({ header: k, key: k, width: breed[k] || Math.min(Math.max(k.length + 2, 6), 18) }));
    rijen.forEach(r => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    if (kol.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kol.length } };
    if (kol.includes("Notitie")) ws.getColumn("Notitie").alignment = { wrapText: true, vertical: "top" };
    if (kol.includes("Google Maps")) ws.getColumn("Google Maps").eachCell((c, i) => { if (i > 1) c.value = { text: "kaart", hyperlink: c.value }; });
  };
  blad("Punten", punten.map(rijPunt), { "Notitie": 60, "Kenmerken": 34, "Soort": 18, "Tijdstip (Suriname)": 17, "Laatst gewijzigd (Suriname)": 17, "Breedtegraad": 11, "Lengtegraad": 11, "ID": 22 });
  blad("Gebieden", gebieden.map(rijGebied), { "Notitie": 30, "Straten": 50, "Hoekpunten (lng lat)": 60, "Status": 20, "ID": 22 });

  const ov = wb.addWorksheet("Overzicht");
  const tel = f => { const m = new Map(); punten.forEach(p => [].concat(f(p)).forEach(v => m.set(v, (m.get(v) || 0) + 1))); return [...m].sort((a, b) => b[1] - a[1]); };
  const sectie = (titel, paren) => { ov.addRow([titel]).font = { bold: true }; paren.forEach(r => ov.addRow(r)); ov.addRow([]); };
  ov.addRow([`Veldkaart Magenta, opgehaald ${lokaal(opgehaald)} (Suriname-tijd)`]).font = { bold: true, size: 13 };
  ov.addRow([`${punten.length} punten, ${punten.filter(p => p.notitie).length} met notitie, ${gebieden.length} gebied(en)`]);
  ov.addRow([]);
  sectie("Per soort", tel(p => soortNaam(p.soort)));
  sectie("Per persoon", tel(p => p.door || "onbekend"));
  sectie("Per ernst", tel(p => ERN[p.ernst] || "geen ernst gekozen"));
  sectie("Per kenmerk (vinkje)", tel(p => p.tags || []));
  ov.getColumn(1).width = 34; ov.getColumn(2).width = 8;
  await wb.xlsx.writeFile(path.join(uit, "veldkaart-magenta.xlsx"));
}
console.log(`${punten.length} punten en ${gebieden.length} gebied(en) geschreven naar ${uit}`);
