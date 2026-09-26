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

   비교 기준은 '가는 길에 처음 나오는 길가 주유소'다. 아무것도 안 따지고 가다가
   처음 보이는 곳에 들어가는 것 - 사람이 실제로 하는 행동이 기준이어야 이득을 믿는다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'dest') return;

  var esc = OIL.esc, won = OIL.won;
  var P = OIL.prefs, PL = OIL.place, ENV = OIL.env;

  /* 진짜 우회거리를 물어볼 곳 수 (한 곳당 호출 1회, 4곳씩 나눠 보낸다).
     동네를 제대로 받으면 8곳으로 정답 1위를 찾는다 - 후보 69·43곳을 전부 재서
     비교해 확인했다(2026-09-27). 늘리면 느린 날 기다림만 묶음 수만큼 길어진다. */
  var MAX_MEASURE = 8;
  var ON_ROAD = 0.15;     /* 경로에서 이 거리(km) 안이면 길가로 본다 - 비교 기준 후보 */
  var BASE_SLACK = 0.5;   /* 제일 안 돌아가는 곳보다 이만큼 더 돌아가도 '길가'로 친다 */
  var SHOW = 5;           /* 내 주변 화면과 같은 수 - 5곳이면 고르기 충분하다 */

  function fuel() { return P ? P.get('fuel') : 'g'; }
  function fuelName() { return P ? P.fuelName() : '휘발유'; }
  function range() { return P ? P.get('range') : 30; }
  function allow() { return P ? P.get('detour') : 2; }
  function cap() { return allow() / 2 * 1.15; }  /* 벗어났다 돌아와야 하니 우회 ≥ 경로까지 거리×2 */
  function price(s) { return fuel() === 'd' ? s.d : s.g; }

  var dest = { la: parseFloat(OIL.param('dla')), ln: parseFloat(OIL.param('dln')) };
  var destName = OIL.param('dq') || '목적지';
  var origin = null, originName = '내 위치';
  if (OIL.param('ola') && OIL.param('oln')) {
    origin = { la: parseFloat(OIL.param('ola')), ln: parseFloat(OIL.param('oln')) };
    originName = OIL.param('oq') || '지정한 출발지';
  }

  /* ── 경로 위 계산 (돈이 들지 않는 부분) ─────────────────────── */

  /* 경로를 따라 걸으며 '더 갈 수 있는 거리'까지만 남긴다.
     cum = 출발지에서 각 점까지 경로를 따라 간 거리, gap = 점 사이 가장 긴 간격 */
  function cut(path, km) {
    var out = [path[0]], cum = [0], acc = 0, gap = 0;
    for (var i = 1; i < path.length; i++) {
      var d = OIL.distKm(path[i - 1].la, path[i - 1].ln, path[i].la, path[i].ln);
      acc += d;
      if (d > gap) gap = d;
      out.push(path[i]);
      cum.push(acc);
      if (acc >= km) break;
    }
    var bb = [90, 180, -90, -180];
    out.forEach(function (p) {
      bb = [Math.min(bb[0], p.la), Math.min(bb[1], p.ln), Math.max(bb[2], p.la), Math.max(bb[3], p.ln)];
    });
    return { path: out, cum: cum, km: acc, gap: gap, bb: bb };
  }

  /* 주유소에서 경로까지 가장 가까운 거리(off)와, 그 지점이 출발지에서 경로를 따라
     몇 km 앞인지(at). 경로 '점'이 아니라 점을 이은 '선'까지 잰다 - 경로 점은
     고속도로에서 1.7km씩 떨어져 있어서, 점까지 재면 길가 주유소도 멀게 나왔다. */
  function onPath(seg, s) {
    var p = seg.path, kx = 111.32 * Math.cos(s.la * Math.PI / 180), ky = 110.57;
    var best = Infinity, at = 0;
    for (var i = 0; i + 1 < p.length; i++) {
      var ax = (p[i].ln - s.ln) * kx, ay = (p[i].la - s.la) * ky;
      var dx = (p[i + 1].ln - p[i].ln) * kx, dy = (p[i + 1].la - p[i].la) * ky;
      var l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      var x = ax + t * dx, y = ay + t * dy, d = Math.sqrt(x * x + y * y);
      if (d < best) { best = d; at = seg.cum[i] + t * (seg.cum[i + 1] - seg.cum[i]); }
    }
    return { off: best, at: at };
  }

  /* ── 자료 모으기 ─────────────────────────────────────────────
     주유소 분포 범위가 경로에 걸치는 동네는 전부 받는다(OIL.regionsHit).
     전에는 가격순으로 정렬된 동네 목록에서 앞의 8곳을 잘라 써서, 수도권에서는
     길가 주유소가 대부분 빠졌다(서울→인천 30곳 중 30곳, 강남→수원 8곳 중 6곳). */
  function collect(reg, seg) {
    var c = cap();
    var near = OIL.regionsHit(reg.items, seg.path, c + seg.gap / 2 + 0.2);
    if (!near.length) return Promise.resolve([]);

    var m = (c * 2) / 110.57, bb = seg.bb;   /* 경로 범위 밖은 선까지 재볼 것도 없다 */
    return Promise.all(near.map(function (r) {
      return OIL.region(r.sl).catch(function () { return null; });
    })).then(function (list) {
      var out = [], seen = {};
      list.forEach(function (detail) {
        if (!detail) return;
        (detail.stations || []).forEach(function (s) {
          if (s.la == null || !price(s)) return;
          if (s.la < bb[0] - m || s.la > bb[2] + m || s.ln < bb[1] - m * 1.3 || s.ln > bb[3] + m * 1.3) return;
          var k = s.n + '|' + s.a;
          if (seen[k]) return;
          seen[k] = 1;
          var o = onPath(seg, s);
          if (o.off > c * 2) return;
          s._off = o.off;
          s._at = o.at;
          out.push(s);
        });
      });
      return out;
    });
  }

  /* ── 손익 계산 ───────────────────────────────────────────── */
  function evaluate(pool) {
    var rad = allow();
    var all = pool.filter(function (s) { return s._tried && s._detour <= rad; });
    if (!all.length) return null;

    /* 기준 = 가는 길에 처음 나오는 길가 주유소. 아무것도 안 따지면 들렀을 집이다.
       제일 안 돌아가는 곳과 우회가 거의 같은(0.5km 이내) 곳 중 먼저 나오는 곳. */
    var minDet = Math.min.apply(null, all.map(function (s) { return s._detour; }));
    var base = all.filter(function (s) { return s._detour <= minDet + BASE_SLACK; })
      .reduce(function (a, b) { return b._at < a._at ? b : a; });

    all.forEach(function (s) {
      s._isBase = (s === base);
      /* 우회는 벗어났다 돌아오는 것까지 포함된 값이라 편도로 센다 */
      s._trip = OIL.calcTrip(price(s), price(base), s._detour, base._detour, false);
      s._tmin = (s._xmin != null && base._xmin != null) ? s._xmin - base._xmin : null;
    });
    var r = OIL.rankTrips(all, function (s) { return s._at; }, base);
    return { all: all, base: base, list: r.list, tie: r.tie, best: r.list[0] };
  }

  /* 재지 않은 곳을 가장 유리하게 쳤을 때 남는 돈. 우회는 경로까지 거리의 두 배보다
     작기 어렵다(벗어났다 돌아와야 하니까). */
  function upper(s, r) {
    var L = P ? P.liters() : 30, kmpl = P ? P.car().kmpl : 12;
    return (price(r.base) - price(s)) * L - (2 * s._off - r.base._detour) / kmpl * price(s);
  }

  /* ── 진짜 우회거리 재기 (호출 1곳당 1회) ───────────────────── */
  function ask(list) {
    list = list.filter(function (s) { return !s._tried; });
    if (!list.length) return Promise.resolve();
    /* 한꺼번에 던지면 서로 느려진다. 4개씩 끊어 보내고, 늦는 건 어림값으로 넘어간다 */
    return OIL.road.inBatches(list, 4, function (s) {
      return OIL.road.detour(origin, s, dest, state.baseKm, state.baseMin).then(function (r) {
        s._tried = true;
        if (r) { s._detour = r.extra; s._xmin = r.extraMin; s._real = true; }
        else { s._detour = s._off * 2 * OIL.road.GUESS; s._xmin = null; s._real = false; }
      });
    });
  }

  /* 어느 곳을 잴지 고른다. 한 곳당 한 번씩 물어야 하므로 아무거나 재면 안 된다.
       1) 우회 허용을 넘을 게 뻔한 곳은 뺀다.
       2) 비교 기준 후보 4곳 - 길가 주유소를 나오는 순서대로.
       3) 나머지는 예상 비용(기름값 + 돌아가는 기름값)이 싼 순. 가격만 보고 고르면
          경로에서 먼 곳만 뽑혀 재놓고 전부 걸러진다.
     그다음 재지 않은 곳이 가장 유리하게 쳐도 1위를 못 이기는지 확인하고,
     이길 수도 있는 곳이 있을 때만 4곳을 더 잰다(한 묶음 - 드물다). */
  function measure(cand) {
    var c = cap();
    var pool = cand.filter(function (s) { return s._off <= c; });
    if (!pool.length) pool = cand.slice().sort(function (a, b) { return a._off - b._off; }).slice(0, 4);

    var L = P ? P.liters() : 30, kmpl = P ? P.car().kmpl : 12;
    function est(s) { return price(s) * (L + 2 * s._off / kmpl); }
    var byBase = pool.slice().sort(function (a, b) {
      return (a._off <= ON_ROAD ? a._at : 1e6 + a._off) - (b._off <= ON_ROAD ? b._at : 1e6 + b._off);
    });
    var byEst = pool.slice().sort(function (a, b) { return est(a) - est(b); });

    var pick = [], seen = {};
    function add(s) {
      var k = s.n + '|' + s.a;
      if (seen[k] || pick.length >= MAX_MEASURE) return;
      seen[k] = 1; pick.push(s);
    }
    byBase.slice(0, 4).forEach(add);
    byEst.forEach(add);

    return ask(pick).then(function () {
      var r = evaluate(pool);
      if (!r) return;
      return ask(byEst.filter(function (s) {
        return !s._tried && upper(s, r) > r.best._trip.net;
      }).slice(0, 4));
    }).then(function () { return pool; });
  }

  /* ── 카드 ────────────────────────────────────────────────── */
  function atText(s) { return (s._at < 10 ? s._at.toFixed(1) : s._at.toFixed(0)) + 'km 앞'; }
  function detText(s) {
    return s._detour < 0.05 ? '안 돌아감'
      : '우회 ' + (s._real ? '' : '약 ') + s._detour.toFixed(1) + 'km';
  }

  function card(s, i, base, no) {
    var p = price(s), t = s._trip;
    var line = OIL.tripLine(t, s._isBase, 'detour', state.baseShort);

    var tags = '';
    if (s.s) tags += '<span class="oil-tag">셀프</span>';
    if (s.b) tags += '<span class="oil-tag">' + esc(s.b) + '</span>';
    if (s.c === '늘 최저권') tags += '<span class="oil-badge is-low">1년 내내 최저권</span>';
    else if (s.c === '늘 최고권') tags += '<span class="oil-badge is-high">오늘만 쌈</span>';

    /* 순위 띠 - 내 주변 화면과 같은 모양, 같은 번호를 지도에도 쓴다 */
    var rank = '<div class="oil-st-rank' + (i === 0 ? ' is-top' : '') + '">' +
      '<span class="oil-st-no">' + no + '위</span>' + OIL.rankTag(i, s._isBase) +
      '</div>';

    return '<article class="oil-st' + (i === 0 ? ' is-top' : '') + '">' + rank +
      '<div class="oil-st-top">' +
        '<span class="oil-st-name">' + OIL.brandChip(s.b) + esc(s.n) +
          '<span class="oil-st-tags">' + tags + '</span></span>' +
        '<span class="oil-st-fig">' +
          '<b class="oil-st-price">' + won(p) + '<i>원</i></b>' +
          '<span class="oil-st-km">' + atText(s) + '</span>' +
          '<span class="oil-st-km' + (s._real ? '' : ' is-guess') + '">' + detText(s) + '</span>' +
        '</span>' +
      '</div>' +
      '<div class="oil-st-line ' + line.cls + '">' + line.text + '</div>' +
      '<div class="oil-st-acts">' +
        '<button type="button" class="oil-st-btn" data-detail="' + i + '">상세보기</button>' +
        '<a class="oil-st-btn is-go" href="' + OIL.mapUrl(s) + '" ' +
          'target="_blank" rel="noopener">찾아가기</a>' +
      '</div>' +
      '<div class="oil-st-detail" id="oil-det-' + i + '" hidden>' +
        detail(s, base) + '</div></article>';
  }

  function detail(s, base) {
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
      '출발지에서 경로를 따라 <b>' + atText(s) + '</b> · 들렀다 가면 <b>' +
      s._detour.toFixed(1) + 'km</b> 더 갑니다 (실제 도로 기준)' +
      (s._isBase ? '<br>가는 길에 처음 나오는 길가 주유소라 비교 기준으로 씁니다.' : '') +
      (s._real ? '' : '<br><span class="oil-st-caveat">길찾기가 안 돼 어림한 값입니다.</span>') +
      '</p>';
    if (!s._isBase) {
      html += '<div class="oil-st-calc"><div class="oil-st-calc-h">' + esc(base.n) + '(' +
        esc(state.baseShort) + ')에 들르는 것과 비교</div>' +
        OIL.tripRows(s._trip, price(s), 'detour') + OIL.timeNote(s._tmin) + '</div>';
    }

    if (s.c === '늘 최저권') {
      html += '<p class="oil-st-why">최근 1년 동안 동네 최저권을 지킨 주유소입니다.</p>';
    } else if (s.c === '늘 최고권') {
      html += '<p class="oil-st-why">평소 동네에서 비싼 축입니다. 오늘 싼 건 일시적일 수 있습니다.</p>';
    }
    return html;
  }

  /* ── 화면 ────────────────────────────────────────────────── */
  var state = null;   /* { baseKm, baseMin, cutKm, seg, reg, date, cand, pool, baseShort } */

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
    var r = evaluate(state.pool || []);
    var rad = allow();

    var html = '<div class="oil-stack">';
    html += head('전체 ' + state.baseKm.toFixed(0) + 'km 중 <b>앞 ' +
      state.cutKm.toFixed(0) + 'km</b> 구간에서 찾았습니다');
    if (P) html += P.destPickerHtml();

    /* 주행가능거리는 계기판 숫자다. 믿고 끝까지 가면 길에서 멈춘다. */
    html += '<div class="oil-note">표시된 주행가능거리는 여유 없이 그대로 계산합니다. ' +
      '실제로는 정체·오르막에서 더 줄어드니 <b>넉넉히 잡아 미리 넣으시는 게 안전합니다.</b></div>';

    if (!r) {
      html += '<div class="oil-note">앞 ' + state.cutKm.toFixed(0) + 'km 안에 우회 ' +
        rad + 'km로 갈 수 있는 ' + fuelName() + ' 주유소가 없습니다. ' +
        '위에서 우회 허용이나 거리를 늘려보세요.</div>';
      html += '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
        '<span>다른 목적지로 찾기</span>' + OIL.chev('#fff') + '</a></div>';
      OIL.render(html);
      if (P) P.wirePicker(onChange);
      return;
    }

    var base = r.base, list = OIL.showList(r.list, base, SHOW);
    var rankOf = function (s) { return r.list.indexOf(s) + 1; };
    state.baseShort = base._detour < BASE_SLACK ? '처음 나오는 곳' : '덜 돌아가는 곳';
    var pool = state.pool, measured = pool.filter(function (s) { return s._tried; }).length;
    var guessed = r.all.some(function (s) { return !s._real; });
    /* 한 묶음을 더 재고도 1위를 이길 여지가 남은 곳 - 있으면 숨기지 않고 말한다 */
    var unsure = pool.filter(function (s) { return !s._tried && upper(s, r) > r.best._trip.net; }).length;

    html += OIL.whyHtml({
      best: r.best, base: base, list: r.list, all: r.all, tie: r.tie, kind: 'detour',
      price: price, reach: function (s) { return s._at; },
      reachText: function (s) { return atText(s) + ' · ' + detText(s); },
      baseShort: state.baseShort,
      checked: '앞 ' + state.cutKm.toFixed(0) + 'km 안에서 우회 ' + rad + 'km로 들를 수 있는 <b>' +
        pool.length + '곳</b>을 모두 따져봤습니다 (들렀다 가는 길을 실제로 잰 곳 ' + measured + '곳' +
        (pool.length > measured
          ? (unsure ? ' · 기다리지 않으려고 ' + unsure + '곳은 못 쟀습니다. 이 중에 1위보다 조금 나은 곳이 있을 수 있습니다'
                    : ' · 나머지는 가장 유리하게 쳐도 1위보다 덜 남는 곳') : '') + ')' +
        (guessed ? ' · 길찾기가 안 된 곳은 "약"을 붙였습니다' : ''),
      cond: OIL.condText('detour', state.date)
    });

    if (OIL.map && OIL.map.can()) html += '<div class="oil-list-map" id="oil-list-map"></div>';

    html += OIL.adSlotHtml();
    html += '<div class="oil-sts">' + list.map(function (s, i) {
      return card(s, i, base, rankOf(s));
    }).join('') + '</div>';

    html += OIL.restHtml({
      rest: r.list.filter(function (s) { return list.indexOf(s) < 0; }),
      rankOf: rankOf, price: price, baseShort: state.baseShort,
      detail: function (s) { return detail(s, base); },
      sub: function (s) { return atText(s) + ' · ' + detText(s); },
      groups: [
        { title: '들렀다 가면 우회가 ' + rad + 'km를 넘어 뺀 곳',
          items: pool.filter(function (s) { return s._tried && s._detour > rad; })
            .sort(function (a, b) { return a._at - b._at; }),
          fmt: function (s) { return won(price(s)) + '원(우회 ' + s._detour.toFixed(1) + 'km)'; } },
        { title: '가장 유리하게 쳐도 1위보다 덜 남아 재지 않은 곳',
          items: pool.filter(function (s) { return !s._tried; })
            .sort(function (a, b) { return a._at - b._at; }),
          fmt: function (s) { return won(price(s)) + '원(' + atText(s) + ')'; } }
      ]
    });

    html += '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
      '<span>다른 목적지로 찾기</span>' + OIL.chev('#fff') + '</a>';
    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      OIL.dateKo(state.date) + ' ' + fuelName() + ' 실제 판매가 · 출처 오피넷 · ' +
      '우회 거리는 카카오맵 길찾기로 실제 경로를 계산한 값입니다</p></div>';

    OIL.render(html);
    document.title = destName + ' 가는 길 주유소 - 주유소찾기';
    if (OIL.map) {
      OIL.map.render(document.getElementById('oil-list-map'), {
        from: { la: origin.la, ln: origin.ln, name: originName },
        to: { la: dest.la, ln: dest.ln, name: destName },
        path: state.seg.path,
        items: list.map(function (s, i) {
          return { la: s.la, ln: s.ln, name: s.n, label: won(price(s)),
                   brand: s.b, rank: rankOf(s), good: s._trip.net > 0, i: i };
        }),
        onPick: OIL.map.focusCard
      });
    }
    if (P) P.wirePicker(onChange);
    wireDetail();
  }

  /* 거리(range)가 바뀌면 볼 구간이 달라지니 처음부터.
     나머지는 후보만 다시 고른다 - 받아둔 동네 파일과 잰 우회거리는 다시 묻지 않는다. */
  function onChange(key) {
    if (key === 'range') { run(); return; }
    refresh().catch(fail);
  }

  function refresh() {
    OIL.loading('가는 길 주변 주유소를 모으는 중...');
    return collect(state.reg, state.seg).then(function (cand) {
      state.cand = cand;
      if (!cand.length) { state.pool = []; draw(); return; }
      OIL.loading('들렀다 가는 거리를 재는 중... (' + Math.min(cand.length, MAX_MEASURE) + '곳)');
      return measure(cand).then(function (pool) { state.pool = pool; draw(); });
    });
  }

  /* ── 상세보기 ────────────────────────────────────────────── */
  var wired = false;
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
  function fail(e) {
    OIL.render('<div class="oil-error">가는 길을 찾지 못했습니다.<br>' +
      '<a class="oil-btn is-ghost" style="margin-top:14px;" href="' +
      (OIL.cfg.listPageUrl || '/') + '"><span>다시 찾기</span></a></div>');
    if (window.console) console.error(e);
  }

  function run() {
    OIL.loading('가는 길을 찾는 중...');
    OIL.road.route(origin, dest).then(function (route) {
      var seg = cut(route.path, range());
      return Promise.all([OIL.meta(), OIL.regions()]).then(function (a) {
        state = { baseKm: route.km, baseMin: route.min, cutKm: Math.min(seg.km, route.km),
                  seg: seg, reg: a[1], date: a[0].date };
        return refresh();
      });
    }).catch(fail);
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
        '<a class="oil-locate' + (w.solid ? ' is-ghost' : '') + '" href="' + pick + '">' +
          '출발지 직접 정하기</a>' +
        (kind === 'none' || w.noRetry ? '' :
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
