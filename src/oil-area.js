/* 주유소찾기 - 홈 화면과 동네 상세 화면

   첫 방문:  설정이 펼쳐진 상태 + "내 위치로 찾기" 가 눈에 띄게
   재방문:   저장해둔 우리 동네가 맨 위에, 설정은 한 줄로 접힘
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL) return;
  var mode = window.OIL_MODE;
  if (mode !== 'browse' && mode !== 'area') return;

  var esc = OIL.esc, won = OIL.won;
  var P = OIL.prefs;

  function fuel() { return P ? P.get('fuel') : 'g'; }
  function fuelName() { return P ? P.fuelName() : '휘발유'; }
  /* 동네 요약에서 지금 고른 유종의 통계를 꺼낸다 (없으면 휘발유로) */
  function st(r) { return (r && (r[fuel()] || r.g)) || null; }
  function price(s) { return fuel() === 'd' ? s.d : s.g; }

  function rows(list) {
    return '<div class="oil-rows">' + list.map(function (r) {
      return '<div class="oil-row"><span class="oil-row-k">' + esc(r[0]) + '</span>' +
        '<span class="oil-row-v' + (r[2] ? ' is-accent' : '') + '">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  function stationRow(s) {
    var p = price(s);
    if (!p) return '';
    var badge = '';
    if (s.c === '늘 최저권') badge = '<span class="oil-badge is-low">1년 내내 최저권</span>';
    else if (s.c === '늘 최고권') badge = '<span class="oil-badge is-high">오늘만 쌈</span>';
    return '<div class="oil-list-item"><span class="oil-list-name">' + esc(s.n) +
      (s.s ? '<span class="oil-tag">셀프</span>' : '') + badge + '</span>' +
      '<span class="oil-list-price">' + won(p) + '원</span></div>';
  }

  /* ── 홈 ──────────────────────────────────────────────────── */
  function renderHome(meta, reg) {
    var items = reg.items;
    var mine = null;
    if (P) {
      var slugPref = P.get('home') || P.get('last');
      if (slugPref) {
        for (var i = 0; i < items.length; i++) {
          if (items[i].sl === slugPref) { mine = items[i]; break; }
        }
      }
    }

    var bySido = {};
    items.forEach(function (r) { (bySido[r.sd] = bySido[r.sd] || []).push(r); });
    var sidos = Object.keys(bySido).sort();

    var withFuel = items.filter(st);
    var topSpread = withFuel.slice().sort(function (a, b) { return st(b).sp - st(a).sp; }).slice(0, 8);
    var cheapest = withFuel.slice().sort(function (a, b) { return st(a).md - st(b).md; }).slice(0, 8);

    var natl = fuel() === 'd' ? meta.diesel : meta.gas;

    var html = '<div class="oil-stack">';

    /* 머리말 - 재방문이면 짧게 */
    if (mine) {
      html += '<a class="oil-mine" href="' + OIL.areaUrl(mine.sl) + '">' +
        '<span><span class="oil-mine-k">우리 동네</span>' +
        '<span class="oil-mine-r">' + esc(mine.r) + '</span>' +
        '<span class="oil-mine-s">' + fuelName() + ' 최저 ' + won(st(mine).lo) + '원 · ' +
        '주유소 ' + st(mine).n + '곳</span></span>' + OIL.chev(OIL.cfg.accent || '#A54A04') + '</a>';
    } else {
      html += '<div><div class="oil-kicker">전국 주유소 ' + won(natl.n) + '곳 실제 판매가</div>' +
        '<h1 class="oil-h1">우리 동네 기름값,<br>고를 가치가 있을까요</h1>' +
        '<p class="oil-lead">같은 동네 안에서도 <b>수백 원</b> 차이가 나는 곳이 있고, ' +
        '30원도 차이 안 나는 곳이 있습니다. 어느 쪽인지부터 확인해보세요.</p></div>';
    }

    /* 내 설정 */
    if (P) html += P.barHtml({ regionName: mine ? mine.r : '' });

    /* 오늘 전국 */
    html += '<div class="oil-card">' +
      '<div class="oil-kicker" style="color:var(--oil-muted)">오늘 전국 ' + fuelName() + '</div>' +
      '<div style="display:flex;align-items:baseline;margin-top:5px;">' +
      '<span class="oil-hero">' + won(natl.median) + '원</span>' +
      '<span class="oil-hero-unit">중앙값 · ' + esc(meta.phase) + '</span></div>' +
      rows([
        ['가장 싼 곳 ~ 비싼 곳', won(natl.low) + ' ~ ' + won(natl.high) + '원'],
        ['셀프 / 일반', won(meta['self']) + ' / ' + won(meta.full) + '원'],
        ['동네 안 최대 격차', esc(topSpread[0].r) + ' ' + won(st(topSpread[0]).sp) + '원', true]
      ]) + '</div>';

    /* 동네 찾기 */
    html += '<div class="oil-card"><div class="oil-card-title">우리 동네 찾기</div>';
    if (P) html += P.locateBtnHtml() + '<div style="height:12px;"></div>';
    html += '<input class="oil-search" id="oil-q" type="search" ' +
      'placeholder="또는 동네 이름 입력 (예: 천안)" autocomplete="off" aria-label="동네 검색">' +
      '<div class="oil-suggest" id="oil-sg"></div>' +
      '<div id="oil-browse" style="margin-top:13px;">' +
      '<div class="oil-sido-tabs" id="oil-sidos">' +
      sidos.map(function (s, i) {
        return '<button type="button" class="oil-chip' + (i === 0 ? ' active' : '') +
          '" data-sido="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('') +
      '</div><div class="oil-region-grid" id="oil-regions"></div></div></div>';

    html += OIL.adHtml();

    html += '<div class="oil-card is-flush"><div style="padding:0 16px 8px;">' +
      '<div class="oil-card-title" style="margin:0;">주유소를 고를 가치가 큰 동네</div>' +
      '<p class="oil-p" style="font-size:12.5px;margin:5px 0 0;">동네 안 최저~최고 차이가 가장 큰 곳입니다.</p></div>' +
      '<div class="oil-rank">' + topSpread.map(function (r) {
        return '<a href="' + OIL.areaUrl(r.sl) + '"><span>' + esc(r.r) + '</span>' +
          '<span class="v">' + won(st(r).sp) + '원 차이</span></a>';
      }).join('') + '</div></div>';

    html += '<div class="oil-card is-flush"><div style="padding:0 16px 8px;">' +
      '<div class="oil-card-title" style="margin:0;">오늘 ' + fuelName() +
      OIL.josa(fuelName(), '이가') + ' 싼 동네</div></div>' +
      '<div class="oil-rank">' + cheapest.map(function (r) {
        return '<a href="' + OIL.areaUrl(r.sl) + '"><span>' + esc(r.r) + '</span>' +
          '<span class="v">' + won(st(r).md) + '원</span></a>';
      }).join('') + '</div></div>';

    html += '<a class="oil-btn" href="' + (OIL.cfg.calcPageUrl || '/p/calc.html') + '">' +
      '<span>연간 주유비·경차 환급 계산기</span>' + OIL.chev('#fff') + '</a>';

    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      OIL.dateKo(meta.date) + ' 실제 판매가 · 출처 오피넷 · 매일 갱신</p></div>';

    OIL.render(html);
    if (P) {
      P.wireBar(function () { renderHome(meta, reg); });
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

  /* ── 동네 상세 ───────────────────────────────────────────── */
  function renderArea(meta, r, total) {
    var s = st(r);
    if (!s) {
      OIL.render('<div class="oil-error">' + esc(r.r) + '은(는) ' + fuelName() +
        ' 자료가 없습니다.<br><a href="' + (OIL.cfg.listPageUrl || '/') + '">다른 동네 보기</a></div>');
      return;
    }
    if (P) P.set('last', r.sl);

    var v = OIL.verdict(r, meta, total, s, fuelName());
    var isHome = P && P.get('home') === r.sl;
    var isWork = P && P.get('work') === r.sl;

    var html = '<div class="oil-stack">';
    var spot = P ? P.get('spot') : '';
    html += '<div><div class="oil-kicker">우리 동네 ' + fuelName() + '</div>' +
      '<h1 class="oil-h1">' + esc(v.head) + '</h1>' +
      (spot ? '<div class="oil-spot">현위치 ' + esc(spot) + '</div>' : '') + '</div>';

    if (P) html += P.barHtml({ regionName: r.r });

    html += '<div class="oil-card"><p class="oil-p">' + v.body + '</p>' +
      '<p class="oil-p" style="font-size:13px;">' + v.nat + '</p>' +
      rows([
        ['주유소', s.n + '곳 (셀프 ' + r.sf + '곳)'],
        ['최저 ~ 최고', won(s.lo) + ' ~ ' + won(s.hi) + '원'],
        ['동네 중앙값', won(s.md) + '원', true]
      ]) + '</div>';

    html += '<div class="oil-save-row">' +
      '<button type="button" class="oil-save' + (isHome ? ' is-on' : '') + '" data-save="home">' +
      (isHome ? '집으로 저장됨' : '집으로 저장') + '</button>' +
      '<button type="button" class="oil-save' + (isWork ? ' is-on' : '') + '" data-save="work">' +
      (isWork ? '회사로 저장됨' : '회사로 저장') + '</button></div>';

    html += OIL.adHtml();

    var list = (r.stations || []).filter(function (x) { return price(x); })
      .sort(function (a, b) { return price(a) - price(b); }).slice(0, 15);
    html += '<div class="oil-card is-flush"><div style="padding:0 16px 10px;">' +
      '<div class="oil-card-title" style="margin:0;">오늘 싼 순서</div>' +
      '<p class="oil-p" style="font-size:12.5px;margin:6px 0 0;">' + OIL.characterLine(r) + '</p></div>' +
      list.map(stationRow).join('') + '</div>';

    html += '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
      '<span>다른 동네 보기</span>' + OIL.chev('#fff') + '</a>';
    html += '<a class="oil-btn is-ghost" href="' + (OIL.cfg.calcPageUrl || '/p/calc.html') + '">' +
      '<span>내 연간 주유비 계산해보기</span>' + OIL.chev() + '</a>';

    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      esc(r.r) + ' · ' + OIL.dateKo(meta.date) + ' ' + fuelName() + ' 실제 판매가 ' + s.n +
      '곳 기준 · 1년 성격은 최근 1년 일별 가격으로 산출 · 출처 오피넷</p></div>';

    OIL.render(html);
    document.title = r.r + ' 주유소 최저가 - 오늘 ' + fuelName() + ' ' + won(s.lo) + '원부터';

    if (P) {
      P.wireBar(function () { renderArea(meta, r, total); });
      var root = OIL.root();
      root.addEventListener('click', function (e) {
        var b = e.target.closest('[data-save]');
        if (!b) return;
        var key = b.getAttribute('data-save');
        P.set(key, P.get(key) === r.sl ? '' : r.sl);
        renderArea(meta, r, total);
      });
    }
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  OIL.loading();
  if (mode === 'browse') {
    Promise.all([OIL.meta(), OIL.regions()])
      .then(function (a) { renderHome(a[0], a[1]); }).catch(OIL.fail);
  } else {
    var slug = OIL.param('r');
    if (!slug) { location.replace(OIL.cfg.listPageUrl || '/'); return; }
    Promise.all([OIL.meta(), OIL.region(slug), OIL.regions()])
      .then(function (a) { renderArea(a[0], a[1], a[2].total); }).catch(OIL.fail);
  }
})();
