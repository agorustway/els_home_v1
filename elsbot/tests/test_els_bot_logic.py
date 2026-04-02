import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# elsbot 폴더를 path에 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from els_bot import find_ele_globally, open_els_menu, is_session_valid, close_modals

class TestElsBotLogic(unittest.TestCase):
    def setUp(self):
        self.mock_page = MagicMock()
        # ChromiumPage 객체에 frames 속성이 없음을 명시적으로 설정 (AttributeError 유도용)
        if hasattr(self.mock_page, 'frames'):
            del self.mock_page.frames

    def test_find_ele_globally_avoids_frames_attribute(self):
        """AttributeError: 'ChromiumPage' object has no attribute 'frames' 방지 테스트"""
        # Given: Mock 설정
        self.mock_page.ele.return_value = None
        mock_iframe = MagicMock()
        self.mock_page.eles.return_value = [mock_iframe]
        mock_target = MagicMock()
        mock_iframe.ele.return_value = mock_target
        
        # When: find_ele_globally 호출
        selector = 'css:input[id*="containerNo"]'
        result = find_ele_globally(self.mock_page, selector)
        
        # Then:
        # 1. page.ele가 호출되었는가?
        self.mock_page.ele.assert_any_call(selector, timeout=0.5)
        # 2. page.eles('t:iframe')가 호출되었는가? (frames 대신)
        self.mock_page.eles.assert_called_with('t:iframe')
        # 3. 결과값이 반환되었는가?
        self.assertEqual(result, mock_target)
        # 4. [중요] page.frames 가 접근되지 않았는가?
        # MagicMock은 속성 접근 시 새로운 Mock을 생성하므로,
        # 만약 frames가 접근되었다면 AssertionError가 나지 않겠지만,
        # 우리는 아까 setUp에서 del로 지웠거나 mock_page를 엄격하게 제한할 수 있음.
        # 여기서는 getattr 시도 시 에러가 나면 테스트 실패로 간주됨.
        with self.assertRaises(AttributeError):
             _ = self.mock_page.frames

    def test_open_els_menu_triggers_mnu0024(self):
        """MNU0024 자바스크립트 워프 로직이 실행되는지 테스트"""
        # Given: 
        self.mock_page.run_js.return_value = None
        self.mock_page.ele.return_value = MagicMock(states=MagicMock(is_displayed=True)) # 메뉴 진입 성공 가정
        
        # When:
        result = open_els_menu(self.mock_page)
        
        # Then:
        self.assertTrue(result)
        # MNU0024 스크립트가 실행되었나?
        calls = [c for c in self.mock_page.run_js.call_args_list if 'MNU0024' in str(c)]
        self.assertGreater(len(calls), 0)

    def test_is_session_valid_success(self):
        """세션이 유효할 때 (로그아웃 버튼 존재) True 반환 테스트"""
        # Given:
        self.mock_page.url = "https://etrans.klnet.co.kr/main.do"
        self.mock_page.html = "<html>...</html>"
        self.mock_page.ele.return_value = MagicMock() # 로그아웃 버튼 발견
        
        # When:
        result = is_session_valid(self.mock_page)
        
        # Then:
        self.assertTrue(result)

    def test_is_session_valid_expired(self):
        """세션 만료 텍스트 발견 시 False 반환 테스트"""
        # Given:
        self.mock_page.html = "Session이 종료되었습니다."
        self.mock_page.ele.return_value = None
        
        # When:
        result = is_session_valid(self.mock_page)
        
        # Then:
        self.assertFalse(result)

if __name__ == "__main__":
    unittest.main()
