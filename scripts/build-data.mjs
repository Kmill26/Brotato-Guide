import { readFile, writeFile } from "node:fs/promises";

const CHARACTER_TEMPLATE_PATH =
  "/Users/kennymiller/.cursor/projects/Users-kennymiller-Brotato-Guide/agent-tools/28357231-50da-48b5-88bd-7e3bd3dbb4ac.txt";
const WEAPON_TEMPLATE_PATH =
  "/Users/kennymiller/.cursor/projects/Users-kennymiller-Brotato-Guide/agent-tools/72d2db93-aa53-4a85-9887-bdc29544e86e.txt";

function cleanMarkup(input) {
  if (!input) return "";
  return input
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/\{\{Color\|[^|}]+\|([^}]+)\}\}/g, "$1")
    .replace(/\{\{StatIcon\|([^}]+)\}\}/g, " $1")
    .replace(/\[\[File:[^\]]+\]\]/g, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/''+/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/ ;/g, ";")
    .trim();
}

function titleCaseFromKey(key) {
  return key
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseCharacterTemplate(raw) {
  const lines = raw.split("\n");
  const characters = [];
  let current = null;
  let collectingStats = false;
  let statsBuffer = "";

  for (const line of lines) {
    const keyMatch = line.match(/^\|([^=]+)=\s*\{\{#switch:\{\{lc:\{\{\{2\|\}\}\}\}\}/);
    if (keyMatch) {
      if (current) {
        current.stats = cleanMarkup(statsBuffer || current.stats || "");
        characters.push(current);
      }
      current = {
        key: keyMatch[1].trim(),
        name: titleCaseFromKey(keyMatch[1].trim()),
        stats: "",
        unlockedBy: "",
        unlocks: "",
        unlockType: "",
        wantedTags: "",
        startingWeapons: [],
        isDlc: false
      };
      collectingStats = false;
      statsBuffer = "";
      continue;
    }
    if (!current) continue;

    if (line.includes("|stats=")) {
      collectingStats = true;
      statsBuffer += line.split("|stats=")[1].trim();
      continue;
    }
    if (collectingStats && /^\s*\|/.test(line)) {
      collectingStats = false;
    }
    if (collectingStats) {
      statsBuffer += " " + line.trim();
      continue;
    }

    if (line.includes("|unlockedby=")) {
      current.unlockedBy = cleanMarkup(line.split("|unlockedby=")[1].trim());
    } else if (line.includes("|unlocks=")) {
      current.unlocks = cleanMarkup(line.split("|unlocks=")[1].trim());
    } else if (line.includes("|unlocktype=")) {
      current.unlockType = cleanMarkup(line.split("|unlocktype=")[1].trim());
    } else if (line.includes("|wantedtags=")) {
      current.wantedTags = cleanMarkup(line.split("|wantedtags=")[1].trim());
    } else if (line.includes("|startingwpns=")) {
      const rawWeapons = line.split("|startingwpns=")[1].trim();
      current.startingWeapons = rawWeapons
        .split(",")
        .map((w) => cleanMarkup(w.trim()))
        .filter((w) => w && w !== "-");
    } else if (line.includes("|isdlc=")) {
      current.isDlc = line.split("|isdlc=")[1].trim() === "1";
    }
  }

  if (current) {
    current.stats = cleanMarkup(statsBuffer || current.stats || "");
    characters.push(current);
  }

  return characters.filter((c) => c.key !== "#default");
}

function parseTierValues(section) {
  const values = {};
  const re = /\|(\d)\|(?:common|rare|epic|legendary)=([^\n]+)/g;
  let m = re.exec(section);
  while (m) {
    values[m[1]] = cleanMarkup(m[2].trim());
    m = re.exec(section);
  }
  return values;
}

function extractSwitchBlock(text, fieldName) {
  const start = text.indexOf(`|${fieldName}={{#switch`);
  if (start === -1) return "";
  const nextField = text.slice(start + 1).search(/\n\t\|[a-z]+=/);
  if (nextField === -1) return text.slice(start);
  return text.slice(start, start + 1 + nextField);
}

function parseWeaponTemplate(raw) {
  const weaponBlocks = raw.split(/\n\|/).slice(1);
  const weapons = [];

  for (const blockRaw of weaponBlocks) {
    const block = "|" + blockRaw;
    if (block.startsWith("|#default")) continue;
    const head = block.match(/^\|([^=]+)=\s*\{\{#switch:/);
    if (!head) continue;
    const key = head[1].trim();
    const weapon = {
      key,
      name: titleCaseFromKey(key),
      rarity: "",
      types: [],
      unlockedBy: "",
      special: "",
      attackType: "",
      isDlc: false,
      tiers: {}
    };
    const rarity = block.match(/\|rarity=([^\n]+)/);
    const types = block.match(/\|types=([^\n]+)/);
    const unlockedBy = block.match(/\|unlockedby=([^\n]+)/);
    const special = block.match(/\|special=([^\n]+)/);
    const attackType = block.match(/\|attacktype=([^\n]+)/);
    const isDlc = block.match(/\|isdlc=([^\n]+)/);

    weapon.rarity = rarity ? cleanMarkup(rarity[1]) : "";
    weapon.types = types
      ? cleanMarkup(types[1])
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    weapon.unlockedBy = unlockedBy ? cleanMarkup(unlockedBy[1]) : "";
    weapon.special = special ? cleanMarkup(special[1]) : "";
    weapon.attackType = attackType ? cleanMarkup(attackType[1]) : "";
    weapon.isDlc = isDlc ? isDlc[1].trim() === "1" : false;

    const fields = ["damage", "attackspeed", "dps", "crit", "range", "knockback", "lifesteal", "price"];
    for (const field of fields) {
      const blockPart = extractSwitchBlock(block, field);
      if (!blockPart) continue;
      const tierValues = parseTierValues(blockPart);
      for (const [tier, value] of Object.entries(tierValues)) {
        if (!weapon.tiers[tier]) weapon.tiers[tier] = {};
        weapon.tiers[tier][field] = value;
      }
    }

    weapons.push(weapon);
  }

  return weapons;
}

function deriveStatPriority(character) {
  const s = (character.stats || "").toLowerCase();
  const tags = (character.wantedTags || "").toLowerCase();
  const k = character.key;
  const hasMeleePenalty = /-\d+ ?melee damage|melee damage modifications are reduced/.test(s);
  const hasRangedPenalty = /-\d+ ?ranged damage|ranged damage modifications are reduced/.test(s);
  const hasElementalPenalty = /-\d+ ?elemental damage|elemental damage modifications are reduced/.test(s);
  const hasEngineeringPenalty = /-\d+ ?engineering|engineering modifications are reduced/.test(s);

  if (k === "bull") return ["Armor", "HP Regeneration", "Max HP", "Attack Speed", "Crit Chance"];
  if (k === "demon") return ["Economy", "Max HP", "Armor", "Damage", "Attack Speed"];
  if (k === "apprentice") return ["Max HP", "Attack Speed", "Melee Damage", "Ranged Damage", "Armor"];
  if (k === "golem") return ["Armor", "Max HP", "Attack Speed", "Speed", "Damage"];
  if (k === "generalist") return ["Melee Damage", "Ranged Damage", "Attack Speed", "Armor", "Max HP"];
  if (k === "technomage") return ["Engineering", "Elemental Damage", "Attack Speed", "Armor", "Max HP"];
  if (k === "dwarf") return ["Engineering", "Melee Damage", "Armor", "Max HP", "Speed"];
  if (s.includes("can't equip weapons")) return ["Armor", "HP Regeneration", "Max HP", "Dodge", "Speed"];
  if (s.includes("can't equip melee")) return ["Ranged Damage", "Attack Speed", "Range", "Crit Chance", "Armor"];
  if (s.includes("can't equip ranged")) return ["Melee Damage", "Attack Speed", "Armor", "Max HP", "Speed"];
  if (s.includes("unarmed")) return ["Melee Damage", "Attack Speed", "Dodge", "Armor", "Max HP"];
  if (tags.includes("melee damage")) return ["Melee Damage", "Attack Speed", "Armor", "Max HP", "Speed"];
  if (tags.includes("ranged damage")) return ["Ranged Damage", "Attack Speed", "Range", "Crit Chance", "Armor"];
  if (tags.includes("elemental damage")) return ["Elemental Damage", "Attack Speed", "Range", "Armor", "Max HP"];
  if (tags.includes("engineering")) return ["Engineering", "Armor", "Attack Speed", "HP Regeneration", "Max HP"];

  if (s.includes("melee") && !hasMeleePenalty) {
    return ["Melee Damage", "Attack Speed", "Armor", "Max HP", "Speed"];
  }
  if (s.includes("ranged") && !hasRangedPenalty) {
    return ["Ranged Damage", "Attack Speed", "Range", "Crit Chance", "Armor"];
  }
  if (s.includes("elemental") && !hasElementalPenalty) {
    return ["Elemental Damage", "Attack Speed", "Range", "Armor", "Max HP"];
  }
  if (s.includes("engineering") && !hasEngineeringPenalty) {
    return ["Engineering", "Armor", "Attack Speed", "HP Regeneration", "Max HP"];
  }

  if ((s.includes("engineering") && !hasEngineeringPenalty) || tags.includes("engineering")) {
    return ["Engineering", "Armor", "Attack Speed", "HP Regeneration", "Max HP"];
  }
  if ((s.includes("elemental") && !hasElementalPenalty) || tags.includes("elemental")) {
    return ["Elemental Damage", "Attack Speed", "Range", "Armor", "Max HP"];
  }
  if ((s.includes("ranged") && !hasRangedPenalty) || tags.includes("ranged")) {
    return ["Ranged Damage", "Attack Speed", "Range", "Crit Chance", "Armor"];
  }
  if ((s.includes("melee") && !hasMeleePenalty) || tags.includes("melee")) {
    return ["Melee Damage", "Attack Speed", "Armor", "Max HP", "Speed"];
  }
  if (s.includes("luck") || tags.includes("luck")) return ["Luck", "Harvesting", "Attack Speed", "Armor", "Max HP"];
  if (s.includes("harvesting") || tags.includes("economy")) return ["Harvesting", "Economy", "Damage", "Armor", "Max HP"];
  return ["Damage", "Attack Speed", "Armor", "Max HP", "Speed"];
}

function inferArchetype(character) {
  const s = (character.stats || "").toLowerCase();
  const t = (character.wantedTags || "").toLowerCase();
  const k = character.key;

  if (k === "bull") return "retaliation";
  if (k === "demon") return "hp-economy";
  if (s.includes("can't equip weapons")) return "unarmed-tank";
  if (s.includes("can't equip melee")) return "ranged-only";
  if (s.includes("can't equip ranged")) return "melee-only";
  if (s.includes("you can only equip one weapon")) return "single-weapon";
  if (s.includes("you can equip up to 12 weapons") || s.includes("weapon slot when you level up")) return "many-weapons";
  if (s.includes("structures") || s.includes("engineering") || t.includes("structure")) return "engineering";
  if (s.includes("elemental") || t.includes("elemental")) return "elemental";
  if (s.includes("luck") || t.includes("luck")) return "luck-economy";
  if (s.includes("harvesting") || t.includes("harvesting")) return "economy";
  if (s.includes("dodge") || t.includes("dodge")) return "dodge";
  if (s.includes("life steal") || s.includes("hp regeneration")) return "sustain";
  if (s.includes("ranged")) return "ranged";
  if (s.includes("melee")) return "melee";
  return "balanced";
}

function deriveRecommendedStart(character) {
  const curated = {
    well_rounded: { weapon: "Stick", reason: "Stable primitive opener with strong early consistency and easy scaling." },
    brawler: { weapon: "Fist", reason: "Unarmed attack speed bonus gives immediate tempo and dodge-friendly melee control." },
    crazy: { weapon: "Knife", reason: "Precise melee start best exploits crazy range and attack speed scaling." },
    ranger: { weapon: "SMG", reason: "Ranged scaling and attack-speed ramp make SMG the fastest early clear option." },
    mage: { weapon: "Wand", reason: "Elemental-focused start gives reliable burn setup without relying on penalized damage stats." },
    chunky: { weapon: "Pruner", reason: "Chunky converts consumable sustain into efficient scaling, and Pruner maximizes fruit generation." },
    old: { weapon: "Scissors", reason: "Safer melee control supports slower pacing and early stability." },
    lucky: { weapon: "Slingshot", reason: "Luck economy likes bounce clear to farm materials efficiently." },
    mutant: { weapon: "SMG", reason: "Fast ranged clear leverages rapid level pacing and tempo advantage." },
    generalist: { weapon: "Cacti Club", reason: "Hybrid scaler benefits from strong early melee base and broad class synergy." },
    loud: { weapon: "Slingshot", reason: "Dense waves reward bounce clear and fast early horde control." },
    multitasker: { weapon: "Stick", reason: "Cheap stacking power lets many-slot builds spike quickly." },
    wildling: { weapon: "Stick", reason: "Primitive lifesteal scaling plus stick stacking gives best early momentum." },
    pacifist: { weapon: "Hand", reason: "Pacifist wants economy/harvest utility over damage scaling." },
    gladiator: { weapon: "Spear", reason: "Reliable melee reach supports mixed weapon roster without early deaths." },
    saver: { weapon: "Thief Dagger", reason: "Economy-oriented kills synergize with saver material scaling." },
    sick: { weapon: "Medical Gun", reason: "Sustain-focused profile benefits from stable ranged lifesteal tempo." },
    farmer: { weapon: "Pruner", reason: "Consumable and harvesting loop is strongest with fruit generation." },
    ghost: { weapon: "Ghost Scepter", reason: "Ethereal and dodge stacking aligns with snowball ghost mechanics." },
    speedy: { weapon: "Spear", reason: "Speed scaling plus reach keeps uptime high while kiting aggressively." },
    entrepreneur: { weapon: "Sickle", reason: "High-economy scaling benefits from Sickle tempo and strong wave-value conversion." },
    engineer: { weapon: "Wrench", reason: "Early structure uptime stabilizes waves while engineering scales." },
    explorer: { weapon: "Screwdriver", reason: "Map-control utility and extra trees favor trap-based wave management." },
    doctor: { weapon: "Scissors", reason: "Medical attack speed scaling and sustain loops are strongest with Scissors start." },
    hunter: { weapon: "Crossbow", reason: "High range and crit scaling align with burst pickoff playstyle." },
    artificer: { weapon: "Shredder", reason: "Explosion-centric scaling comes online fastest with ranged explosive hits." },
    arms_dealer: { weapon: "Pistol", reason: "Cheap rotating weapon economy starts safest with basic ranged tempo." },
    streamer: { weapon: "SMG", reason: "Movement-based damage and speed windows are best exploited by rapid-fire guns." },
    cyborg: { weapon: "SMG", reason: "Ranged damage conversion kit values fast-hit guns for scaling and consistency." },
    glutton: { weapon: "Pruner", reason: "Consumable-triggered explosions scale best when fruit spawn is maximized." },
    jack: { weapon: "Laser Gun", reason: "Elite/boss kill profile favors high single-target ranged consistency." },
    lich: { weapon: "Chopper", reason: "Healing and HP scaling loops are strongest with max-HP-based melee conversions." },
    apprentice: { weapon: "Slingshot", reason: "Level-up scaling likes safe wave clear while stats ramp naturally." },
    cryptid: { weapon: "Pruner", reason: "Tree and sustain economy works best with extra consumable generation." },
    fisherman: { weapon: "Spear", reason: "Reliable melee control handles bait-spawn pressure early." },
    golem: { weapon: "Rock", reason: "No-heal tank plan values blunt survivability and safe contact pacing." },
    king: { weapon: "Sword", reason: "Tier progression and melee consistency give strongest upgrade path for king." },
    renegade: { weapon: "SMG", reason: "Projectile count scaling performs best with high fire-rate ranged starts." },
    one_armed: { weapon: "Lightning Shiv", reason: "Single-slot builds want one high-impact scaling weapon with strong tempo." },
    soldier: { weapon: "SMG", reason: "Stand-still damage profile multiplies high fire-rate ranged weapons." },
    masochist: { weapon: "Spiky Shield", reason: "Armor and on-hit loops naturally align with defensive melee scaling." },
    knight: { weapon: "Sword", reason: "Armor-scaling melee profile gets stable early value from sword path." },
    demon: { weapon: "Ghost Scepter", reason: "HP economy start prefers weapons that convert early kills into survivability." },
    baby: { weapon: "Stick", reason: "Multi-slot leveling scales fastest with cheap stackable primitive starts." },
    vagabond: { weapon: "Lightning Shiv", reason: "Mixed class bonus abuse likes high-impact unique weapon archetypes." },
    technomage: { weapon: "Wrench", reason: "Structure plus elemental conversion makes early turret setup optimal." },
    vampire: { weapon: "Claw", reason: "Missing-health and lifesteal loops favor fast melee hit frequency." },
    sailor: { weapon: "Anchor", reason: "Naval synergy and curse interactions make Anchor the most coherent opener." },
    curious: { weapon: "Javelin", reason: "Loot-focused scaling likes safe ranged poke with strong early consistency." },
    builder: { weapon: "Plank", reason: "Builder turret setup benefits from tool/structure tempo and control." },
    captain: { weapon: "Spear", reason: "Consistent reach and scaling help bridge captain XP tempo ramp." },
    creature: { weapon: "Sickle", reason: "Curse scaling and flexible wave clear fit creature progression." },
    chef: { weapon: "Spoon", reason: "Burn-synergy and utility melee supports chef explosion/burn conversion." },
    druid: { weapon: "Sickle", reason: "Consumable-luck profile benefits from balanced sustain and wave clear." },
    dwarf: { weapon: "Hammer", reason: "Melee-engineering loop benefits from heavy hit profile and structure support." },
    gangster: { weapon: "SMG", reason: "Volatile economy and elite risk prefer stable high-tempo ranged starts." },
    diver: { weapon: "Shuriken", reason: "Precise crit scaling comes online fastest with shuriken tempo." },
    hiker: { weapon: "Hiking Pole", reason: "Step-scaling mechanic is best exploited by hiking-pole pacing." },
    buccaneer: { weapon: "Slingshot", reason: "Pickup-reset loop pairs well with bounce-based ranged clear." },
    ogre: { weapon: "Chopper", reason: "High melee base and HP-linked effects scale best with chopper profile." },
    romantic: { weapon: "Flute", reason: "Charm-focused kit aligns with musical utility and curse pacing." }
  };

  const normalizedKey = character.key.replaceAll(" ", "_");
  const starts = character.startingWeapons || [];
  const lowStats = (character.stats || "").toLowerCase();
  const lowTags = (character.wantedTags || "").toLowerCase();

  if (curated[normalizedKey] && starts.includes(curated[normalizedKey].weapon)) {
    return {
      recommendedStartingWeapon: curated[normalizedKey].weapon,
      recommendedStartConfidence: "High",
      recommendedStartReason: curated[normalizedKey].reason
    };
  }
  if (!starts.length) {
    return {
      recommendedStartingWeapon: "-",
      recommendedStartConfidence: "Low",
      recommendedStartReason: "No valid starting weapon data found for this character."
    };
  }

  const scores = new Map(starts.map((w) => [w, 0]));
  const addScore = (weapon, score) => {
    if (scores.has(weapon)) scores.set(weapon, scores.get(weapon) + score);
  };

  for (const weapon of starts) {
    const lowW = weapon.toLowerCase();
    if (lowW.includes("ghost")) addScore(weapon, 1);
    if (lowW.includes("wrench") || lowW.includes("screwdriver") || lowW.includes("hammer")) addScore(weapon, 2);
    if (lowW.includes("smg") || lowW.includes("slingshot") || lowW.includes("crossbow")) addScore(weapon, 2);
    if (lowW.includes("wand") || lowW.includes("torch") || lowW.includes("taser") || lowW.includes("icicle")) addScore(weapon, 2);
    if (lowW.includes("fist") || lowW.includes("stick") || lowW.includes("knife") || lowW.includes("spear")) addScore(weapon, 1);
  }

  const prefer = (cond, names, score) => {
    if (!cond) return;
    for (const n of names) addScore(n, score);
  };

  prefer(lowStats.includes("can't equip melee"), ["SMG", "Slingshot", "Crossbow", "Pistol"], 5);
  prefer(lowStats.includes("can't equip ranged"), ["Fist", "Stick", "Spear", "Cacti Club", "Knife"], 5);
  prefer(lowStats.includes("engineering") || lowTags.includes("engineering"), ["Wrench", "Screwdriver", "Hammer", "Plank"], 5);
  prefer(lowStats.includes("elemental") || lowTags.includes("elemental"), ["Wand", "Torch", "Taser", "Icicle"], 5);
  prefer(lowStats.includes("unarmed"), ["Fist", "Hand", "Claw"], 6);
  prefer(lowTags.includes("ranged damage"), ["SMG", "Slingshot", "Crossbow", "Pistol"], 4);
  prefer(lowTags.includes("melee damage"), ["Cacti Club", "Spear", "Knife", "Fist", "Stick"], 4);
  prefer(lowTags.includes("luck"), ["Slingshot", "Lute", "Flute"], 3);
  prefer(lowStats.includes("harvesting"), ["Pruner", "Hand", "Lute"], 3);
  prefer(lowTags.includes("consumable") || lowStats.includes("consumable"), ["Pruner", "Chopper"], 7);

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [bestWeapon, bestScore] = sorted[0];
  const secondScore = sorted[1]?.[1] ?? -999;
  const gap = bestScore - secondScore;
  const confidence = gap >= 4 ? "High" : gap >= 2 ? "Medium" : "Low";

  const reasonParts = [];
  if (lowStats.includes("can't equip melee")) reasonParts.push("character is ranged-locked");
  if (lowStats.includes("can't equip ranged")) reasonParts.push("character is melee-locked");
  if (lowStats.includes("engineering") || lowTags.includes("engineering")) reasonParts.push("engineering synergy");
  if (lowStats.includes("elemental") || lowTags.includes("elemental")) reasonParts.push("elemental synergy");
  if (lowTags.includes("melee damage")) reasonParts.push("melee tag weighting");
  if (lowTags.includes("ranged damage")) reasonParts.push("ranged tag weighting");
  if (!reasonParts.length) reasonParts.push("best weighted fit among starting options");

  return {
    recommendedStartingWeapon: bestWeapon,
    recommendedStartConfidence: confidence,
    recommendedStartReason: `${bestWeapon} selected due to ${reasonParts.join(", ")}.`
  };
}

function deriveStrategy(character) {
  const stats = character.stats || "";
  const starts = character.startingWeapons.slice(0, 4).join(", ") || "default options";
  const low = stats.toLowerCase();
  const archetype = inferArchetype(character);
  const tips = [];

  tips.push(`Open with ${starts}; commit to one damage lane early so your shops stay coherent.`);

  if (archetype === "engineering") {
    tips.push("Prioritize Engineering + survivability; treat direct weapon DPS as secondary unless your passive converts another stat into structures.");
    tips.push("Stack structure density and uptime before greed, then add attack speed/range support to convert turret uptime into wave control.");
  } else if (archetype === "elemental") {
    tips.push("Force burn application consistency first, then scale Elemental Damage and attack speed for smooth horde clear.");
    tips.push("If direct melee/ranged scaling is penalized, avoid wasting level-ups there and push utility stats that keep burn uptime safe.");
  } else if (archetype === "ranged-only" || archetype === "ranged") {
    tips.push("Use range breakpoints to kill elites before contact; once safety is stable, pivot into pure DPS stats.");
    tips.push("Keep weapon classes tight to avoid diluting shop rolls with off-plan weapons.");
  } else if (archetype === "melee-only" || archetype === "melee") {
    tips.push("Frontload survivability (Armor/HP) so you can stay in contact safely while scaling melee damage.");
    tips.push("Use knockback or speed to control engagement distance instead of trying to stat-fix every weakness.");
  } else if (archetype === "many-weapons") {
    tips.push("Abuse slot count by stabilizing with cheap merged cores first, then replace weakest weapons with tiered synergies.");
    tips.push("Because inventory is wide, avoid too many unrelated classes or your best upgrades become inconsistent.");
  } else if (archetype === "single-weapon") {
    tips.push("Invest hard into one weapon's best scaling path and protect economy for fast tier upgrades.");
    tips.push("Skip mediocre side stats; concentrated scaling outperforms balanced shopping on single-slot builds.");
  } else if (archetype === "retaliation" || archetype === "unarmed-tank") {
    tips.push("Your clear comes from survivability loops: cap defensive layers first, then add offensive multipliers that piggyback on tank stats.");
    tips.push("Take controlled hits only when your sustain cycle is online; avoid greed waves that break recovery rhythm.");
  } else if (archetype === "hp-economy") {
    tips.push("Treat HP as both resource and power budget: buy only high-impact upgrades and avoid low-value reroll spam.");
    tips.push("Convert economy spikes into survivability before damage so late-wave purchases do not collapse your health buffer.");
  } else if (archetype === "luck-economy" || archetype === "economy") {
    tips.push("Secure early economy multipliers, then cash out into combat stats before elite timings.");
    tips.push("Do not over-greed past wave 10: convert surplus into immediate survivability and clear speed.");
  } else if (archetype === "dodge") {
    tips.push("Play around dodge cap and evasion uptime, then patch armor/HP enough to survive failed rolls.");
    tips.push("Favor mobility and contact control so dodge variance does not decide elite fights.");
  } else if (archetype === "sustain") {
    tips.push("Build around your healing loop first (lifesteal/regen trigger), then amplify damage once sustain is reliable.");
    tips.push("Avoid overinvesting in redundant sustain if your kit already overcaps one healing source.");
  } else {
    tips.push("Balance economy and tempo: one economy buy, one combat buy rhythm through early and mid waves.");
    tips.push("Use level-ups to reinforce your strongest scaling modifier instead of rounding weak stats.");
  }

  if (low.includes("items price") || low.includes("weapon price")) {
    tips.push("Because shop prices are altered on this character, plan rerolls conservatively and prioritize premium-value purchases.");
  }
  if (low.includes("enemies") || low.includes("enemy health") || low.includes("enemy damage")) {
    tips.push("Enemy density/strength is modified here, so adjust positioning: kite longer on horde maps and preposition for elites.");
  }
  if (low.includes("can't heal")) {
    tips.push("No-heal condition: treat every hit as permanent; armor and dodge become mandatory, not optional.");
  }

  return tips.slice(0, 5);
}

const characterRaw = await readFile(CHARACTER_TEMPLATE_PATH, "utf8");
const weaponRaw = await readFile(WEAPON_TEMPLATE_PATH, "utf8");

const characters = parseCharacterTemplate(characterRaw).map((character) => {
  const startMeta = deriveRecommendedStart(character);
  return {
    ...character,
    ...startMeta,
    statPriority: deriveStatPriority(character),
    strategy: deriveStrategy(character)
  };
});
const weapons = parseWeaponTemplate(weaponRaw);

const data = {
  generatedAt: new Date().toISOString(),
  source: "brotato.wiki.spellsandguns.com templates",
  totals: { characters: characters.length, weapons: weapons.length },
  characters,
  weapons
};

await writeFile(
  new URL("../data/brotato-data.json", import.meta.url),
  JSON.stringify(data, null, 2),
  "utf8"
);

console.log(`Generated ${characters.length} characters and ${weapons.length} weapons.`);
