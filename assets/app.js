/* DMI 스크랩+ — 서버 없이 도는 화면(2026-10-28 시안 D 적용). 기사 데이터는 data/articles.js(생성기가 만든다).
   담은 폴더·메모·형광펜은 방문자 브라우저(localStorage)에만 저장된다 — 회원가입·서버 저장이 없다. */
(function () {
  "use strict";

  var DATA = window.SCRAP_DATA || { articles: [], generated: "" };
  var ARTICLES = DATA.articles;
  var BY_ID = {};
  ARTICLES.forEach(function (a) { BY_ID[a.id] = a; });

  var CATEGORIES = ["기술", "정책", "산업"];
  var FIELDS = ["인공지능", "첨단로봇·모빌리티", "차세대 보안·네트워크", "반도체·디스플레이", "첨단바이오",
    "차세대 전지", "우주항공·해양", "혁신·미래소재", "미래에너지·원자력", "양자"];
  var BADGES = ["희토류", "핵심광물", "공급망"];
  var STORE_KEY = "dmi-scrap-books-v1";

  // 분야 아래 세부기술: 생성기가 공식 세부기술 판정 결과(a.subtech)와 분야별 공식 순서(subtech_order)를
  // 넣어 준다(지침/세부기술분류_기준.md). 판정이 안 된 기사는 빈 값 — 그 분야 '전체'에만 나온다.
  var SUBTECH_ORDER = DATA.subtech_order || {};
  ARTICLES.forEach(function (a) { a.sub = a.subtech || ""; });

  var state = {
    q: "", cats: [], fields: [], subs: [], badges: [], month: "", bundle: null, openField: null,
    sort: "new", per: 24, page: 1, selected: {}
  };

  // ── 저장소 (사생활 보호 창 등에서 막혀도 화면은 돌아가야 한다) ──
  var books = loadBooks();
  function loadBooks() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      var v = raw ? JSON.parse(raw) : null;
      if (v && Array.isArray(v.folders)) { v.folders.forEach(function (f) { f.notes = f.notes || {}; }); return v; }
    } catch (e) { /* 저장소를 못 쓰면 이번 방문 동안만 기억한다 */ }
    return { folders: [] };
  }
  function saveBooks() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(books)); } catch (e) { /* 무시 */ }
    renderBookCount();
  }

  // ── 도우미 ──
  var $ = function (s, el) { return (el || document).querySelector(s); };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function hl(text) {
    var t = esc(text);
    var terms = queryTerms();
    if (!terms.length) return t;
    terms.forEach(function (term) {
      var re = new RegExp("(" + esc(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
      t = t.replace(re, "<mark>$1</mark>");
    });
    return t;
  }
  function queryTerms() { return state.q.trim().split(/\s+/).filter(Boolean); }
  function fmtDate(d) {
    if (!d) return "";
    var p = d.split("-");
    var day = new Date(+p[0], +p[1] - 1, +p[2]);
    return p[0] + "." + p[1] + "." + p[2] + "(" + "일월화수목금토"[day.getDay()] + ")";
  }
  function monthLabel(m) { var p = m.split("-"); return p[0] + "년 " + (+p[1]) + "월호"; }
  function uid() { return "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function haystack(a) {
    if (!a._h) {
      a._h = [a.title, a.summary, a.lines.join(" "), a.source, a.category, a.field, a.subfield,
        a.institutions.join(" "), a.badges.join(" ")].join(" ").toLowerCase();
    }
    return a._h;
  }

  // ── 묶음 (차트+의 '추천 묶음') ──
  var BUNDLES = buildBundles();
  function buildBundles() {
    var months = {}, weeks = {};
    ARTICLES.forEach(function (a) {
      months[a.month] = (months[a.month] || 0) + 1;
      if (a.week) {
        var w = weeks[a.week.key] || (weeks[a.week.key] = { label: a.week.label, n: 0 });
        w.n++;
      }
    });
    var list = [];
    list.push({ group: "주제 특집", id: "t-supply", label: "희토류·핵심광물·공급망", test: function (a) { return a.badges.length > 0; } });
    list.push({ group: "주제 특집", id: "t-material", label: "혁신·미래소재", test: function (a) { return a.field === "혁신·미래소재"; } });
    list.push({ group: "주제 특집", id: "t-featured", label: "이주의 대표기사", test: function (a) { return a.featured; } });
    Object.keys(months).sort().reverse().forEach(function (m) {
      list.push({ group: "월간호", id: "m-" + m, label: monthLabel(m), test: function (a) { return a.month === m; } });
    });
    Object.keys(weeks).sort().reverse().forEach(function (k) {
      list.push({ group: "주간호", id: "w-" + k, label: weeks[k].label, test: function (a) { return a.week && a.week.key === k; } });
    });
    list.forEach(function (b) { b.n = ARTICLES.filter(b.test).length; });
    return list.filter(function (b) { return b.n > 0; });
  }
  function bundleById(id) { return BUNDLES.filter(function (b) { return b.id === id; })[0] || null; }

  // ── 거르기 ──
  function filtered() {
    var terms = queryTerms().map(function (t) { return t.toLowerCase(); });
    var bundle = state.bundle ? bundleById(state.bundle) : null;
    var list = ARTICLES.filter(function (a) {
      if (bundle && !bundle.test(a)) return false;
      if (state.cats.length && state.cats.indexOf(a.category) < 0) return false;
      if ((state.fields.length || state.subs.length) &&
          state.fields.indexOf(a.field) < 0 && state.subs.indexOf(a.field + "|" + a.sub) < 0) return false;
      if (state.badges.length && !state.badges.every(function (b) { return a.badges.indexOf(b) >= 0; })) return false;
      if (state.month && a.month !== state.month) return false;
      var h = haystack(a);
      return terms.every(function (t) { return h.indexOf(t) >= 0; });
    });
    list.sort(function (x, y) {
      var c = x.date < y.date ? -1 : x.date > y.date ? 1 : 0;
      return state.sort === "new" ? -c : c;
    });
    return list;
  }
  function countBy(key, value, base) {
    return base.filter(function (a) {
      return key === "badges" ? a.badges.indexOf(value) >= 0 : a[key] === value;
    }).length;
  }

  // ── 왼쪽 패널 ──
  function renderSide() {
    var base = ARTICLES;
    var months = Object.keys(ARTICLES.reduce(function (m, a) { m[a.month] = 1; return m; }, {})).sort().reverse();
    var h = "";
    h += group("구분", CATEGORIES.map(function (c) { return chip("cats", c, c, countBy("category", c, base)); }).join(""));
    // 분야를 누르면 그 아래 세부기술이 펼쳐지고, 세부기술(또는 '전체')을 골라 거른다
    h += '<div class="fgroup"><h3>분야</h3><div class="ftree">' + FIELDS.map(function (f) {
      var inField = base.filter(function (a) { return a.field === f; });
      if (!inField.length) return "";
      var open = state.openField === f;
      var picked = state.fields.indexOf(f) >= 0 || state.subs.some(function (v) { return v.indexOf(f + "|") === 0; });
      var out = '<button type="button" class="fhead' + (open ? " open" : "") + (picked ? " picked" : "") + '" data-open-field="' + esc(f) + '" aria-expanded="' + open + '">' +
        "<span>" + esc(f) + '</span><span class="n">' + inField.length + "</span></button>";
      if (open) {
        var subs = (SUBTECH_ORDER[f] || []).concat(["기타"]);
        out += '<div class="chips fsubs">' + chip("fields", f, "전체", inField.length) + subs.map(function (sname) {
          var n = inField.filter(function (a) { return a.sub === sname; }).length;
          return n ? chip("subs", f + "|" + sname, sname, n) : "";
        }).join("") + "</div>";
      }
      return out;
    }).join("") + "</div></div>";
    h += '<div class="fgroup"><h3>발행 월</h3><select id="monthSel"><option value="">전체 기간</option>' +
      months.map(function (m) { return '<option value="' + m + '"' + (state.month === m ? " selected" : "") + ">" + monthLabel(m) + "</option>"; }).join("") +
      "</select></div>";
    h += '<button type="button" class="reset" data-act="reset">조건 모두 지우기</button>';
    $("#pane-topic").innerHTML = h;

    var groups = {};
    BUNDLES.forEach(function (b) { (groups[b.group] = groups[b.group] || []).push(b); });
    $("#pane-bundle").innerHTML = Object.keys(groups).map(function (g) {
      return '<div class="bundle-group"><h3>' + esc(g) + "</h3>" + groups[g].map(function (b) {
        return '<button type="button" class="bundle' + (state.bundle === b.id ? " on" : "") + '" data-bundle="' + b.id + '"><span>' +
          esc(b.label) + '</span><span class="n">' + b.n + "건</span></button>";
      }).join("") + "</div>";
    }).join("");
  }
  function group(title, inner) { return '<div class="fgroup"><h3>' + esc(title) + '</h3><div class="chips">' + inner + "</div></div>"; }
  function chip(key, value, label, n) {
    var on = state[key].indexOf(value) >= 0;
    return '<button type="button" class="chip' + (on ? " on" : "") + '" data-key="' + key + '" data-val="' + esc(value) + '">' +
      esc(label) + '<span class="n">' + n + "</span></button>";
  }

  function renderActiveFilters() {
    var chips = [];
    if (state.q) chips.push(af("q", "", "검색: " + state.q));
    if (state.bundle) { var b = bundleById(state.bundle); if (b) chips.push(af("bundle", "", "묶음: " + b.label)); }
    ["cats", "fields"].forEach(function (k) { state[k].forEach(function (v) { chips.push(af(k, v, v)); }); });
    state.subs.forEach(function (v) { chips.push(af("subs", v, v.split("|")[1])); });
    if (state.month) chips.push(af("month", "", monthLabel(state.month)));
    $("#activeFilters").innerHTML = chips.join("");
  }
  function af(key, val, label) { return '<button type="button" class="af" data-clear="' + key + '" data-val="' + esc(val) + '">' + esc(label) + "</button>"; }

  // ── 카드 목록 ──
  var current = [];
  function render() {
    current = filtered();
    var pages = Math.max(1, Math.ceil(current.length / state.per));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.per;
    var pageItems = current.slice(start, start + state.per);

    $("#total").textContent = current.length;
    $("#pageInfo").textContent = current.length ? "페이지 " + state.page + "/" + pages : "";
    $("#grid").innerHTML = pageItems.length ? pageItems.map(card).join("") :
      '<div class="empty">조건에 맞는 기사가 없습니다. 검색어나 조건을 줄여 보세요.</div>';
    renderPager(pages);
    renderActiveFilters();
    syncSelection();
    // '지금 주목할 기사' 띠는 필터를 골라도 그대로 둔다 — 숨기면 아래 목록이 위로 올라왔다 내려가
    // 필터를 켰다 끌 때마다 스크롤이 튄다(2026-10-29 담당자 지적).
  }
  // 기사 사진은 언론사 저작물이라 쓰지 않는다 — 분야별 색으로 표지를 그린다.
  var HUE = { "인공지능": 262, "첨단로봇·모빌리티": 200, "차세대 보안·네트워크": 228, "반도체·디스플레이": 214,
    "첨단바이오": 150, "차세대 전지": 95, "우주항공·해양": 190, "혁신·미래소재": 280, "미래에너지·원자력": 32,
    "양자": 300, "정책": 222, "산업": 18 };
  function coverOf(a) {
    var key = a.field && HUE[a.field] != null ? a.field : a.category;
    return { hue: HUE[key] != null ? HUE[key] : 220, label: a.field || (a.category === "정책" ? "정책 동향" : "산업 동향") };
  }
  function coverStyle(a, c) {
    return "--h:" + c.hue + (a.image ? ";background-image:url('" + a.image + "')" : "");
  }
  function card(a) {
    var sel = !!state.selected[a.id], c = coverOf(a);
    return '<article class="card' + (sel ? " sel" : "") + '" data-id="' + a.id + '">' +
      '<input class="pick" type="checkbox" aria-label="기사 선택" data-pick="' + a.id + '"' + (sel ? " checked" : "") + ">" +
      '<div class="cover' + (a.image ? " has-img" : "") + '" style="' + coverStyle(a, c) + '" data-open="' + a.id + '">' +
        (a.featured ? '<span class="star">대표기사</span>' : "") +
        '<div class="ov"><h2><button type="button" data-open="' + a.id + '">' + hl(a.title) + "</button></h2></div></div>" +
      '<div class="card-body">' +
        '<div class="card-top"><span class="otag otag-' + esc(a.category) + '">' + esc(a.category) + "</span>" +
        '<span class="lbl">' + esc(c.label) + "</span></div>" +
        '<div class="meta"><span>' + fmtDate(a.date) + " · " + esc(a.source) + "</span>" +
        '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">원문 ↗</a></div>' +
        (a.badges.length ? '<div class="badges">' + a.badges.map(badge).join("") + "</div>" : "") +
      "</div></article>";
  }
  // ── 위쪽 넘겨보기 띠 ──
  var PICK_TABS = [
    { id: "featured", label: "이주의 대표기사", en: "Featured", test: function (a) { return a.featured; } },
    { id: "supply", label: "희토류·공급망", en: "Supply chain", test: function (a) { return a.badges.length > 0; } },
    { id: "material", label: "혁신·미래소재", en: "Materials", test: function (a) { return a.field === "혁신·미래소재"; } },
    { id: "policy", label: "정책 동향", en: "Policy", test: function (a) { return a.category === "정책"; } }
  ];
  var pickTab = "featured";
  function renderPicks() {
    var tab = PICK_TABS.filter(function (t) { return t.id === pickTab; })[0];
    $("#pickTabs").innerHTML = PICK_TABS.map(function (t) {
      var first = ARTICLES.filter(t.test)[0] || {}, c = first.id ? coverOf(first) : { hue: 120 };
      return '<button type="button" class="ptab' + (t.id === pickTab ? " on" : "") + '" data-pick-tab="' + t.id + '">' +
        '<i class="thumb' + (first.image ? " has-img" : "") + '" style="' + coverStyle(first, c) + '"></i>' +
        "<span>" + esc(t.label) + "</span><b>→</b></button>";
    }).join("");
    var items = ARTICLES.filter(tab.test).slice(0, 10);
    $("#pickRow").innerHTML = items.map(function (a) {
      var c = coverOf(a);
      return '<button type="button" class="tile' + (a.image ? " has-img" : "") + '" style="' + coverStyle(a, c) + '" data-open="' + a.id + '">' +
        '<span class="tile-k">' + esc(a.category) + (a.field ? " · " + esc(a.field) : "") + "</span>" +
        '<span class="tile-t">' + esc(a.title) + "</span>" +
        '<span class="tile-m">' + fmtDate(a.date) + " · " + esc(a.source) + "</span></button>";
    }).join("");
    $("#pickRow").scrollLeft = 0;
    syncDots();
  }
  // 점 대신 가는 진행 막대 — 보이는 구간만큼 채운다.
  function syncDots() {
    var row = $("#pickRow"), bar = $("#pickBar");
    var max = row.scrollWidth - row.clientWidth;
    var ratio = row.scrollWidth ? row.clientWidth / row.scrollWidth : 1;
    var pos = max > 0 ? row.scrollLeft / max : 0;
    bar.style.width = (ratio * 100) + "%";
    bar.style.transform = "translateX(" + (pos * (1 / ratio - 1) * 100) + "%)";
  }
  function badge(b) { return '<span class="badge badge-' + esc(b) + '">#' + esc(b) + "</span>"; }
  function renderPager(pages) {
    if (pages <= 1) { $("#pager").innerHTML = ""; return; }
    var p = state.page, h = "";
    var from = Math.max(1, Math.min(p - 4, pages - 9)), to = Math.min(pages, from + 9);
    h += '<button type="button" data-page="' + (p - 1) + '"' + (p === 1 ? " disabled" : "") + ' aria-label="이전">‹</button>';
    for (var i = from; i <= to; i++) h += '<button type="button" data-page="' + i + '"' + (i === p ? ' class="on"' : "") + ">" + i + "</button>";
    h += '<button type="button" data-page="' + (p + 1) + '"' + (p === pages ? " disabled" : "") + ' aria-label="다음">›</button>';
    $("#pager").innerHTML = h;
  }
  function selectedIds() { return Object.keys(state.selected); }
  function syncSelection() {
    var n = selectedIds().length;
    var btn = $("#saveSel");
    btn.disabled = n === 0;
    btn.textContent = n ? "폴더 저장 (" + n + ")" : "폴더 저장";
    var onPage = Array.prototype.map.call(document.querySelectorAll("[data-pick]"), function (el) { return el.getAttribute("data-pick"); });
    $("#selAll").checked = onPage.length > 0 && onPage.every(function (id) { return state.selected[id]; });
  }

  // ── 기사 상세 ──
  function openArticle(id) {
    var a = BY_ID[id];
    if (!a) return;
    var dl = "";
    dl += "<dt>날짜</dt><dd>" + fmtDate(a.date) + "</dd>";
    dl += "<dt>보도기관</dt><dd>" + esc(a.source) + "</dd>";
    if (a.field) dl += "<dt>분야</dt><dd>" + esc(a.field) + "</dd>";
    if (a.subfield) dl += "<dt>세부분야</dt><dd>" + esc(a.subfield) + "</dd>";
    if (a.institutions.length) dl += "<dt>관련기관</dt><dd>" + esc(a.institutions.join(" · ")) + "</dd>";
    if (a.week) dl += "<dt>수록</dt><dd>" + esc(a.week.label) + "</dd>";
    showDialog(
      '<button type="button" class="x" data-act="close" aria-label="닫기">×</button>' +
      '<div class="card-top"><span class="cat cat-' + esc(a.category) + '">' + esc(a.category) + "</span>" +
      (a.featured ? '<span class="star">★ 대표기사</span>' : "") + "</div>" +
      "<h2>" + esc(a.title) + "</h2>" +
      (a.badges.length ? '<div class="badges">' + a.badges.map(badge).join("") + "</div>" : "") +
      (a.lines.length ? '<ul class="lines">' + a.lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" :
        '<p class="lines">' + esc(a.summary) + "</p>") +
      "<dl>" + dl + "</dl>" +
      '<div class="row"><a class="btn" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>' +
      '<button type="button" class="btn primary" data-save-one="' + a.id + '">폴더에 담기</button></div>'
    );
  }

  // ── 폴더 저장 (차트+ STEP 02) ──
  function openSave(ids) {
    var folders = books.folders;
    var list = folders.map(function (f, i) {
      return '<label><input type="radio" name="fold" value="' + f.id + '"' + (i === folders.length - 1 ? " checked" : "") + ">" +
        esc(f.name) + '<span class="n">' + f.items.length + "건</span></label>";
    }).join("");
    showDialog(
      '<button type="button" class="x" data-act="close" aria-label="닫기">×</button>' +
      "<h2>저장할 폴더 선택</h2><p class=\"muted\">기사 " + ids.length + "건을 담습니다. 담은 기사는 ‘내 스크랩북’에서 폴더별로 볼 수 있습니다.</p>" +
      '<div class="folder-pick">' + list +
      '<label><input type="radio" name="fold" value="__new"' + (folders.length ? "" : " checked") + '>새 폴더 만들기</label></div>' +
      '<div class="field" id="newFolder"' + (folders.length ? " hidden" : "") + '><span>새 폴더 이름</span>' +
      '<input id="newName" maxlength="40" placeholder="예: 핵심광물 공급망 동향"></div>' +
      '<div class="row"><button type="button" class="btn" data-act="close">취소</button>' +
      '<button type="button" class="btn primary" data-act="do-save">저장</button></div>'
    );
    $("#dialog").setAttribute("data-ids", ids.join(","));
    var radios = document.querySelectorAll('input[name="fold"]');
    Array.prototype.forEach.call(radios, function (r) {
      r.addEventListener("change", function () { $("#newFolder").hidden = r.value !== "__new" || !r.checked; });
    });
    if (!folders.length) $("#newName").focus();
  }
  function doSave() {
    var ids = ($("#dialog").getAttribute("data-ids") || "").split(",").filter(Boolean);
    var pick = $('input[name="fold"]:checked');
    var folder;
    if (!pick || pick.value === "__new") {
      var name = ($("#newName").value || "").trim() || "새 스크랩북";
      folder = { id: uid(), name: name, desc: "", items: [], notes: {}, created: new Date().toISOString().slice(0, 10) };
      books.folders.push(folder);
    } else {
      folder = books.folders.filter(function (f) { return f.id === pick.value; })[0];
    }
    var added = 0;
    ids.forEach(function (id) { if (BY_ID[id] && folder.items.indexOf(id) < 0) { folder.items.push(id); added++; } });
    saveBooks();
    state.selected = {};
    closeDialog();
    render();
    toast("‘" + folder.name + "’에 " + added + "건 담았습니다" + (added < ids.length ? " (이미 있던 " + (ids.length - added) + "건 제외)" : ""));
  }

  // ── 내 스크랩북: 폴더를 열면 담은 기사가 카드 그대로 모여 있고, 폴더·기사마다 메모와 형광펜을 남긴다 ──
  var openFolderId = null;
  function folderById(id) { return books.folders.filter(function (x) { return x.id === id; })[0] || null; }
  function noteOf(f, id) {
    f.notes = f.notes || {};
    return f.notes[id] || (f.notes[id] = { memo: "", hl: [] });
  }
  function linesOf(a) { return a.lines.length ? a.lines : [a.summary]; }
  // 형광펜 구간([줄, 시작, 끝])을 그 줄 글자 위에 덧칠한다.
  function paintLine(text, ranges) {
    if (!ranges.length) return esc(text);
    var out = "", pos = 0;
    ranges.slice().sort(function (x, y) { return x[0] - y[0]; }).forEach(function (r) {
      if (r[0] < pos) return;
      out += esc(text.slice(pos, r[0])) + '<mark class="hlp" title="눌러서 지우기" data-unhl="' + r[0] + '">' + esc(text.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    return out + esc(text.slice(pos));
  }
  function scrapCard(f, a) {
    var c = coverOf(a), n = noteOf(f, a.id);
    var lines = linesOf(a).map(function (l, i) {
      var rs = n.hl.filter(function (h) { return h[0] === i; }).map(function (h) { return [h[1], h[2]]; });
      return '<li data-line="' + i + '">' + paintLine(l, rs) + "</li>";
    }).join("");
    return '<article class="card scrap" data-id="' + a.id + '">' +
      '<div class="cover' + (a.image ? " has-img" : "") + '" style="' + coverStyle(a, c) + '" data-open="' + a.id + '">' +
        (a.featured ? '<span class="star">대표기사</span>' : "") +
        '<div class="ov"><h2><button type="button" data-open="' + a.id + '">' + esc(a.title) + "</button></h2></div></div>" +
      '<div class="card-body">' +
        '<div class="card-top"><span class="otag otag-' + esc(a.category) + '">' + esc(a.category) + "</span>" +
        '<span class="lbl">' + esc(c.label) + "</span></div>" +
        '<div class="meta"><span>' + fmtDate(a.date) + " · " + esc(a.source) + "</span>" +
        '<a href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">원문 ↗</a></div>' +
        '<ul class="scrap-lines" data-hl-for="' + a.id + '">' + lines + "</ul>" +
        '<textarea class="scrap-memo" data-memo-item="' + a.id + '" rows="2" maxlength="500" placeholder="메모">' + esc(n.memo) + "</textarea>" +
        '<button type="button" class="scrap-out" data-remove="' + f.id + "|" + a.id + '">폴더에서 빼기</button>' +
      "</div></article>";
  }
  function renderBook() {
    if (openFolderId && !folderById(openFolderId)) openFolderId = null;
    if (!openFolderId && books.folders.length) openFolderId = books.folders[books.folders.length - 1].id;
    var f = folderById(openFolderId);
    var side = books.folders.map(function (x) {
      return '<button type="button" class="bk-folder' + (x.id === openFolderId ? " on" : "") + '" data-open-folder="' + x.id + '">' +
        "<span>" + esc(x.name) + '</span><span class="n">' + x.items.length + "</span></button>";
    }).join("");
    var main;
    if (!f) {
      main = '<div class="empty">아직 만든 폴더가 없습니다.<br>기사 카드 오른쪽 위 칸을 눌러 고른 뒤 ‘폴더 저장’을 누르면 여기 모입니다.</div>';
    } else {
      var items = f.items.map(function (id) { return BY_ID[id]; }).filter(Boolean);
      main = '<div class="bk-head">' +
          '<input class="bk-name" data-folder-name="' + f.id + '" maxlength="40" value="' + esc(f.name) + '" aria-label="폴더 이름">' +
          '<div class="bk-meta">기사 ' + items.length + "건 · " + esc(f.created) + " 만듦" +
          '<button type="button" class="bk-del" data-del-folder="' + f.id + '">폴더 삭제</button></div>' +
        "</div>" +
        '<label class="bk-memo"><span>이 폴더를 모은 이유</span>' +
          '<textarea data-memo-folder="' + f.id + '" rows="3" maxlength="1000" placeholder="예: 11월 핵심광물 대응 회의 준비 — 국내 기업 공급망 다변화 사례 모음">' + esc(f.desc) + "</textarea></label>" +
        '<p class="bk-tip">요약 문장을 드래그하면 <mark class="hlp">형광펜</mark>을 칠할 수 있고, 칠한 곳을 누르면 지워집니다.</p>' +
        (items.length ? '<div class="grid scrap-grid">' + items.map(function (a) { return scrapCard(f, a); }).join("") + "</div>" :
          '<div class="empty">이 폴더는 비어 있습니다.</div>');
    }
    $("#bookView").innerHTML =
      '<div class="bk-bar"><div class="wrap bk-bar-in"><button type="button" class="bk-back" data-act="close-book">← 기사 목록으로</button>' +
      "<b>내 스크랩북</b><span class=\"bk-note\">이 브라우저에 자동 저장됩니다</span></div></div>" +
      '<div class="wrap bk-layout"><aside class="bk-side"><p class="sec-k">Folders</p>' + side +
      '<button type="button" class="bk-new" data-act="new-folder">+ 새 폴더</button></aside>' +
      '<section class="bk-main">' + main + "</section></div>";
  }
  function openBook(id) {
    if (id) openFolderId = id;
    renderBook();
    $("#bookView").hidden = false;
    document.body.classList.add("book-open");
    $("#bookView").scrollTop = 0;
  }
  function closeBook() {
    $("#bookView").hidden = true;
    document.body.classList.remove("book-open");
    hideHlBtn();
    render();
  }

  // 형광펜: 요약 한 줄 안에서 고른 글자 구간을 저장한다(줄을 넘는 선택은 그 줄 끝까지만).
  var pendingHl = null;
  function lineOffset(li, node, off) {
    var r = document.createRange();
    r.selectNodeContents(li);
    r.setEnd(node, off);
    return r.toString().length;
  }
  function onSelectEnd() {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return hideHlBtn();
    var rg = sel.getRangeAt(0);
    var startEl = rg.startContainer.nodeType === 1 ? rg.startContainer : rg.startContainer.parentNode;
    var li = startEl.closest && startEl.closest(".scrap-lines li");
    if (!li) return hideHlBtn();
    var text = li.textContent;
    var s = lineOffset(li, rg.startContainer, rg.startOffset);
    var e = li.contains(rg.endContainer) ? lineOffset(li, rg.endContainer, rg.endOffset) : text.length;
    if (e - s < 1) return hideHlBtn();
    pendingHl = { id: li.parentNode.getAttribute("data-hl-for"), line: +li.getAttribute("data-line"), s: s, e: e };
    var box = rg.getBoundingClientRect(), btn = $("#hlBtn");
    btn.hidden = false;
    btn.style.left = Math.max(8, Math.min(window.innerWidth - 90, box.left + box.width / 2 - 40)) + "px";
    btn.style.top = Math.max(8, box.top - 44) + "px";
  }
  function hideHlBtn() { pendingHl = null; var b = $("#hlBtn"); if (b) b.hidden = true; }
  function applyHl() {
    var f = folderById(openFolderId);
    if (!f || !pendingHl) return hideHlBtn();
    var n = noteOf(f, pendingHl.id), L = pendingHl.line, s = pendingHl.s, e = pendingHl.e;
    // 겹치는 구간은 하나로 합친다
    var keep = [];
    n.hl.forEach(function (h) {
      if (h[0] === L && h[1] <= e && h[2] >= s) { s = Math.min(s, h[1]); e = Math.max(e, h[2]); }
      else keep.push(h);
    });
    keep.push([L, s, e]);
    n.hl = keep;
    saveBooks();
    window.getSelection().removeAllRanges();
    hideHlBtn();
    renderBook();
  }
  function removeHl(markEl) {
    var f = folderById(openFolderId);
    var li = markEl.closest("li"), ul = markEl.closest(".scrap-lines");
    if (!f || !li || !ul) return;
    var n = noteOf(f, ul.getAttribute("data-hl-for")), L = +li.getAttribute("data-line"), s = +markEl.getAttribute("data-unhl");
    n.hl = n.hl.filter(function (h) { return !(h[0] === L && h[1] === s); });
    saveBooks();
    renderBook();
  }
  function newFolder() {
    var f = { id: uid(), name: "새 폴더", desc: "", items: [], notes: {}, created: new Date().toISOString().slice(0, 10) };
    books.folders.push(f);
    saveBooks();
    openFolderId = f.id;
    renderBook();
    var inp = $(".bk-name");
    if (inp) { inp.focus(); inp.select(); }
  }

  // ── 이용 안내 ──
  function openAbout() {
    showDialog(
      '<button type="button" class="x" data-act="close" aria-label="닫기">×</button><div class="about"><h2>이용 안내</h2>' +
      "<p>DMI 스크랩+는 한국재료연구원 소재혁신선도본부가 매주 고르는 국내 소재·부품·장비(소·부·장) 주요 기사를 모아 둔 곳입니다. 주간 뉴스레터 「KIMS · DMI WEEKLY BRIEF」에 실린 기사를 바탕으로 합니다.</p>" +
      "<h3>이렇게 쓰세요</h3><p><b>① 찾기</b> 검색창이나 왼쪽의 구분과 분야(누르면 세부기술이 펼쳐집니다)로 기사를 찾습니다. ‘묶음으로 찾기’에서는 월간호·주간호·주제 특집을 한 번에 볼 수 있습니다.<br>" +
      "<b>② 담기</b> 카드 오른쪽 위 칸을 눌러 고른 뒤 ‘폴더 저장’으로 폴더에 담습니다.<br>" +
      "<b>③ 스크랩북</b> ‘내 스크랩북’에서 폴더를 열면 담은 기사가 카드로 모여 있습니다. 폴더를 모은 이유와 기사별 메모를 적고, 요약 문장에 형광펜을 칠해 둘 수 있습니다.</p>" +
      "<h3>저장에 대해</h3><p>담은 폴더·메모·형광펜은 지금 쓰는 브라우저에 자동 저장되어, 다시 들어와도 그대로 있습니다. 회원가입이 없고 어떤 정보도 서버로 보내지 않습니다. 다른 기기에서는 보이지 않으며, 브라우저 기록을 지우면 함께 지워집니다.</p>" +
      "<h3>출처와 요약</h3><p>기사 저작권은 각 언론사·기관에 있습니다. 이 사이트는 제목·원문 링크와 본부가 작성한 요약·분류만 제공합니다. 요약은 AI의 도움을 받아 작성하고 담당자가 검수했으나, 정확한 내용은 반드시 원문을 확인하세요.</p>" +
      '<p class="muted">데이터 갱신: ' + esc(DATA.generated) + "</p></div>"
    );
  }

  // ── 팝업 공통 ──
  var lastFocus = null;
  function showDialog(html) {
    lastFocus = document.activeElement;
    $("#dialog").innerHTML = html;
    $("#layer").hidden = false;
    var first = $("#dialog").querySelector("input, button:not(.x), a");
    if (first) first.focus();
  }
  function closeDialog() {
    $("#layer").hidden = true;
    $("#dialog").innerHTML = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderBookCount() {
    $("#bookCount").textContent = books.folders.length;  // 폴더 개수
  }

  function rerender(resetPage) {
    if (resetPage) state.page = 1;
    renderSide();
    render();
  }

  // ── 이벤트 ──
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act],[data-key],[data-bundle],[data-clear],[data-page],[data-open],[data-save-one],[data-open-field],[data-open-folder],[data-del-folder],[data-remove],[data-tab],[data-unhl],#hlBtn");
    if (!t) {
      if (e.target === $("#layer")) closeDialog();
      return;
    }
    var act = t.getAttribute("data-act");
    if (act === "home") { e.preventDefault(); resetAll(); return; }
    if (act === "about") return openAbout();
    if (act === "open-books") return openBook();
    if (act === "close-book") return closeBook();
    if (act === "new-folder") return newFolder();
    if (act === "close") return closeDialog();
    if (act === "save-selected") return openSave(selectedIds());
    if (act === "do-save") return doSave();
    if (act === "reset") return resetAll();
    if (act === "toggle-side") { $("#side").classList.toggle("open"); return; }

    if (t.hasAttribute("data-tab")) {
      var tab = t.getAttribute("data-tab");
      document.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("on", b === t); });
      $("#pane-topic").hidden = tab !== "topic";
      $("#pane-bundle").hidden = tab !== "bundle";
      return;
    }
    if (t.hasAttribute("data-key")) {
      var key = t.getAttribute("data-key"), val = t.getAttribute("data-val");
      var arr = state[key], i = arr.indexOf(val);
      if (i >= 0) arr.splice(i, 1); else arr.push(val);
      return rerender(true);
    }
    if (t.hasAttribute("data-open-field")) {
      var of = t.getAttribute("data-open-field");
      state.openField = state.openField === of ? null : of;
      return renderSide();
    }
    if (t.hasAttribute("data-bundle")) {
      var id = t.getAttribute("data-bundle");
      state.bundle = state.bundle === id ? null : id;
      return rerender(true);
    }
    if (t.hasAttribute("data-clear")) {
      var k = t.getAttribute("data-clear"), v = t.getAttribute("data-val");
      if (k === "q") { state.q = ""; $("#q").value = ""; }
      else if (k === "bundle") state.bundle = null;
      else if (k === "month") state.month = "";
      else state[k] = state[k].filter(function (x) { return x !== v; });
      return rerender(true);
    }
    if (t.hasAttribute("data-page")) {
      state.page = +t.getAttribute("data-page");
      render();
      document.querySelector(".results").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (t.id === "hlBtn") return applyHl();
    if (t.hasAttribute("data-unhl")) return removeHl(t);
    if (t.hasAttribute("data-open-folder")) { openFolderId = t.getAttribute("data-open-folder"); renderBook(); $("#bookView").scrollTop = 0; return; }
    if (t.hasAttribute("data-open")) return openArticle(t.getAttribute("data-open"));
    if (t.hasAttribute("data-save-one")) return openSave([t.getAttribute("data-save-one")]);
    if (t.hasAttribute("data-del-folder")) {
      var did = t.getAttribute("data-del-folder");
      var f = books.folders.filter(function (x) { return x.id === did; })[0];
      if (f && window.confirm("‘" + f.name + "’ 폴더를 지울까요? 담은 기사·메모·형광펜이 함께 지워집니다.")) {
        books.folders = books.folders.filter(function (x) { return x.id !== did; });
        saveBooks(); renderBook();
      }
      return;
    }
    if (t.hasAttribute("data-remove")) {
      var parts = t.getAttribute("data-remove").split("|");
      var ff = books.folders.filter(function (x) { return x.id === parts[0]; })[0];
      if (ff) { ff.items = ff.items.filter(function (x) { return x !== parts[1]; }); if (ff.notes) delete ff.notes[parts[1]]; saveBooks(); renderBook(); }
    }
  });

  document.addEventListener("click", function (e) {
    var tb = e.target.closest("[data-pick-tab]");
    if (tb) { pickTab = tb.getAttribute("data-pick-tab"); return renderPicks(); }
    var sl = e.target.closest("[data-slide]");
    if (sl) {
      var row = $("#pickRow"), w = row.children[0] ? row.children[0].getBoundingClientRect().width + 16 : 300;
      row.scrollBy({ left: +sl.getAttribute("data-slide") * w * 2, behavior: "smooth" });
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.hasAttribute("data-pick")) {
      var id = t.getAttribute("data-pick");
      if (t.checked) state.selected[id] = true; else delete state.selected[id];
      t.closest(".card").classList.toggle("sel", t.checked);
      return syncSelection();
    }
    if (t.id === "selAll") {
      document.querySelectorAll("[data-pick]").forEach(function (cb) {
        var cid = cb.getAttribute("data-pick");
        cb.checked = t.checked;
        if (t.checked) state.selected[cid] = true; else delete state.selected[cid];
        cb.closest(".card").classList.toggle("sel", t.checked);
      });
      return syncSelection();
    }
    if (t.id === "monthSel") { state.month = t.value; return rerender(true); }
    if (t.id === "sort") { state.sort = t.value; return render(); }
    if (t.id === "per") { state.per = +t.value; state.page = 1; return render(); }
  });

  // 메모는 쓰는 대로 저장한다(다시 그리지 않아 입력이 끊기지 않는다)
  document.addEventListener("input", function (e) {
    var t = e.target, f;
    if (t.hasAttribute("data-memo-folder")) { f = folderById(t.getAttribute("data-memo-folder")); if (f) { f.desc = t.value; saveBooks(); } }
    else if (t.hasAttribute("data-memo-item")) { f = folderById(openFolderId); if (f) { noteOf(f, t.getAttribute("data-memo-item")).memo = t.value; saveBooks(); } }
    else if (t.hasAttribute("data-folder-name")) {
      f = folderById(t.getAttribute("data-folder-name"));
      if (f) { f.name = t.value.trim() || "이름 없는 폴더"; saveBooks(); var b = document.querySelector('[data-open-folder="' + f.id + '"] span'); if (b) b.textContent = f.name; }
    }
  });
  document.addEventListener("mouseup", function (e) {
    if (e.target.id === "hlBtn") return;
    if ($("#bookView").hidden) return;
    setTimeout(onSelectEnd, 0);
  });
  document.addEventListener("touchend", function () { if (!$("#bookView").hidden) setTimeout(onSelectEnd, 250); });
  $("#bookView").addEventListener("scroll", hideHlBtn);

  $("#searchForm").addEventListener("submit", function (e) {
    e.preventDefault();
    state.q = $("#q").value.trim();
    rerender(true);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("#layer").hidden) closeDialog();
    else if (!$("#hlBtn").hidden) hideHlBtn();
    else if (!$("#bookView").hidden) closeBook();
  });

  function resetAll() {
    state.q = ""; state.cats = []; state.fields = []; state.subs = []; state.badges = []; state.month = ""; state.bundle = null;
    $("#q").value = "";
    rerender(true);
  }

  $("#updated").textContent = DATA.generated ? "데이터 갱신 " + DATA.generated + " · 기사 " + ARTICLES.length + "건" : "";
  renderBookCount();
  renderPicks();
  $("#pickRow").addEventListener("scroll", function () { clearTimeout(syncDots.t); syncDots.t = setTimeout(syncDots, 80); });
  rerender(true);
})();
