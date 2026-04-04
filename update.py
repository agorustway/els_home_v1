import io
with io.open('c:/Users/hoon/Desktop/els_home_v1/web/android/app/src/main/assets/public/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

old_str = '''<script>window._naverMapLoadError=false;window._naverMapReady=false;window.__naverMapCB=function(){window._naverMapReady=true;console.log('[NaverMap] SDK 로드 성공! Origin:',location.origin);};</script>\n<script type=\"text/javascript\" src=\"https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=hxoj79osnj&submodules=geocoder&callback=__naverMapCB\" onerror=\"window._naverMapLoadError=true;console.error('[NaverMap] SDK 로드 실패! NCP 콘솔에서 도메인 등록 필요. Origin:',location.origin);\"></script>\n<script src=\"app.js?v=4.3.31\"></script>'''

new_str = '''<script>
window._naverMapLoadError=false;
window._naverMapReady=false;
window.__naverMapCB=function(){
  window._naverMapReady=true;
  console.log('[NaverMap] SDK 로드 성공! Origin:', location.origin);
  if(window.App && window.App.remoteLog) window.App.remoteLog('[TDD_MAP] 로드 성공. Origin=' + location.origin + ', Href=' + location.href, 'TDD');
};
window.__naverMapFail=function(){
  window._naverMapLoadError=true;
  console.error('[NaverMap] SDK 로드 실패! NCP 콘솔 도메인 필요. Origin:', location.origin);
  setTimeout(() => {
    if(window.App && window.App.remoteLog) window.App.remoteLog('[TDD_MAP] SDK 로드 에러(Origin Block 의심). Origin=' + location.origin + ', Href=' + location.href, 'TDD_ERR');
  }, 1000);
};
</script>
<script type=\"text/javascript\" src=\"https://oapi.map.naver.com/openapi/v3/maps.js?ncpClientId=hxoj79osnj&submodules=geocoder&callback=__naverMapCB\" onerror=\"__naverMapFail()\"></script>
<script src=\"app.js\"></script>'''

if old_str in text:
    text = text.replace(old_str, new_str)
    with io.open('c:/Users/hoon/Desktop/els_home_v1/web/android/app/src/main/assets/public/index.html', 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('Replaced')
else:
    print('Target string not found')
