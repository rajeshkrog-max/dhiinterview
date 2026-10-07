/* DhiRise · brand glyphs for the round share buttons (same artwork and classes as the Founding Card's row in js/card.js;
   styled by .fs / .fs-ico / .fs-fill / .fs-stroke in css/card.css). DhiShareIcons.button(id, label, href) builds one. */
(function (root) {
  "use strict";
  var SVG = {
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fs-fill" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="fsIgGrad" x1="0" y1="1" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#F58529"/><stop offset=".5" stop-color="#DD2A7B"/><stop offset="1" stop-color="#8134AF"/></linearGradient></defs>' +
        '<rect class="fs-stroke" x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle class="fs-stroke" cx="12" cy="12" r="4.4"/>' +
        '<circle class="fs-fill" cx="17.4" cy="6.6" r="1.25"/></svg>',
    fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fs-fill" d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>'
  };
  /* <a target="_blank" rel="noopener"> when there is a link, else a <button> */
  function button(id, label, href) {
    var node = document.createElement(href ? "a" : "button");
    node.className = "fs fs-" + id;
    if (href) { node.href = href; node.target = "_blank"; node.rel = "noopener"; } else node.type = "button";
    node.setAttribute("aria-label", "Share on " + label);
    var ico = document.createElement("span"); ico.className = "fs-ico"; ico.innerHTML = SVG[id];
    var lab = document.createElement("span"); lab.className = "fs-label"; lab.textContent = label;
    node.appendChild(ico); node.appendChild(lab);
    return node;
  }
  root.DhiShareIcons = { svg: SVG, button: button };
})(window);
