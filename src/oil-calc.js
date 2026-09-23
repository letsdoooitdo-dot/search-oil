/* 주유소찾기 - 계산기 세 종

   순서가 곧 중요도다. 맨 앞은 이 사이트가 하는 일 그 자체 -
   "저기까지 더 가도 이득인가". 나머지 둘은 곁다리다.
     1. 더 가도 될까   (예전 이름: 우회 손익분기)
     2. 연간 주유비
     3. 경차 환급

   기준 가격은 전국이 아니라 **우리 동네 중앙값**을 쓴다.
   전국 평균은 통계지 내 이야기가 아니다. 내가 넣는 동네 값이어야
   "내 얘기"로 읽힌다. 위치를 모르면 그때만 전국 값으로 물러선다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'calc') return;
  var esc = OIL.esc, won = OIL.won;

  /* 경차 유류세 환급 (조세특례제한법) */
  var REFUND_PER_L = 250, REFUND_CAP = 300000;

  function field(id, label, value, unit, hint) {
    return '<div class="oil-field"><label for="' + id + '">' + esc(label) + '</label>' +
      '<div class="oil-field-in"><input id="' + id + '" type="number" inputmode="decimal" value="' +
      value + '"><span class="oil-field-unit">' + esc(unit) + '</span></div>' +
      (hint ? '<div class="oil-field-hint">' + esc(hint) + '</div>' : '') + '</div>';
  }

  /* 숫자로 받을 수 없는 선택지. 칩으로 둬야 무엇을 고를 수 있는지 한눈에 보인다. */
  function chips(id, label, opts, cur, hint) {
    return '<div class="oil-field"><label>' + esc(label) + '</label>' +
      '<div class="oil-sido-tabs" id="' + id + '">' + opts.map(function (o) {
        return '<button type="button" class="oil-chip' + (o[0] === cur ? ' active' : '') +
          '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>' +
      (hint ? '<div class="oil-field-hint" id="' + id + '-h">' + esc(hint) + '</div>' : '') +
      '</div>';
  }

  function result(id) {
    return '<div class="oil-card is-accent">' +
      '<div class="oil-kicker" id="' + id + '-k">결과</div>' +
      '<div class="oil-hero" id="' + id + '" style="margin-top:6px;">-</div>' +
      '<p class="oil-p" id="' + id + '-s" style="margin-top:9px;font-size:12.5px;"></p></div>';
  }

  /* ── 우리 동네 찾기 ────────────────────────────────────────
     내 주변 화면이나 동네 화면에서 한 번이라도 위치를 잡았으면 그 동네를 쓴다. */
  function myRegion(reg) {
    var slug = OIL.prefs && (OIL.prefs.get('home') || OIL.prefs.get('last'));
    if (!slug) return null;
    for (var i = 0; i < reg.items.length; i++) {
      if (reg.items[i].sl === slug) return reg.items[i];
    }
    return null;
  }

  function render(meta, reg) {
    var P = OIL.prefs;
    var car = P ? P.car() : { kmpl: 12, usual: 30, label: '일반 승용차' };
    var isDiesel = P && P.get('fuel') === 'd';
    var fuelName = isDiesel ? '경유' : '휘발유';
    var natl = isDiesel ? meta.diesel : meta.gas;

    /* 기준 가격 - 우리 동네가 있으면 그 동네 중앙값 */
    var mine = myRegion(reg);
    var ms = mine ? (isDiesel ? mine.d : mine.g) : null;
    var basePrice = Math.round(ms ? ms.md : natl.median);
    var baseWhere = ms ? mine.r : '전국';
    var selfM = Math.round(meta['self']), fullM = Math.round(meta.full);

    var trip = (P && P.get('trip')) || 'one';

    var html = '<div class="oil-stack">';

    /* 맨 위 광고 - 글 화면과 같은 자리 */
    html += OIL.adSlotHtml();

    html += '<div><div class="oil-kicker">계산기</div>' +
      '<h1 class="oil-h1">기름값 계산기</h1>' +
      '<p class="oil-lead">' + (ms
        ? '<b>' + esc(mine.r) + '</b> 주유소 ' + ms.n + '곳의 오늘 실제 판매가로 계산합니다. '
        : '전국 ' + won(natl.n) + '곳 실제 판매가로 계산합니다. ') +
      '차종을 고르면 연비와 주유량이 자동으로 채워집니다.</p></div>';

    /* 설정 - 접지 않는다. 여기서 고르는 게 곧 계산 조건이다. */
    if (P) html += P.barHtml({ fixed: true });

    /* 위치를 모르면 전국 값으로 돌아가므로, 잡을 기회를 준다 */
    if (!ms) {
      html += '<div class="oil-note">지금은 <b>전국 중앙값</b>으로 계산합니다. ' +
        '우리 동네 값으로 바꾸면 훨씬 정확합니다.' +
        '<button type="button" class="oil-locate" id="oil-calc-locate" ' +
        'style="margin-top:11px;">내 위치로 우리 동네 잡기</button>' +
        '<div class="oil-locate-msg" id="oil-calc-locate-msg"></div></div>';
    }

    /* 탭 - 앞에 올수록 중요한 것 */
    var TABS = ['더 가도 될까', '연간 주유비', '경차 환급'];
    html += '<div class="oil-sido-tabs" id="oil-calc-tabs">' +
      TABS.map(function (t, i) {
        return '<button type="button" class="oil-chip' + (i === 0 ? ' active' : '') +
          '" data-t="' + i + '">' + t + '</button>';
      }).join('') + '</div>';

    /* ── 1. 더 가도 될까 ──────────────────────────────────────
       예전에는 "몇 km까지 가면 본전인가"만 답했다. 그런데 사람은
       "10km 떨어진 곳이 50원 싸다"는 구체적인 상황을 들고 온다.
       거리를 직접 넣게 하고 이득/손해를 바로 답해준다. */
    html += '<div class="oil-pane" data-p="0"><div class="oil-card">' +
      field('c3gap', '거기가 얼마나 싼가요', 50, '원/L', '리터당 가격 차이입니다') +
      field('c3km', '얼마나 더 가야 하나요', 10, 'km', '지금 넣을 곳보다 더 가는 거리입니다') +
      chips('c3trip', '가는 방식', [['one', '편도'], ['round', '왕복']], trip,
            trip === 'round' ? '주유만 하러 갔다가 돌아옵니다 - 거리를 두 배로 셉니다'
                             : '주유하고 가던 길을 계속 갑니다') +
      field('c3l', '넣을 양', car.usual, 'L', car.label + ' 1회 주유량 기준') +
      field('c3kmpl', '연비', car.kmpl, 'km/L', car.label + ' 기본값') +
      field('c3p', '기름값', basePrice, '원/L', '오늘 ' + baseWhere + ' ' + fuelName + ' 중앙값') +
      '</div>' + result('c3out') +
      '<div class="oil-card" style="margin-top:12px;">' +
      '<div class="oil-card-title">계산 근거</div>' +
      '<div class="oil-rows" style="margin-top:0;">' +
      '<div class="oil-row"><span class="oil-row-k">싸게 넣어서 아끼는 돈</span>' +
        '<span class="oil-row-v" id="c3save">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">실제로 더 달리는 거리</span>' +
        '<span class="oil-row-v" id="c3drive">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">그 거리에 드는 기름값</span>' +
        '<span class="oil-row-v is-accent" id="c3cost">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">여기까지는 가도 본전</span>' +
        '<span class="oil-row-v" id="c3be">-</span></div></div></div></div>';

    /* ── 2. 연간 주유비 ────────────────────────────────────── */
    html += '<div class="oil-pane" data-p="1" hidden><div class="oil-card">' +
      field('c1km', '한 달 주행거리', 1200, 'km', '출퇴근 왕복 20km × 22일이면 약 440km입니다') +
      field('c1kmpl', '연비', car.kmpl, 'km/L', car.label + ' 기본값입니다. 내 차 연비를 알면 고쳐주세요') +
      '</div>' + result('c1out') +
      '<div class="oil-card" style="margin-top:12px;">' +
      '<div class="oil-card-title">어디서 넣느냐로 갈리는 돈</div>' +
      '<p class="oil-p" style="font-size:12.5px;">같은 거리를 달려도 주유소를 어떻게 고르느냐에 ' +
      '따라 1년 치가 이만큼 달라집니다.</p>' +
      '<div class="oil-rows"><div class="oil-row">' +
      '<span class="oil-row-k">셀프로만 넣으면 (' + won(fullM - selfM) + '원 저렴)</span>' +
      '<span class="oil-row-v is-accent" id="c1self">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">' +
        (ms ? esc(mine.r) + ' 제일 싼 집 vs 제일 비싼 집' : '가장 싼 동네 vs 비싼 동네') +
      '</span><span class="oil-row-v is-accent" id="c1gap">-</span></div></div>' +
      '<p class="oil-p" style="font-size:12px;color:var(--oil-muted);margin-top:11px;">' +
      (ms
        ? '오늘 ' + esc(mine.r) + ' ' + fuelName + '은 최저 ' + won(ms.lo) + '원, 최고 ' +
          won(ms.hi) + '원입니다. 같은 동네 안에서 리터당 ' + won(ms.sp) + '원이 갈립니다.'
        : '오늘 ' + esc(meta.regionCheap.r) + ' ' + won(meta.regionCheap.md) +
          '원이 가장 낮고 ' + esc(meta.regionPricey.r) + ' ' + won(meta.regionPricey.md) +
          '원이 가장 높습니다.') +
      '</p></div></div>';

    /* ── 3. 경차 환급 ──────────────────────────────────────── */
    html += '<div class="oil-pane" data-p="2" hidden>' +
      '<div class="oil-card" style="margin-bottom:12px;">' +
      '<div class="oil-card-title">경차를 타면 기름값 일부를 돌려받습니다</div>' +
      '<p class="oil-p">경차(배기량 1,000cc 미만) 소유자는 주유할 때 낸 세금 중 ' +
      '<b>리터당 250원</b>을 돌려받습니다. 할인이 아니라 <b>나라에서 환급</b>해주는 돈이라, ' +
      '신청해두면 주유할 때마다 자동으로 빠집니다.</p>' +
      '<p class="oil-p">다만 <b>1년에 30만원까지</b>만 돌려줍니다. ' +
      '이 계산기는 <b>내가 1년에 얼마나 돌려받는지</b>, 그리고 <b>한도를 언제 채우는지</b>를 알려드립니다.</p>' +
      '</div><div class="oil-card">' +
      field('c2m', '한 달 주유량', 40, 'L', '월 주유비를 ' + won(basePrice) + '원으로 나누면 대략 나옵니다') +
      '</div>' + result('c2out') +
      '<div class="oil-card" style="margin-top:12px;">' +
      '<div class="oil-card-title">알아두실 것</div>' +
      '<div class="oil-rows" style="margin-top:0;">' +
      '<div class="oil-row"><span class="oil-row-k">환급 단가</span>' +
        '<span class="oil-row-v">리터당 ' + REFUND_PER_L + '원</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">연 한도</span>' +
        '<span class="oil-row-v">' + won(REFUND_CAP) + '원</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">한도까지 주유량</span>' +
        '<span class="oil-row-v is-accent">' + won(REFUND_CAP / REFUND_PER_L) + 'L</span></div></div>' +
      '<p class="oil-p" style="margin-top:12px;"><b>전용 유류구매카드로 결제해야</b> 자동 적용됩니다. ' +
      '일반 카드로 넣으면 나중에 소급해주지 않습니다. 한도는 매년 1월에 다시 채워집니다.</p>' +
      '<div class="oil-note" style="margin-top:11px;">환급 단가와 한도는 법이 바뀌면 달라집니다. ' +
      '지금 적용되는 기준은 국세청이나 카드사에 확인해주세요.</div></div></div>';

    /* 맨 아래 - 버튼을 빼고 출처를 그 자리에 둔다.
       계산기까지 온 사람에게 "다른 화면 보세요"는 흐름을 끊는 말이다.
       대신 이 숫자가 어디서 왔는지를 읽을 만한 크기로 밝힌다. */
    html += '<p class="oil-calc-note">' + OIL.dateKo(meta.date) +
      ' ' + (ms ? esc(mine.r) : '전국') + ' ' + fuelName + ' 실제 판매가 기준 · 출처 오피넷<br>' +
      '실제 주유비는 운전 습관과 유가 변동에 따라 달라집니다</p>';

    html += '</div>';

    OIL.render(html);
    /* 블로그스팟이 "주유소찾기: calc" 로 붙이는 제목을 검색용으로 바꾼다 */
    document.title = '기름값 계산기 - 더 가도 될까·연간 주유비·경차 환급';

    wire({ basePrice: basePrice, selfM: selfM, fullM: fullM, ms: ms, meta: meta, trip: trip });
    if (P) {
      P.wireBar(function () { render(meta, reg); });
      wireLocate(meta, reg);
    }
  }

  /* 위치를 잡으면 그 동네로 다시 그린다. 동네 화면으로 넘기지 않는다 -
     계산하던 중이었으니 여기 그대로 있어야 한다. */
  function wireLocate(meta, reg) {
    var btn = document.getElementById('oil-calc-locate');
    if (!btn) return;
    var msg = document.getElementById('oil-calc-locate-msg');
    btn.addEventListener('click', function () {
      btn.disabled = true;
      msg.textContent = '위치를 확인하는 중...';
      OIL.prefs.locate(function (hit, err) {
        if (err) { btn.disabled = false; msg.textContent = err; return; }
        OIL.prefs.set('last', hit.region.sl);
        OIL.prefs.set('spot', OIL.prefs.spotText(hit));
        render(meta, reg);
      });
    });
  }

  function wire(cfg) {
    var $ = function (id) { return document.getElementById(id); };
    var trip = cfg.trip;

    var tabs = $('oil-calc-tabs');
    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('.oil-chip');
      if (!b) return;
      tabs.querySelectorAll('.oil-chip').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      var t = b.getAttribute('data-t');
      document.querySelectorAll('.oil-pane').forEach(function (p) {
        p.hidden = p.getAttribute('data-p') !== t;
      });
    });

    /* ── 1. 더 가도 될까 ─────────────────────────────────────
       식은 oil-core.js 의 calcTrip 과 같아야 한다. 계산기와 목록 화면이
       다른 답을 내놓으면 어느 쪽도 못 믿게 된다. */
    function c3() {
      var gap = parseFloat($('c3gap').value) || 0;
      var km = parseFloat($('c3km').value) || 0;
      var l = parseFloat($('c3l').value) || 0;
      var kmpl = parseFloat($('c3kmpl').value) || 0;
      var p = parseFloat($('c3p').value) || 0;

      if (gap <= 0 || kmpl <= 0 || p <= 0 || l <= 0) {
        $('c3out-k').textContent = '결과';
        $('c3out').textContent = '-';
        $('c3out-s').textContent = '값을 모두 입력해주세요.';
        return;
      }

      var mult = trip === 'round' ? 2 : 1;
      var drive = km * mult;              /* 실제로 더 달리는 거리 */
      var gain = gap * l;                 /* 싸게 넣어 아끼는 돈 */
      var cost = drive / kmpl * p;        /* 그 거리에 드는 기름값 */
      var net = gain - cost;
      var beKm = gain * kmpl / (p * mult);  /* 여기까지는 가도 본전 */

      $('c3out-k').textContent = net >= 0 ? '가면 이득입니다' : '가면 손해입니다';
      $('c3out').textContent = won(Math.abs(net)) + '원';
      $('c3out-s').innerHTML = net >= 0
        ? '리터당 <b>' + won(gap) + '원</b> 싼 곳에 <b>' + won(l) + 'L</b>를 넣으면 ' +
          won(gain) + '원을 아낍니다. ' + drive.toFixed(1) + 'km 더 달리는 기름값 ' +
          won(cost) + '원을 빼도 <b>' + won(net) + '원</b>이 남습니다.'
        : '싸게 넣어 ' + won(gain) + '원을 아끼지만, ' + drive.toFixed(1) +
          'km 더 달리는 기름값이 ' + won(cost) + '원입니다. ' +
          '<b>' + beKm.toFixed(1) + 'km</b> 안쪽이어야 이득입니다.';

      $('c3save').textContent = won(gain) + '원';
      $('c3drive').textContent = drive.toFixed(1) + 'km' +
        (mult === 2 ? ' (왕복)' : '');
      $('c3cost').textContent = won(cost) + '원';
      $('c3be').textContent = beKm.toFixed(1) + 'km';
    }

    var tripBox = $('c3trip');
    tripBox.addEventListener('click', function (e) {
      var b = e.target.closest('.oil-chip');
      if (!b) return;
      tripBox.querySelectorAll('.oil-chip').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      trip = b.getAttribute('data-v');
      if (OIL.prefs) OIL.prefs.set('trip', trip);
      $('c3trip-h').textContent = trip === 'round'
        ? '주유만 하러 갔다가 돌아옵니다 - 거리를 두 배로 셉니다'
        : '주유하고 가던 길을 계속 갑니다';
      c3();
    });

    /* ── 2. 연간 주유비 ────────────────────────────────────── */
    function c1() {
      var km = parseFloat($('c1km').value) || 0;
      var kmpl = parseFloat($('c1kmpl').value) || 0;
      $('c1out-k').textContent = '연간 주유비';
      if (kmpl <= 0) {
        $('c1out').textContent = '-';
        $('c1out-s').textContent = '연비를 입력해주세요.';
        return;
      }
      var liters = (km * 12) / kmpl;
      $('c1out').textContent = won(liters * cfg.basePrice) + '원';
      $('c1out-s').innerHTML = '1년에 약 <b>' + won(liters) + 'L</b>를 넣게 됩니다 (월 ' +
        won(km / kmpl) + 'L). 리터당 ' + won(cfg.basePrice) + '원 기준입니다.';
      $('c1self').textContent = won(liters * (cfg.fullM - cfg.selfM)) + '원';
      /* 동네를 알면 그 동네 최저~최고, 모르면 전국 동네 간 차이 */
      var spread = cfg.ms ? (cfg.ms.hi - cfg.ms.lo)
                          : (cfg.meta.regionPricey.md - cfg.meta.regionCheap.md);
      $('c1gap').textContent = won(liters * spread) + '원';
    }

    /* ── 3. 경차 환급 ──────────────────────────────────────── */
    function c2() {
      var m = parseFloat($('c2m').value) || 0;
      var yearL = m * 12;
      var refund = Math.min(yearL * REFUND_PER_L, REFUND_CAP);
      $('c2out-k').textContent = '1년에 돌려받는 돈';
      $('c2out').textContent = won(refund) + '원';
      if (yearL <= 0) { $('c2out-s').textContent = '월 주유량을 입력해주세요.'; return; }
      if (yearL * REFUND_PER_L >= REFUND_CAP) {
        $('c2out-s').innerHTML = '연 한도 <b>30만원</b>을 다 받습니다. 약 <b>' +
          (REFUND_CAP / REFUND_PER_L / m).toFixed(1) +
          '개월</b>이면 한도에 닿고, 그 뒤에 넣는 기름은 환급되지 않습니다.';
      } else {
        $('c2out-s').innerHTML = '1년에 <b>' + won(yearL) + 'L</b>를 넣으시는 기준입니다. ' +
          '한도까지 <b>' + won(REFUND_CAP - yearL * REFUND_PER_L) +
          '원</b>이 남아 있어, 더 넣으셔도 전액 돌려받습니다.';
      }
    }

    ['c3gap', 'c3km', 'c3l', 'c3kmpl', 'c3p'].forEach(function (id) {
      $(id).addEventListener('input', c3);
    });
    ['c1km', 'c1kmpl'].forEach(function (id) {
      $(id).addEventListener('input', c1); $(id).addEventListener('change', c1);
    });
    $('c2m').addEventListener('input', c2);
    c3(); c1(); c2();
  }

  OIL.loading();
  Promise.all([OIL.meta(), OIL.regions()])
    .then(function (a) { render(a[0], a[1]); })
    .catch(OIL.fail);
})();
