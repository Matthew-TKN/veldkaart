// Bouwt straten.json: alle straatnamen van MI-GLIS (Strpln) met ressort, district en omhullende,
// zodat de zoekbalk meteen suggesties kan tonen zonder bij elke letter de trage server te vragen.
// Gebruik: cd tools && npm run straten   (opnieuw draaien als MI-GLIS nieuwe straten heeft)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hier = path.dirname(fileURLToPath(import.meta.url));
const uit = path.join(hier, "..", "straten.json");
const LAAG = "https://services2.arcgis.com/CK9GXvmosMB7QXv8/arcgis/rest/services/Strpln/FeatureServer/0/query";

// Ressort → district. Centrum en Welgelegen bestaan twee keer; die worden op ligging gekozen.
const DISTRICT = {
  Paramaribo: ["Beekhuizen","Blauwgrond","Flora","Latour","Livorno","Munder","Pontbuiten","Rainville","Tammenga","Weg naar Zee"],
  Wanica: ["De Nieuwe Grond","Domburg","Houttuin","Koewarasan","Kwatta","Lelydorp","Saramacca Polder","Saramaccapolder"],
  Commewijne: ["Alkmaar","Bakkie","Margarethenburg","Margaretha","Meerzorg","Nieuw Amsterdam","Nieuw-Amsterdam","Tamanredjo"],
  Nickerie: ["Groot Henar","Oostelijke Polders","Westelijke Polders","Nieuw Nickerie","Nieuw-Nickerie","Wageningen"],
  Coronie: ["Totness","Johanna Maria"],
  Saramacca: ["Calcutta","Groningen","Jarikaba","Kampong Baroe","Tijgerkreek","Wayamboweg"],
  Marowijne: ["Albina","Galibi","Moengo","Moengotapoe","Patamacca","Wanhatti"],
  Para: ["Bigi Poika","Carolina","Noord","Oost","Zuid"],
  Brokopondo: ["Brownsweg","Klaaskreek","Kwakoegron","Marshallkreek","Sarakreek"],
  Sipaliwini: ["Kabalebo","Boven Coppename","Boven Saramacca","Boven Suriname","Coeroeni","Tapanahony"],
};
const sleutel = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const naarDistrict = new Map(Object.entries(DISTRICT).flatMap(([d, rs]) => rs.map(r => [sleutel(r), d])));
const mooiRessort = new Map(Object.values(DISTRICT).flat().map(r => [sleutel(r), r]));
function districtVan(ressort, lng, lat) {
  const k = sleutel(ressort);
  if (k === "CENTRUM") return lat < 5.5 ? "Brokopondo" : "Paramaribo";
  if (k === "WELGELEGEN") return lng < -55.7 ? "Coronie" : "Paramaribo";
  return naarDistrict.get(k) || "";
}

