# Veldkaart Magenta

**Open de kaart: https://matthew-tkn.github.io/veldkaart/**

Mobiele veldkaart voor de inventarisatie van het onderzoeksgebied Magenta in Paramaribo
(Praktisch Werken 1, Citylab Car Project, PTC Infrastructuur). Het gebied ligt tussen
Magentakanaalweg, Nieuw Weergevondenweg, Santodorpweg / Rambali Mathoeraweg en Frederikshoopweg.

## Gebruiken

1. Open de link op je telefoon en zet locatie aan (bij "Nauwkeurige locatie": aan).
2. Tik **Punt hier** om op je GPS-plek een punt vast te leggen, of tik zelf op de kaart.
3. Kies soort, ernst en de vinkjes (goot begroeid, duiker dicht, zandweg, asfalt …) en wie het opnam.
4. Teken onder **Gebieden** een blok en kleur het groen (gecheckt) of geel (nog te checken).
5. Voor een schermafbeelding: tik het **camera-icoon** rechts (of Menu → Schermafbeelding). Alle knoppen
   verdwijnen; met de balk bovenaan zoom je per 1% (−/+, schuifregelaar of zelf een getal typen), en
   knijpen of scrollen zoomt traploos. Tik op de kaart om de balk te verbergen of terug te halen,
   en **Klaar** (of Esc) zet alles terug.
6. Deel na de ronde je punten via **Menu → Delen in de groepsapp** of **Download CSV**.

Punten en gebieden worden alleen op je eigen telefoon bewaard. Er is geen gedeelde opslag;
voeg ze samen via Delen of CSV.

## Wat erin zit

- Kaartlagen: luchtfoto (met of zonder straten), OpenStreetMap, topografisch, lichte kaart.
- Percelen en straten van MI-GLIS (openbare diensten, zichtbaar vanaf ver inzoomen).
- Zoekbalk met suggesties terwijl je typt: straten met ressort en district (ook met tikfouten,
  zonder spaties of met een oude straatnaam), punten van de groep (op nummer zoals `p12`, of op
  woorden uit de notitie en vinkjes), plaatsen uit OpenStreetMap (kanalen, scholen, wijken …)
  en coördinaten zoals `5.792, -55.226`.
- GPS met nauwkeurigheid in de balk onderaan. Op een computer is er geen GPS en zit de plek
  kilometers naast; gebruik de kaart in het veld op je telefoon.
- Licht, donker of automatisch, onder het menu.

## Alle gegevens exporteren

`tools/export.mjs` haalt alle punten en gebieden uit de gedeelde opslag en zet ze in `export/`:
een Excel-bestand (tabbladen Punten, Gebieden en Overzicht), CSV's, een GeoJSON voor QGIS of
Google Earth en de ruwe data. Nodig: Node.js 18 of nieuwer.

```
cd tools
npm install
npm run export
```

`export/` staat in `.gitignore`, zodat namen en notities niet op GitHub komen. Het
activiteitenlogboek en de ledenlijst zijn alleen voor beheerders en zitten er niet bij.

## Bijwerken

Alles staat in één bestand, `index.html`, zonder build-stap. Vervang het en push naar `main`;
GitHub Pages zet het na 1 à 2 minuten live.

De straatnamen voor de zoekbalk staan in `straten.json`, omdat MI-GLIS te traag is om bij elke
letter te vragen. Heeft MI-GLIS nieuwe straten, maak het bestand dan opnieuw (duurt ± 2 minuten):

```
cd tools
npm run straten
```
