import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const indexPath = path.join(root, "index.html");
const stylesPath = path.join(root, "styles.css");
const appPath = path.join(root, "app.js");
const dataPath = path.join(root, "data/brotato-data.json");

const indexHtml = fs.readFileSync(indexPath, "utf8");
const styles = fs.readFileSync(stylesPath, "utf8");
let appJs = fs.readFileSync(appPath, "utf8");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const fetchBlock = `const response = await fetch("./data/brotato-data.json");
state.data = await response.json();
render();
generateBuildPlan();`;

const replacement = `state.data = JSON.parse(document.getElementById("brotato-embedded-data").textContent);
render();
generateBuildPlan();`;

if (!appJs.includes(fetchBlock)) {
  throw new Error(
    "app.js no longer matches expected fetch block; update scripts/build-standalone.mjs"
  );
}

appJs = appJs.replace(fetchBlock, replacement);

/** Prevent `</script>` or `</` in JSON from breaking HTML when embedded. */
function jsonForHtmlScript(jsonObj) {
  return JSON.stringify(jsonObj).replace(/</g, "\\u003c");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTagList(tags) {
  if (!tags || !tags.length) return "None";
  return tags.map((tag) => escapeHtml(tag)).join(", ");
}

function renderCharacterCard(character) {
  const name = escapeHtml(character.name);
  const weapon = escapeHtml(character.recommendedStartingWeapon || "Any");
  const strategy = (character.strategy || []).slice(0, 2).map(escapeHtml).join(" ");
  const priorities = renderTagList(character.statPriority || []);
  const tags = renderTagList(character.tags || []);
  return `<article class="card">
    <h3>${name}</h3>
    <p><strong>Best start:</strong> ${weapon}</p>
    <p><strong>Stat priority:</strong> ${priorities}</p>
    <p><strong>Tags:</strong> ${tags}</p>
    <p>${strategy || "Open with a stable early weapon, scale economy, then pivot into survivability and damage for elite waves."}</p>
  </article>`;
}

function renderWeaponCard(weapon) {
  const name = escapeHtml(weapon.name);
  const type = escapeHtml(weapon.type || "Unknown");
  const tier = escapeHtml(weapon.tier || "Unknown");
  const classList = renderTagList(weapon.tags || []);
  const notes = escapeHtml(weapon.notes || "Flexible pickup weapon.");
  return `<article class="card">
    <h3>${name}</h3>
    <p><strong>Type:</strong> ${type}</p>
    <p><strong>Tier:</strong> ${tier}</p>
    <p><strong>Tags:</strong> ${classList}</p>
    <p>${notes}</p>
  </article>`;
}

const embeddedJson = jsonForHtmlScript(data);
const preRenderedCharacters = data.characters.map(renderCharacterCard).join("\n");
const preRenderedWeapons = data.weapons.map(renderWeaponCard).join("\n");

let html = indexHtml
  .replace(
    `<link rel="stylesheet" href="./styles.css" />`,
    `<style>\n${styles}\n</style>`
  )
  .replace(
    `<div id="characterCount" class="meta"></div>`,
    `<div id="characterCount" class="meta">${data.characters.length} characters loaded</div>`
  )
  .replace(
    `<div id="weaponCount" class="meta"></div>`,
    `<div id="weaponCount" class="meta">${data.weapons.length} weapons loaded</div>`
  )
  .replace(
    `<div id="characterGrid" class="grid"></div>`,
    `<div id="characterGrid" class="grid">${preRenderedCharacters}</div>`
  )
  .replace(
    `<div id="weaponGrid" class="grid"></div>`,
    `<div id="weaponGrid" class="grid">${preRenderedWeapons}</div>`
  )
  .replace(
    `<script type="module" src="./app.js"></script>`,
    `<script type="application/json" id="brotato-embedded-data">${embeddedJson}</script>
    <script>${appJs}</script>`
  );

const outPath = path.join(root, "Brotato-Guide-standalone.html");
fs.writeFileSync(outPath, html, "utf8");
const kb = Math.round(fs.statSync(outPath).size / 1024);
console.log(`Wrote ${outPath} (${kb} KB)`);
