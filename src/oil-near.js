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

  /* 반경은 사용자가 고른다(1~10km). 주유소 목록은 한 번만 받아두고,
     반경을 바꿀 때는 걸러내기만 한다(자료는 다시 받지 않는다). */
  var MAX_RADIUS = 10;    /* 카카오 다중 목적지 길찾기 한계 */
  /* 시군구 경계 문제 - 중심이 이 안에 있는 동네를 함께 본다.
     반경은 최대 10km 인데 25km 씩 떨어진 동네까지 받으면 쓰지도 않을
     자료를 기다리게 된다. 18km 면 경계 건너편은 그대로 들어온다. */
  var NEAR_REGION = 18;
  var MAX_REGION = 4;
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
     시군구 하나만 보면 경계 바로 건너편의 더 싼 집을 놓친다.
     그래서 가까운 동네 몇 곳을 같이 불러 합친다. */
  function collect(reg) {
    var near = reg.items
      .filter(function (r) { return r.la != null; })
      .map(function (r) {
        return { r: r, km: OIL.distKm(la, ln, r.la, r.ln) };
      })
      .filter(function (x) { return x.km <= NEAR_REGION; })
      .sort(function (a, b) { return a.km - b.km; })
      .slice(0, MAX_REGION);

    if (!near.length) return Promise.resolve({ stations: [], regions: [] });

    return Promise.all(near.map(function (x) {
      return OIL.region(x.r.sl).catch(function () { return null; });
    })).then(function (list) {
      var out = [];
      list.forEach(function (detail, i) {
        if (!detail) return;
        (detail.stations || []).forEach(function (s) {
          if (s.la == null) return;
          /* 직선거리는 후보를 고를 때만 쓴다. 도로거리는 직선보다 항상 기니까
             직선 10km 안에서 뽑으면 도로 10km 안의 주유소는 하나도 안 빠진다. */
          var km = OIL.distKm(la, ln, s.la, s.ln);
          if (km > MAX_RADIUS) return;
          s._straight = km;
          s._region = near[i].r.r;
          out.push(s);
        });
      });
      return { stations: out, regions: near.map(function (x) { return x.r; }) };
    });
  }

  /* ── 한 곳 카드 ──────────────────────────────────────────── */
  function card(s, i, baseName) {
    var p = price(s);
    var t = s._trip;
    var line = OIL.tripLine(t, s._isBase);

    var tags = '';
    if (s.s) tags += '<span class="oil-tag">셀프</span>';
    if (s.b) tags += '<span class="oil-tag">' + esc(s.b) + '</span>';
    if (s.c === '늘 최저권') tags += '<span class="oil-badge is-low">1년 내내 최저권</span>';
    else if (s.c === '늘 최고권') tags += '<span class="oil-badge is-high">오늘만 쌈</span>';

    /* 순위는 카드 맨 위에 띠로 단다. 1위만 색을 넣어 눈이 먼저 가게 한다.
       지도 표시도 같은 번호를 쓰므로 둘을 눈으로 이어 붙일 수 있다. */
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

    /* 왜 이런 판정이 나왔는지 - 숨기지 않고 밝힌다 */
    html += '<p class="oil-st-why">' +
      '여기서 <b>' + t.km.toFixed(1) + 'km</b> (실제 도로 기준)' +
      (s._isBase
        ? '<br>가장 가까운 주유소라 이곳을 비교 기준으로 씁니다.'
        : '<br>기준(' + esc(baseName) + ')보다 <b>' + t.extra.toFixed(1) + 'km 더</b> 갑니다' +
          (t.round ? ' · 왕복이라 ' + t.drive.toFixed(1) + 'km' : '') +
          '<br>' + t.car.label + ' ' + t.kmpl + 'km/L · ' + t.L + 'L 주유 기준<br>' +
          '아끼는 돈 ' + won(t.gain) + '원 − 거기까지 가는 기름값 ' + won(t.cost) + '원 = ' +
          '<b>' + (t.net >= 0 ? '+' : '') + won(t.net) + '원</b>') +
      (s._real ? '' : '<br><span class="oil-st-caveat">이 주유소는 길찾기가 안 돼 ' +
        '직선거리로 어림했습니다.</span>') + '</p>';

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
  /* 실제 도로거리를 재둔다. 한 번에 30곳까지만 물어볼 수 있으므로
     '이길 가능성이 있는 곳'을 고른다 - 싼 곳들과, 비교 기준이 될 가까운 곳들.
     나머지는 직선 어림값으로 채우고 화면에 '약'을 붙여 밝힌다. */
  function measure(cand) {
    var byNear = cand.slice().sort(function (a, b) { return a._straight - b._straight; });
    var byPrice = cand.slice().sort(function (a, b) { return price(a) - price(b); });

    var pick = [], seen = {};
    function add(s) {
      var k = s.n + '|' + s.a;
      if (seen[k] || pick.length >= OIL.road.MAX_DEST) return;
      seen[k] = 1; pick.push(s);
    }
    byNear.slice(0, NEAREST_KEEP).forEach(add);
    byPrice.forEach(add);

    return OIL.road.matrix({ la: la, ln: ln }, pick).then(function (res) {
      pick.forEach(function (s, i) { s._road = res[i].km; s._real = res[i].real; });
      cand.forEach(function (s) {
        if (s._road == null) { s._road = s._straight * OIL.road.GUESS; s._real = false; }
      });
    });
  }

  function render(meta, data) {
    var rad = radius();
    /* 도로거리는 직선거리보다 항상 기니까, 직선 R 안에서 후보를 뽑으면
       도로 R 안의 주유소는 하나도 빠지지 않는다 */
    var cand = data.stations.filter(function (s) {
      return price(s) && s._straight <= rad;
    });
    OIL.loading('실제 도로거리를 재는 중...');
    measure(cand).then(function () { draw(meta, data, cand, rad); });
  }

  function draw(meta, data, cand, rad) {
    var all = cand.filter(function (s) { return s._road <= rad; });

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
      if (P) P.wirePicker(function () { render(meta, data); });
      wireDetail();
      return;
    }

    /* 기준 = 여기서 가장 가까운 주유소(도로 기준). 아무것도 안 따지면 갔을 곳이다. */
    var base = all.reduce(function (a, b) { return b._road < a._road ? b : a; });
    var basePrice = price(base);
    var round = isRound();

    all.forEach(function (s) {
      s._isBase = (s === base);
      s._trip = OIL.calcTrip(price(s), basePrice, s._road, base._road, round);
    });

    var list = all.slice().sort(function (a, b) {
      if (b._trip.net !== a._trip.net) return b._trip.net - a._trip.net;
      return a._road - b._road;
    }).slice(0, SHOW);

    /* 이 한 줄이 결론이다. 계산 과정("빼고도 남습니다")을 말하지 않고
       "어디서 넣으면 얼마 이득인지"를 바로 말한다. */
    var best = list[0];
    var lead = (best._isBase || best._trip.net <= 0)
      ? '<b>' + esc(base.n) + '</b>에서 넣는 게 제일 낫습니다. ' +
        '더 싼 곳도 있지만, 거기까지 오가는 기름값이 아끼는 돈보다 큽니다.'
      : '<b>' + esc(best.n) + '</b>까지 가서 넣으면 제일 가까운 ' +
        esc(base.n) + '보다 <b>' + won(best._trip.net) + '원</b>을 아낍니다. ' +
        '거기까지 가는 기름값은 이미 뺀 금액입니다.';
    html += '<p class="oil-lead" style="margin-top:0;">' + lead + '</p>';

    /* 지도 - 목록에 보이는 곳을 그대로 찍는다 */
    if (OIL.map && OIL.map.can()) html += '<div class="oil-list-map" id="oil-list-map"></div>';

    html += OIL.adSlotHtml();

    html += '<div class="oil-sts">' + list.map(function (s, i) {
      return card(s, i, base.n);
    }).join('') + '</div>';

    if (all.length > list.length) {
      html += '<p class="oil-p" style="font-size:12px;color:var(--oil-muted);text-align:center;">' +
        '반경 ' + rad + 'km 안 <b>' + all.length + '곳</b>을 전부 계산해 ' +
        '제일 아끼는 <b>' + list.length + '곳</b>만 보여드립니다</p>';
    }

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
                   brand: s.b, rank: i + 1, good: s._trip.net > 0, i: i };
        }),
        onPick: OIL.map.focusCard
      });
    }
    if (P) P.wirePicker(function () { render(meta, data); });
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
    .then(function (a) {
      return collect(a[1]).then(function (data) { render(a[0], data); });
    })
    .catch(OIL.fail);
})();
