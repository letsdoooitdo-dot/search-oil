/* 주유소찾기 - 계산기 세 종 (연간 주유비 / 경차 환급 / 우회 손익분기) */
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

  function result(id) {
    return '<div class="oil-card is-accent">' +
      '<div class="oil-kicker" id="' + id + '-k">결과</div>' +
      '<div class="oil-hero" id="' + id + '" style="margin-top:6px;">-</div>' +
      '<p class="oil-p" id="' + id + '-s" style="margin-top:9px;font-size:12.5px;"></p></div>';
  }

  function render(meta) {
    var gas = Math.round(meta.gas.median);
    var diesel = Math.round(meta.diesel.median);
    var selfM = Math.round(meta['self']), fullM = Math.round(meta.full);
    var cheap = Math.round(meta.regionCheap.md), pricey = Math.round(meta.regionPricey.md);

    var html = '<div class="oil-stack">';
    html += '<div><div class="oil-kicker">계산기</div>' +
      '<h1 class="oil-h1">기름값 계산기</h1>' +
      '<p class="oil-lead">전국 ' + won(meta.gas.n) + '곳 실제 판매가로 계산합니다. ' +
      '일반적인 평균치가 아니라 오늘 실제로 팔리는 가격입니다.</p></div>';

    /* 탭 */
    html += '<div class="oil-sido-tabs" id="oil-calc-tabs">' +
      ['연간 주유비', '경차 환급', '우회 손익분기'].map(function (t, i) {
        return '<button type="button" class="oil-chip' + (i === 0 ? ' active' : '') +
          '" data-t="' + i + '">' + t + '</button>';
      }).join('') + '</div>';

    /* 1. 연간 주유비 */
    html += '<div class="oil-pane" data-p="0"><div class="oil-card">' +
      field('c1km', '한 달 주행거리', 1200, 'km', '출퇴근 왕복 20km × 22일이면 약 440km입니다') +
      field('c1kmpl', '연비', 12, 'km/L', '모르시면 일반 승용차 12, 경차 16, SUV 8 정도로 넣으세요') +
      '<div class="oil-field"><label for="c1fuel">유종</label>' +
      '<div class="oil-field-in"><select id="c1fuel">' +
      '<option value="g">휘발유</option><option value="d">경유</option></select></div></div>' +
      '</div>' + result('c1out') +
      '<div class="oil-card" style="margin-top:12px;">' +
      '<div class="oil-card-title">어디서 넣느냐로 갈리는 돈</div>' +
      '<p class="oil-p" style="font-size:12.5px;">같은 거리를 달려도 주유소를 어떻게 고르느냐에 따라 1년 치가 이만큼 달라집니다.</p>' +
      '<div class="oil-rows"><div class="oil-row">' +
      '<span class="oil-row-k">셀프로만 넣으면 (' + won(fullM - selfM) + '원 저렴)</span>' +
      '<span class="oil-row-v is-accent" id="c1self">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">가장 싼 동네 vs 비싼 동네</span>' +
      '<span class="oil-row-v is-accent" id="c1region">-</span></div></div>' +
      '<p class="oil-p" style="font-size:12px;color:#6B7679;margin-top:11px;">오늘 ' +
      esc(meta.regionCheap.r) + ' ' + won(cheap) + '원이 가장 낮고 ' +
      esc(meta.regionPricey.r) + ' ' + won(pricey) + '원이 가장 높습니다.</p></div></div>';

    /* 2. 경차 환급 */
    html += '<div class="oil-pane" data-p="1" hidden><div class="oil-card">' +
      field('c2m', '한 달 주유량', 40, 'L', '월 주유비를 오늘 중앙값으로 나누면 대략 나옵니다') +
      '</div>' + result('c2out') +
      '<div class="oil-card" style="margin-top:12px;">' +
      '<div class="oil-card-title">알아두실 것</div>' +
      '<div class="oil-rows" style="margin-top:0;">' +
      '<div class="oil-row"><span class="oil-row-k">환급 단가</span><span class="oil-row-v">리터당 ' + REFUND_PER_L + '원</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">연 한도</span><span class="oil-row-v">' + won(REFUND_CAP) + '원</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">한도까지 주유량</span><span class="oil-row-v is-accent">' +
      won(REFUND_CAP / REFUND_PER_L) + 'L</span></div></div>' +
      '<p class="oil-p" style="margin-top:12px;">전용 유류구매카드로 결제해야 자동 적용됩니다. ' +
      '일반 카드로 결제하면 소급되지 않습니다. 한도는 매년 1월에 초기화됩니다.</p>' +
      '<div class="oil-note" style="margin-top:11px;">환급 단가와 한도는 법 개정에 따라 바뀔 수 있습니다. ' +
      '현재 적용 기준은 국세청 또는 카드사에 확인하세요.</div></div></div>';

    /* 3. 우회 손익분기 */
    html += '<div class="oil-pane" data-p="2" hidden><div class="oil-card">' +
      field('c3gap', '리터당 가격 차이', 50, '원', '거기가 여기보다 얼마나 싼가요') +
      field('c3l', '넣을 양', 30, 'L', '') +
      field('c3kmpl', '연비', 12, 'km/L', '') +
      field('c3p', '기름값', gas, '원/L', '오늘 전국 중앙값을 넣어뒀습니다') +
      '</div>' + result('c3out') +
      '<div class="oil-card" style="margin-top:12px;">' +
      '<div class="oil-card-title">계산 근거</div>' +
      '<div class="oil-rows" style="margin-top:0;">' +
      '<div class="oil-row"><span class="oil-row-k">싸게 넣어서 아끼는 돈</span><span class="oil-row-v" id="c3save">-</span></div>' +
      '<div class="oil-row"><span class="oil-row-k">1km 더 달리는 비용</span><span class="oil-row-v is-accent" id="c3cost">-</span></div></div>' +
      '<p class="oil-p" style="margin-top:12px;">여기서 말하는 거리는 <b>왕복이 아니라 우회분</b>입니다. ' +
      '가던 길에서 벗어났다가 다시 돌아오는 데 추가로 드는 거리만 셉니다.</p></div></div>';

    html += OIL.adHtml();
    html += '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
      '<span>우리 동네 기름값 보기</span>' + OIL.chev('#fff') + '</a>';
    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      OIL.dateKo(meta.date) + ' 실제 판매가 기준 · 출처 오피넷 · 실제 주유비는 운전 습관·유가 변동에 따라 달라집니다</p>';
    html += '</div>';

    OIL.render(html);
    wire(gas, diesel, selfM, fullM, cheap, pricey);
  }

  function wire(gas, diesel, selfM, fullM, cheap, pricey) {
    var $ = function (id) { return document.getElementById(id); };

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

    function c1() {
      var km = parseFloat($('c1km').value) || 0;
      var kmpl = parseFloat($('c1kmpl').value) || 0;
      var isG = $('c1fuel').value === 'g';
      $('c1out-k').textContent = '연간 주유비';
      if (kmpl <= 0) { $('c1out').textContent = '-'; $('c1out-s').textContent = '연비를 입력해주세요.'; return; }
      var base = isG ? gas : diesel;
      var liters = (km * 12) / kmpl;
      $('c1out').textContent = won(liters * base) + '원';
      $('c1out-s').innerHTML = '1년에 약 <b>' + won(liters) + 'L</b>를 넣게 됩니다 (월 ' +
        won(km / kmpl) + 'L). 오늘 전국 중앙값 ' + won(base) + '원 기준입니다.';
      $('c1self').textContent = won(liters * (fullM - selfM)) + '원';
      $('c1region').textContent = won(liters * (pricey - cheap)) + '원';
    }

    function c2() {
      var m = parseFloat($('c2m').value) || 0;
      var yearL = m * 12;
      var refund = Math.min(yearL * REFUND_PER_L, REFUND_CAP);
      $('c2out-k').textContent = '연간 환급액';
      $('c2out').textContent = won(refund) + '원';
      if (yearL <= 0) { $('c2out-s').textContent = '월 주유량을 입력해주세요.'; return; }
      if (yearL * REFUND_PER_L >= REFUND_CAP) {
        $('c2out-s').innerHTML = '연 한도 <b>30만원</b>을 채웁니다. 약 <b>' +
          (REFUND_CAP / REFUND_PER_L / m).toFixed(1) + '개월</b>이면 한도에 도달하고, 그 뒤 주유분은 환급되지 않습니다.';
      } else {
        $('c2out-s').innerHTML = '1년에 <b>' + won(yearL) + 'L</b>를 넣으시는 기준입니다. 한도까지 <b>' +
          won(REFUND_CAP - yearL * REFUND_PER_L) + '원</b>이 남아, 더 넣으셔도 전액 환급 대상입니다.';
      }
    }

    function c3() {
      var gap = parseFloat($('c3gap').value) || 0;
      var l = parseFloat($('c3l').value) || 0;
      var kmpl = parseFloat($('c3kmpl').value) || 0;
      var p = parseFloat($('c3p').value) || 0;
      $('c3out-k').textContent = '여기까지는 돌아가도 본전';
      if (gap <= 0 || kmpl <= 0 || p <= 0) {
        $('c3out').textContent = '-'; $('c3out-s').textContent = '값을 모두 입력해주세요.'; return;
      }
      var perKm = p / kmpl;
      var km = (gap * l) / perKm;
      $('c3out').textContent = km.toFixed(1) + 'km';
      $('c3out-s').innerHTML = '리터당 <b>' + won(gap) + '원</b> 싼 곳에 <b>' + won(l) +
        'L</b>를 넣는다면, <b>' + km.toFixed(1) + 'km</b>까지 돌아가도 본전입니다. ' +
        '이보다 멀면 아낀 돈보다 쓴 기름값이 큽니다.';
      $('c3save').textContent = won(gap * l) + '원';
      $('c3cost').textContent = won(perKm) + '원';
    }

    ['c1km', 'c1kmpl', 'c1fuel'].forEach(function (id) {
      $(id).addEventListener('input', c1); $(id).addEventListener('change', c1);
    });
    $('c2m').addEventListener('input', c2);
    ['c3gap', 'c3l', 'c3kmpl', 'c3p'].forEach(function (id) { $(id).addEventListener('input', c3); });
    c1(); c2(); c3();
  }

  OIL.loading();
  OIL.meta().then(render).catch(OIL.fail);
})();
