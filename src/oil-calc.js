/* 주유소찾기 - 계산기 "더 가도 될까"

   계산기는 이것 하나만 둔다. 연간 주유비·경차 환급은 뺐다 -
   둘 다 우리가 하는 일(저기까지 더 가도 이득인가)과 상관이 없고,
   읽을거리에 가까워서 '주유 꿀팁' 글로 옮겼다.

   기준 가격은 전국이 아니라 **우리 동네 중앙값**을 쓴다.
   전국 평균은 통계지 내 이야기가 아니다. 위치를 모르면 들어오자마자
   한 번 물어보고, 거부하면 그때만 전국 값으로 물러선다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'calc') return;
  var esc = OIL.esc, won = OIL.won;

  /* 위치는 한 번만 물어본다. 거부한 사람에게 다시 그릴 때마다 물으면
     화면을 쓸 수가 없다. */
  var askedLocation = false;

  /* 입력칸. 두 칸씩 나란히 놓으므로 이름은 짧아야 한다 -
     길면 두 줄로 접히면서 좌우 높이가 어긋난다. */
  function field(id, label, value, unit, hint) {
    return '<div class="oil-field"><label for="' + id + '">' + esc(label) + '</label>' +
      '<div class="oil-field-in"><input id="' + id + '" type="number" inputmode="decimal" value="' +
      value + '"><span class="oil-field-unit">' + esc(unit) + '</span></div>' +
      (hint ? '<div class="oil-field-hint">' + esc(hint) + '</div>' : '') + '</div>';
  }

  /* 숫자로 받을 수 없는 선택지. 칩으로 둬야 고를 수 있다는 게 보인다. */
  function chips(id, label, opts, cur, hint) {
    return '<div class="oil-field"><label>' + esc(label) + '</label>' +
      '<div class="oil-sido-tabs" id="' + id + '">' + opts.map(function (o) {
        return '<button type="button" class="oil-chip' + (o[0] === cur ? ' active' : '') +
          '" data-v="' + o[0] + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>' +
      '<div class="oil-field-hint" id="' + id + '-h">' + esc(hint) + '</div></div>';
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

  function tripHint(t) {
    return t === 'round' ? '주유만 하러 갔다 오면 왕복' : '넣고 가던 길 계속 가면 편도';
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

    var trip = (P && P.get('trip')) || 'one';

    var html = '<div class="oil-stack">';

    /* 맨 위 광고 - 글 화면과 같은 자리 */
    html += OIL.adSlotHtml();

    /* 제목 위에 "계산기"라는 딱지를 붙이지 않는다(2026-09-23). 탭에서 이미
       계산기를 누르고 들어온 사람에게 한 번 더 알려줄 필요가 없고, 붉은 글씨는
       '비용' 쪽에 써야 하는 색이라 제목 위에서 낭비된다. */
    html += '<div>' +
      '<h1 class="oil-h1">저기까지 가서 넣어도 이득일까?</h1>' +
      '<p class="oil-lead">싼 주유소가 멀 때, <b>가는 기름값까지 빼고</b> 이득인지 ' +
      '손해인지 계산합니다. ' + (ms
        ? '<b>' + esc(mine.r) + '</b> 오늘 실제 판매가 기준입니다.'
        : '오늘 전국 실제 판매가 기준입니다.') + '</p></div>';

    /* 설정 - 접지 않는다. 여기서 고르는 게 곧 계산 조건이다. */
    if (P) html += P.barHtml({ fixed: true });

    /* 위치를 모르면 들어오자마자 한 번 물어본다(아래 autoLocate).
       이 상자는 그 상태를 보여주고, 거부했을 때 다시 눌러볼 자리가 된다. */
    if (!ms) {
      html += '<div class="oil-note" id="oil-calc-loc">' +
        '<span id="oil-calc-locate-msg">우리 동네 기름값으로 계산하려고 위치를 확인합니다...</span>' +
        '<button type="button" class="oil-locate" id="oil-calc-locate" ' +
        'style="margin-top:11px;">내 위치로 우리 동네 잡기</button></div>';
    }

    /* ── 입력 ─────────────────────────────────────────────────
       두 칸씩 나란히 놓는다. 숫자 하나 넣는 칸이 한 줄을 통째로 쓰면
       여섯 줄이 되어, 정작 답인 결과 카드가 화면 밖으로 밀려난다. */
    html += '<div class="oil-card"><div class="oil-fields2">' +
      field('c3gap', '가격 차이', 50, '원/L', '거기가 여기보다') +
      field('c3km', '더 가는 거리', 10, 'km', '지금 넣을 곳보다') +
      field('c3l', '넣을 양', car.usual, 'L', car.label) +
      field('c3kmpl', '연비', car.kmpl, 'km/L', car.label) +
      field('c3p', '기름값', basePrice, '원/L', baseWhere + ' ' + fuelName) +
      chips('c3trip', '가는 방식', [['one', '편도'], ['round', '왕복']], trip, tripHint(trip)) +
      '</div></div>';

    /* ── 결과 ─────────────────────────────────────────────── */
    html += '<div class="oil-card is-accent">' +
      '<div class="oil-kicker" id="c3out-k">결과</div>' +
      '<div class="oil-hero" id="c3out" style="margin-top:6px;">-</div>' +
      '<p class="oil-p" id="c3out-s" style="margin-top:9px;font-size:12.5px;"></p></div>';

    html += '<div class="oil-card">' +
      '<div class="oil-card-title">계산 근거</div>' +
      '<div class="oil-rows" style="margin-top:0;">' +
      '<div class="oil-row"><span class="oil-row-k">싸게 넣어서 아끼는 돈</span>' +
        '<span class="oil-row-v" id="c3save">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">실제로 더 달리는 거리</span>' +
        '<span class="oil-row-v" id="c3drive">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">그 거리에 드는 기름값</span>' +
        '<span class="oil-row-v is-accent" id="c3cost">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">여기까지는 가도 본전</span>' +
        '<span class="oil-row-v" id="c3be">-</span></div></div></div>';

    /* 맨 아래 - 버튼을 빼고 출처를 그 자리에 둔다.
       계산기까지 온 사람에게 "다른 화면 보세요"는 흐름을 끊는 말이다. */
    html += '<p class="oil-calc-note">' + OIL.dateKo(meta.date) +
      ' ' + esc(baseWhere) + ' ' + fuelName + ' 실제 판매가 기준 · 출처 오피넷<br>' +
      '실제 주유비는 운전 습관과 유가 변동에 따라 달라집니다</p>';

    html += '</div>';

    OIL.render(html);
    /* 블로그스팟이 "주유소찾기: calc" 로 붙이는 제목을 검색용으로 바꾼다 */
    document.title = '싼 주유소 더 가도 될까 - 기름값 손익 계산기';

    wire(trip);
    if (P) {
      P.wireBar(function () { render(meta, reg); });
      wireLocate(meta, reg, !!ms);
    }
  }

  /* ── 위치 ──────────────────────────────────────────────────
     위치를 모르면 들어오자마자 한 번 스스로 물어본다. 전국 평균으로
     계산해놓고 "정확하게 하려면 눌러보세요"라고 하면 아무도 안 누른다.
     거부하면 전국 값으로 돌아가고, 버튼은 남겨둬 다시 해볼 수 있게 한다. */
  function wireLocate(meta, reg, haveRegion) {
    var btn = document.getElementById('oil-calc-locate');
    if (!btn) return;
    var msg = document.getElementById('oil-calc-locate-msg');

    function go() {
      btn.disabled = true;
      msg.textContent = '위치를 확인하는 중...';
      OIL.prefs.locate(function (hit, err) {
        if (err) {
          btn.disabled = false;
          msg.innerHTML = esc(err) + '<br>지금은 <b>전국 중앙값</b>으로 계산합니다.';
          return;
        }
        OIL.prefs.set('last', hit.region.sl);
        OIL.prefs.set('spot', OIL.prefs.spotText(hit));
        render(meta, reg);   /* 그 동네 값으로 다시 그린다 */
      });
    }

    btn.addEventListener('click', go);
    if (!haveRegion && !askedLocation) { askedLocation = true; go(); }
  }

  function wire(trip) {
    var $ = function (id) { return document.getElementById(id); };

    /* 식은 oil-core.js 의 calcTrip 과 같아야 한다. 계산기와 목록 화면이
       다른 답을 내놓으면 어느 쪽도 못 믿게 된다. */
    function calc() {
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
      $('c3drive').textContent = drive.toFixed(1) + 'km' + (mult === 2 ? ' (왕복)' : '');
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
      $('c3trip-h').textContent = tripHint(trip);
      calc();
    });

    ['c3gap', 'c3km', 'c3l', 'c3kmpl', 'c3p'].forEach(function (id) {
      $(id).addEventListener('input', calc);
    });
    calc();
  }

  OIL.loading();
  Promise.all([OIL.meta(), OIL.regions()])
    .then(function (a) { render(a[0], a[1]); })
    .catch(OIL.fail);
})();
