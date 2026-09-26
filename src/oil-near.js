/* 주유소찾기 - 어떤 지점 주변의 주유소 목록

   들어오는 주소:  /p/area.html?la=37.038&ln=127.056&q=삼성전자 평택캠퍼스
                  /p/area.html?la=..&ln=..&me=1        (내 위치)

   순서는 가격순이 아니라 '실질 이득순'이다. 이게 오피넷과 다른 유일한 지점이고,
   사람들이 우리를 쓸 이유다. 싼 집이 멀면 기름값으로 다 까먹는다.

   비교 기준은 '여기서 가장 가까운 주유소'다. 거기서 넣는 대신 이 집까지 가면
   얼마가 남는지를 센다. 기준점이 없으면 '이득'이라는 말 자체가 성립하지 않는다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'near') return;

  var esc = OIL.esc, won = OIL.won;
  var P = OIL.prefs, PL = OIL.place;

  /* 반경은 사용자가 고른다(1~10km, 카카오 다중 목적지 길찾기 한계).
     반경을 바꾸면 그 반경에 걸치는 동네를 다시 고른다 - 받아둔 파일은 다시 안 받는다. */
  var SHOW = 5;           /* 5곳이면 고르기 충분하다. 더 늘어놓으면 안 읽는다 */
  var NEAREST_KEEP = 8;   /* 비교 기준을 놓치지 않게 가까운 곳은 꼭 실측한다 */

  function fuel() { return P ? P.get('fuel') : 'g'; }
  function fuelName() { return P ? P.fuelName() : '휘발유'; }
  function radius() { return P ? P.get('radius') : 5; }
  function isRound() { return P ? P.isRound() : false; }
  function price(s) { return fuel() === 'd' ? s.d : s.g; }

  var la = parseFloat(OIL.param('la'));
  var ln = parseFloat(OIL.param('ln'));
  var qname = OIL.param('q');
  var isMe = OIL.param('me') === '1';
  var placeName = isMe ? '내 위치' : (qname || '선택한 장소');

  /* ── 데이터 모으기 ───────────────────────────────────────────
     반경에 주유소 분포 범위가 걸치는 동네는 전부 받는다(OIL.regionsHit).
     전에는 가까운 동네 4곳만 받아서, 반경 5km 에서도 서울시청 52곳 중 14곳,
     대구 반월당 97곳 중 37곳이 빠졌다(2026-09-27 실측). */
  function collect(reg, rad) {
    var near = OIL.regionsHit(reg.items, [{ la: la, ln: ln }], rad);
    if (!near.length) return Promise.resolve({ stations: [] });

    return Promise.all(near.map(function (r) {
      return OIL.region(r.sl).catch(function () { return null; });
    })).then(function (list) {
      var out = [], seen = {};
      list.forEach(function (detail, i) {
        if (!detail) return;
        (detail.stations || []).forEach(function (s) {
          if (s.la == null) return;
          var k = s.n + '|' + s.a;
          if (seen[k]) return;
          /* 직선거리는 후보를 고를 때만 쓴다. 도로거리는 직선보다 항상 기니까
             직선 R 안에서 뽑으면 도로 R 안의 주유소는 하나도 안 빠진다. */
          var km = OIL.distKm(la, ln, s.la, s.ln);
          if (km > rad) return;
          seen[k] = 1;
          s._straight = km;
          s._region = near[i].r;
          out.push(s);
        });
      });
      return { stations: out };
    });
  }

  /* ── 한 곳 카드 ──────────────────────────────────────────── */
  function card(s, i, baseName, no) {
    var p = price(s);
    var t = s._trip;
    var line = OIL.tripLine(t, s._isBase, null, BASE_SHORT);

    var tags = '';
    if (s.s) tags += '<span class="oil-tag">셀프</span>';
    if (s.b) tags += '<span class="oil-tag">' + esc(s.b) + '</span>';
    if (s.c === '늘 최저권') tags += '<span class="oil-badge is-low">1년 내내 최저권</span>';
    else if (s.c === '늘 최고권') tags += '<span class="oil-badge is-high">오늘만 쌈</span>';

    /* 순위는 카드 맨 위에 띠로 단다. 1위만 색을 넣어 눈이 먼저 가게 한다.
       지도 표시도 같은 번호를 쓰므로 둘을 눈으로 이어 붙일 수 있다. */
    var rank = '<div class="oil-st-rank' + (i === 0 ? ' is-top' : '') + '">' +
      '<span class="oil-st-no">' + no + '위</span>' + OIL.rankTag(i, s._isBase) +
      '</div>';

    return '<article class="oil-st' + (i === 0 ? ' is-top' : '') + '">' + rank +
      '<div class="oil-st-top">' +
        '<span class="oil-st-name">' + OIL.brandChip(s.b) + esc(s.n) +
          '<span class="oil-st-tags">' + tags + '</span></span>' +
        '<span class="oil-st-fig">' +
          '<b class="oil-st-price">' + won(p) + '<i>원</i></b>' +
          '<span class="oil-st-km' + (s._real ? '' : ' is-guess') + '">' +
            (s._real ? '' : '약 ') + t.km.toFixed(1) + 'km</span>' +
        '</span>' +
      '</div>' +
      '<div class="oil-st-line ' + line.cls + '">' + line.text + '</div>' +
      '<div class="oil-st-acts">' +
        '<button type="button" class="oil-st-btn" data-detail="' + i + '">상세보기</button>' +
        '<a class="oil-st-btn is-go" href="' + OIL.mapUrl(s) + '" ' +
          'target="_blank" rel="noopener">찾아가기</a>' +
      '</div>' +
      '<div class="oil-st-detail" id="oil-det-' + i + '" hidden>' + detail(s, i, baseName) + '</div>' +
      '</article>';
  }

  function detail(s, i, baseName) {
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
    html += '<div class="oil-row"><span class="oil-row-k">상표</span>' +
      '<span class="oil-row-v" style="font-weight:500;">' + esc(s.b || '-') +
      (s.s ? ' · 셀프' : '') + '</span></div>';
    html += '</div>';

    /* 왜 이런 판정이 나왔는지 - 숨기지 않고 밝힌다. 식까지 보여줘야 따라 셀 수 있다. */
    html += '<p class="oil-st-why">' +
      '여기서 <b>' + t.km.toFixed(1) + 'km</b> (실제 도로 기준)' +
      (s._isBase ? '<br>가장 가까운 주유소라 이곳을 비교 기준으로 씁니다.' : '') +
      (s._real ? '' : '<br><span class="oil-st-caveat">이 주유소는 길찾기가 안 돼 ' +
        '직선거리로 어림했습니다.</span>') + '</p>';
    if (!s._isBase) {
      html += '<div class="oil-st-calc"><div class="oil-st-calc-h">' + esc(baseName) +
        '(제일 가까운 곳)에서 넣는 것과 비교</div>' +
        OIL.tripRows(t, price(s), null) + OIL.timeNote(s._tmin) + '</div>';
    }

    if (s.c === '늘 최저권') {
      html += '<p class="oil-st-why">이 주유소는 최근 1년 동안 동네 최저권을 지켰습니다. ' +
        '오늘만 싼 곳이 아닙니다.</p>';
    } else if (s.c === '늘 최고권') {
      html += '<p class="oil-st-why">이 주유소는 평소 동네에서 비싼 축입니다. ' +
        '오늘 싼 건 일시적일 수 있습니다.</p>';
    }
    return html;
  }

  /* ── 화면 ────────────────────────────────────────────────── */
  var BASE_SHORT = '제일 가까운 곳';

  /* 도로거리를 잰 곳만 가지고 기준·손익·순위를 낸다 */
  function evaluate(cand, rad) {
    var all = cand.filter(function (s) { return s._tried && s._road <= rad; });
    if (!all.length) return null;
    /* 기준 = 여기서 가장 가까운 주유소(도로 기준). 아무것도 안 따지면 갔을 곳이다. */
    var base = all.reduce(function (a, b) { return b._road < a._road ? b : a; });
    var round = isRound();
    all.forEach(function (s) {
      s._isBase = (s === base);
      s._trip = OIL.calcTrip(price(s), price(base), s._road, base._road, round);
      s._tmin = (s._min != null && base._min != null) ? (s._min - base._min) * (round ? 2 : 1) : null;
    });
    var r = OIL.rankTrips(all, function (s) { return s._road; }, base);
    return { all: all, base: base, list: r.list, tie: r.tie, best: r.list[0] };
  }

  /* 재지 않은 곳을 가장 유리하게 쳤을 때 남는 돈의 상한.
     도로거리는 직선거리보다 짧을 수 없으니, 직선으로 계산한 값이 최대다. */
  function upper(s, r) {
    var L = P ? P.liters() : 30, kmpl = P ? P.car().kmpl : 12;
    var extra = Math.max(0, s._straight - r.base._road) * (isRound() ? 2 : 1);
    return (price(r.base) - price(s)) * L - extra / kmpl * price(s);
  }

  function ask(list) {
    list = list.filter(function (s) { return !s._tried; });
    if (!list.length) return Promise.resolve();
    return OIL.road.matrix({ la: la, ln: ln }, list).then(function (res) {
      list.forEach(function (s, i) {
        s._road = res[i].km; s._min = res[i].min; s._real = res[i].real; s._tried = true;
      });
    });
  }

  /* 실제 도로거리를 잰다. 한 번에 30곳까지 물을 수 있으므로 '이길 가능성이 있는 곳'을
     고른다 - 비교 기준이 될 가까운 곳들 + 예상 비용(기름값 + 가는 기름값)이 싼 곳들.
     그다음 재지 않은 곳이 가장 유리하게 쳐도 1위를 못 이기는지 확인한다.
     이길 수도 있는 곳이 남아 있을 때만 한 번 더 묻는다(드물다) -
     그래서 1위는 반경 안 전부와 비교한 답이라고 말할 수 있다. */
  function measure(cand, rad) {
    var L = P ? P.liters() : 30, kmpl = P ? P.car().kmpl : 12, mult = isRound() ? 2 : 1;
    function est(s) { return price(s) * (L + s._straight * mult / kmpl); }
    var byNear = cand.slice().sort(function (a, b) { return a._straight - b._straight; });
    var byEst = cand.slice().sort(function (a, b) { return est(a) - est(b); });

    var pick = [], seen = {};
    function add(s) {
      if (seen[s.n + '|' + s.a] || pick.length >= OIL.road.MAX_DEST) return;
      seen[s.n + '|' + s.a] = 1; pick.push(s);
    }
    byNear.slice(0, NEAREST_KEEP).forEach(add);
    byEst.forEach(add);

    return ask(pick).then(function () {
      var r = evaluate(cand, rad);
      if (!r) return;
      return ask(cand.filter(function (s) {
        return !s._tried && upper(s, r) > r.best._trip.net;
      }));
    });
  }

  function render(meta, reg) {
    var rad = radius();
    OIL.loading('주변 주유소를 찾는 중...');
    collect(reg, rad).then(function (data) {
      var cand = data.stations.filter(function (s) { return price(s); });
      OIL.loading('실제 도로거리를 재는 중...');
      return measure(cand, rad).then(function () { draw(meta, reg, cand, rad); });
    }).catch(OIL.fail);
  }

  function draw(meta, reg, cand, rad) {
    var r = evaluate(cand, rad);
    var all = r ? r.all : [];

    var html = '<div class="oil-stack">';

    /* 머리말 - 괄호 안은 '찾은 개수'가 아니라 '보여주는 개수'다.
       반경 안 15곳 중 5곳을 보여주면서 (15)라고 적으면 세어보고 어리둥절해진다. */
    html += '<div class="oil-near-head">' +
      '<h1 class="oil-near-h1">' + (isMe ? '내 주변' : esc(placeName)) +
      ' 다 따져서 제일 싼 주유소' +
      '<span class="oil-near-n">(' + Math.min(all.length, SHOW) + ')</span></h1></div>';

    /* 고르는 줄 - 반경 · 유종 · 차종 */
    if (P) html += P.pickerHtml();

    if (!all.length) {
      html += '<div class="oil-note">' + esc(placeName) + ' 반경 <b>' + rad +
        'km</b> 안에 ' + fuelName() + ' 파는 주유소가 없습니다. ' +
        '위에서 반경을 넓혀보세요.</div>' +
        '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
        '<span>다른 장소로 찾기</span>' + OIL.chev('#fff') + '</a></div>';
      OIL.render(html);
      if (P) P.wirePicker(function () { render(meta, reg); });
      wireDetail();
      return;
    }

    var base = r.base, best = r.best;
    var list = OIL.showList(r.list, base, SHOW);
    var rankOf = function (s) { return r.list.indexOf(s) + 1; };
    var measured = cand.filter(function (s) { return s._tried; }).length;
    var guessed = all.some(function (s) { return !s._real; });
    var unsure = cand.filter(function (s) { return !s._tried && upper(s, r) > best._trip.net; }).length;

    /* 결론 상자 - 무엇에 비해 얼마가 남는지, 왜 2위·최저가가 아닌지, 몇 곳을 어떤
       조건으로 비교했는지. 사용자가 따라 셀 수 있어야 믿는다. */
    html += OIL.whyHtml({
      best: best, base: base, list: r.list, all: all, tie: r.tie, kind: 'near',
      price: price, reach: function (s) { return s._road; },
      reachText: function (s) { return '여기서 ' + (s._real ? '' : '약 ') + s._road.toFixed(1) + 'km'; },
      baseShort: BASE_SHORT,
      checked: '반경 ' + rad + 'km 안에 들 수 있는 <b>' + cand.length + '곳</b>을 모두 따져봤습니다 ' +
        '(실제 도로거리로 잰 곳 ' + measured + '곳' +
        (cand.length > measured
          ? (unsure ? ' · ' + unsure + '곳은 길찾기가 안 돼 확인하지 못했습니다'
                    : ' · 나머지는 가장 가깝게 쳐도 1위보다 덜 남는 곳') : '') + ')' +
        (guessed ? ' · 길찾기가 안 된 곳은 거리 앞에 "약"을 붙였습니다' : ''),
      cond: OIL.condText('near', meta.date)
    });

    /* 지도 - 목록에 보이는 곳을 그대로 찍는다 */
    if (OIL.map && OIL.map.can()) html += '<div class="oil-list-map" id="oil-list-map"></div>';

    html += OIL.adSlotHtml();

    html += '<div class="oil-sts">' + list.map(function (s, i) {
      return card(s, i, base.n, rankOf(s));
    }).join('') + '</div>';

    html += OIL.restHtml({
      rest: r.list.filter(function (s) { return list.indexOf(s) < 0; }),
      rankOf: rankOf, price: price, baseShort: BASE_SHORT,
      sub: function (s) { return '여기서 ' + (s._real ? '' : '약 ') + s._road.toFixed(1) + 'km'; },
      groups: [
        { title: '실제 도로거리가 반경 ' + rad + 'km를 넘어 뺀 곳',
          items: cand.filter(function (s) { return s._tried && s._road > rad; })
            .sort(function (a, b) { return a._road - b._road; }),
          fmt: function (s) { return won(price(s)) + '원(' + s._road.toFixed(1) + 'km)'; } },
        { title: '가장 가깝게 쳐도 1위보다 덜 남아 도로거리를 재지 않은 곳',
          items: cand.filter(function (s) { return !s._tried; })
            .sort(function (a, b) { return price(a) - price(b); }),
          fmt: function (s) { return won(price(s)) + '원'; } }
      ]
    });

    html += '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
      '<span>다른 장소로 찾기</span>' + OIL.chev('#fff') + '</a>';

    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      OIL.dateKo(meta.date) + ' ' + fuelName() + ' 실제 판매가 · 출처 오피넷 · ' +
      '거리는 카카오맵 길찾기의 실제 도로거리입니다</p></div>';

    OIL.render(html);
    document.title = placeName + ' 주변 주유소 최저가 - 주유소찾기';

    /* 첫 화면에서 다시 보여주려고 남겨둔다. 가격은 매일 바뀌니 담지 않는다 -
       이름과 도로거리만 있으면 오늘 가격으로 다시 계산할 수 있다. */
    if (PL && isMe && base._region && best._region) {
      PL.saveLast({
        place: placeName,
        top: { n: best.n, km: best._road, sl: best._region.replace(/ /g, '-') },
        base: { n: base.n, km: base._road, sl: base._region.replace(/ /g, '-') }
      });
    }

    shown = list;
    if (OIL.map) {
      OIL.map.render(document.getElementById('oil-list-map'), {
        from: { la: la, ln: ln, name: isMe ? '내 위치' : placeName },
        items: list.map(function (s, i) {
          return { la: s.la, ln: s.ln, name: s.n, label: won(price(s)),
                   brand: s.b, rank: rankOf(s), good: s._trip.net > 0, i: i };
        }),
        onPick: OIL.map.focusCard
      });
    }
    if (P) P.wirePicker(function () { render(meta, reg); });
    wireDetail();
  }

  /* ── 상세보기 펼치기 · 지도 ────────────────────────────────── */
  var shown = [];
  var wired = false;

  function wireDetail() {
    if (wired) return;          /* 다시 그릴 때마다 붙이면 한 번 눌러 두 번 열린다 */
    wired = true;
    OIL.root().addEventListener('click', function (e) {
      var b = e.target.closest('[data-detail]');
      if (!b) return;
      var i = b.getAttribute('data-detail');
      var box = document.getElementById('oil-det-' + i);
      if (!box) return;
      box.hidden = !box.hidden;
      b.textContent = box.hidden ? '상세보기' : '접기';
    });
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  if (!la || !ln) { location.replace(OIL.cfg.listPageUrl || '/'); return; }
  if (!isMe && qname && PL) PL.remember({ n: qname, a: '', la: la, ln: ln });

  OIL.loading('주변 주유소를 찾는 중...');
  Promise.all([OIL.meta(), OIL.regions()])
    .then(function (a) { render(a[0], a[1]); })
    .catch(OIL.fail);
})();
