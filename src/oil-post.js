/* 주유소찾기 - 블로그 글 보조
   글 본문은 블로그스팟 편집기에 붙여넣는 것이라 <script> 를 쓸 수 없다.
   그래서 본문에는 '표시'만 남기고 실제 일은 여기서 한다.

     <div class="oil-ad-here"></div>      -> 그 자리에 광고를 끼워 넣는다
     <span data-oil="selfGap"></span>     -> 오늘 데이터 값으로 채운다

   덕분에 글을 다시 쓰지 않아도 숫자가 매일 최신이 된다.
*/
(function () {
  'use strict';

  var OIL = window.OIL;
  if (!OIL || window.OIL_MODE !== 'blog') return;

  var won = OIL.won;

  /* 본문에서 쓸 수 있는 값들 */
  var FIELD = {
    date: function (m) { return OIL.dateKo(m.date); },
    phase: function (m) { return m.phase; },
    gasN: function (m) { return won(m.gas.n); },
    gasMedian: function (m) { return won(m.gas.median); },
    gasLow: function (m) { return won(m.gas.low); },
    gasHigh: function (m) { return won(m.gas.high); },
    dieselMedian: function (m) { return won(m.diesel.median); },
    selfMedian: function (m) { return won(m['self']); },
    fullMedian: function (m) { return won(m.full); },
    selfGap: function (m) { return won(m.selfGap); },
    weekdayGap: function (m) { return m.weekdayGap.toFixed(1); },
    spreadMedian: function (m) { return won(m.spreadMedian); },
    topSpreadName: function (m) { return m.topSpread.r; },
    topSpreadValue: function (m) { return won(m.topSpread.sp); },
    cheapName: function (m) { return m.regionCheap.r; },
    cheapValue: function (m) { return won(m.regionCheap.md); },
    priceyName: function (m) { return m.regionPricey.r; },
    priceyValue: function (m) { return won(m.regionPricey.md); }
  };

  function fillNumbers(meta) {
    var nodes = document.querySelectorAll('.post-body [data-oil]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute('data-oil');
      var fn = FIELD[key];
      if (!fn) continue;
      try { nodes[i].textContent = fn(meta); } catch (e) { /* 값이 없으면 그대로 둔다 */ }
    }
  }

  function fillAds() {
    var spots = document.querySelectorAll('.post-body .oil-ad-here');
    if (!spots.length) return;
    var html = OIL.adHtml();
    if (!html) return;
    for (var i = 0; i < spots.length; i++) {
      if (spots[i].getAttribute('data-done')) continue;
      spots[i].innerHTML = html;
      spots[i].setAttribute('data-done', '1');
    }
    OIL.adFill();
  }

  function run() {
    fillAds();
    if (!document.querySelector('.post-body [data-oil]')) return;
    OIL.meta().then(fillNumbers).catch(function () { /* 숫자는 못 채워도 글은 읽힌다 */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
