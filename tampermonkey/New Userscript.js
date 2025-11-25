// ==UserScript==
// @name         New Userscript
// @namespace    http://tampermonkey.net/
// @version      2025-11-13
// @description  try to take over the world!
// @author       You
// @include      /^https://gitea\.btcmap\.org\/teambtcmap\/btcmap-data\/issues\/[0-9]+/
// @icon         https://www.google.com/s2/favicons?sz=64&domain=btcmap.org
// @grant        none
// ==/UserScript==

const getAddress = (bodyHTML) => {
        const regex = /"address":\s*"(?<address>[^"]*)"/;
        const match = bodyHTML.match(regex);
        console.log("match address", match);

        return match?.groups?.address || "";
};

const getMerchant = (bodyHTML) => {
        const regex = /^Name:\s(?<name>.*)/m;
        const match = bodyHTML.match(regex);
        console.log("match name", match);

        return match?.groups?.name || "";
};

const getLatLon = (bodyHTML) => {
        const regex = /#map=[0-9]+\/(?<lat>[0-9.-]+)\/(?<lon>[0-9.-]+)/;
        const match = bodyHTML.match(regex);
        console.log("match", match);

    return match?{lat: match.groups.lat, lon: match.groups.lon}:null;
};

const prependParagraph = (node, paragraphHTML) => {
        const newP = document.createElement("p");
        newP.setAttribute("dir", "auto");

        newP.innerHTML = paragraphHTML;
        return node.parentNode.insertBefore(newP, node);
};

// Robust US Address Parser (single-file, no dependencies)
// Handles: street, unit/suite, city, state, postal code, country.
// Designed for single-line, no-comma addresses like:
// "57556 29 Palms Hwy #105 Yucca Valley CA 92284 US"

function parseUSAddress(input) {
  const tokens = input.trim().split(/\s+/);

  // ---- Extract trailing known components ----
  const country = tokens.pop();                          // e.g., US
  const postal_code = tokens.pop();                      // e.g., 92284
  const state = tokens.pop();                            // e.g., CA

  // ---- Extract city ----
  // City = last contiguous run of alphabetic tokens before state
  let cityTokens = [];
  while (tokens.length && /^[A-Za-z]+$/.test(tokens[tokens.length - 1])) {
    cityTokens.unshift(tokens.pop());
  }
  const city = cityTokens.join(" ");

  // ---- Remaining tokens = street + optional unit ----
  const streetTokens = tokens;

  // USPS unit designators
  const UNIT_DESIGNATORS = new Set([
    '#', 'APT', 'APARTMENT', 'UNIT', 'STE', 'SUITE', 'RM', 'ROOM',
    'BLDG', 'BUILDING', 'FL', 'FLOOR', 'LOT', 'SPACE', 'DEPT',
    'TRL', 'TRLR', 'NO', 'NO.'
  ]);

  let street = "";
  let unit = "";

  // Helper: is this token a unit designator?
  function isUnitDesignator(token) {
    return UNIT_DESIGNATORS.has(token.toUpperCase());
  }

  // Helper: is this a plausible unit number (not a street number)?
  function isLikelyUnitNumber(token) {
    // 10, 105, 2B, #10, A-101 etc.
    return /^#?\d+[A-Za-z-]*$/.test(token);
  }

  // Helper: does this look like a highway or route number?
  function isHighwayContext(i) {
    if (i === 0) return false;
    const prev = streetTokens[i - 1].toUpperCase();
    return ['HWY', 'HIGHWAY', 'ROUTE', 'RT', 'SR', 'CR', 'COUNTY', 'US', 'STATE'].includes(prev);
  }

  // Identify the split point between street name and unit
  let splitIndex = streetTokens.length; // default: no unit

  for (let i = 0; i < streetTokens.length; i++) {
    const t = streetTokens[i];

    // Case 1: Explicit designator → next token is unit
    if (isUnitDesignator(t)) {
      splitIndex = i;
      break;
    }

    // Case 2: "#105"-style token
    if (t.startsWith("#") && t.length > 1) {
      splitIndex = i;
      break;
    }

    // Case 3: trailing unit-like number that is NOT part of a highway
    if (i > 0 && isLikelyUnitNumber(t) && !isHighwayContext(i)) {
      // but allow initial street number
      if (i > 1) {
        splitIndex = i;
        break;
      }
    }
  }

  // Build street and unit
  street = streetTokens.slice(0, splitIndex).join(" ");

  if (splitIndex < streetTokens.length) {
    const unitTokens = streetTokens.slice(splitIndex);

    // Remove explicit designator if present and normalize
    if (isUnitDesignator(unitTokens[0])) {
      unit = unitTokens.slice(1).join(" ");
    } else {
      unit = unitTokens.join(" ");
    }
  }

  return {
    street,
    unit: unit || null,
    city,
    state,
    postal_code,
    country
  };
}

(function() {
    'use strict';
    console.log("Tampermonkey script loaded.");

    const delay = ms => new Promise(res => setTimeout(res, ms));

    async function run() {
        await delay(500); // ensure DOM is rendered

        const content = document.querySelector(".render-content");
        const contentHTML = content.textContent;

        const address = getAddress(contentHTML);
        const latlon = getLatLon(contentHTML);
        const name = getMerchant(contentHTML);

        const {city} = parseUSAddress(address);

        const paragraphs = content.querySelectorAll('p[dir="auto"]');
        let osmParagraph = null;

        for (const p of paragraphs) {
            if (p.textContent.includes("OpenStreetMap viewer link")) {
                osmParagraph = p;
                break;
            }
        }
        if (!osmParagraph) return;

        let gmLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        prependParagraph(osmParagraph,
            `GoogleMaps address link: ` +
            `<a href="${gmLink}" ` +
            `>${gmLink}</a>`);

        gmLink = `https://www.google.com/maps/place/${latlon?.lat},${latlon?.lon}`;
        prependParagraph(osmParagraph,
            `GoogleMaps lat-lon link: ` +
            `<a href="${gmLink}" ` +
            `>${gmLink}</a>`);

        let gLink = `https://www.google.com/search?q=%22${encodeURIComponent(name)}%22%20${encodeURIComponent(city)}`;
        prependParagraph(osmParagraph,
            `Google name and town link: ` +
            `<a href="${gLink}" ` +
            `>${gLink}</a>`);

        const anchors = content.querySelectorAll("a");
        const targets = ["google", "google", "google", "osm_view", "osm_edit", "_blank"];
        for(let i=0; i<targets.length;i++) {
            anchors[i].target = targets[i];
        }
    }

    run();
})();
