/**
 * nav.js — 화면 전환 (순수 DOM, 의존성 없음)
 * permissions, init 등 여러 모듈이 공통으로 import
 */

export function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name)?.classList.add('active');

  const globalTabBar  = document.getElementById('global-tab-bar');
  const globalSafeArea = document.getElementById('global-safe-area');
  if (globalTabBar && globalSafeArea) {
    if (name === 'main' || name === 'map') {
      globalTabBar.classList.remove('hidden');
      globalSafeArea.classList.remove('hidden');
    } else {
      globalTabBar.classList.add('hidden');
      globalSafeArea.classList.add('hidden');
    }
  }
}
