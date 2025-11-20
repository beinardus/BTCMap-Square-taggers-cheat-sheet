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
        console.log("match", match);

        return match?.groups?.address || "";
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

(function() {
    'use strict';
    console.log("Tampermonkey script loaded.");

    const delay = ms => new Promise(res => setTimeout(res, ms));

    async function run() {
        await delay(500); // ensure DOM is rendered

        const content = document.querySelector(".render-content");
        const contentHTML = content.innerHTML;

        const address = getAddress(contentHTML);
        const encoded = encodeURIComponent(address);
        console.log("encoded", encoded);

        const latlon = getLatLon(contentHTML);

        const paragraphs = content.querySelectorAll('p[dir="auto"]');
        let osmParagraph = null;

        for (const p of paragraphs) {
            if (p.textContent.includes("OpenStreetMap viewer link")) {
                osmParagraph = p;
                break;
            }
        }
        if (!osmParagraph) return;

        let gmLink = `https://www.google.nl/maps/place/${encoded}`;
        prependParagraph(osmParagraph,
            `GoogleMaps address link: ` +
            `<a href="${gmLink}" ` +
            `>${gmLink}</a>`);

        gmLink = `https://www.google.nl/maps/place/${latlon?.lat},${latlon?.lon}`;
        prependParagraph(osmParagraph,
            `GoogleMaps lat-lon link: ` +
            `<a href="${gmLink}" ` +
            `>${gmLink}</a>`);

        const anchors = content.querySelectorAll("a");
        const targets = ["google", "google", "osm_view", "osm_edit", "_blank"];
        for(let i=0; i<targets.length;i++) {
            anchors[i].target = targets[i];
        }
    }

    run();
})();
