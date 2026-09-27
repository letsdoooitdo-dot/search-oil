/* 갈까말까 - 동네 기름값 ("우리 동네 기름값 브리핑")

   ★ 2026-09-27 다시 설계했다. 전에는 '동네 안 가격 격차' 통계를 보여줘서 무엇을 얻어
     가라는 화면인지 모호했다(사용자 지적). 역할을 이렇게 나눈다.
       내 주변 찾기  - "지금 어디서 넣을까?" 거리까지 따져 한 곳을 추천
       동네 기름값   - "우리 동네 기름값 오늘 어때?" 매일 들여다보는 브리핑
     브리핑은 사용자가 알고 싶은 순서대로 쌓는다.
       1. 오늘 제일 싼 곳 3곳 (어제보다 오르내림) + 내 위치에서 거리까지 따져보기
       2. 넣을 타이밍 - 최근 며칠 동네 보통 가격 흐름
       3. 우리 동네는 비싼 편일까 - 전국·옆 동네 3곳과 비교
       4. 믿고 다닐 만한 곳 - 1년 내내 최저권을 지킨 집
       5. 전체 목록 (셀프만 보기)

   주소
     /p/area.html            우리 동네를 알면 바로 브리핑, 모르면 동네 고르기
     /p/area.html?pick=1     동네 고르기 (다른 동네 보기)
     /p/area.html?r=서울-마포구  그 동네 브리핑
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL) return;
  var mode = window.OIL_MODE;
  if (mode !== 'browse' && mode !== 'area') return;

  var esc = OIL.esc, won = OIL.won;
  var P = OIL.prefs, ENV = OIL.env;
  var AREA = OIL.cfg.areaPageUrl || '/p/area.html';

  function fuel() { return P ? P.get('fuel') : 'g'; }
  function fuelName() { return P ? P.fuelName() : '휘발유'; }
  function liters() { return P ? P.liters() : 30; }
  /* 동네 요약에서 지금 고른 유종의 통계를 꺼낸다 */
  function st(r) { return (r && r[fuel()]) || null; }
  function price(s) { return fuel() === 'd' ? s.d : s.g; }
  function yprice(s) { return fuel() === 'd' ? s.yd : s.yg; }
  function natMedian(meta) { return (fuel() === 'd' ? meta.diesel : meta.gas).median; }

  /* 광고 인텐트(구글이 글귀에 끼워 넣는 검색 버튼)가 목록 줄 안에 들어가면 목록 내용처럼
     보인다. 목록 구역만 google-anno-skip 으로 막는다 - 구글 공식 안내 방법이다
     (support.google.com/adsense/answer/15111968). 일반 광고 자리와는 상관없다. */
  var SKIP = ' google-anno-skip';

  /* ── 작은 조각들 ──────────────────────────────────────────── */
  function delta(s) {
    var p = price(s), y = yprice(s);
    if (!p || !y) return '';
    var d = Math.round(p - y);
    if (!d) return '<span class="oil-delta">어제와 같음</span>';
    /* 값이 내리면 사용자에게 좋은 일(초록), 오르면 드는 돈(빨강) */
    return '<span class="oil-delta ' + (d < 0 ? 'is-down' : 'is-up') + '">어제보다 ' +
      won(Math.abs(d)) + '원 ' + (d < 0 ? '↓' : '↑') + '</span>';
  }

  /* 1년 성격. '늘 최고권'인데 오늘 싼 곳만 "오늘만 쌈"이다 - 전에는 오늘도 비싼 곳에
     "오늘만 쌈"이 붙어 앞뒤가 안 맞았다. */
  function badge(s, md) {
    if (s.c === '늘 최저권') return '<span class="oil-badge is-low">1년 내내 최저권</span>';
    if (s.c === '늘 최고권') {
      return price(s) <= md ? '<span class="oil-badge is-high">오늘만 쌈</span>'
                            : '<span class="oil-badge is-mid">평소 비싼 편</span>';
    }
    return '';
  }

  function tags(s, md) {
    return (s.s ? '<span class="oil-tag">셀프</span>' : '') +
      (s.b ? '<span class="oil-tag">' + esc(s.b) + '</span>' : '') + badge(s, md);
  }

  /* 싼 순서. 같은 값이면 1년 내내 최저권인 집을 앞에 - 믿을 만한 쪽이 먼저 */
  function cheapFirst(a, b) {
    return price(a) - price(b) || (b.c === '늘 최저권') - (a.c === '늘 최저권');
  }

  function josa(w, pair) { return OIL.josa(w, pair); }

  /* ── 누르면 펼치는 상세 ────────────────────────────────────
     결과 화면의 '나머지 보기'와 같은 방식 - 그 자리에서 펼치고 다른 앱으로 넘어가지
     않는다(2026-09-27 사용자 요청). <details> 라 스크립트 없이도 열리고 닫힌다. */
  function yLine(now, y) {
    if (!now || !y) return '';
    var d = Math.round(now - y);
    return d ? ' <span class="oil-delta ' + (d < 0 ? 'is-down' : 'is-up') + '">어제보다 ' +
      won(Math.abs(d)) + '원 ' + (d < 0 ? '↓' : '↑') + '</span>' : ' <span class="oil-delta">어제와 같음</span>';
  }

  function detailHtml(s, md) {
    var fuels = [['휘발유', s.g, s.yg], ['경유', s.d, s.yd], ['고급휘발유', s.p], ['실내등유', s.k]];
    var h = '<div class="oil-rows">';
    fuels.forEach(function (f) {
      if (!f[1]) return;
      h += '<div class="oil-row"><span class="oil-row-k">' + f[0] + '</span>' +
        '<span class="oil-row-v">' + won(f[1]) + '원' + yLine(f[1], f[2]) + '</span></div>';
    });
    h += '<div class="oil-row"><span class="oil-row-k">주소</span>' +
      '<span class="oil-row-v" style="font-weight:500;">' + esc(s.a || '-') + '</span></div>';
    if (s.t) {
      h += '<div class="oil-row"><span class="oil-row-k">전화</span>' +
        '<span class="oil-row-v"><a href="tel:' + esc(s.t) + '">' + esc(s.t) + '</a></span></div>';
    }
    h += '<div class="oil-row"><span class="oil-row-k">상표</span>' +
      '<span class="oil-row-v" style="font-weight:500;">' + esc(s.b || '-') + (s.s ? ' · 셀프' : '') +
      '</span></div></div>';

    var gap = Math.round(md - price(s)), notes = [];
    notes.push(Math.abs(gap) < 1 ? '이 동네 보통 가격과 같아요.'
      : '이 동네 보통 가격(' + won(md) + '원)보다 리터당 <b>' + won(Math.abs(gap)) + '원 ' +
        (gap > 0 ? '싸요' : '비싸요') + '</b> (' + liters() + 'L면 ' + won(Math.abs(gap) * liters()) + '원).');
    if (s.c === '늘 최저권') notes.push('최근 1년 동안 이 동네 최저권을 지킨 곳이에요. 오늘만 싼 곳이 아닙니다.');
    else if (s.c === '늘 최고권') notes.push(price(s) <= md
      ? '평소에는 이 동네에서 비싼 축인데 오늘은 싸요. 일시적일 수 있어요.'
      : '최근 1년 동안 이 동네에서 비싼 축이었던 곳이에요.');
    return h + '<p class="oil-st-why">' + notes.join('<br>') + '</p>';
  }

  /* ── 1. 오늘 제일 싼 곳 ───────────────────────────────────── */
  function top3Html(r, list, s) {
    var top = list.slice(0, 3);
    var h = '<section class="oil-card is-flush' + SKIP + '"><div class="oil-sec-h">' +
      '<div class="oil-card-title">오늘 제일 싼 곳</div>' +
      '<p class="oil-sec-s">' + esc(r.r) + ' 주유소 ' + s.n + '곳 중 ' + fuelName() + ' 가격 순 · 누르면 상세보기</p></div>';
    h += top.map(function (x, i) {
      return '<details class="oil-area-item"><summary class="oil-top3-item">' +
        '<span class="oil-top3-no' + (i === 0 ? ' is-first' : '') + '">' + (i + 1) + '</span>' +
        '<span class="oil-top3-main"><b>' + esc(x.n) + '</b>' +
          '<i>' + tags(x, s.md) + '</i><i>' + delta(x) + '</i></span>' +
        '<span class="oil-top3-p">' + won(price(x)) + '<small>원</small></span></summary>' +
        '<div class="oil-area-det">' + detailHtml(x, s.md) + '</div></details>';
    }).join('');
    /* 싼 집이 나한테도 이득인지는 거리를 따져야 안다 - 그건 내 주변 찾기가 한다 */
    h += '<div class="oil-sec-f">' +
      '<button type="button" class="oil-near-btn" id="oil-area-near">' +
        '<span class="oil-near-l"><span><span class="oil-near-t">내 위치에서 거리까지 따져보기</span>' +
        '<span class="oil-near-where">제일 싼 곳이 나한테도 이득인지, 가는 기름값까지 계산합니다</span>' +
        '</span></span><span class="oil-near-go">찾기' + OIL.chev('#0891B2') + '</span></button>' +
      '<div class="oil-locate-msg" id="oil-area-msg"></div></div></section>';
    return h;
  }

  /* ── 2. 넣을 타이밍 ───────────────────────────────────────── */
  function trendHtml(r) {
    var t = r.trend, key = fuel();
    if (!t || !t[key]) return '';
    var pts = [];
    t.dates.forEach(function (d, i) { if (t[key][i] != null) pts.push({ d: d, v: t[key][i] }); });

    var h = '<section class="oil-card"><div class="oil-card-title">넣을 타이밍</div>';
    if (pts.length < 2) {
      return h + '<p class="oil-p">가격 흐름은 며칠 더 쌓이면 보여드립니다.</p></section>';
    }
    var first = pts[0].v, last = pts[pts.length - 1].v, prev = pts[pts.length - 2].v;
    var ch = Math.round(last - first), d1 = Math.round(last - prev), days = pts.length;
    var v = ch >= 10
      ? { cls: 'is-up', head: '오르는 중이에요',
          say: '최근 ' + days + '일 사이 보통 가격이 <b>' + won(ch) + '원</b> 올랐어요. ' +
               '넣을 생각이면 미루지 않는 게 좋아요.' }
      : ch <= -10
        ? { cls: 'is-down', head: '내리는 중이에요',
            say: '최근 ' + days + '일 사이 보통 가격이 <b>' + won(-ch) + '원</b> 내렸어요. ' +
                 '급하지 않으면 며칠 지켜봐도 괜찮아요.' }
        : { cls: '', head: '큰 변화 없어요',
            say: '최근 ' + days + '일 동안 보통 가격이 ' + (ch ? won(Math.abs(ch)) + '원 ' +
                 (ch > 0 ? '오른' : '내린') + ' 정도예요' : '그대로예요') +
                 '. 언제 넣어도 차이가 크지 않아요.' };

    h += '<p class="oil-trend-head ' + v.cls + '">' + v.head + '</p>' +
      '<p class="oil-p" style="margin-top:4px;">' + v.say +
      (d1 ? ' 어제보다는 ' + won(Math.abs(d1)) + '원 ' + (d1 > 0 ? '올랐어요.' : '내렸어요.')
          : ' 어제와는 같아요.') + '</p>';
    h += sparkline(pts);
    h += '<p class="oil-sec-note">' + esc(r.r) + ' ' + fuelName() + ' 보통 가격(주유소들의 가운데 값) ' +
      '흐름입니다. 지난 흐름이라 앞으로 오르내림을 보장하지는 않아요.</p></section>';
    return h;
  }

  /* 작은 꺾은선. 점마다 날짜, 첫 값과 마지막 값에 가격을 적는다. */
  function sparkline(pts) {
    var W = 320, H = 110, px = 22, top = 22, bot = 26;
    var vs = pts.map(function (p) { return p.v; });
    var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
    if (hi - lo < 10) { var mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
    function x(i) { return px + i * (W - px * 2) / (pts.length - 1); }
    function y(v) { return top + (hi - v) * (H - top - bot) / (hi - lo); }
    var line = pts.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p.v).toFixed(1); }).join(' ');
    var s = '<svg class="oil-spark" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="최근 가격 흐름">' +
      '<polyline points="' + line + '" fill="none" stroke="currentColor" stroke-width="2.5" ' +
      'stroke-linejoin="round" stroke-linecap="round"/>';
    pts.forEach(function (p, i) {
      var last = i === pts.length - 1;
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="' + (last ? 4.5 : 3) + '"' +
        (last ? ' class="is-last"' : '') + '/>';
      var md = p.d.split('-');
      s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="d">' +
        Number(md[0]) + '/' + Number(md[1]) + '</text>';
      if (i === 0 || last) {
        s += '<text x="' + x(i).toFixed(1) + '" y="' + (y(p.v) - 9).toFixed(1) + '" text-anchor="middle" ' +
          'class="v' + (last ? ' is-last' : '') + '">' + won(p.v) + '</text>';
      }
    });
    return s + '</svg>';
  }

  /* ── 3. 우리 동네는 비싼 편일까 ───────────────────────────── */
  function compareHtml(r, meta, reg) {
    var s = st(r), L = liters();
    var diff = Math.round(s.md - natMedian(meta));
    var line = Math.abs(diff) < 5
      ? '전국 보통 가격과 <b>거의 같아요</b>.'
      : '전국 보통 가격보다 리터당 <b class="' + (diff < 0 ? 'is-gain">' + won(-diff) + '원 싸요'
                                                     : 'is-cost">' + won(diff) + '원 비싸요') +
        '</b> (' + L + 'L면 ' + won(Math.abs(diff) * L) + '원).';

    /* 옆 동네 - 동네 중심끼리 가까운 3곳 */
    var nb = reg.items.filter(function (x) { return x.sl !== r.sl && x.la != null && st(x); })
      .map(function (x) { return { r: x, km: OIL.distKm(r.la, r.ln, x.la, x.ln) }; })
      .sort(function (a, b) { return a.km - b.km; }).slice(0, 3);
    var cheaper = nb.filter(function (x) { return st(x.r).md <= s.md - 10; })
      .sort(function (a, b) { return st(a.r).md - st(b.r).md; })[0];

    var h = '<section class="oil-card is-flush' + SKIP + '"><div class="oil-sec-h">' +
      '<div class="oil-card-title">우리 동네는 비싼 편일까?</div>' +
      '<p class="oil-p" style="margin-top:6px;">' + line + ' 전국 ' + reg.total + '개 시군구 중 <b>' +
        s.rk + '번째</b>로 저렴한 동네예요.</p>' +
      '<p class="oil-p" style="margin-top:6px;">' + (cheaper
        ? '옆 <b>' + esc(cheaper.r.r) + '</b>' + josa(cheaper.r.r, '이가') + ' 리터당 <b class="is-gain">' +
          won(s.md - st(cheaper.r).md) + '원</b> 싸요 (' + L + 'L면 ' +
          won((s.md - st(cheaper.r).md) * L) + '원). 가는 길이면 들러볼 만해요.'
        : '옆 동네들과 비교해도 비싸지 않은 편이에요.') + '</p></div>';
    h += '<div class="oil-rank">' +
      '<a href="' + OIL.areaUrl(r.sl) + '" class="is-me"><span>' + esc(r.r) + ' <i>우리 동네</i></span>' +
        '<span class="v">' + won(s.md) + '원</span></a>' +
      nb.map(function (x) {
        var d = Math.round(st(x.r).md - s.md);
        return '<a href="' + OIL.areaUrl(x.r.sl) + '"><span>' + esc(x.r.r) + '</span>' +
          '<span class="v">' + won(st(x.r).md) + '원 <i class="' + (d < 0 ? 'is-gain' : d > 0 ? 'is-cost' : '') + '">' +
          (Math.abs(d) < 1 ? '같음' : (d < 0 ? won(-d) + '원 쌈' : won(d) + '원 비쌈')) + '</i></span></a>';
      }).join('') + '</div>' +
      '<p class="oil-sec-note" style="padding:0 16px 12px;">가격은 동네마다 주유소들의 가운데 값(보통 가격)입니다</p>' +
      '</section>';
    return h;
  }

  /* ── 4. 믿고 다닐 만한 곳 ─────────────────────────────────── */
  function steadyHtml(r, list, s) {
    var low = list.filter(function (x) { return x.c === '늘 최저권'; });
    var oneDay = list.filter(function (x) { return x.c === '늘 최고권' && price(x) <= s.md; }).length;
    var h = '<section class="oil-card is-flush' + SKIP + '"><div class="oil-sec-h">' +
      '<div class="oil-card-title">믿고 다닐 만한 곳</div>' +
      '<p class="oil-sec-s">최근 1년 동안 이 동네 최저권을 지킨 주유소입니다. 오늘 하루 싼 집과 계속 싼 집은 다릅니다. 누르면 상세보기</p></div>';
    if (!low.length) {
      h += '<p class="oil-p" style="padding:0 16px 14px;">이 동네에는 1년 내내 최저권을 지킨 곳이 없어요. ' +
        '오늘 싼 곳이 다음 달에도 싸다는 보장이 없으니, 넣기 전에 한 번씩 확인하는 게 좋아요.</p>';
    } else {
      h += low.slice(0, 5).map(function (x) {
        return '<details class="oil-area-item"><summary class="oil-list-item">' +
          '<span class="oil-list-name">' + esc(x.n) +
          (x.s ? '<span class="oil-tag">셀프</span>' : '') + ' ' + delta(x) + '</span>' +
          '<span class="oil-list-price">' + won(price(x)) + '원</span></summary>' +
          '<div class="oil-area-det">' + detailHtml(x, s.md) + '</div></details>';
      }).join('');
    }
    if (oneDay) {
      h += '<p class="oil-sec-note" style="padding:8px 16px 12px;">반대로 평소 비싼 축인데 오늘만 싼 곳이 ' +
        oneDay + '곳 있어요. 목록에 "오늘만 쌈"으로 표시했습니다.</p>';
    }
    return h + '</section>';
  }

  /* ── 5. 전체 목록 ─────────────────────────────────────────── */
  function listRows(list, md, selfOnly) {
    return list.filter(function (x) { return !selfOnly || x.s; }).map(function (x) {
      return '<details class="oil-area-item"><summary class="oil-list-item">' +
        '<span class="oil-list-name">' + esc(x.n) + tags(x, md) +
        '<i class="oil-list-sub">' + delta(x) + '</i></span>' +
        '<span class="oil-list-price">' + won(price(x)) + '원</span></summary>' +
        '<div class="oil-area-det">' + detailHtml(x, md) + '</div></details>';
    }).join('') || '<p class="oil-p" style="padding:10px 16px;">셀프 주유소가 없어요.</p>';
  }

  function fullHtml(list, s, r) {
    return '<section class="oil-card is-flush' + SKIP + '"><div class="oil-sec-h">' +
      '<div class="oil-card-title">전체 ' + list.length + '곳 · 싼 순서</div>' +
      '<p class="oil-sec-s">누르면 상세보기</p>' +
      '<div class="oil-sido-tabs" id="oil-area-self" style="margin-top:9px;">' +
        '<button type="button" class="oil-chip active" data-v="all">전체</button>' +
        '<button type="button" class="oil-chip" data-v="self">셀프만 (' + r.sf + '곳)</button></div></div>' +
      '<div id="oil-area-list">' + listRows(list, s.md, false) + '</div></section>';
  }

  /* ── 동네 브리핑 ──────────────────────────────────────────── */
  function renderArea(meta, r, reg) {
    var s = st(r);
    if (!s) {
      OIL.render('<div class="oil-error">' + esc(r.r) + josa(r.r, '은는') + ' ' + fuelName() +
        ' 자료가 없습니다.<br><a href="' + AREA + '?pick=1">다른 동네 보기</a></div>');
      return;
    }
    if (P) P.set('last', r.sl);
    var list = (r.stations || []).filter(function (x) { return price(x); }).sort(cheapFirst);
    var spot = P ? P.get('spot') : '';

    var html = '<div class="oil-stack">';
    html += OIL.adSlotHtml('top');

    /* 첫 줄이 곧 답이다 - 오늘 이 동네 최저가 */
    html += '<div><div class="oil-kicker" style="color:var(--oil-mint-strong)">동네 기름값 · ' +
        OIL.dateKo(meta.date) + '</div>' +
      '<h1 class="oil-h1">' + esc(r.r) + ' 오늘 ' + fuelName() + '<br>최저 ' + won(s.lo) + '원</h1>' +
      '<p class="oil-lead" style="margin-top:6px;">주유소 ' + s.n + '곳 · 보통 ' + won(s.md) + '원 · ' +
        '가장 비싼 곳 ' + won(s.hi) + '원</p>' +
      '<div class="oil-area-where">' + (spot ? '<span class="oil-spot">현위치 ' + esc(spot) + '</span>' : '') +
        '<a class="oil-area-other" href="' + AREA + '?pick=1">다른 동네 보기 ›</a></div></div>';

    /* 유종만 둔다 - 이 화면의 숫자는 유종으로만 갈린다(차종은 계산기·주유소 찾기에서) */
    if (P) html += P.barHtml({ regionName: r.r, fixed: true, noCar: true });

    html += top3Html(r, list, s);
    html += trendHtml(r);
    html += compareHtml(r, meta, reg);
    html += steadyHtml(r, list, s);
    html += fullHtml(list, s, r);

    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      esc(r.r) + ' · ' + OIL.dateKo(meta.date) + ' ' + fuelName() + ' 실제 판매가 ' + s.n + '곳 · ' +
      (r.prevDate ? '어제 대비는 ' + OIL.dateKo(r.prevDate) + ' 가격과 비교 · ' : '') +
      '1년 성격은 최근 1년 일별 가격으로 산출 · 출처 오피넷</p></div>';

    OIL.render(html);
    document.title = r.r + ' 주유소 최저가 - 오늘 ' + fuelName() + ' ' + won(s.lo) + '원부터 | 갈까말까';

    if (P) P.wireBar(function () { renderArea(meta, r, reg); });
    wireArea(r, list, s);
  }

  function wireArea(r, list, s) {
    var self = document.getElementById('oil-area-self');
    if (self) {
      self.addEventListener('click', function (e) {
        var b = e.target.closest('.oil-chip');
        if (!b) return;
        self.querySelectorAll('.oil-chip').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        document.getElementById('oil-area-list').innerHTML =
          listRows(list, s.md, b.getAttribute('data-v') === 'self');
      });
    }
    /* 내 위치로 '내 주변 찾기'를 연다. 위치를 못 받으면 이 동네 가운데를 출발점으로 */
    var btn = document.getElementById('oil-area-near');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var msg = document.getElementById('oil-area-msg');
      var center = AREA + '?la=' + r.la + '&ln=' + r.ln + '&q=' + encodeURIComponent(r.r + ' 가운데');
      btn.disabled = true;
      if (msg) msg.textContent = '위치를 확인하는 중...';
      if (!ENV || !ENV.locate) { location.href = center; return; }
      ENV.locate(function (pos) {
        location.href = AREA + '?la=' + pos.coords.latitude.toFixed(5) +
          '&ln=' + pos.coords.longitude.toFixed(5) + '&me=1';
      }, function () {
        if (msg) msg.textContent = '위치를 못 받아서 ' + r.r + ' 가운데를 기준으로 찾습니다...';
        location.href = center;
      }, function (step) { if (msg) msg.textContent = step; });
    });
  }

  /* ── 동네 고르기 ──────────────────────────────────────────── */
  function renderPick(meta, reg) {
    var items = reg.items;
    var bySido = {};
    items.forEach(function (r) { (bySido[r.sd] = bySido[r.sd] || []).push(r); });
    var sidos = Object.keys(bySido).sort();
    var cheapest = items.filter(st).sort(function (a, b) { return st(a).md - st(b).md; }).slice(0, 5);

    var html = '<div class="oil-stack">';
    html += OIL.adSlotHtml('top');
    html += '<div><h1 class="oil-h1">우리 동네 기름값</h1>' +
      '<p class="oil-lead">오늘 우리 동네에서 <b>제일 싼 곳</b>, <b>넣을 타이밍</b>, ' +
      '<b>옆 동네와 비교</b>까지 한눈에 보여드려요.</p></div>';

    if (P) html += P.barHtml({ fixed: true, noCar: true });

    html += '<div class="oil-card"><div class="oil-card-title">우리 동네 찾기</div>';
    if (P) html += P.locateBtnHtml() + '<div style="height:12px;"></div>';
    html += '<input class="oil-search" id="oil-q" type="search" ' +
      'placeholder="또는 동네 이름 입력 (예: 천안)" autocomplete="off" aria-label="동네 검색">' +
      '<div class="oil-suggest' + SKIP + '" id="oil-sg"></div>' +
      '<div id="oil-browse" class="' + SKIP.trim() + '" style="margin-top:13px;">' +
      '<div class="oil-sido-tabs" id="oil-sidos">' +
      sidos.map(function (s, i) {
        return '<button type="button" class="oil-chip' + (i === 0 ? ' active' : '') +
          '" data-sido="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('') +
      '</div><div class="oil-region-grid" id="oil-regions"></div></div></div>';

    html += '<div class="oil-card is-flush' + SKIP + '"><div class="oil-sec-h">' +
      '<div class="oil-card-title">오늘 ' + fuelName() + josa(fuelName(), '이가') + ' 싼 동네</div>' +
      '<p class="oil-sec-s">동네 보통 가격(가운데 값)이 낮은 5곳</p></div>' +
      '<div class="oil-rank">' + cheapest.map(function (r) {
        return '<a href="' + OIL.areaUrl(r.sl) + '"><span>' + esc(r.r) + '</span>' +
          '<span class="v">' + won(st(r).md) + '원</span></a>';
      }).join('') + '</div></div>';

    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      OIL.dateKo(meta.date) + ' 실제 판매가 · 출처 오피넷 · 매일 갱신</p></div>';

    OIL.render(html);
    document.title = '우리 동네 기름값 - 오늘 제일 싼 주유소 | 갈까말까';
    if (P) {
      P.wireBar(function () { renderPick(meta, reg); });
      P.wireLocate();
    }
    wireFind(items, bySido, sidos);
  }

  function wireFind(items, bySido, sidos) {
    var grid = document.getElementById('oil-regions');
    var sidoBox = document.getElementById('oil-sidos');
    var q = document.getElementById('oil-q');
    var sg = document.getElementById('oil-sg');
    var browse = document.getElementById('oil-browse');
    if (!grid) return;

    function showSido(sd) {
      grid.innerHTML = (bySido[sd] || []).slice().sort(function (a, b) {
        return a.r.localeCompare(b.r, 'ko');
      }).map(function (r) {
        var name = r.r.indexOf(' ') > 0 ? r.r.slice(r.r.indexOf(' ') + 1) : r.r;
        return '<a href="' + OIL.areaUrl(r.sl) + '">' + esc(name) + '</a>';
      }).join('');
    }
    showSido(sidos[0]);

    sidoBox.addEventListener('click', function (e) {
      var b = e.target.closest('.oil-chip');
      if (!b) return;
      sidoBox.querySelectorAll('.oil-chip').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      showSido(b.getAttribute('data-sido'));
    });

    q.addEventListener('input', function () {
      var v = q.value.trim();
      if (!v) { sg.innerHTML = ''; browse.style.display = ''; return; }
      browse.style.display = 'none';
      var hit = items.filter(function (r) { return r.r.indexOf(v) >= 0 && st(r); }).slice(0, 8);
      sg.innerHTML = hit.length
        ? hit.map(function (r) {
            return '<a href="' + OIL.areaUrl(r.sl) + '">' + esc(r.r) +
              '<span class="s">주유소 ' + st(r).n + '곳 · 최저 ' + won(st(r).lo) + '원</span></a>';
          }).join('')
        : '<div style="padding:10px 12px;font-size:13px;color:#5B666A;">찾는 동네가 없습니다</div>';
    });
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  function mySlug() { return P ? (P.get('home') || P.get('last')) : ''; }

  OIL.loading();
  Promise.all([OIL.meta(), OIL.regions()]).then(function (a) {
    var meta = a[0], reg = a[1];
    /* 동네 목록(?pick=1)이 아니고 우리 동네를 알면 바로 브리핑을 보여준다 */
    var slug = mode === 'area' ? OIL.param('r') : (OIL.param('pick') ? '' : mySlug());
    var known = slug && reg.items.some(function (x) { return x.sl === slug; });
    if (!known) { renderPick(meta, reg); return; }
    return OIL.region(slug).then(function (r) { renderArea(meta, r, reg); });
  }).catch(OIL.fail);
})();
