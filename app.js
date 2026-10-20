(function () {
  "use strict";

  var MENU = window.COFFEELLA_MENU || [];

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function icon(id, cls) {
    return '<svg class="' + (cls || "") + '" aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  }

  function fmt(n) { return Number(n).toLocaleString("en-US"); }

  function priceHTML(p) {
    return Array.isArray(p)
      ? fmt(p[0]) + "<small>–</small>" + fmt(p[1])
      : fmt(p);
  }

  function priceLabel(p) {
    return Array.isArray(p)
      ? "من " + fmt(p[0]) + " إلى " + fmt(p[1]) + " دينار"
      : fmt(p) + " دينار";
  }

  function countItems(cat) {
    return cat.groups.reduce(function (n, g) { return n + g.items.length; }, 0);
  }

  function itemsLabel(n) {
    if (n === 1) return "صنف واحد";
    if (n === 2) return "صنفان";
    if (n <= 10) return n + " أصناف";
    return n + " صنفاً";
  }

  // توحيد النص للبحث: إزالة التشكيل وتوحيد الألف والتاء المربوطة والياء
  function norm(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ًͯ-ٰٟـ]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function highlight(text, q) {
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
  }

  // ---------- render: category cards ----------
  var catsEl = $("#cats");
  catsEl.innerHTML = MENU.map(function (cat) {
    var hasPhoto = !!cat.photo;
    return (
      '<a class="cat' + (hasPhoto ? " cat--photo" : "") + '" href="#' + cat.id + '"' +
        (hasPhoto
          ? " style=\"--photo:url('" + esc(cat.photo) + "')" + (cat.focus ? ";--focus:" + esc(cat.focus) : "") + "\""
          : "") + ">" +
        '<span class="cat__count">' + itemsLabel(countItems(cat)) + "</span>" +
        icon(cat.icon, "cat__icon") +
        '<span class="cat__label">' +
          '<span class="cat__ar">' + esc(cat.ar) + "</span>" +
          '<span class="cat__en" lang="en">' + esc(cat.en) + "</span>" +
        "</span>" +
      "</a>"
    );
  }).join("");

  // ---------- render: tabs ----------
  var tabsEl = $("#tabs");
  tabsEl.innerHTML = MENU.map(function (cat) {
    return '<button type="button" class="tab" data-target="' + cat.id + '">' +
      icon(cat.icon) + "<span>" + esc(cat.ar) + "</span></button>";
  }).join("");

  // ---------- render: sections ----------
  var sectionsEl = $("#sections");
  sectionsEl.innerHTML = MENU.map(function (cat) {
    return (
      '<section class="section" id="' + cat.id + '" aria-labelledby="h-' + cat.id + '">' +
        '<header class="section__head">' +
          '<span class="section__icon">' + icon(cat.icon) + "</span>" +
          '<h2 class="section__title" id="h-' + cat.id + '">' + esc(cat.ar) +
            '<span class="section__en" lang="en">' + esc(cat.en) + "</span></h2>" +
        "</header>" +
        cat.groups.map(function (g) {
          return (
            '<div class="group">' +
              '<h3 class="group__head">' + esc(g.ar) + ' <span class="group__en" lang="en">' + esc(g.en) + "</span></h3>" +
              '<ul class="items">' +
                g.items.map(function (it) {
                  return (
                    '<li class="item">' +
                      '<span class="item__names">' +
                        '<span class="item__ar">' + esc(it.ar) + "</span>" +
                        '<span class="item__en" lang="en" dir="ltr">' + esc(it.en) + "</span>" +
                      "</span>" +
                      '<span class="item__leader" aria-hidden="true"></span>' +
                      '<span class="item__price" dir="ltr" aria-label="' + esc(priceLabel(it.price)) + '">' + priceHTML(it.price) + "</span>" +
                    "</li>"
                  );
                }).join("") +
              "</ul>" +
            "</div>"
          );
        }).join("") +
      "</section>"
    );
  }).join("");

  // ---------- index for search ----------
  var index = MENU.map(function (cat) {
    var secEl = document.getElementById(cat.id);
    var groupEls = secEl.querySelectorAll(".group");
    return {
      id: cat.id,
      el: secEl,
      groups: cat.groups.map(function (g, gi) {
        var gEl = groupEls[gi];
        var itemEls = gEl.querySelectorAll(".item");
        var ctx = [cat.ar, cat.en, g.ar, g.en].join(" ");
        return {
          el: gEl,
          items: g.items.map(function (it, ii) {
            var el = itemEls[ii];
            return {
              data: it,
              el: el,
              arEl: el.querySelector(".item__ar"),
              enEl: el.querySelector(".item__en"),
              key: norm(it.ar + " " + it.en + " " + ctx)
            };
          })
        };
      })
    };
  });

  // ---------- search ----------
  var searchEl = $("#search");
  var clearEl = $("#searchClear");
  var emptyEl = $("#empty");
  var emptyQ = $("#emptyQuery");

  function applyFilter(raw) {
    var q = raw.trim();
    var tokens = norm(q).split(" ").filter(Boolean);
    var total = 0;

    index.forEach(function (sec) {
      var secCount = 0;
      sec.groups.forEach(function (g) {
        var gCount = 0;
        g.items.forEach(function (it) {
          var show = tokens.every(function (t) { return it.key.indexOf(t) !== -1; });
          it.el.hidden = !show;
          if (show) {
            gCount++;
            it.arEl.innerHTML = highlight(it.data.ar, q);
            it.enEl.innerHTML = highlight(it.data.en, q);
          }
        });
        g.el.hidden = gCount === 0;
        secCount += gCount;
      });
      sec.el.hidden = secCount === 0;
      var tab = tabsEl.querySelector('[data-target="' + sec.id + '"]');
      if (tab) tab.disabled = secCount === 0;
      total += secCount;
    });

    clearEl.hidden = q.length === 0;
    emptyEl.hidden = total > 0;
    emptyQ.textContent = q;
    updateActive();
  }

  // عند البحث أثناء التمرير لأسفل، أعد العرض إلى بداية النتائج
  var menuEl = $("#menu");
  function scrollToResults() {
    var top = window.scrollY + menuEl.getBoundingClientRect().top +
      parseFloat(getComputedStyle(menuEl).paddingTop) - header.offsetHeight;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: "instant" });
  }

  searchEl.addEventListener("input", function () {
    applyFilter(searchEl.value);
    scrollToResults();
  });
  searchEl.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { resetSearch(); }
  });

  function resetSearch() {
    searchEl.value = "";
    applyFilter("");
  }
  clearEl.addEventListener("click", function () { resetSearch(); searchEl.focus(); });
  $("#emptyReset").addEventListener("click", resetSearch);

  // ---------- sticky offset ----------
  var header = $(".header");
  var toolbar = $(".toolbar");
  function setOffset() {
    var off = header.offsetHeight + toolbar.offsetHeight + 8;
    document.documentElement.style.setProperty("--toolbar-top", header.offsetHeight + "px");
    document.documentElement.style.setProperty("--sticky-offset", off + "px");
    return off;
  }
  var stickyOffset = setOffset();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { stickyOffset = setOffset(); });
  }
  window.addEventListener("resize", function () { stickyOffset = setOffset(); updateActive(); });

  // ---------- tabs click ----------
  tabsEl.addEventListener("click", function (e) {
    var tab = e.target.closest(".tab");
    if (!tab) return;
    var sec = document.getElementById(tab.dataset.target);
    if (sec) sec.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ---------- scroll spy ----------
  var navLinks = document.querySelectorAll(".nav__link");
  var tabs = tabsEl.querySelectorAll(".tab");
  var current = null;

  function updateActive() {
    var active = "top";
    index.forEach(function (sec) {
      if (sec.el.hidden) return;
      if (sec.el.getBoundingClientRect().top <= stickyOffset + 24) active = sec.id;
    });
    if (active === current) return;
    current = active;

    tabs.forEach(function (t) {
      var on = t.dataset.target === active;
      t.classList.toggle("is-active", on);
      if (on) {
        t.setAttribute("aria-current", "true");
        // أبقِ التبويب النشط ظاهراً في الشريط الأفقي على الجوال
        var tr = t.getBoundingClientRect();
        var cr = tabsEl.getBoundingClientRect();
        if (tr.left < cr.left) tabsEl.scrollBy({ left: tr.left - cr.left - 16, behavior: "smooth" });
        else if (tr.right > cr.right) tabsEl.scrollBy({ left: tr.right - cr.right + 16, behavior: "smooth" });
      } else {
        t.removeAttribute("aria-current");
      }
    });
    navLinks.forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("href") === "#" + active);
    });
  }

  // ---------- back to top ----------
  var toTop = $("#toTop");
  toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  // إخفاء الأزرار العائمة أثناء التمرير للأسفل حتى لا تغطي الأسعار
  var ticking = false;
  var lastY = window.scrollY;
  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      updateActive();
      toTop.hidden = y < 700;
      if (Math.abs(y - lastY) > 6) {
        document.body.classList.toggle("is-reading", y > lastY && y > 300);
        lastY = y;
      }
      ticking = false;
    });
  }, { passive: true });

  updateActive();
  $("#year").textContent = new Date().getFullYear();
})();
