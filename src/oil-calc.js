/* 주유소찾기 - 계산기 "더 가도 될까"

   계산기는 이것 하나만 둔다. 연간 주유비·경차 환급은 뺐다 -
   둘 다 우리가 하는 일(저기까지 더 가도 이득인가)과 상관이 없고,
   읽을거리에 가까워서 '주유 꿀팁' 글로 옮겼다.

   ★ 결과 화면이 추천할 때 쓰는 계산을 그대로 해보는 곳이다(2026-09-27 사용자 요청).
     비교 기준(그냥 넣었을 곳)과 비교할 곳을 각각 넣고, 내 주변(편도/왕복)·가는 길(우회)을
     고른다. 식은 OIL.calcTrip, 보여주는 모양은 OIL.tripRows - 결과 화면과 같은 것을 쓴다.

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
  /* 차종을 바꾸면 화면을 다시 그린다 - 그때 고른 상황이 풀리지 않게 밖에 둔다 */
  var calcMode = 'near';

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

  /* 상황에 따라 바뀌는 글자들. 가는 길은 '여기서 거리'가 아니라 '우회거리'를 넣는다. */
  /* ★ 거리는 비교할 곳 하나만 받는다(2026-09-27 사용자 지적). 계산에 들어가는 건
     '기준보다 얼마나 더 가나'뿐이라, 기준 거리까지 바꿀 수 있으면 무엇을 넣는 칸인지
     헷갈린다. 기준은 지금 그냥 넣으면 되는 곳 - 출발점(0km)으로 고정해 보여준다. */
  var MODE = {
    near: { base: '제일 가까운 곳', dist: '더 가는 거리', distHint: '제일 가까운 곳보다 (실제 도로거리)',
            modeHint: '지금 있는 곳 주변에서 고를 때' },
    dest: { base: '처음 나오는 곳', dist: '더 돌아가는 거리', distHint: '처음 나오는 곳보다 · 길가면 0',
            modeHint: '목적지 가는 길에 들를 때' }
  };

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
    var liters = P ? P.liters() : car.usual;

    var html = '<div class="oil-stack">';

    /* 맨 위 광고 - 글 화면과 같은 자리 */
    html += OIL.adSlotHtml('top');

    /* 제목 위에 "계산기"라는 딱지를 붙이지 않는다(2026-09-23). 탭에서 이미
       계산기를 누르고 들어온 사람에게 한 번 더 알려줄 필요가 없고, 붉은 글씨는
       '비용' 쪽에 써야 하는 색이라 제목 위에서 낭비된다. */
    html += '<div>' +
      '<h1 class="oil-h1">정말 이득인지 계산해 보기</h1>' +
      '<p class="oil-lead">우리 사이트가 주유소를 추천할 때 쓰는 계산을 <b>그대로</b> ' +
      '해볼 수 있습니다. 그냥 넣었을 곳(비교 기준)과 비교할 곳의 가격·거리를 넣어보세요. ' +
      '기본값은 ' + (ms ? '<b>' + esc(mine.r) + '</b>' : '전국') + ' 오늘 실제 판매가입니다.</p></div>';

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
    /* 기본값은 첫 화면 예시와 같은 상황 - 리터당 100원 싼 곳이 15km 떨어져 있다.
       첫 화면은 '다녀오기(왕복)' 기준이라 1,500원 손해, 편도로 보면 750원 이득이다.
       편도/왕복은 사용자가 고른 값을 따른다 - 여기서 바꾸면 내 주변 화면 설정까지 바뀐다. */
    var mode = calcMode, M = MODE[mode];
    html += '<div class="oil-card"><div class="oil-fields2">' +
      chips('c3mode', '어디서 찾나요', [['near', '내 주변'], ['dest', '가는 길']], mode, M.modeHint) +
      '<div id="c3trip-box">' +
        chips('c3trip', '가는 방식', [['one', '편도'], ['round', '왕복']], trip, tripHint(trip)) +
      '</div></div></div>';

    html += '<div class="oil-card"><div class="oil-card-title">비교 기준 · <span id="c3a-name">' +
        M.base + '</span></div>' +
      '<p class="oil-field-hint" style="margin:-4px 0 10px;">아무것도 안 따지면 그냥 넣었을 곳</p>' +
      '<div class="oil-fields2">' +
        field('c3ap', '기름값', basePrice, '원/L', baseWhere + ' ' + fuelName) +
        /* 거리는 고정 - 입력칸처럼 보이되 바꿀 수 없다는 게 보이게 잠가 둔다 */
        '<div class="oil-field"><label>거리</label>' +
          '<div class="oil-field-in is-fixed"><input type="text" value="기준 0" disabled>' +
          '<span class="oil-field-unit">km</span></div>' +
          '<div class="oil-field-hint">출발점이라 고정</div></div>' +
      '</div></div>';

    html += '<div class="oil-card"><div class="oil-card-title">비교할 곳 · 더 싼 곳</div>' +
      '<div class="oil-fields2">' +
        field('c3bp', '기름값', basePrice - 100, '원/L', '비교 기준보다 싸면 이득 후보') +
        field('c3bd', M.dist, 15, 'km', M.distHint) +
      '</div></div>';

    html += '<div class="oil-card"><div class="oil-card-title">내 차</div>' +
      '<div class="oil-fields2">' +
        field('c3kmpl', '연비', car.kmpl, 'km/L', car.label) +
        field('c3l', '넣을 양', liters, 'L', '한 번에 넣는 양') +
      '</div></div>';

    /* ── 결과 - 결과 화면의 '왜 추천하나요'와 같은 계산 줄 ─────── */
    /* 결과 카드는 중립색 - 늘 빨갛게 두면 이득이 나와도 손해처럼 보인다.
       금액만 이득이면 초록, 손해면 빨강. */
    html += '<div class="oil-card oil-calc-out">' +
      '<div class="oil-kicker" id="c3out-k">결과</div>' +
      '<div class="oil-hero" id="c3out" style="margin-top:6px;">-</div>' +
      '<div id="c3rows"></div>' +
      '<p class="oil-p" id="c3out-s" style="margin-top:10px;font-size:12.5px;"></p></div>';

    /* 맨 아래 - 버튼을 빼고 출처를 그 자리에 둔다.
       계산기까지 온 사람에게 "다른 화면 보세요"는 흐름을 끊는 말이다. */
    html += '<p class="oil-calc-note">' + OIL.dateKo(meta.date) +
      ' ' + esc(baseWhere) + ' ' + fuelName + ' 실제 판매가 기준 · 출처 오피넷<br>' +
      '실제 주유비는 운전 습관과 유가 변동에 따라 달라집니다</p>';

    html += '</div>';

    OIL.render(html);
    /* 블로그스팟이 "주유소찾기: calc" 로 붙이는 제목을 검색용으로 바꾼다 */
    document.title = '싼 주유소 더 가도 될까 - 기름값 손익 계산기 | 갈까말까';

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

    function num(id) { return parseFloat($(id).value); }

    /* 식은 결과 화면과 똑같이 OIL.calcTrip 으로 낸다 - 여기서 따로 셈하지 않는다. */
    function calc() {
      var ap = num('c3ap'), bp = num('c3bp'), bd = num('c3bd');
      var kmpl = num('c3kmpl'), l = num('c3l');
      var M = MODE[calcMode], dest = calcMode === 'dest';

      if (!(ap > 0 && bp > 0 && kmpl > 0 && l > 0 && bd >= 0)) {
        $('c3out-k').textContent = '결과';
        $('c3out').textContent = '-';
        $('c3rows').innerHTML = '';
        $('c3out-s').textContent = '값을 모두 입력해주세요.';
        return;
      }

      var round = !dest && trip === 'round';
      var t = OIL.calcTrip(bp, ap, bd, 0, round, { L: l, kmpl: kmpl });
      var net = Math.round(t.net);

      $('c3out-k').textContent = net > 0 ? '비교할 곳에서 넣는 게 이득입니다'
        : net < 0 ? M.base + '에서 넣는 게 낫습니다' : '어디서 넣어도 같습니다';
      $('c3out').innerHTML = net === 0 ? '0원'
        : '<span class="' + (net > 0 ? 'is-gain' : 'is-cost') + '">' +
          won(Math.abs(net)) + '원 ' + (net > 0 ? '이득' : '손해') + '</span>';
      $('c3rows').innerHTML = OIL.tripRows(t, bp, dest ? 'detour' : null);

      /* 본전 거리와, 결과 화면이 실제로 어떻게 추천할지까지 알려준다 */
      var s = [];
      if (t.gain > 0) {
        s.push(M.base + '보다 <b>' + t.beKm.toFixed(1) + 'km</b> 더 ' +
          (dest ? '돌아가는' : (round ? '가는(왕복 기준)' : '가는')) + ' 데까지는 이득입니다.');
      } else if (t.gain < 0) {
        s.push('비교할 곳이 리터당 ' + won(-t.gain / t.L) + '원 더 비싸서, 거리가 같아도 손해입니다.');
      }
      if (net > 0 && net < OIL.TIE) {
        s.push('차이가 ' + OIL.TIE + '원도 안 돼서, 결과 화면에서는 ' +
          (dest ? '먼저 나오는' : '더 가까운') + ' 곳을 1위로 추천합니다.');
      }
      $('c3out-s').innerHTML = s.join('<br>');
    }

    function pick(boxId, onPick) {
      var box = $(boxId);
      box.addEventListener('click', function (e) {
        var b = e.target.closest('.oil-chip');
        if (!b) return;
        box.querySelectorAll('.oil-chip').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        onPick(b.getAttribute('data-v'));
        calc();
      });
    }

    /* 상황을 바꾸면 거리 칸 이름과 설명이 바뀐다. 가는 길은 편도·왕복을 묻지 않는다 -
       우회거리에 벗어났다 돌아오는 것이 이미 들어 있다. */
    function applyMode() {
      var M = MODE[calcMode];
      $('c3mode-h').textContent = M.modeHint;
      $('c3a-name').textContent = M.base;
      $('c3trip-box').style.display = calcMode === 'dest' ? 'none' : '';
      var f = $('c3bd').closest('.oil-field');
      f.querySelector('label').textContent = M.dist;
      f.querySelector('.oil-field-hint').textContent = M.distHint;
    }

    pick('c3mode', function (v) { calcMode = v; applyMode(); });
    pick('c3trip', function (v) {
      trip = v;
      if (OIL.prefs) OIL.prefs.set('trip', trip);
      $('c3trip-h').textContent = tripHint(trip);
    });

    ['c3ap', 'c3bp', 'c3bd', 'c3kmpl', 'c3l'].forEach(function (id) {
      $(id).addEventListener('input', calc);
    });
    applyMode();
    calc();
  }

  OIL.loading();
  Promise.all([OIL.meta(), OIL.regions()])
    .then(function (a) { render(a[0], a[1]); })
    .catch(OIL.fail);
})();
