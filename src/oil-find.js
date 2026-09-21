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

  var PIN = '<svg class="oil-pin" width="15" height="15" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
    '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"></path>' +
    '<circle cx="12" cy="10" r="2.4"></circle></svg>';

  /* ── 첫 화면 ─────────────────────────────────────────────── */
  function renderFind(meta, reg) {
    /* 전에 위치를 찾아둔 적이 있으면 그 동네 가격을 미리 보여준다 */
    var lastSlug = P ? P.get('last') : '';
    var spot = P ? P.get('spot') : '';
    var near = null;
    if (lastSlug) {
      for (var i = 0; i < reg.items.length; i++) {
        if (reg.items[i].sl === lastSlug) { near = reg.items[i]; break; }
      }
    }

    var html = '<div class="oil-find">';

    /* 1. 장소명 검색 */
    html += '<section class="oil-find-sec">' +
      '<h2 class="oil-find-h">장소명으로 찾기</h2>' +
      '<button type="button" class="oil-fakein" id="oil-open-search">' +
        '<span>장소명을 검색해 주세요</span>' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle>' +
        '<path d="M20 20l-3.5-3.5"></path></svg>' +
      '</button>' +
      '<p class="oil-find-hint">회사·아파트·역 이름으로 찾을 수 있습니다</p>' +
      '</section>';

    /* 2. 내 주변 */
    var sub;
    if (near) {
      var g = near.g, d = near.d;
      sub = '<span class="oil-near-price">' +
        (g ? '<b>휘발유</b> ' + won(g.lo) + '원' : '') +
        (d ? '<b>경유</b> ' + won(d.lo) + '원' : '') + '</span>' +
        '<span class="oil-near-where">' + esc(spot || near.r) + ' 기준</span>';
    } else {
      sub = '<span class="oil-near-where">위치를 켜면 주변 최저가를 바로 보여드립니다</span>';
    }

    html += '<section class="oil-find-sec">' +
      '<h2 class="oil-find-h">내 주변에서 찾기</h2>' +
      '<button type="button" class="oil-near-btn" id="oil-near">' +
        '<span class="oil-near-l">' + PIN +
          '<span><span class="oil-near-t">내 주변 주유소 찾기</span>' + sub + '</span></span>' +
        OIL.chev('#fff') +
      '</button>' +
      '<div class="oil-locate-msg" id="oil-locate-msg"></div>' +
      '</section>';

    /* 3. 광고 자리 */
    html += OIL.adSlotHtml();

    html += '</div>';

    OIL.render(html);
    document.title = '주유소찾기 - 내 주변 기름값 싼 주유소';

    document.getElementById('oil-open-search')
      .addEventListener('click', function () { openSheet(); });
    document.getElementById('oil-near')
      .addEventListener('click', goNear);
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
  var pending = '';       /* '집으로 지정' 같은 상태. 'home' | 'work' | '' */
  var timer = null, seq = 0;

  function openSheet(slot) {
    pending = slot || '';
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
    pending = '';
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

  function slotChip(name, label) {
    var p = PL.slot(name);
    if (!p) {
      return '<button type="button" class="oil-slot is-empty" data-setslot="' + name + '">' +
        '＋ ' + label + '</button>';
    }
    return '<span class="oil-slot"><button type="button" class="oil-slot-go" data-go=\'' +
      esc(JSON.stringify(p)) + '\'>' + label + ' · ' + esc(p.n) + '</button>' +
      '<button type="button" class="oil-slot-x" data-delslot="' + name +
      '" aria-label="' + label + ' 해제">✕</button></span>';
  }

  /* 검색어가 없을 때 - 집·회사·최근 검색 */
  function drawIdle() {
    var html = '';
    if (pending) {
      html += '<div class="oil-sheet-note">' +
        (pending === 'home' ? '집' : '회사') + '으로 지정할 장소를 검색해주세요</div>';
    }
    html += '<div class="oil-slots">' + slotChip('home', '집') + slotChip('work', '회사') + '</div>';

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

    var setSlot = t.closest('[data-setslot]');
    if (setSlot) { pending = setSlot.getAttribute('data-setslot'); drawIdle(); input.focus(); return; }

    var delSlot = t.closest('[data-delslot]');
    if (delSlot) { PL.clearSlot(delSlot.getAttribute('data-delslot')); drawIdle(); return; }

    var go = t.closest('[data-go]');
    if (go) {
      var p;
      try { p = JSON.parse(go.getAttribute('data-go')); } catch (err) { return; }
      if (pending) { PL.setSlot(pending, p); pending = ''; }
      PL.remember(p);
      location.href = PL.url(p);
    }
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  OIL.loading();
  Promise.all([OIL.meta(), OIL.regions()])
    .then(function (a) { renderFind(a[0], a[1]); })
    .catch(OIL.fail);
})();
