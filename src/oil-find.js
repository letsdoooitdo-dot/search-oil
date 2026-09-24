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
  var P = OIL.prefs, PL = OIL.place, ENV = OIL.env;

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

    /* 앱 안 브라우저면 들어오자마자 알려준다. 눌러보고 실패한 뒤에 알려주면
       헛걸음을 한 번 시키는 셈이다. 한 번 닫으면 그 방문 동안 다시 안 뜬다. */
    html += ENV.bannerHtml();

    /* 광고는 화면 제일 위, 소개상자보다 앞에 둔다(2026-09-23).
       다른 화면(계산기·동네·글)도 전부 맨 위라, 자리를 하나로 맞춘다. */
    html += OIL.adSlotHtml('top');

    /* 0. 주장을 숫자로 증명하는 자리.
       "제일 싼 주유소가 제일 이득일까요?" 와 "다 따져서 제일 싼 주유소를
       찾아드립니다" 는 머리 띠가 이미 말한다. 여기서 또 쓰면 같은 말을
       세 번 읽히게 되므로, 남겨둔 건 띠가 못 하는 일 - 숫자로 보여주기뿐이다.
       화면에 보이는 첫 문장이라 h1 을 여기 둔다(검색용 제목). */
    if (!pickOrigin) {
      /* 여기 숫자는 우리 계산기에 그대로 넣어도 같은 답이 나와야 한다.
         리터당 30원 싸고 10km 더 가는 경우는 경차·일반·SUV·화물 모두 손해다
         (기름값이 리터당 1,080원 아래로 떨어지지 않는 한 뒤집히지 않는다). */
      html += '<section class="oil-pitch">' +
        /* 이 상자가 무슨 상자인지 한마디로 말해준다. 이게 없으면
           갑자기 산수 문제가 튀어나온 것처럼 보인다. */
        '<span class="oil-pitch-tag">쓰면 좋은 이유!</span>' +
        '<h1 class="oil-pitch-q">리터당 <b>30원 싼 집</b>이 <b>10km</b> 멀다면,<br>' +
          '가는 게 맞을까요?</h1>' +
        '<div class="oil-pitch-calc">' +
          '<div class="oil-pitch-row"><span>싼 집 가서 아끼는 돈</span>' +
            '<b>900원</b></div>' +
          '<div class="oil-pitch-row is-cost"><span>더 멀리 가느라 드는 돈</span>' +
            '<b>1,500원</b></div>' +
        '</div>' +
        '<p class="oil-pitch-say"><b>다 따져서 제일 싼 주유소</b> 찾아드립니다.</p>' +
        '</section>';
    }

    /* 1. 내 주변. 지난번 결과가 있으면 오늘 가격으로 다시 계산해 미리 보여준다.
       자리는 먼저 잡아두고, 계산이 끝나면 채운다(기다리게 하지 않는다).
       ★ 가는 길보다 위에 둔다(2026-09-23). 목적지를 정해 검색하는 것보다
         "지금 내 주변"이 훨씬 자주 쓰는 길이다.
       출발지를 고르러 온 경우에는 아예 그리지 않는다 - 출발지를 묻는 화면에
       주변 주유소 찾기가 같이 떠 있으면 무엇을 하라는 화면인지 알 수 없다. */
    if (!pickOrigin) {
      html += '<section class="oil-find-sec">' +
        '<h2 class="oil-find-h"><span>내 주변에서 ' +
          '<b>다 따져서 제일 싼 주유소</b></span></h2>' +
        '<button type="button" class="oil-near-btn" id="oil-near">' +
          '<span class="oil-near-l">' + PIN +
            '<span><span class="oil-near-t">내 주변 다 따져서 제일 싼 주유소</span>' +
            '<span id="oil-near-sub"><span class="oil-near-where">' +
            (spot ? esc(spot) + ' 기준으로 찾아드립니다'
                  : '위치를 켜면 바로 찾아드립니다') +
            '</span></span></span></span>' +
          OIL.chev('#fff') +
        '</button>' +
        '<p class="oil-find-hint">따지는 항목 : 기름값 · 실제 이동거리 · 편도/왕복<br>' +
          '차종별 연비와 1회 주유량까지 따져서 계산합니다</p>' +
        '<div class="oil-locate-msg" id="oil-locate-msg"></div>' +
        '</section>';
    }
    void near;

    /* 2. 목적지까지 가는 길에서 찾기 */
    html += '<section class="oil-find-sec">' +
      '<h2 class="oil-find-h"><span>' +
        (pickOrigin ? '출발지를 정해주세요'
                    : '가는 길에서 <b>다 따져서 제일 싼 주유소</b>') + '</span></h2>' +
      '<button type="button" class="oil-fakein" id="oil-open-search">' +
        '<span>' + (pickOrigin ? '어디서 출발하세요?' : '어디로 가세요?') + '</span>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle>' +
        '<path d="M20 20l-3.5-3.5"></path></svg>' +
      '</button>' +
      /* 무엇을 따지는지 그대로 적는다. 이 목록이 우리가 다른 점 전부다.
         두 메뉴의 목록이 다른 건, 가는 길은 '우회거리'를 재고
         내 주변은 '편도/왕복'을 묻기 때문이다 - 없는 걸 적으면 안 된다. */
      '<p class="oil-find-hint">' + (pickOrigin
        ? esc(OIL.param('dq')) + '까지 가는 길에서 찾아드립니다'
        : '따지는 항목 : 기름값 · 실제 이동거리 · 우회거리<br>' +
          '차종별 연비와 1회 주유량까지 따져서 계산합니다') +
      '</p></section>';

    html += '</div>';

    OIL.render(html);
    document.title = '주유소찾기 - 내 주변 기름값 싼 주유소';

    ENV.wireBanner();
    document.getElementById('oil-open-search')
      .addEventListener('click', function () { openSheet(); });
    /* 출발지 고르기 화면에는 이 버튼이 없다 */
    var nearBtn = document.getElementById('oil-near');
    if (nearBtn) nearBtn.addEventListener('click', goNear);
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
          won(t.net) + '원 이득</span>' +
          '<span class="oil-near-where">' + esc(last.place) + ' 기준 · ' +
          last.top.km.toFixed(1) + 'km · 지난번 결과</span>'
        : '<span class="oil-near-price">오늘은 <b>가까운 곳</b>이 낫습니다</span>' +
          '<span class="oil-near-where">' + esc(last.place) + ' 기준 · 지난번 결과</span>';
    }).catch(function () { /* 못 불러오면 원래 안내문 그대로 둔다 */ });
  }

  /* ── 내 주변 - 위치를 받아서 결과 화면으로 ──────────────────
     실제로 위치를 받아오는 일(두 번 시도 · 권한 미리 확인 · 앱 안이면
     짧게 끊기)과, 실패 이유를 가려내 무슨 말을 할지 고르는 일은
     '가는 길' 화면도 똑같이 한다. 그래서 OIL.env 에 모아뒀고
     여기서는 화면에 붙이는 일만 한다. */
  function goNear() {
    var btn = document.getElementById('oil-near');
    var msg = document.getElementById('oil-locate-msg');
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = '위치를 확인하는 중...';

    ENV.locate(function (pos) {
      var la = pos.coords.latitude, ln = pos.coords.longitude;
      location.href = (OIL.cfg.areaPageUrl || '/p/area.html') +
        '?la=' + la.toFixed(5) + '&ln=' + ln.toFixed(5) + '&me=1';
    }, function (kind) {
      if (btn) btn.disabled = false;
      locateFailed(kind);
    }, function (step) {
      if (msg) msg.textContent = step;
    });
  }

  /* ── 위치를 못 잡았을 때 ───────────────────────────────────
     한 줄 안내만 남기면 막다른 길이 된다. 여기서 할 수 있는 일을
     두 개 다 손에 쥐여준다 - (1) 동네 이름으로 찾기 (2) 다시 시도. */
  function locateFailed(kind) {
    var msg = document.getElementById('oil-locate-msg');
    if (!msg) return;

    var w = ENV.locateWhy(kind);

    /* 어떤 경우든 '동네 이름으로 찾기'는 준다. 이 길만 있으면 위치 없이도
       똑같은 결과를 볼 수 있다 - 막다른 길로 끝내지 않는다. */
    msg.innerHTML =
      '<div class="oil-locate-help">' +
        '<b>' + w.head + '</b>' +
        '<p>' + w.why + '</p>' + w.extra +
        '<button type="button" class="oil-locate' + (w.extra ? ' is-ghost' : '') +
          '" id="oil-near-search">동네·장소 이름으로 찾기</button>' +
        (kind === 'none' ? '' :
          '<button type="button" class="oil-locate is-ghost" id="oil-near-retry">' +
            '위치 다시 시도</button>') +
      '</div>';

    ENV.wireWhy();
    var s = document.getElementById('oil-near-search');
    if (s) s.addEventListener('click', function () { openSheet('near'); });
    var r = document.getElementById('oil-near-retry');
    if (r) r.addEventListener('click', goNear);
  }

  /* ── 검색 화면 ───────────────────────────────────────────── */
  var sheet = null, input = null, body = null;
  var timer = null, seq = 0;

  /* 같은 검색 화면을 세 가지로 쓴다. 고른 곳을 어디로 넘길지가 다르다.
       dest    목적지로     - 가는 길에서 찾기
       origin  출발지로     - 목적지는 정했는데 출발지를 모를 때
       near    그 지점 주변 - 위치를 못 잡아 '내 주변' 대신 쓰는 길 */
  var sheetMode = 'dest';

  function openSheet(mode) {
    if (!sheet) buildSheet();
    sheetMode = mode || (pickOrigin ? 'origin' : 'dest');
    sheet.classList.add('is-open');
    document.body.classList.add('oil-noscroll');
    input.value = '';
    input.placeholder = sheetMode === 'near'
      ? '동네나 장소 이름을 넣어주세요'
      : '장소명을 검색해 주세요';
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
      if (sheetMode === 'origin') {
        /* 고른 곳은 목적지가 아니라 출발지다 */
        location.href = PL.destUrl(
          { la: parseFloat(OIL.param('dla')), ln: parseFloat(OIL.param('dln')),
            n: OIL.param('dq') }, p);
        return;
      }
      PL.remember(p);
      /* near - 위치를 못 잡았을 때. 고른 곳을 '내 위치' 대신 쓴다. */
      location.href = sheetMode === 'near' ? PL.nearUrl(p) : PL.destUrl(p);
    }
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  OIL.loading();
  Promise.all([OIL.meta(), OIL.regions()])
    .then(function (a) { renderFind(a[0], a[1]); })
    .catch(OIL.fail);
})();
