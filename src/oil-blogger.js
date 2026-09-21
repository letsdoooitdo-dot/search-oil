/* 주유소찾기 - 블로그스팟 화면 분기
   주소를 보고 어떤 화면을 그릴지 정한다.
     /                    홈 (지역 선택 + 오늘 현황)
     /p/area.html?r=...   동네 상세
     /p/calc.html         계산기
     그 외                 일반 블로그 글
*/
(function () {
  'use strict';

  var cfg = window.OIL_CONFIG || {};
  var html = document.documentElement;
  var path = location.pathname.replace(/\/+$/, '') || '/';

  var areaPath = (cfg.areaPageUrl || '/p/area.html').replace(/\/+$/, '');
  var calcPath = (cfg.calcPageUrl || '/p/calc.html').replace(/\/+$/, '');

  var mode = 'blog';
  if (path === '/' || path === '/index.html') mode = 'home';
  else if (path === areaPath) mode = 'area';
  else if (path === calcPath) mode = 'calc';

  html.classList.add('oil-mode-' + mode);
  window.OIL_MODE = mode;

  /* 탭 표시 */
  var tabs = [
    ['우리 동네', cfg.listPageUrl || '/'],
    ['계산기', cfg.calcPageUrl || '/p/calc.html'],
    ['기름값 이야기', (cfg.reportLabelUrl || '/search/label/기름값리포트')]
  ];
  var nav = document.getElementById('oil-tabs');
  if (nav) {
    var active = mode === 'calc' ? 1 : (mode === 'blog' ? 2 : 0);
    nav.innerHTML = '<ul>' + tabs.map(function (t, i) {
      return '<li><a class="' + (i === active ? 'active' : '') + '" href="' + t[1] + '">' +
        t[0] + '</a></li>';
    }).join('') + '</ul>';
  }

  /* 앱 화면이 아니면 본문 자리를 비워 공간을 차지하지 않게 한다 */
  if (mode === 'blog') {
    var root = document.getElementById('oil-root');
    if (root) root.style.display = 'none';
  }
})();
