/* 주유소찾기 - 홈 화면과 동네 상세 화면 */
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL) return;
  var mode = window.OIL_MODE;
  if (mode !== 'home' && mode !== 'area') return;

  var esc = OIL.esc, won = OIL.won;

  /* ── 조각 ────────────────────────────────────────────────── */
  function stationRow(st, i) {
    var badge = '';
    if (st.c === '늘 최저권') badge = '<span class="oil-badge is-low">1년 내내 최저권</span>';
    else if (st.c === '늘 최고권') badge = '<span class="oil-badge is-high">오늘만 쌈</span>';
    var self = st.s ? '<span class="oil-tag">셀프</span>' : '';
    return '<div class="oil-list-item">' +
      '<span class="oil-list-name">' + esc(st.n) + self + badge + '</span>' +
      '<span class="oil-list-price">' + won(st.g) + '원</span></div>';
  }

  function rows(list) {
    return '<div class="oil-rows">' + list.map(function (r, i) {
      return '<div class="oil-row"><span class="oil-row-k">' + esc(r[0]) + '</span>' +
        '<span class="oil-row-v' + (r[2] ? ' is-accent' : '') + '">' + r[1] + '</span></div>';
    }).join('') + '</div>';
  }

  /* ── 홈 ──────────────────────────────────────────────────── */
  function renderHome(meta, reg) {
    var items = reg.items;
    var bySido = {};
    items.forEach(function (r) { (bySido[r.sd] = bySido[r.sd] || []).push(r); });
    var sidos = Object.keys(bySido).sort();

    var topSpread = items.slice().sort(function (a, b) { return b.sp - a.sp; }).slice(0, 8);
    var cheapest = items.slice(0, 8);

    var html = '<div class="oil-stack">';

    /* 오늘 현황 */
    html += '<div>' +
      '<div class="oil-kicker">전국 주유소 ' + won(meta.gas.n) + '곳 실제 판매가</div>' +
      '<h1 class="oil-h1">우리 동네 기름값,<br>고를 가치가 있을까요</h1>' +
      '<p class="oil-lead">같은 동네 안에서도 <b>수백 원</b> 차이가 나는 곳이 있고, ' +
      '30원도 차이 안 나는 곳이 있습니다. 어느 쪽인지부터 확인해보세요.</p></div>';

    html += '<div class="oil-card">' +
      '<div class="oil-kicker" style="color:var(--oil-muted)">오늘 전국 휘발유</div>' +
      '<div style="display:flex;align-items:baseline;margin-top:5px;">' +
      '<span class="oil-hero">' + won(meta.gas.median) + '원</span>' +
      '<span class="oil-hero-unit">중앙값 · ' + esc(meta.phase) + '</span></div>' +
      rows([
        ['가장 싼 곳 ~ 비싼 곳', won(meta.gas.low) + ' ~ ' + won(meta.gas.high) + '원'],
        ['셀프 / 일반', won(meta['self']) + ' / ' + won(meta.full) + '원'],
        ['동네 안 최대 격차', esc(meta.topSpread.r) + ' ' + won(meta.topSpread.sp) + '원', true]
      ]) + '</div>';

    /* 지역 선택 */
    html += '<div class="oil-card">' +
      '<div class="oil-card-title">우리 동네 찾기</div>' +
      '<input class="oil-search" id="oil-q" type="search" placeholder="동네 이름을 입력하세요 (예: 천안)" ' +
      'autocomplete="off" aria-label="동네 검색">' +
      '<div class="oil-suggest" id="oil-sg"></div>' +
      '<div id="oil-browse" style="margin-top:13px;">' +
      '<div class="oil-sido-tabs" id="oil-sidos">' +
      sidos.map(function (s, i) {
        return '<button type="button" class="oil-chip' + (i === 0 ? ' active' : '') +
          '" data-sido="' + esc(s) + '">' + esc(s) + '</button>';
      }).join('') +
      '</div><div class="oil-region-grid" id="oil-regions"></div></div></div>';

    html += OIL.adHtml();

    /* 격차 큰 동네 */
    html += '<div class="oil-card is-flush">' +
      '<div style="padding:0 16px 8px;">' +
      '<div class="oil-card-title" style="margin:0;">주유소를 고를 가치가 큰 동네</div>' +
      '<p class="oil-p" style="font-size:12.5px;margin:5px 0 0;">동네 안 최저~최고 차이가 가장 큰 곳입니다.</p></div>' +
      '<div class="oil-rank">' +
      topSpread.map(function (r) {
        return '<a href="' + OIL.areaUrl(r.sl) + '"><span>' + esc(r.r) + '</span>' +
          '<span class="v">' + won(r.sp) + '원 차이</span></a>';
      }).join('') + '</div></div>';

    /* 싼 동네 */
    html += '<div class="oil-card is-flush">' +
      '<div style="padding:0 16px 8px;">' +
      '<div class="oil-card-title" style="margin:0;">오늘 기름값이 싼 동네</div></div>' +
      '<div class="oil-rank">' +
      cheapest.map(function (r) {
        return '<a href="' + OIL.areaUrl(r.sl) + '"><span>' + esc(r.r) + '</span>' +
          '<span class="v">' + won(r.md) + '원</span></a>';
      }).join('') + '</div></div>';

    html += '<a class="oil-btn" href="' + (OIL.cfg.calcPageUrl || '/p/calc.html') + '">' +
      '<span>연간 주유비·경차 환급 계산기</span>' + OIL.chev('#fff') + '</a>';

    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      OIL.dateKo(meta.date) + ' 실제 판매가 · 출처 오피넷 · 매일 갱신</p>';

    html += '</div>';
    OIL.render(html);
    wireHome(items, bySido, sidos);
  }

  function wireHome(items, bySido, sidos) {
    var grid = document.getElementById('oil-regions');
    var sidoBox = document.getElementById('oil-sidos');
    var q = document.getElementById('oil-q');
    var sg = document.getElementById('oil-sg');
    var browse = document.getElementById('oil-browse');

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
      var hit = items.filter(function (r) { return r.r.indexOf(v) >= 0; }).slice(0, 8);
      sg.innerHTML = hit.length
        ? hit.map(function (r) {
            return '<a href="' + OIL.areaUrl(r.sl) + '">' + esc(r.r) +
              '<span class="s">주유소 ' + r.n + '곳 · 최저 ' + won(r.lo) + '원</span></a>';
          }).join('')
        : '<a href="#" onclick="return false;">찾는 동네가 없습니다</a>';
    });
  }

  /* ── 동네 상세 ───────────────────────────────────────────── */
  function renderArea(meta, r, total) {
    var v = OIL.verdict(r, meta, total);
    var html = '<div class="oil-stack">';

    html += '<div><div class="oil-kicker">우리 동네 기름값</div>' +
      '<h1 class="oil-h1">' + esc(v.head) + '</h1></div>';

    html += '<div class="oil-card">' +
      '<p class="oil-p">' + v.body + '</p>' +
      '<p class="oil-p" style="font-size:13px;">' + v.nat + '</p>' +
      rows([
        ['주유소', r.n + '곳 (셀프 ' + r.sf + '곳)'],
        ['최저 ~ 최고', won(r.lo) + ' ~ ' + won(r.hi) + '원'],
        ['동네 중앙값', won(r.md) + '원', true]
      ]) + '</div>';

    html += OIL.adHtml();

    html += '<div class="oil-card is-flush">' +
      '<div style="padding:0 16px 10px;">' +
      '<div class="oil-card-title" style="margin:0;">오늘 싼 순서</div>' +
      '<p class="oil-p" style="font-size:12.5px;margin:6px 0 0;">' + OIL.characterLine(r) + '</p></div>' +
      (r.stations || []).slice(0, 15).map(stationRow).join('') + '</div>';

    html += '<a class="oil-btn" href="' + (OIL.cfg.listPageUrl || '/') + '">' +
      '<span>다른 동네 보기</span>' + OIL.chev('#fff') + '</a>';
    html += '<a class="oil-btn is-ghost" href="' + (OIL.cfg.calcPageUrl || '/p/calc.html') + '">' +
      '<span>내 연간 주유비 계산해보기</span>' + OIL.chev() + '</a>';

    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      esc(r.r) + ' · ' + OIL.dateKo(meta.date) + ' 휘발유 실제 판매가 ' + r.n + '곳 기준 · ' +
      '1년 성격은 최근 1년 일별 가격으로 산출 · 출처 오피넷</p>';

    html += '</div>';
    OIL.render(html);

    document.title = r.r + ' 주유소 최저가 - 오늘 기름값 ' + won(r.lo) + '원부터';
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  OIL.loading();
  if (mode === 'home') {
    Promise.all([OIL.meta(), OIL.regions()])
      .then(function (a) { renderHome(a[0], a[1]); })
      .catch(OIL.fail);
  } else {
    var slug = OIL.param('r');
    if (!slug) {
      location.replace(OIL.cfg.listPageUrl || '/');
      return;
    }
    Promise.all([OIL.meta(), OIL.region(slug), OIL.regions()])
      .then(function (a) { renderArea(a[0], a[1], a[2].total); })
      .catch(OIL.fail);
  }
})();