// "ANNA FRANCINA DIJKSTEEL-HENNEPLAAN" → "Anna Francina Dijksteel-Henneplaan", "WEG NAAR ZEE" → "Weg naar Zee"
const KLEIN = new Set(["van","de","der","den","naar","en","het","ten","ter","op","in","la","le","du","des","di","da","y"]);
const ROMEINS = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/;
function mooi(s) {
  s = String(s || "").trim().replace(/\s+/g, " ");
  if (!s || /[a-z]/.test(s)) return s; // al gemengd geschreven: laten zoals het is
  return s.toLowerCase().split(" ").map((w, i) => {
    if (i > 0 && KLEIN.has(w)) return w;
    if (ROMEINS.test(w)) return w.toUpperCase();
    return w.replace(/(^|[-'(./])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  }).join(" ");
}

async function haal(params) {
  for (let poging = 1; ; poging++) {
    try {
      const r = await fetch(LAAG + "?" + new URLSearchParams({ f: "json", ...params }));
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error));
      return j;
    } catch (e) {
      if (poging >= 4) throw e;
      console.log("opnieuw proberen:", e.message);
      await new Promise(s => setTimeout(s, 2000 * poging));
    }
  }
}

const { count } = await haal({ where: "1=1", returnCountOnly: "true" });
console.log(count, "straatstukken");
const stukken = [];
for (let off = 0; off < count; off += 2000) {
  const j = await haal({ where: "1=1", outFields: "FID,STREETNAME,RESSORTNAM,OUDE_STR_N", returnGeometry: "true", outSR: "4326",
    geometryPrecision: "6", orderByFields: "FID", resultOffset: String(off), resultRecordCount: "2000" });
  for (const f of j.features) {
    const pts = (f.geometry?.paths || []).flat();
    if (!pts.length || !String(f.attributes.STREETNAME || "").trim()) continue;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    stukken.push({ naam: f.attributes.STREETNAME, ressort: String(f.attributes.RESSORTNAM || "").trim(), oud: String(f.attributes.OUDE_STR_N || "").trim(),
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
  }
  console.log(`  ${Math.min(off + 2000, count)} / ${count}`);
}

// Ontbrekend ressort: neem het district van het dichtstbijzijnde stuk met ressort (binnen ~2 km)
const midden = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const metRessort = stukken.filter(s => s.ressort).map(s => ({ m: midden(s.box), d: districtVan(s.ressort, ...midden(s.box)) })).filter(s => s.d);
for (const s of stukken) {
  const [x, y] = midden(s.box);
  if (s.ressort) { s.district = districtVan(s.ressort, x, y); continue; }
  let best = null, bd = 0.02 ** 2;
  for (const o of metRessort) { const d = (o.m[0] - x) ** 2 + (o.m[1] - y) ** 2; if (d < bd) { bd = d; best = o; } }
  s.district = best ? best.d : "";
}

// Samenvoegen per naam + ressort (een straat bestaat uit veel stukken)
const groepen = new Map();
for (const s of stukken) {
  const k = s.naam + "|" + s.ressort + "|" + (s.ressort ? "" : s.district);
  const g = groepen.get(k);
  if (!g) { groepen.set(k, { ...s, oud: new Set(s.oud ? [s.oud] : []), n: 1 }); continue; }
  g.box = [Math.min(g.box[0], s.box[0]), Math.min(g.box[1], s.box[1]), Math.max(g.box[2], s.box[2]), Math.max(g.box[3], s.box[3])];
  if (s.oud) g.oud.add(s.oud);
  g.n++;
}

const ressorts = [...new Set([...groepen.values()].map(g => g.ressort ? mooiRessort.get(sleutel(g.ressort)) || mooi(g.ressort) : ""))].sort();
const districten = [...new Set([...groepen.values()].map(g => g.district))].sort();
// Omhullende als gehele getallen in stappen van 0,0001° (~11 m) vanaf de hoek x0,y0: kleiner bestand, genoeg om naartoe te zoomen
const X0 = -58.1, Y0 = 1.8, STAP = 1e4;
const doos = ([x1, y1, x2, y2]) => { const x = Math.floor((x1 - X0) * STAP), y = Math.floor((y1 - Y0) * STAP); return [x, y, Math.ceil((x2 - X0) * STAP) - x, Math.ceil((y2 - Y0) * STAP) - y]; };
// Per straat: [naam, MI-GLIS-naam (leeg als gelijk aan naam in hoofdletters), ressortnr, districtnr, x, y, breedte, hoogte, oude namen]
const s = [...groepen.values()].sort((a, b) => a.naam.localeCompare(b.naam)).map(g => {
  const n = mooi(g.naam), rm = g.ressort ? mooiRessort.get(sleutel(g.ressort)) || mooi(g.ressort) : "";
  const rij = [n, g.naam === n.toUpperCase() ? "" : g.naam, ressorts.indexOf(rm), districten.indexOf(g.district), ...doos(g.box)];
  const oud = [...g.oud].filter(o => sleutel(o) !== sleutel(g.naam)).map(mooi);
  if (oud.length) rij.push(oud.join(" / "));
  return rij;
});
// v moet gelijk zijn aan INDEX_V in index.html; verander je het formaat, verhoog dan beide
const index = { v: 2, gemaakt: new Date().toISOString().slice(0, 10), bron: "MI-GLIS Strpln", x0: X0, y0: Y0, stap: STAP, ressorts, districten, s };
fs.writeFileSync(uit, JSON.stringify(index));
console.log(`${s.length} straten, ${ressorts.length} ressorts, ${districten.length} districten → ${uit} (${(fs.statSync(uit).size / 1024).toFixed(0)} kB)`);
const zonder = [...groepen.values()].filter(g => !g.district).length;
if (zonder) console.log(`${zonder} straten zonder district`);
const onbekend = [...new Set([...groepen.values()].filter(g => g.ressort && !naarDistrict.has(sleutel(g.ressort)) && !["CENTRUM","WELGELEGEN"].includes(sleutel(g.ressort))).map(g => g.ressort))];
if (onbekend.length) console.log("ressorts zonder district:", onbekend.join(", "));
