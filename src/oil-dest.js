/* 주유소찾기 - 목적지까지 가는 길에서 찾기 (회랑)

   들어오는 주소
     /p/area.html?dla=..&dln=..&dq=목적지이름          출발지는 현재 위치
     /p/area.html?dla=..&dln=..&dq=..&ola=..&oln=..&oq=..   출발지를 직접 정한 경우

   '내 주변'과 다른 점은 기준이 거리가 아니라 **우회**라는 것이다.
   가는 길목에 있는 주유소는 아무리 멀어도 우회가 0에 가깝고,
   바로 옆에 있어도 반대 방향이면 우회가 10km가 넘는다.
   실제로 평택캠퍼스에서 용인으로 갈 때, 직선 3.6km인 무한대주유소는 우회가 10.13km였다.

   긴 여정 전체를 뒤지지 않는다. "지금 기름으로 더 갈 수 있는 거리" 안에서만 찾는다.
   조회하는 시점이 곧 기름을 넣어야 하는 시점이기 때문이고,
   덕분에 받아야 할 자료도 몇 동네로 줄어든다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'dest') return;

  var esc = OIL.esc, won = OIL.won;
  var P = OIL.prefs, PL = OIL.place, ENV = OIL.env;

  /* 진짜 우회거리를 물어볼 곳 수 (한 곳당 호출 1회).
     8곳이면 기준이 될 '안 벗어나는 곳'과 이길 만한 '싼 곳'이 모두 들어온다.
     12곳은 답을 별로 못 바꾸면서 기다리는 시간만 늘렸다. */
  var MAX_MEASURE = 8;
  var MAX_REGION = 8;
  var REGION_NEAR = 20;   /* 경로에서 이 거리 안에 중심이 있는 동네를 받는다 */
  var SHOW = 5;           /* 내 주변 화면과 같은 수 - 5곳이면 고르기 충분하다 */

  function fuel() { return P ? P.get('fuel') : 'g'; }
  function fuelName() { return P ? P.fuelName() : '휘발유'; }
  function range() { return P ? P.get('range') : 30; }
  function allow() { return P ? P.get('detour') : 2; }
  function price(s) { return fuel() === 'd' ? s.d : s.g; }

  var dest = { la: parseFloat(OIL.param('dla')), ln: parseFloat(OIL.param('dln')) };
  var destName = OIL.param('dq') || '목적지';
  var origin = null, originName = '내 위치';
  if (OIL.param('ola') && OIL.param('oln')) {
    origin = { la: parseFloat(OIL.param('ola')), ln: parseFloat(OIL.param('oln')) };
    originName = OIL.param('oq') || '지정한 출발지';
  }

  /* ── 경로 위 계산 (돈이 들지 않는 부분) ─────────────────────── */

  /* 경로를 따라 걸으며 '더 갈 수 있는 거리'까지만 남긴다 */
  function cut(path, km) {
    var out = [path[0]], acc = 0;
    for (var i = 1; i < path.length; i++) {
      acc += OIL.distKm(path[i - 1].la, path[i - 1].ln, path[i].la, path[i].ln);
      out.push(path[i]);
      if (acc >= km) break;
    }
    return { path: out, km: acc };
  }

  /* 주유소에서 경로까지 가장 가까운 거리. 우회 후보를 고르는 데만 쓴다. */
  function toPath(path, s) {
    var best = Infinity;
    for (var i = 0; i < path.length; i++) {
      var d = OIL.distKm(s.la, s.ln, path[i].la, path[i].ln);
      if (d < best) best = d;
      if (best < 0.05) break;
    }
    return best;
  }

  /* ── 자료 모으기 ─────────────────────────────────────────── */
  function collect(reg, path) {
    var near = reg.items.filter(function (r) {
      return r.la != null && toPath(path, r) <= REGION_NEAR;
    }).slice(0, MAX_REGION);

    if (!near.length) return Promise.resolve([]);

    return Promise.all(near.map(function (r) {
      return OIL.region(r.sl).catch(function () { return null; });
    })).then(function (list) {
      var out = [], seen = {};
      list.forEach(function (detail) {
        if (!detail) return;
        (detail.stations || []).forEach(function (s) {
          if (s.la == null || !price(s)) return;
          var k = s.n + '|' + s.a;
          if (seen[k]) return;
          seen[k] = 1;
          s._off = toPath(path, s);
          out.push(s);
        });
      });
      return out;
    });
  }

  /* ── 진짜 우회거리 재기 (호출 1곳당 1회) ──────────────────────
     한 곳당 한 번씩 물어야 하므로 아무거나 재면 안 된다.
       1) 우회 허용을 넘을 게 뻔한 곳은 아예 뺀다.
          벗어났다 돌아와야 하니 우회는 경로까지 거리의 두 배보다 작을 수 없다.
       2) 남은 것 중 '경로에 가장 붙은 곳'과 '가장 싼 곳'을 섞어 고른다.
          붙은 곳이 있어야 비교 기준이 서고, 싼 곳이 있어야 이길 후보가 생긴다. */
  function measure(cand, baseKm) {
    var cap = allow() / 2 * 1.15;     /* 약간 여유를 둔다 - 도로가 직선보다 기니까 */
    var pool = cand.filter(function (s) { return s._off <= cap; });
    if (!pool.length) pool = cand.slice().sort(function (a, b) {
      return a._off - b._off;
    }).slice(0, 4);

    var byOff = pool.slice().sort(function (a, b) { return a._off - b._off; });
    var byPrice = pool.slice().sort(function (a, b) { return price(a) - price(b); });

    var pick = [], seen = {};
    function add(s) {
      var k = s.n + '|' + s.a;
      if (seen[k] || pick.length >= MAX_MEASURE) return;
      seen[k] = 1; pick.push(s);
    }
    byOff.slice(0, 4).forEach(add);   /* 비교 기준이 될 '가장 안 벗어나는 곳' */
    byPrice.forEach(add);             /* 이길 가능성이 있는 '싼 곳' */

    cand.forEach(function (s) { s._detour = null; });
    /* 한 곳에 한 번씩 물어야 하는데 12개를 동시에 던지면 서로 느려진다.
       4개씩 끊어 보내고, 늦는 건 어림값으로 넘어간다(oil-road.js 의 시간 제한). */
    return OIL.road.inBatches(pick, 4, function (s) {
      return OIL.road.detour(origin, s, dest, baseKm).then(function (r) {
        if (r) { s._detour = r.extra; s._real = true; }
        else { s._detour = s._off * 2 * OIL.road.GUESS; s._real = false; }
        return s;
      });
    });
  }

  /* ── 카드 ────────────────────────────────────────────────── */
  function card(s, i, baseName) {
    var p = price(s), t = s._trip;
    var line = OIL.tripLine(t, s._isBase, 'detour');

    var tags = '';
    if (s.s) tags += '<span class="oil-tag">셀프</span>';
    if (s.b) tags += '<span class="oil-tag">' + esc(s.b) + '</span>';
    if (s.c === '늘 최저권') tags += '<span class="oil-badge is-low">1년 내내 최저권</span>';
    else if (s.c === '늘 최고권') tags += '<span class="oil-badge is-high">오늘만 쌈</span>';

    /* 순위 띠 - 내 주변 화면과 같은 모양, 같은 번호를 지도에도 쓴다 */
    var rank = '<div class="oil-st-rank' + (i === 0 ? ' is-top' : '') + '">' +
      '<span class="oil-st-no">' + (i + 1) + '위</span>' +
      (i === 0 ? '<span class="oil-st-why1">여기가 제일 많이 아낍니다</span>' : '') +
      '</div>';

    return '<article class="oil-st' + (i === 0 ? ' is-top' : '') + '">' + rank +
      '<div class="oil-st-top">' +
        '<span class="oil-st-name">' + OIL.brandChip(s.b) + esc(s.n) +
          '<span class="oil-st-tags">' + tags + '</span></span>' +
        '<span class="oil-st-fig">' +
          '<b class="oil-st-price">' + won(p) + '<i>원</i></b>' +
          '<span class="oil-st-km' + (s._real ? '' : ' is-guess') + '">우회 ' +
            (s._real ? '' : '약 ') + s._detour.toFixed(1) + 'km</span>' +
        '</span>' +
      '</div>' +
      '<div class="oil-st-line ' + line.cls + '">' + line.text + '</div>' +
      '<div class="oil-st-acts">' +
        '<button type="button" class="oil-st-btn" data-detail="' + i + '">상세보기</button>' +
        '<a class="oil-st-btn is-go" href="' + OIL.mapUrl(s) + '" ' +
          'target="_blank" rel="noopener">찾아가기</a>' +
      '</div>' +
      '<div class="oil-st-detail" id="oil-det-' + i + '" hidden>' +
        detail(s, baseName) + '</div></article>';
  }

  function detail(s, baseName) {
    var t = s._trip;
    var fuels = [];
    if (s.g) fuels.push(['휘발유', s.g]);
    if (s.d) fuels.push(['경유', s.d]);
    if (s.p) fuels.push(['고급휘발유', s.p]);
    if (s.k) fuels.push(['실내등유', s.k]);

    var html = '<div class="oil-rows">';
    fuels.forEach(function (f) {
      html += '<div class="oil-row"><span class="oil-row-k">' + f[0] + '</span>' +
        '<span class="oil-row-v">' + won(f[1]) + '원</span></div>';
    });
    html += '<div class="oil-row"><span class="oil-row-k">주소</span>' +
      '<span class="oil-row-v" style="font-weight:500;">' + esc(s.a || '-') + '</span></div>';
    if (s.t) {
      html += '<div class="oil-row"><span class="oil-row-k">전화</span>' +
        '<span class="oil-row-v"><a href="tel:' + esc(s.t) + '">' + esc(s.t) + '</a></span></div>';
    }
    html += '</div>';

    html += '<p class="oil-st-why">' +
      '들렀다 가면 <b>' + s._detour.toFixed(1) + 'km</b> 더 갑니다 (실제 도로 기준)' +
      (s._isBase
        ? '<br>가는 길에서 가장 덜 벗어나는 곳이라 비교 기준으로 씁니다.'
        : '<br>기준(' + esc(baseName) + ')보다 <b>' + t.extra.toFixed(1) + 'km 더</b> 우회합니다' +
          '<br>' + t.car.label + ' ' + t.kmpl + 'km/L · ' + t.L + 'L 주유 기준<br>' +
          '아끼는 돈 ' + won(t.gain) + '원 − 들렀다 가는 기름값 ' + won(t.cost) + '원 = ' +
          '<b>' + (t.net >= 0 ? '+' : '') + won(t.net) + '원</b>') +
      (s._real ? '' : '<br><span class="oil-st-caveat">길찾기가 안 돼 어림한 값입니다.</span>') +
      '</p>';

    if (s.c === '늘 최저권') {
      html += '<p class="oil-st-why">최근 1년 동안 동네 최저권을 지킨 주유소입니다.</p>';
    } else if (s.c === '늘 최고권') {
      html += '<p class="oil-st-why">평소 동네에서 비싼 축입니다. 오늘 싼 건 일시적일 수 있습니다.</p>';
    }
    return html;
  }

  /* ── 화면 ────────────────────────────────────────────────── */
  var state = null;   /* { route, cand, baseKm } */

  function head(extra) {
    return '<div class="oil-route">' +
      '<div class="oil-route-row"><span class="oil-route-k">출발</span>' +
        '<span class="oil-route-v">' + esc(originName) + '</span></div>' +
      '<div class="oil-route-row"><span class="oil-route-k">도착</span>' +
        '<span class="oil-route-v">' + esc(destName) + '</span></div>' +
      (extra ? '<div class="oil-route-sum">' + extra + '</div>' : '') +
      '</div>';
  }

  function draw() {
    var measured = state.cand.filter(function (s) { return s._detour != null; });
    var rad = allow();
    var all = measured.filter(function (s) { return s._detour <= rad; });

    var html = '<div class="oil-stack">';
    html += head('전체 ' + state.baseKm.toFixed(0) + 'km 중 <b>앞 ' +
      state.cutKm.toFixed(0) + 'km</b> 구간에서 찾았습니다');
    if (P) html += P.destPickerHtml();

    /* 주행가능거리는 계기판 숫자다. 믿고 끝까지 가면 길에서 멈춘다. */
    html += '<div class="oil-note">표시된 주행가능거리는 여유 없이 그대로 계산합니다. ' +
      '실제로는 정체·오르막에서 더 줄어드니 <b>넉넉히 잡아 미리 넣으시는 게 안전합니다.</b></div>';

    if (!all.length) {
      html += '<div class="oil-note">앞 ' + state.cutKm.toFixed(0) + 'km 안에 우회 ' +
        rad + 'km로 갈 수 있는 ' + fuelName() + ' 주유소가 없습니다. ' +
        '위에서 우회 허용이나 거리를 늘려보세요.</div>';
      html += '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
        '<span>다른 목적지로 찾기</span>' + OIL.chev('#fff') + '</a></div>';
      OIL.render(html);
      if (P) P.wirePicker(onChange);
      return;
    }

    /* 기준 = 가는 길에서 가장 덜 벗어나는 곳. 아무것도 안 따지면 들렀을 집이다. */
    var base = all.reduce(function (a, b) { return b._detour < a._detour ? b : a; });
    var basePrice = price(base);

    all.forEach(function (s) {
      s._isBase = (s === base);
      /* 우회는 벗어났다 돌아오는 것까지 포함된 값이라 편도로 센다 */
      s._trip = OIL.calcTrip(price(s), basePrice, s._detour, base._detour, false);
    });

    var list = all.slice().sort(function (a, b) {
      if (b._trip.net !== a._trip.net) return b._trip.net - a._trip.net;
      return a._detour - b._detour;
    }).slice(0, SHOW);

    var best = list[0];
    html += '<p class="oil-lead" style="margin-top:0;">' +
      (best._isBase || best._trip.net <= 0
        ? '<b>' + esc(base.n) + '</b>에 들르는 게 제일 낫습니다. ' +
          '더 싼 곳도 있지만, 거기까지 돌아가는 기름값이 아끼는 돈보다 큽니다.'
        : '<b>' + esc(best.n) + '</b>에 들렀다 가면 제일 안 돌아가는 ' +
          esc(base.n) + '보다 <b>' + won(best._trip.net) + '원</b>을 아낍니다. ' +
          '들렀다 가는 기름값은 이미 뺀 금액입니다.') + '</p>';

    if (OIL.map && OIL.map.can()) html += '<div class="oil-list-map" id="oil-list-map"></div>';

    html += OIL.adSlotHtml();
    html += '<div class="oil-sts">' + list.map(function (s, i) {
      return card(s, i, base.n);
    }).join('') + '</div>';

    html += '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
      '<span>다른 목적지로 찾기</span>' + OIL.chev('#fff') + '</a>';
    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      OIL.dateKo(state.date) + ' ' + fuelName() + ' 실제 판매가 · 출처 오피넷 · ' +
      '우회 거리는 카카오맵 길찾기로 실제 경로를 계산한 값입니다</p></div>';

    OIL.render(html);
    document.title = destName + ' 가는 길 주유소 - 주유소찾기';
    shown = list;
    if (OIL.map) {
      OIL.map.render(document.getElementById('oil-list-map'), {
        from: { la: origin.la, ln: origin.ln, name: originName },
        to: { la: dest.la, ln: dest.ln, name: destName },
        path: state.segPath,
        items: list.map(function (s, i) {
          return { la: s.la, ln: s.ln, name: s.n, label: won(price(s)),
                   brand: s.b, rank: i + 1, good: s._trip.net > 0, i: i };
        }),
        onPick: OIL.map.focusCard
      });
    }
    if (P) P.wirePicker(onChange);
    wireDetail();
  }

  /* 차종만 바꾸면 다시 그리기만 하면 된다 - 거리는 그대로다.
     거리·우회허용·유종이 바뀌면 재야 할 후보가 달라진다. */
  function onChange(key) {
    if (key === 'range') { run(); return; }
    if (key === 'fuel' || key === 'detour') { remeasure(); return; }
    draw();
  }

  function remeasure() {
    OIL.loading('우회 거리를 다시 재는 중...');
    measure(state.cand, state.baseKm).then(draw);
  }

  /* ── 상세보기 ────────────────────────────────────────────── */
  var shown = [], wired = false;
  function wireDetail() {
    if (wired) return;
    wired = true;
    OIL.root().addEventListener('click', function (e) {
      var b = e.target.closest('[data-detail]');
      if (!b) return;
      var box = document.getElementById('oil-det-' + b.getAttribute('data-detail'));
      if (!box) return;
      box.hidden = !box.hidden;
      b.textContent = box.hidden ? '상세보기' : '접기';
    });
  }

  /* ── 흐름 ────────────────────────────────────────────────── */
  function run() {
    OIL.loading('가는 길을 찾는 중...');
    OIL.road.route(origin, dest).then(function (route) {
      var seg = cut(route.path, range());
      return Promise.all([OIL.meta(), OIL.regions()]).then(function (a) {
        return collect(a[1], seg.path).then(function (cand) {
          state = { baseKm: route.km, cutKm: Math.min(seg.km, route.km),
                    segPath: seg.path, cand: cand, date: a[0].date };
          if (!cand.length) { draw(); return; }
          OIL.loading('우회 거리를 재는 중... (' +
            Math.min(cand.length, MAX_MEASURE) + '곳)');
          return measure(cand, route.km).then(draw);
        });
      });
    }).catch(function (e) {
      OIL.render('<div class="oil-error">가는 길을 찾지 못했습니다.<br>' +
        '<a class="oil-btn is-ghost" style="margin-top:14px;" href="' +
        (OIL.cfg.listPageUrl || '/') + '"><span>다시 찾기</span></a></div>');
      if (window.console) console.error(e);
    });
  }

  function start() {
    if (!dest.la || !dest.ln) { location.replace(OIL.cfg.listPageUrl || '/'); return; }
    if (PL) PL.remember({ n: destName, a: '', la: dest.la, ln: dest.ln });
    if (origin) { run(); return; }

    /* 출발지가 없으면 현재 위치를 쓴다.
       ★ 위치 받는 방법도, 실패했을 때 하는 말도 '내 주변'과 똑같이 맞춘다
         (2026-09-24). 전에는 이 화면만 8초 한 번 시도에 "권한 거부"와
         "오래 걸립니다" 두 마디밖에 없어서, 앱 안 브라우저로 들어온 사람은
         왜 안 되는지도 모른 채 막다른 길에 섰다. */
    OIL.loading('현재 위치를 확인하는 중...');
    ENV.locate(function (pos) {
      origin = { la: pos.coords.latitude, ln: pos.coords.longitude };
      run();
    }, noOrigin, function (step) { OIL.loading(step); });
  }

  /* 출발지를 못 잡았을 때. '내 주변'과 같은 안내를 쓰되, 대신 할 일만
     이 화면에 맞게 바꾼다 - 여기서는 동네 목록이 아니라 출발지를 정해야 한다. */
  function noOrigin(kind) {
    var w = ENV.locateWhy(kind);
    var pick = (OIL.cfg.listPageUrl || '/') +
      '?pick=origin&dla=' + dest.la + '&dln=' + dest.ln +
      '&dq=' + encodeURIComponent(destName);

    OIL.render('<div class="oil-stack">' + head('') +
      '<div class="oil-locate-help">' +
        '<b>' + w.head + '</b>' +
        '<p>' + w.why + '</p>' + w.extra +
        '<p style="margin:10px 0 0;">가는 길에서 찾으려면 ' +
          '<b>어디서 출발하는지</b>를 알아야 합니다. ' +
          '아래에서 출발지를 직접 정하셔도 결과는 똑같습니다.</p>' +
        '<a class="oil-locate' + (w.extra ? ' is-ghost' : '') + '" href="' + pick + '">' +
          '출발지 직접 정하기</a>' +
        (kind === 'none' ? '' :
          '<button type="button" class="oil-locate is-ghost" id="oil-dest-retry">' +
            '위치 다시 시도</button>') +
      '</div>' +
      '<a class="oil-btn is-ghost" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
      '<span>처음으로</span>' + OIL.chev() + '</a></div>');

    ENV.wireWhy();
    var r = document.getElementById('oil-dest-retry');
    if (r) r.addEventListener('click', start);
  }

  start();
})();
