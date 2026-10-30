(function () {
  "use strict";

  // ---- Settings -----------------------------------------------------------

  // Each flavor family prints in one ink, everywhere that flavor appears.
  // Ink names match the [data-ink] rules in styles.css. Listed in ink-chart order.
  var FLAVORS = [
    { tag: "grassy", ink: "leaf" },
    { tag: "vegetal", ink: "leaf" },
    { tag: "citrus", ink: "chrome" },
    { tag: "stone fruit", ink: "chrome" },
    { tag: "floral", ink: "vermilion" },
    { tag: "spiced", ink: "vermilion" },
    { tag: "smoky", ink: "indigo" },
    { tag: "mineral", ink: "indigo" },
    { tag: "earthy", ink: "umber" },
    { tag: "malty", ink: "umber" },
    { tag: "nutty", ink: "umber" },
    { tag: "creamy", ink: "paper" }
  ];
  var INK_NAME = {
    leaf: "Leaf green", chrome: "Chrome yellow", vermilion: "Vermilion",
    indigo: "Indigo", umber: "Umber", paper: "Unprinted paper"
  };
  var FLAVOR_INK = {};
  FLAVORS.forEach(function (f) { FLAVOR_INK[f.tag] = f.ink; });
  var MAX_FLAVORS = 3;

  var BOLDNESS_TARGET = { delicate: 2, balanced: 3, assertive: 4.5 };

  var CAFFEINE_RANK = { none: 0, low: 1, medium: 2, high: 3 };
  // Highest caffeine level allowed at each time of day.
  var TIME_CAFFEINE_CAP = { morning: 3, afternoon: 2, evening: 1, bed: 0 };
  // "Something soft and quiet" never goes above low caffeine.
  var SOFT_CAFFEINE_CAP = 1;

  var POINTS = {
    perFlavor: 10,
    perIntensityStep: 4,
    moodFit: 5,
    tannicEmptyStomach: 30, // heavy: astringency 4-5 with nothing eaten
    tannicAfterMeal: 8      // astringency 4-5 within an hour of a full meal
  };

  function hasAny(tea, tags) {
    return tea.flavors.some(function (f) { return tags.indexOf(f) !== -1; });
  }

  // Mood is a light nudge: a tea "fits" if it belongs to the family below.
  var MOODS = {
    warming: function (t) {
      return t.type === "puerh" || hasAny(t, ["spiced", "malty", "nutty", "earthy", "smoky"]);
    },
    soft: function (t) { return t.intensity <= 2 && t.astringency <= 2; },
    bracing: function (t) { return t.intensity >= 4 || t.astringency >= 4; },
    clean: function (t) {
      return t.intensity <= 3 &&
        hasAny(t, ["grassy", "citrus", "mineral", "vegetal"]) &&
        !hasAny(t, ["smoky", "earthy", "malty", "spiced"]);
    },
    any: function () { return false; }
  };

  var TYPE_LABEL = {
    green: "Green tea", black: "Black tea", oolong: "Oolong", white: "White tea",
    puerh: "Pu-erh", herbal: "Herbal tisane"
  };

  var CAFFEINE_LABEL = {
    none: "Caffeine-free", low: "Low caffeine", medium: "Moderate caffeine", high: "High caffeine"
  };

  // ---- State --------------------------------------------------------------

  var answers = emptyAnswers();
  var teas = [];

  function emptyAnswers() {
    return { flavors: [], boldness: null, time: null, food: null, ateWhen: null, mood: null };
  }

  // "empty": nothing for a couple of hours. "afterMeal": full meal within the hour.
  function stomach(a) {
    if (a.food === "none") return "empty";
    if (a.ateWhen === "120") return "empty";
    if (a.food === "meal" && (a.ateWhen === "now" || a.ateWhen === "30")) return "afterMeal";
    return "fed";
  }

  function caffeineCap(a) {
    var cap = TIME_CAFFEINE_CAP[a.time];
    if (a.mood === "soft") cap = Math.min(cap, SOFT_CAFFEINE_CAP);
    return cap;
  }

  // ---- Scoring ------------------------------------------------------------

  function evaluate(tea, a) {
    var shared = tea.flavors.filter(function (f) { return a.flavors.indexOf(f) !== -1; });
    var target = BOLDNESS_TARGET[a.boldness];
    var moodFit = MOODS[a.mood](tea);
    var tannic = tea.astringency >= 4;
    var st = stomach(a);

    var penalty = 0;
    if (tannic && st === "empty") penalty = POINTS.tannicEmptyStomach;
    if (tannic && st === "afterMeal") penalty = POINTS.tannicAfterMeal;

    var score = shared.length * POINTS.perFlavor -
      Math.abs(tea.intensity - target) * POINTS.perIntensityStep +
      (moodFit ? POINTS.moodFit : 0) -
      penalty;

    var caf = CAFFEINE_RANK[tea.caffeine];
    var excluded = null;
    if (caf > TIME_CAFFEINE_CAP[a.time]) excluded = "caffeine";
    else if (a.mood === "soft" && caf > SOFT_CAFFEINE_CAP) excluded = "soft";
    else if (shared.length === 0) excluded = "flavor";
    else if (score <= 0) excluded = score + penalty > 0 ? "tannic" : "weak";

    return { tea: tea, shared: shared, score: score, moodFit: moodFit, excluded: excluded };
  }

  // Higher score first; ties go to the gentler tea.
  function compare(x, y) {
    return (y.score - x.score) ||
      (x.tea.astringency - y.tea.astringency) ||
      (x.tea.intensity - y.tea.intensity) ||
      (CAFFEINE_RANK[x.tea.caffeine] - CAFFEINE_RANK[y.tea.caffeine]) ||
      x.tea.name.localeCompare(y.tea.name);
  }

  function recommend(a) {
    var all = teas.map(function (t) { return evaluate(t, a); });
    var qualified = all.filter(function (r) { return !r.excluded; }).sort(compare);
    return { all: all, picks: qualified.slice(0, 3) };
  }

  // ---- Language helpers ---------------------------------------------------

  function list(items, conj) {
    conj = conj || "and";
    if (items.length <= 1) return items.join("");
    if (items.length === 2) return items[0] + " " + conj + " " + items[1];
    return items.slice(0, -1).join(", ") + ", " + conj + " " + items[items.length - 1];
  }

  function article(word) { return /^[aeiou]/i.test(word) ? "an " + word : "a " + word; }

  // Joins clauses that each contain their own verb: "A, and B".
  function clauses(items) {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + ", and " + items[items.length - 1];
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function adj(tag) { return tag === "stone fruit" ? "stone-fruit" : tag; }

  var NUMBER_WORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  function count(n) { return n < NUMBER_WORD.length ? NUMBER_WORD[n] : String(n); }

  var BODY_WORD = { 1: "very light", 2: "light", 3: "medium-bodied", 4: "full-bodied", 5: "heavyweight" };
  var TEXTURE_WORD = { 1: "silky", 2: "smooth", 3: "lightly brisk", 4: "brisk and drying", 5: "grippy and tannic" };

  var TIME_PHRASE = { morning: "this morning", afternoon: "this afternoon", evening: "this evening", bed: "right before bed" };

  function boldnessRelation(tea, a, short) {
    var d = tea.intensity - BOLDNESS_TARGET[a.boldness];
    if (Math.abs(d) <= 0.5) return short ? "right at that strength" : "right at the " + a.boldness + " level you asked for";
    var size = Math.abs(d) <= 1.5 ? "a step" : "noticeably";
    var than = short ? " than that" : " than " + a.boldness;
    return size + (d > 0 ? " bolder" : " gentler") + than;
  }

  function moodClause(r, a) {
    if (!r.moodFit) return null;
    return {
      warming: "it has the warmth you were in the mood for",
      soft: "it is as soft and quiet as you wanted",
      bracing: "it has the bracing edge you were after",
      clean: "it drinks clean and refreshing, the way you wanted"
    }[a.mood] || null;
  }

  function foodClause(tea, a) {
    var st = stomach(a);
    if (st === "empty") {
      var when = a.food === "none" ? "when you haven't eaten" : "when it's been a while since you ate";
      if (tea.astringency <= 2) return "it is smooth rather than tannic, which matters " + when;
      return "it has a little grip, but nothing harsh " + when;
    }
    if (st === "afterMeal") {
      if (tea.astringency <= 2) return "it is gentle on tannins, so it sits easily after the meal you just had";
      if (tea.astringency === 3) return "it isn't tannic enough to fight the meal you just had";
      return "it is on the tannic side, so it's worth letting that meal settle first";
    }
    if (a.food === "meal" && a.ateWhen === "60" && tea.astringency >= 4) {
      return "with your meal an hour behind you, its brisk, tannic edge is welcome";
    }
    return null;
  }

  function caffeineClause(tea, a) {
    var c = tea.caffeine;
    var table = {
      morning: {
        high: "it has the caffeine to match a morning",
        medium: "it brings a moderate amount of caffeine for the morning",
        low: "it is light on caffeine, if you want an easy start",
        none: "it is caffeine-free, so the morning cup is all about flavor"
      },
      afternoon: {
        medium: "its moderate caffeine is about right for the afternoon",
        low: "it stays light on caffeine for the afternoon",
        none: "it is caffeine-free, so it is an easy afternoon cup"
      },
      evening: {
        low: "since it's evening, it keeps the caffeine low",
        none: "since it's evening, this one stays caffeine-free"
      },
      bed: {
        none: "it is caffeine-free, which is the only kind of cup that belongs right before bed"
      }
    };
    return table[a.time][c];
  }

  // ---- Explanations: one structure per rank so the three never read alike --

  // First pick: starts from the person's answers.
  function explainFirst(r, a) {
    var t = r.tea;
    var match;
    if (r.shared.length === a.flavors.length) {
      match = a.flavors.length === 1 ? "exactly that" :
        a.flavors.length === 2 ? "both of those flavors" : "all three of those flavors";
    } else {
      match = "the " + list(r.shared.map(adj)) + " side of that";
    }
    var tail = moodClause(r, a) || foodClause(t, a);
    return "You asked for " + list(a.flavors) + " at " + article(a.boldness) + " strength, and " + t.name +
      " gives you " + match + " in " + article(BODY_WORD[t.intensity]) + " cup " +
      boldnessRelation(t, a, true) + "; " + caffeineClause(t, a) +
      (tail ? ", and " + tail : "") + ".";
  }

  // Second pick: starts from the situation (time of day, caffeine).
  function explainSecond(r, a) {
    var t = r.tea;
    var notes = "the " + list(r.shared.map(adj)) + " " + (r.shared.length > 1 ? "notes" : "note");
    var extra = foodClause(t, a) || moodClause(r, a);
    extra = extra ? ", and " + extra : "";
    switch (a.time) {
      case "morning":
        return "Mornings put every tea on the table, so this came down to taste: " + t.name +
          " has " + notes + " you picked" + extra + "; " + caffeineClause(t, a) + ".";
      case "afternoon":
        var how = { none: "skips caffeine entirely", low: "stays well under that", medium: "sits right at that line" }[t.caffeine];
        return "For the afternoon you can go up to moderate caffeine, and " + t.name + " " + how +
          " while still bringing " + notes + " you picked" + extra + ".";
      case "evening":
        return "It's evening, so caffeine has to stay low — " + t.name + " " +
          (t.caffeine === "none" ? "has none at all" : "keeps it low") +
          " and still brings " + notes + " you were after" + extra + ".";
      default:
        return "Right before bed only caffeine-free cups make the cut, and " + t.name +
          " is one that still carries " + notes + " you asked for" + extra + ".";
    }
  }

  // Third pick: starts from the tea itself.
  function explainThird(r, a) {
    var t = r.tea;
    var missing = a.flavors.filter(function (f) { return r.shared.indexOf(f) === -1; });
    var angle;
    if (missing.length) {
      angle = "leans " + list(r.shared.map(adj)) + " rather than " + list(missing.map(adj), "or");
    } else if (a.flavors.length === 1) {
      angle = "is a different take on " + adj(a.flavors[0]);
    } else {
      angle = "covers " + list(r.shared.map(adj)) + " as well";
    }
    var parts = [];
    var food = foodClause(t, a);
    var mood = moodClause(r, a);
    if (food) parts.push(food.replace(/^it is /, "it's "));
    if (mood && !parts.length) parts.push(mood);
    if (a.time === "evening" || a.time === "bed") {
      parts.push(t.caffeine === "none" ? "there's no caffeine in it" : "there's only a little caffeine in it");
    }
    if (!parts.length) parts.push("it lands " + boldnessRelation(t, a));
    return cap(BODY_WORD[t.intensity]) + " and " + TEXTURE_WORD[t.astringency] + ", " + t.name +
      " " + angle + " — " + clauses(parts) + ".";
  }

  var EXPLAINERS = [explainFirst, explainSecond, explainThird];

  // ---- Short-list explanation ---------------------------------------------

  function shortListNote(result, a) {
    var n = result.picks.length;
    var flavorMatches = result.all.filter(function (r) { return r.shared.length > 0; });
    var tally = { caffeine: 0, soft: 0, tannic: 0, weak: 0 };
    flavorMatches.forEach(function (r) { if (tally[r.excluded] !== undefined) tally[r.excluded]++; });

    var flavorPhrase = list(a.flavors.map(adj), "or");
    var timeWords = { morning: "for the morning", afternoon: "for the afternoon", evening: "for the evening", bed: "for right before bed" };

    var context = [];
    if (tally.caffeine) context.push(a.time === "bed" ? "at bedtime" : TIME_PHRASE[a.time].replace("this ", "in the "));
    if (tally.soft) context.push("in a soft, quiet mood");
    if (tally.tannic) context.push(stomach(a) === "empty" ? "on an empty stomach" : "straight after a meal");

    var parts = [];
    function piece(k, singular, plural) {
      if (!tally[k]) return;
      var all = tally[k] === flavorMatches.length && tally[k] > 1;
      parts.push((all ? "all " : "") + count(tally[k]) + " " + (tally[k] === 1 ? singular : plural));
    }
    piece("caffeine", "has too much caffeine " + timeWords[a.time], "have too much caffeine " + timeWords[a.time]);
    piece("soft", "has more caffeine than a soft, quiet cup should", "have more caffeine than a soft, quiet cup should");
    piece("tannic", "is too tannic for " + (stomach(a) === "empty" ? "a cup before food" : "right after a full meal"),
      "are too tannic for " + (stomach(a) === "empty" ? "a cup before food" : "right after a full meal"));
    piece("weak", "is too far from the " + a.boldness + " cup you asked for", "are too far from the " + a.boldness + " cup you asked for");

    var opening = n === 0 ? "Nothing fits all of that." :
      n === 1 ? "Only one tea fits all of that." : "Only two teas fit all of that.";

    var lead = "Asking for " + list(a.flavors.map(adj)) + (context.length ? " " + list(context) : "") + " narrows things a lot";
    var detail;
    if (flavorMatches.length === 0) {
      detail = lead + ".";
    } else {
      detail = lead + ": of the " + count(flavorMatches.length) + " " +
        (flavorMatches.length === 1 ? "tea" : "teas") + " here with a " + flavorPhrase + " flavor, " +
        (parts.length ? clauses(parts) : "most miss on everything else") + ".";
    }
    var close = n === 0 ?
      "Loosen one answer — another flavor, or a different time of day, usually opens things up." :
      "Rather than pad the list with poor matches, here is what genuinely fits.";
    return opening + " " + detail + " " + close;
  }

  // ---- Rendering ----------------------------------------------------------

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var resultsEl = $("#results");

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function missingAnswers(a) {
    var missing = [];
    if (!a.flavors.length) missing.push("a flavor");
    if (!a.boldness) missing.push("how bold");
    if (!a.time) missing.push("when you're drinking it");
    if (!a.food) missing.push("whether you've eaten");
    else if (a.food !== "none" && !a.ateWhen) missing.push("how long ago you ate");
    if (!a.mood) missing.push("your mood");
    return missing;
  }

  function render() {
    var missing = missingAnswers(answers);
    if (missing.length) {
      var a0 = answers;
      var started = a0.flavors.length || a0.boldness || a0.time || a0.food || a0.mood;
      resultsEl.innerHTML = '<p class="placeholder">' +
        (started ? "Almost there — still need " + esc(list(missing)) + "." :
          "Answer the questions and your teas will show up here. Change any answer and they update straight away.") +
        "</p>";
      return;
    }

    var a = answers;
    var result = recommend(a);
    var html = "";

    html += '<p class="results-intro">' + inkify(esc("For " + article(a.boldness) + ", " + list(a.flavors.map(adj)) +
      " cup " + TIME_PHRASE[a.time] + ", here is what I'd brew.")) + "</p>";

    if (result.picks.length < 3) {
      html += '<p class="short-note">' + inkify(esc(shortListNote(result, a))) + "</p>";
    }

    result.picks.forEach(function (r, i) {
      html += labelHTML(r, a, i);
    });

    if (stomach(a) === "afterMeal") {
      html += '<p class="timing-note">If you ate in the last hour, give it another thirty minutes — tannins can interfere with iron absorption from a meal.</p>';
    }

    // Results are "printed" (animated) only when the set of teas changes,
    // not on every answer tweak that leaves the same picks in place.
    var key = result.picks.map(function (r) { return r.tea.name; }).join("|");
    resultsEl.classList.toggle("is-printing", key !== lastPrinted && key !== "");
    lastPrinted = key;
    resultsEl.innerHTML = html;
  }

  var lastPrinted = "";

  // The label's ink comes from the first of its flavors the person picked.
  function labelInk(r) {
    return FLAVOR_INK[r.shared[0] || r.tea.flavors[0]] || "paper";
  }

  function fahrenheit(c) { return Math.round((c * 9 / 5 + 32) / 5) * 5; }

  function steepParts(steep) {
    var m = /^([\d.–-]+)\s*(min|sec)/.exec(steep);
    if (!m) return { num: steep, sub: "" };
    var plural = m[1] !== "1";
    return { num: m[1], sub: m[2] === "min" ? (plural ? "minutes" : "minute") : "seconds" };
  }

  function labelHTML(r, a, i) {
    var t = r.tea;
    var b = t.brew;
    var steep = steepParts(b.steep);
    var ink = labelInk(r);
    var tags = t.flavors.map(function (f) {
      return '<li data-ink="' + FLAVOR_INK[f] + '">' + esc(cap(f)) + "</li>";
    }).join("");

    return '<article class="label" style="--i:' + i + '">' +
      '<header class="label-head" data-ink="' + ink + '">' +
        '<div class="seal" aria-hidden="true"><span><span class="seal-no">No.</span><br><span class="seal-num">' + (i + 1) + "</span></span></div>" +
        "<div>" +
          '<h2 class="tea-name"><span class="visually-hidden">Pick ' + (i + 1) + ": </span>" + esc(t.name) + "</h2>" +
          '<p class="tea-grade">' + esc(TYPE_LABEL[t.type] || t.type) + " — " + esc(t.origin) + "</p>" +
        "</div>" +
      "</header>" +
      '<div class="label-body">' +
        '<ul class="tags" aria-label="Flavors and caffeine">' + tags +
          '<li class="caffeine">' + esc(CAFFEINE_LABEL[t.caffeine]) + "</li></ul>" +
        '<p class="cup">' + inkify(esc(t.description)) + "</p>" +
        '<p class="why"><span class="why-lead">Why this one.</span> ' + inkify(esc(EXPLAINERS[i](r, a))) + "</p>" +
        '<dl class="brew">' +
          '<div><dt>Water</dt><dd><span class="brew-num">' + b.tempC + '°C</span><span class="brew-sub">' + fahrenheit(b.tempC) + "°F</span></dd></div>" +
          '<div><dt>Steep</dt><dd><span class="brew-num">' + esc(steep.num) + '</span><span class="brew-sub">' + esc(steep.sub) + "</span></dd></div>" +
          '<div><dt>Leaf</dt><dd><span class="brew-num">' + b.grams + ' g</span><span class="brew-sub">' + esc(b.measure) + " per cup</span></dd></div>" +
        "</dl>" +
        (b.note ? '<p class="brew-note">' + esc(b.note) + "</p>" : "") +
      "</div>" +
    "</article>";
  }

  // Wraps flavor words in already-escaped text so they carry their ink.
  var FLAVOR_WORDS = /\b(grassy|vegetal|citrus|stone[- ]fruit|floral|spiced|smoky|mineral|earthy|malty|nutty|creamy)\b/gi;
  function inkify(escaped) {
    return escaped.replace(FLAVOR_WORDS, function (w) {
      var ink = FLAVOR_INK[w.toLowerCase().replace("-", " ")];
      return '<span class="inked" data-ink="' + ink + '">' + w + "</span>";
    });
  }

  // ---- Controls -----------------------------------------------------------

  function buildFlavorOptions() {
    var wrap = $("#flavor-options");
    var check = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="square"/></svg>';
    FLAVORS.forEach(function (f) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "ink-tile";
      b.dataset.value = f.tag;
      b.dataset.ink = f.ink;
      b.setAttribute("aria-label", cap(f.tag));
      b.innerHTML = '<span class="swatch">' + check + "</span>" +
        '<span class="tile-name">' + esc(cap(f.tag)) + "</span>" +
        '<span class="tile-ink" aria-hidden="true">' + INK_NAME[f.ink] + "</span>";
      wrap.appendChild(b);
    });
    wrap.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var f = b.dataset.value;
      var i = answers.flavors.indexOf(f);
      if (i !== -1) answers.flavors.splice(i, 1);
      else if (answers.flavors.length < MAX_FLAVORS) answers.flavors.push(f);
      else return;
      syncControls();
      render();
    });
  }

  function bindSingles() {
    document.querySelectorAll("[data-single]").forEach(function (group) {
      var key = group.dataset.single;
      group.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        answers[key] = b.dataset.value;
        syncControls();
        render();
      });
    });
    $("#reset").addEventListener("click", function () {
      answers = emptyAnswers();
      syncControls();
      render();
    });
  }

  function syncControls() {
    var full = answers.flavors.length >= MAX_FLAVORS;
    document.querySelectorAll("#flavor-options button").forEach(function (b) {
      var on = answers.flavors.indexOf(b.dataset.value) !== -1;
      b.setAttribute("aria-pressed", on);
      b.setAttribute("aria-disabled", full && !on);
    });
    $("#flavor-hint").textContent = full ?
      "That's three — tap one to swap it out." :
      "Pick up to three." + (answers.flavors.length ? " " + count(answers.flavors.length).replace(/^./, function (c) { return c.toUpperCase(); }) + " chosen." : "");

    document.querySelectorAll("[data-single]").forEach(function (group) {
      var key = group.dataset.single;
      group.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", answers[key] === b.dataset.value);
      });
    });
    $("#ate-when").hidden = !(answers.food === "snack" || answers.food === "meal");
  }

  // ---- Start --------------------------------------------------------------

  buildFlavorOptions();
  bindSingles();
  syncControls();

  fetch("teas.json")
    .then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    })
    .then(function (data) {
      teas = data.teas;
      render();
    })
    .catch(function () {
      resultsEl.innerHTML = '<p class="placeholder">The tea catalog (teas.json) could not be loaded. ' +
        "If you opened this file straight from your computer, serve the folder over HTTP instead — for example with <code>python3 -m http.server</code>.</p>";
    });

  // Exposed for testing in the console.
  window.TeaFinder = { evaluate: evaluate, recommend: recommend, explain: function (r, a, i) { return EXPLAINERS[i](r, a); }, shortListNote: shortListNote, setAnswers: function (a) { answers = a; syncControls(); render(); } };
})();
