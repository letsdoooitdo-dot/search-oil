/* 주유소찾기 - 첫 화면(분기)과 장소 검색 화면

   첫 화면은 기능 두 개만 둔다.
     1) 장소명 검색  -> 그 장소 주변 주유소
     2) 내 주변      -> 현재 위치 주변 주유소
   둘 다 출발점만 다를 뿐 같은 결과 화면으로 간다.

   검색 화면은 페이지를 바꾸지 않고 덮는다. 휴대폰 뒤로가기로 닫히도록
   history 에 한 칸 넣어둔다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'find') return;

  var esc = OIL.esc, won = OIL.won;
  var P = OIL.prefs, PL = OIL.place;

  /* 목적지 화면에서 "출발지를 정해주세요"로 되돌아온 경우 */
  var pickOrigin = OIL.param('pick') === 'origin' && OIL.param('dla') && OIL.param('dln');

  var PIN = '<svg class="oil-pin" width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"></path>' +
    '<circle cx="12" cy="10" r="2.4"></circle></svg>';

  /* ── 첫 화면 ─────────────────────────────────────────────── */
  function renderFind(meta, reg) {
    /* 전에 내 위치를 찾아둔 적이 있으면 그 동네 가격을 미리 보여준다 */
    var lastSlug = P ? P.get('last') : '';
    var spot = P ? P.get('spot') : '';
    var near = null;
    if (lastSlug) {
      for (var i = 0; i < reg.items.length; i++) {
        if (reg.items[i].sl === lastSlug) { near = reg.items[i]; break; }
      }
    }

    var html = '<div class="oil-find">';

    /* 0. 우리가 다른 곳과 뭐가 다른지.
       검색으로 들어온 사람은 "또 하나의 최저가 사이트"로 알고 온다.
       화면을 보는 순간 다르다는 걸 알아채게 하는 자리다.
       질문 -> 단언 -> 숫자 -> 행동 순으로 읽힌다. */
    if (!pickOrigin) {
      /* 여기 숫자는 우리 계산기에 그대로 넣어도 같은 답이 나와야 한다.
         리터당 30원 싸고 10km 더 가는 경우는 경차·일반·SUV·화물 모두 손해다
         (기름값이 리터당 1,080원 아래로 떨어지지 않는 한 뒤집히지 않는다). */
      html += '<section class="oil-pitch">' +
        '<h1 class="oil-pitch-h">제일 싼 주유소가 제일 이득일까요?</h1>' +
        '<p class="oil-pitch-p">리터당 <b>30원 싼 집</b>이 <b>10km</b> 멀다면,</p>' +
        '<div class="oil-pitch-calc">' +
          '<div class="oil-pitch-row"><span>싼 집 가서 아끼는 돈</span>' +
            '<b>900원</b></div>' +
          '<div class="oil-pitch-row is-cost"><span>더 멀리 가느라 드는 돈</span>' +
            '<b>1,500원</b></div>' +
        '</div>' +
        '<p class="oil-pitch-say">가격과 실제 도로거리, 차종까지 계산해서<br>' +
        '<b>가서 남는 주유소</b>를 골라드립니다.</p>' +
        '</section>';
    }

    /* 1. 목적지까지 가는 길에서 찾기 */
    html += '<section class="oil-find-sec">' +
      '<h2 class="oil-find-h">' + (pickOrigin ? '출발지를 정해주세요' : '가는 길에서 찾기') + '</h2>' +
      '<button type="button" class="oil-fakein" id="oil-open-search">' +
        '<span>' + (pickOrigin ? '어디서 출발하세요?' : '어디로 가세요?') + '</span>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle>' +
        '<path d="M20 20l-3.5-3.5"></path></svg>' +
      '</button>' +
      '<p class="oil-find-hint">' + (pickOrigin
        ? esc(OIL.param('dq')) + '까지 가는 길에서 찾아드립니다'
        : '목적지를 넣으면 <b>가는 길에서 벗어나지 않는</b> 주유소를 찾아드립니다') +
      '</p></section>';

    /* 2. 내 주변. 지난번 결과가 있으면 오늘 가격으로 다시 계산해 미리 보여준다.
       자리는 먼저 잡아두고, 계산이 끝나면 채운다(기다리게 하지 않는다). */
    html += '<section class="oil-find-sec">' +
      '<h2 class="oil-find-h">내 주변에서 찾기</h2>' +
      '<button type="button" class="oil-near-btn" id="oil-near">' +
        '<span class="oil-near-l">' + PIN +
          '<span><span class="oil-near-t">내 주변 남는 주유소 찾기</span>' +
          '<span id="oil-near-sub"><span class="oil-near-where">' +
          (spot ? esc(spot) + ' 기준으로 찾아드립니다'
                : '위치를 켜면 가서 남는 곳부터 골라드립니다') +
          '</span></span></span></span>' +
        OIL.chev('#fff') +
      '</button>' +
      '<div class="oil-locate-msg" id="oil-locate-msg"></div>' +
      '</section>';
    void near;

    /* 3. 광고 자리 */
    html += OIL.adSlotHtml();

    html += '</div>';

    OIL.render(html);
    document.title = '주유소찾기 - 내 주변 기름값 싼 주유소';

    document.getElementById('oil-open-search')
      .addEventListener('click', function () { openSheet(); });
    document.getElementById('oil-near')
      .addEventListener('click', goNear);
    showLastPick();
  }

  /* 지난번에 찾은 주유소를 오늘 가격으로 다시 계산해 버튼에 보여준다.
     길찾기는 부르지 않는다 - 거리는 그때 재둔 값을 그대로 쓴다.
     가격이 바뀌어 오늘은 손해라면 그렇게 말한다. 지난번 숫자를 그대로
     보여주면 들어가서 다른 답을 보게 된다. */
  function showLastPick() {
    var box = document.getElementById('oil-near-sub');
    var last = PL && PL.last();
    if (!box || !last || !last.top || !last.base) return;

    var slugs = last.top.sl === last.base.sl ? [last.top.sl] : [last.top.sl, last.base.sl];
    Promise.all(slugs.map(function (sl) { return OIL.region(sl); })).then(function (regs) {
      function find(want) {
        for (var i = 0; i < regs.length; i++) {
          var list = regs[i].stations || [];
          for (var j = 0; j < list.length; j++) {
            if (list[j].n === want.n) return list[j];
          }
        }
        return null;
      }
      var top = find(last.top), base = find(last.base);
      if (!top || !base) return;      /* 문 닫았거나 이름이 바뀌었다 */

      var f = P ? P.get('fuel') : 'g';
      var tp = f === 'd' ? top.d : top.g;
      var bp = f === 'd' ? base.d : base.g;
      if (!tp || !bp) return;         /* 오늘 그 유종을 안 판다 */

      var t = OIL.calcTrip(tp, bp, last.top.km, last.base.km, P && P.isRound());
      box.innerHTML = t.net > 0
        ? '<span class="oil-near-price"><b>' + esc(top.n) + '</b> ' +
          won(t.net) + '원 남음</span>' +
          '<span class="oil-near-where">' + esc(last.place) + ' 기준 · ' +
          last.top.km.toFixed(1) + 'km · 지난번 결과</span>'
        : '<span class="oil-near-price">오늘은 <b>가까운 곳</b>이 낫습니다</span>' +
          '<span class="oil-near-where">' + esc(last.place) + ' 기준 · 지난번 결과</span>';
    }).catch(function () { /* 못 불러오면 원래 안내문 그대로 둔다 */ });
  }

  /* 내 주변 - 위치를 새로 받아서 결과 화면으로 */
  function goNear() {
    var btn = document.getElementById('oil-near');
    var msg = document.getElementById('oil-locate-msg');
    if (!navigator.geolocation) {
      msg.textContent = '이 브라우저는 위치 기능을 지원하지 않습니다. 장소명으로 찾아주세요.';
      return;
    }
    btn.disabled = true;
    msg.textContent = '위치를 확인하는 중...';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var la = pos.coords.latitude, ln = pos.coords.longitude;
      location.href = (OIL.cfg.areaPageUrl || '/p/area.html') +
        '?la=' + la.toFixed(5) + '&ln=' + ln.toFixed(5) + '&me=1';
    }, function (err) {
      btn.disabled = false;
      msg.textContent = (err && err.code === 1)
        ? '위치 권한이 거부되었습니다. 위 검색창에 동네나 장소 이름을 넣어주세요.'
        : '위치 확인이 오래 걸립니다. 위 검색창에 동네나 장소 이름을 넣어주세요.';
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 });
  }

  /* ── 검색 화면 ───────────────────────────────────────────── */
  var sheet = null, input = null, body = null;
  var timer = null, seq = 0;

  function openSheet() {
    if (!sheet) buildSheet();
    sheet.classList.add('is-open');
    document.body.classList.add('oil-noscroll');
    input.value = '';
    drawIdle();
    /* 휴대폰 뒤로가기로 닫히게 한 칸 넣어둔다 */
    try { history.pushState({ oilSheet: 1 }, '', location.href); } catch (e) { }
    setTimeout(function () { input.focus(); }, 30);
  }

  function closeSheet(fromPop) {
    if (!sheet || !sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    document.body.classList.remove('oil-noscroll');
    if (!fromPop) {
      try { if (history.state && history.state.oilSheet) history.back(); } catch (e) { }
    }
  }

  window.addEventListener('popstate', function () { closeSheet(true); });

  function buildSheet() {
    sheet = document.createElement('div');
    sheet.className = 'oil-sheet';
    sheet.innerHTML =
      '<div class="oil-sheet-bar">' +
        '<button type="button" class="oil-sheet-ico" id="oil-sheet-back" aria-label="닫기">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2"><path d="M15 6l-6 6 6 6"></path></svg></button>' +
        '<input class="oil-sheet-in" id="oil-sheet-in" type="search" ' +
          'placeholder="장소명을 검색해 주세요" autocomplete="off" ' +
          'enterkeyhint="search" aria-label="장소 검색">' +
        '<button type="button" class="oil-sheet-ico" id="oil-sheet-clear" aria-label="지우기">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>' +
      '</div><div class="oil-sheet-body" id="oil-sheet-body"></div>';
    document.body.appendChild(sheet);

    input = sheet.querySelector('#oil-sheet-in');
    body = sheet.querySelector('#oil-sheet-body');

    sheet.querySelector('#oil-sheet-back').addEventListener('click', function () { closeSheet(); });
    sheet.querySelector('#oil-sheet-clear').addEventListener('click', function () {
      input.value = ''; drawIdle(); input.focus();
    });

    /* 타이핑이 멈추고 0.3초 뒤에 찾는다 - 글자마다 부르지 않는다 */
    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (!q) { drawIdle(); return; }
      timer = setTimeout(function () { doSearch(q); }, 300);
    });

    body.addEventListener('click', onBodyClick);
  }

  /* 검색어가 없을 때 - 최근 검색만 보여준다 */
  function drawIdle() {
    var html = '';
    var rec = PL.recent();
    html += '<div class="oil-sheet-head"><span>최근 검색</span>' +
      (rec.length ? '<button type="button" class="oil-sheet-clearall" id="oil-clearall">' +
        '검색기록 전체 삭제</button>' : '') + '</div>';

    if (!rec.length) {
      html += '<div class="oil-sheet-empty">최근 검색한 장소가 없습니다</div>';
    } else {
      html += '<div class="oil-hits">' + rec.map(function (p, i) {
        return '<div class="oil-hit"><button type="button" class="oil-hit-go" data-go=\'' +
          esc(JSON.stringify(p)) + '\'>' + PIN + '<span><b>' + esc(p.n) + '</b>' +
          (p.a ? '<i>' + esc(p.a) + '</i>' : '') + '</span></button>' +
          '<button type="button" class="oil-hit-x" data-forget="' + i +
          '" aria-label="삭제">✕</button></div>';
      }).join('') + '</div>';
    }
    body.innerHTML = html;
  }

  function doSearch(q) {
    var my = ++seq;
    body.innerHTML = '<div class="oil-sheet-empty">찾는 중...</div>';
    PL.search(q).then(function (list) {
      if (my !== seq) return;      /* 그 사이 더 친 글자가 있으면 버린다 */
      if (!list.length) {
        body.innerHTML = '<div class="oil-sheet-empty">검색 결과가 없습니다<br>' +
          '<span>동네 이름(예: 평택, 불당동)으로도 찾을 수 있습니다</span></div>';
        return;
      }
      body.innerHTML = '<div class="oil-sheet-head"><span>검색 결과</span></div>' +
        '<div class="oil-hits">' + list.map(function (p) {
          return '<div class="oil-hit"><button type="button" class="oil-hit-go" data-go=\'' +
            esc(JSON.stringify(p)) + '\'>' + PIN + '<span><b>' + esc(p.n) + '</b>' +
            (p.a ? '<i>' + esc(p.a) + '</i>' : '') + '</span></button></div>';
        }).join('') + '</div>';
    });
  }

  function onBodyClick(e) {
    var t = e.target;

    var clearAll = t.closest('#oil-clearall');
    if (clearAll) { PL.clearRecent(); drawIdle(); return; }

    var forget = t.closest('[data-forget]');
    if (forget) { PL.forget(+forget.getAttribute('data-forget')); drawIdle(); return; }

    var go = t.closest('[data-go]');
    if (go) {
      var p;
      try { p = JSON.parse(go.getAttribute('data-go')); } catch (err) { return; }
      if (pickOrigin) {
        /* 고른 곳은 목적지가 아니라 출발지다 */
        location.href = PL.destUrl(
          { la: parseFloat(OIL.param('dla')), ln: parseFloat(OIL.param('dln')),
            n: OIL.param('dq') }, p);
        return;
      }
      PL.remember(p);
      location.href = PL.destUrl(p);
    }
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  OIL.loading();
  Promise.all([OIL.meta(), OIL.regions()])
    .then(function (a) { renderFind(a[0], a[1]); })
    .catch(OIL.fail);
})();
