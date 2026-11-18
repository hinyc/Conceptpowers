// @concept:pending-diff
// assets/conceptDiff.js — 승인본과 지금 개념의 차이를 항목별 목록으로 낸다(순수 함수, DOM 없음).
// 비교에서 status는 뺀다(검토 중인 것이 이미 상태가 다른 것이므로). 나머지 화면에 보이는 모든 칸을 견준다.
// 결과 한 건: { field, kind: 'added'|'removed'|'changed', before, after, reordered }
//  - 글 칸: before/after는 문자열(없으면 null)
//  - 배열 칸: 값이 같은 항목은 개수까지 먼저 짝짓고, 남은 삭제·추가 중 글자가 비슷한 쌍(SIMILARITY_THRESHOLD 이상)은
//    수정(전·후 문자열)으로, 나머지는 삭제·추가로 낸다. 추가는 after, 삭제는 before에 항목 한 줄(문자열). 순서만 바뀐 칸은 'changed'이고
//    reordered=true이며 before/after가 항목 문자열 배열이다.
'use strict';

var CPConceptDiff = (function () {
  var TEXT_FIELDS = [
    'title',
    'group',
    'description.definition',
    'description.analogy',
    'description.example',
    'purpose.reason',
    'purpose.vision',
    'actions.interaction',
    'principle.operationalPrinciple',
    'principle.tradeoffs',
    'relations.prev',
    'relations.next',
  ];
  var LIST_FIELDS = [
    'aliases',
    'category',
    'description.components',
    'state.managed',
    'purpose.benefits',
    'purpose.painPoints',
    'actions.allow',
    'actions.restrict',
    'principle.immutableRules',
    'principle.lifecycle',
    'relations.related',
    'codeLinks',
    'sources',
  ];
  // 목록 칸에서 삭제·추가로 남은 두 항목이 이 값 이상 비슷하면 "수정"(전·후)으로 짝짓는다.
  // 글자 2-gram Dice 계수(0~1). 문장 한두 단어를 고친 정도(약 0.6 이상)는 수정으로, 전혀 다른 문장(약 0.2 이하)은
  // 삭제+추가로 남기는 경계(tests/viewer/conceptDiff.test.ts가 근거를 확인한다).
  var SIMILARITY_THRESHOLD = 0.5;
  var KNOWN_KEY_ORDER = ['kind', 'path', 'locator', 'supports'];

  function pick(obj, path) {
    var cur = obj;
    var parts = path.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function orderedKeys(obj) {
    var keys = Object.keys(obj);
    var known = KNOWN_KEY_ORDER.filter(function (k) {
      return keys.indexOf(k) !== -1;
    });
    var rest = keys
      .filter(function (k) {
        return known.indexOf(k) === -1;
      })
      .sort();
    return known.concat(rest);
  }

  // 짝짓기 열쇠: 객체는 키 순서를 고정한 JSON, 나머지는 값의 JSON.
  function itemKey(v) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      var keys = orderedKeys(v);
      return JSON.stringify(
        keys.map(function (k) {
          return [k, v[k]];
        })
      );
    }
    return JSON.stringify(v === undefined ? null : v);
  }

  // 화면에 보일 한 줄 글자.
  function itemText(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && !Array.isArray(v)) {
      return orderedKeys(v)
        .map(function (k) {
          return v[k] == null ? '' : String(v[k]);
        })
        .join(' | ');
    }
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  function textOf(v) {
    if (v === null || v === undefined || v === '') return null;
    return String(v);
  }

  function diffText(field, before, after) {
    var b = textOf(before);
    var a = textOf(after);
    if (b === a) return [];
    if (b === null) return [{ field: field, kind: 'added', before: null, after: a, reordered: false }];
    if (a === null) return [{ field: field, kind: 'removed', before: b, after: null, reordered: false }];
    return [{ field: field, kind: 'changed', before: b, after: a, reordered: false }];
  }

  function bigrams(text) {
    var t = String(text).replace(/\s+/g, ' ').trim();
    var counts = {};
    var total = 0;
    if (t.length < 2) {
      counts[t] = 1;
      return { counts: counts, total: 1 };
    }
    for (var i = 0; i < t.length - 1; i++) {
      var g = t.substr(i, 2);
      counts[g] = (counts[g] || 0) + 1;
      total += 1;
    }
    return { counts: counts, total: total };
  }

  // 글자 2-gram Dice 계수. 한글처럼 띄어쓰기 단위가 길어도 글자 단위로 겹침을 센다.
  function similarity(a, b) {
    var x = bigrams(a);
    var y = bigrams(b);
    var common = 0;
    for (var g in x.counts) {
      if (y.counts[g]) common += Math.min(x.counts[g], y.counts[g]);
    }
    return (2 * common) / (x.total + y.total);
  }

  // 남은 삭제·추가를 유사도 높은 쌍부터 짝짓는다(같으면 원래 순서 우선, 한 항목은 한 번만).
  // 반환: { pairs: [[removedIdx, addedIdx]], ... } — 기준 미만은 짝이 되지 않는다.
  function pairBySimilarity(removed, added) {
    var cands = [];
    removed.forEach(function (r, i) {
      added.forEach(function (a, j) {
        var sim = similarity(itemText(r), itemText(a));
        if (sim >= SIMILARITY_THRESHOLD) cands.push({ i: i, j: j, sim: sim });
      });
    });
    cands.sort(function (p, q) {
      return q.sim - p.sim || p.i - q.i || p.j - q.j;
    });
    var usedR = {};
    var usedA = {};
    var pairs = [];
    cands.forEach(function (c) {
      if (usedR[c.i] || usedA[c.j]) return;
      usedR[c.i] = true;
      usedA[c.j] = true;
      pairs.push([c.i, c.j]);
    });
    pairs.sort(function (p, q) {
      return p[0] - q[0];
    });
    return { pairs: pairs, usedR: usedR, usedA: usedA };
  }

  function asList(v) {
    return Array.isArray(v) ? v : [];
  }

  function countMap(list) {
    var m = {};
    list.forEach(function (v) {
      var k = itemKey(v);
      m[k] = (m[k] || 0) + 1;
    });
    return m;
  }

  function diffList(field, beforeRaw, afterRaw) {
    var before = asList(beforeRaw);
    var after = asList(afterRaw);
    var remaining = countMap(after);
    var removed = [];
    before.forEach(function (v) {
      var k = itemKey(v);
      if (remaining[k] > 0) remaining[k] -= 1;
      else removed.push(v);
    });
    var leftover = countMap(before);
    var added = [];
    after.forEach(function (v) {
      var k = itemKey(v);
      if (leftover[k] > 0) leftover[k] -= 1;
      else added.push(v);
    });
    var out = [];
    var matched = pairBySimilarity(removed, added);
    matched.pairs.forEach(function (p) {
      out.push({
        field: field,
        kind: 'changed',
        before: itemText(removed[p[0]]),
        after: itemText(added[p[1]]),
        reordered: false,
      });
    });
    removed.forEach(function (v, i) {
      if (matched.usedR[i]) return;
      out.push({ field: field, kind: 'removed', before: itemText(v), after: null, reordered: false });
    });
    added.forEach(function (v, j) {
      if (matched.usedA[j]) return;
      out.push({ field: field, kind: 'added', before: null, after: itemText(v), reordered: false });
    });
    if (!out.length) {
      var same = before.every(function (v, i) {
        return itemKey(v) === itemKey(after[i]);
      });
      if (!same) {
        out.push({
          field: field,
          kind: 'changed',
          before: before.map(itemText),
          after: after.map(itemText),
          reordered: true,
        });
      }
    }
    return out;
  }

  function diffConcepts(approved, current) {
    var a = approved || {};
    var c = current || {};
    var out = [];
    TEXT_FIELDS.forEach(function (f) {
      out = out.concat(diffText(f, pick(a, f), pick(c, f)));
    });
    LIST_FIELDS.forEach(function (f) {
      out = out.concat(diffList(f, pick(a, f), pick(c, f)));
    });
    return out;
  }

  return { diffConcepts: diffConcepts, FIELDS: TEXT_FIELDS.concat(LIST_FIELDS) };
})();
