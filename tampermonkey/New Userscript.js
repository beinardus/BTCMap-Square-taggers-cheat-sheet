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

const API_URL = "https://dutchbtc.ddns.net/square-address/split";

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

async function parseUSAddress(input) {
    if (!input || typeof input !== "string") return null;

    try {
        const resp = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: input.trim() })
        });

        if (!resp.ok) {
            console.error("Address API error:", resp.status, resp.statusText);
            return null;
        }

        const data = await resp.json();

        // Map API output to original field names
        return data;
    } catch (err) {
        console.error("Failed to call address API:", err);
        return null;
    }
}

function createLink(label, href) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.textContent = label;
    return a;
}

function addressCodeBlock(address_data) {
    const table = document.createElement("table");

    for (const [key, value] of Object.entries(address_data)) {
        const tr = document.createElement("tr");

        const tdKey = document.createElement("td");
        tdKey.textContent = key;

        const tdVal = document.createElement("td");
        tdVal.textContent = value;

        tr.append(tdKey, tdVal);
        table.append(tr);
    }

    return table; // a real DOM node
}

function buildNewContent({ address, latlon, name, address_data }) {
    const frag = document.createDocumentFragment();

    const wrap = el => {
        const p = document.createElement("p");
        p.setAttribute("dir", "auto");
        p.append(el);
        return p;
    };

    // --- Title ---
    const h = document.createElement("h2");
    h.textContent = "Extracted Information";
    frag.append(h);

    // --- Address code block ---
    if (address_data) {
        const block = addressCodeBlock(address_data);
        frag.append(block);
    }

    // --- Google Maps (address) ---
    const gmAddressUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    frag.append(wrap(createLink("Google Maps (address)", gmAddressUrl)));

    // --- Google Search (name + town) ---
    if (address_data?.["addr:city"]) {
        const gQuery = `https://www.google.com/search?q=%22${encodeURIComponent(name)}%22%20${encodeURIComponent(address_data["addr:city"])}`;
        frag.append(wrap(createLink("Google Search (name & city)", gQuery)));
    }

    // --- Google Maps (lat/lon) ---
    if (latlon?.lat && latlon?.lon) {
        const gmLL = `https://www.google.com/maps/place/${latlon.lat},${latlon.lon}`;
        frag.append(wrap(createLink("Google Maps (lat/lon)", gmLL)));
    }

    // --- OSM ---
    if (latlon?.lat && latlon?.lon) {
        const osmEditor = `https://www.openstreetmap.org/edit#map=21/${latlon.lat}/${latlon.lon}`;
        frag.append(wrap(createLink("OpenStreetMap editor", osmEditor)));
    }

    return frag;
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

        const address_data = await parseUSAddress(address);
        console.log(address_data);

        // TODO: construct totally new content but preserve the first 2 paragraphs
        const preserved = document.createDocumentFragment();        
            [...content.querySelectorAll("p")].slice(0,3).forEach(p => {
                preserved.append(p.cloneNode(true)); // deep clone
            });

        const newContent = buildNewContent({ address, latlon, name, address_data });

        const frag = document.createDocumentFragment();
        frag.append(preserved);
        frag.append(newContent);
        content.replaceChildren(frag);

        {
            const combo = document.querySelector(".issue-sidebar-combo[data-update-url*='/labels?']");
            const anchorsAll = combo.querySelectorAll("a");

            // keep essential labels to pick from (added, rejected, pending), and labels already selected
            const essentialLabels = ["1334", "1333", "1335"];
            const anchorsSelected = combo.querySelectorAll(".labels-list a");
            const keepLabelIds = [...essentialLabels, ...[...anchorsSelected].map(a => a.href.match(/labels=(\d+)/)?.[1])];

            for (const anchor of anchorsAll) {
                const dataValue = anchor.getAttribute("data-value");
                if (dataValue && !keepLabelIds.includes(dataValue)) {
                    anchor.remove();
                }
            }
        }
    }

    run();
})();
