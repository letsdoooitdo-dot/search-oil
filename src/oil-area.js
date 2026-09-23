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

    /* 맨 위 광고 - 계산기·글 화면과 같은 자리 */
    html += OIL.adSlotHtml('top');

    /* 머리말 - 재방문이면 짧게.
       "우리 동네"라는 딱지는 뺐다(2026-09-23). 바로 아래 줄에 동네 이름이
       그대로 있어서 같은 말을 두 번 하는 셈이고, 위치를 잡아 들어온 사람에게
       필요한 건 '어디로 잡혔는지'뿐이다. */
    if (mine) {
      html += '<a class="oil-mine" href="' + OIL.areaUrl(mine.sl) + '">' +
        '<span><span class="oil-mine-r"><i>우리 동네</i> ' + esc(mine.r) +
          ' <i>기름값은?</i></span>' +
        '<span class="oil-mine-s">' + fuelName() + ' 최저 ' + won(st(mine).lo) + '원 · ' +
        '주유소 ' + st(mine).n + '곳</span></span>' + OIL.chev(OIL.cfg.accent || '#A54A04') + '</a>';
    } else {
      html += '<div><div class="oil-kicker">전국 주유소 ' + won(natl.n) + '곳 실제 판매가</div>' +
        '<h1 class="oil-h1">우리 동네 기름값,<br>고를 가치가 있을까요</h1>' +
        '<p class="oil-lead">같은 동네 안에서도 <b>수백 원</b> 차이가 나는 곳이 있고, ' +
        '30원도 차이 안 나는 곳이 있습니다. 어느 쪽인지부터 확인해보세요.</p></div>';
    }

    /* 내 설정 - 유종만 둔다.
       이 화면의 숫자는 전국 중앙값·최저~최고·동네 순위뿐이라 전부 유종으로
       갈린다. 차종은 여기서 아무것도 안 바꾼다 - 바꿔봐야 설정 상자 자기
       설명 한 줄만 달라졌다(2026-09-23 실측). 차종은 '한 번에 몇 L 넣느냐'를
       정하는 값이라, 그게 실제로 쓰이는 화면(동네 상세·계산기·주유소 목록)
       에서만 묻는다. */
    if (P) html += P.barHtml({ regionName: mine ? mine.r : '', fixed: true, noCar: true });

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

    /* adHtml() 은 광고를 꺼두면 빈 문자열이라 자리가 통째로 사라진다.
       adSlotHtml() 은 같은 크기의 빈 상자를 남겨서, 나중에 광고를 켜도
       화면이 아래로 밀리지 않는다. 다른 화면과 맞춘다(2026-09-23). */
    html += OIL.adSlotHtml();

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

    /* 계산기로 보내는 버튼은 뺐다(2026-09-23). 위 메뉴에 계산기 칸이 이미 있고,
       없어진 계산기(연간 주유비·경차 환급) 이름을 달고 있던 버튼이다. */
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

    var html = '<div class="oil-stack">';

    /* 맨 위 광고 - 계산기·글 화면과 같은 자리 */
    html += OIL.adSlotHtml('top');

    var spot = P ? P.get('spot') : '';
    /* "우리 동네"가 아니라 실제 동네 이름을 적는다. 목록에서 눌러 들어온
       동네는 우리 동네가 아닐 수도 있어서, 그렇게 쓰면 틀린 말이 된다. */
    html += '<div><div class="oil-kicker">' + esc(r.r) + ' ' + fuelName() + '</div>' +
      '<h1 class="oil-h1">' + esc(v.head) + '</h1>' +
      (spot ? '<div class="oil-spot">현위치 ' + esc(spot) + '</div>' : '') + '</div>';

    /* 설정은 접지 않고, 유종만 둔다(2026-09-23).
       이 화면에서 차종이 바꾸는 건 해설 문장 속 "한 번에 몇 L" 하나뿐이다.
       그 한 줄 때문에 버튼 네 개를 늘어놓는 것보다, 차종은 그게 계산의
       중심인 곳(계산기·주유소 목록)에서 고르게 하는 편이 낫다.
       여기서는 고른 차종을 그대로 가져다 쓰되, 어느 차 기준인지 문장에 밝힌다. */
    if (P) html += P.barHtml({ regionName: r.r, fixed: true, noCar: true });

    html += '<div class="oil-card"><p class="oil-p">' + v.body + '</p>' +
      '<p class="oil-p" style="font-size:13px;">' + v.nat + '</p>' +
      rows([
        ['주유소', s.n + '곳 (셀프 ' + r.sf + '곳)'],
        ['최저 ~ 최고', won(s.lo) + ' ~ ' + won(s.hi) + '원'],
        ['동네 중앙값', won(s.md) + '원', true]
      ]) + '</div>';

    /* 집·회사 저장 버튼은 뺐다(2026-09-23). 위치를 잡으면 마지막 동네가
       자동으로 남아서, 손으로 저장할 일이 없다. */
    html += OIL.adSlotHtml();

    var list = (r.stations || []).filter(function (x) { return price(x); })
      .sort(function (a, b) { return price(a) - price(b); }).slice(0, 15);
    html += '<div class="oil-card is-flush"><div style="padding:0 16px 10px;">' +
      '<div class="oil-card-title" style="margin:0;">오늘 싼 순서</div>' +
      '<p class="oil-p" style="font-size:12.5px;margin:6px 0 0;">' + OIL.characterLine(r) + '</p></div>' +
      list.map(stationRow).join('') + '</div>';

    /* '다른 동네 보기'는 동네 목록(=동네기름값? 메인)으로 간다.
       첫 화면(/)으로 보내면 동네를 보러 왔던 사람이 장소 검색 화면에
       떨어져서, 한 번 더 눌러 돌아와야 한다. */
    html += '<a class="oil-btn" href="' + (OIL.cfg.areaPageUrl || '/p/area.html') + '">' +
      '<span>다른 동네 보기</span>' + OIL.chev('#fff') + '</a>';

    html += '<p class="oil-p" style="font-size:11.5px;color:var(--oil-muted);">' +
      esc(r.r) + ' · ' + OIL.dateKo(meta.date) + ' ' + fuelName() + ' 실제 판매가 ' + s.n +
      '곳 기준 · 1년 성격은 최근 1년 일별 가격으로 산출 · 출처 오피넷</p></div>';

    OIL.render(html);
    document.title = r.r + ' 주유소 최저가 - 오늘 ' + fuelName() + ' ' + won(s.lo) + '원부터';

    if (P) P.wireBar(function () { renderArea(meta, r, total); });
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
