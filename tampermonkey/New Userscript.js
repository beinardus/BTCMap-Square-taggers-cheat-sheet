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

const prependParagraph = (node, paragraphHTML) => {
        const newP = document.createElement("p");
        newP.setAttribute("dir", "auto");

        newP.innerHTML = paragraphHTML;
        return node.parentNode.insertBefore(newP, node);
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

const addressCodeBlock = (address_data) => {
    const kv = Object.keys(address_data).map(k => `<tr><td>${k}</td><td>${address_data[k]}</td></tr>`).join("\n");
    return `<table>${kv}</table>`;
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

        const paragraphs = content.querySelectorAll('p[dir="auto"]');
        let osmParagraph = null;

        for (const p of paragraphs) {
            if (p.textContent.includes("OpenStreetMap viewer link")) {
                osmParagraph = p;
                break;
            }
        }
        if (!osmParagraph) return;

        if (address_data)
            prependParagraph(osmParagraph, addressCodeBlock(address_data));

        let gmLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        prependParagraph(osmParagraph,
            `GoogleMaps address link: ` +
            `<a href="${gmLink}" ` +
            `>${gmLink}</a>`);

        if (address_data) {
            let gLink = `https://www.google.com/search?q=%22${encodeURIComponent(name)}%22%20${encodeURIComponent(address_data["addr:city"])}`;
            prependParagraph(osmParagraph,
                `Google name and town link: ` +
                `<a href="${gLink}" ` +
                `>${gLink}</a>`);
        }

        gmLink = `https://www.google.com/maps/place/${latlon?.lat},${latlon?.lon}`;
        prependParagraph(osmParagraph,
            `GoogleMaps lat-lon link: ` +
            `<a href="${gmLink}" ` +
            `>${gmLink}</a>`);

        {
            const anchors = content.querySelectorAll("a");
            const targets = ["google", "google", "google", "osm_view", "osm_edit", "_blank"];
            for(let i=0; i<targets.length;i++) {
                anchors[i].target = targets[i];
            }
        }

        {
            const combo = document.querySelector(".issue-sidebar-combo[data-update-url*='/labels?']");
            const anchorsAll = combo.querySelectorAll("a");

            // keep essential labels to pick from (added, rejected, pending), and labels already selected
            const essentialLabels = ["1334", "1333", "1335"];
            const anchorsSelected = combo.querySelectorAll(".labels-list a");
            const keepLabelIds = [...essentialLabels, ...[...anchorsSelected].map(a => a.href.match(/labels=(\d+)/)?.[1])];

            for (const anchor of anchorsAll) {
                const dataValue = anchor.getAttribute("data-value");
                console.log(dataValue);
                if (dataValue && !keepLabelIds.includes(dataValue)) {
                    anchor.remove();
                }
            }
        }

        // remove OSM viewer paragraph
        osmParagraph.remove();
    }

    run();
})();
