import os
import sys
import pytest
from unittest import mock
from pathlib import Path

# Add current dir to path to import nas_vectorizer
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Mocking missing modules that are not essential for this TDD check
from unittest import mock
import sys
sys.modules['textract'] = mock.Mock()

from nas_vectorizer import process_nas_directory

@pytest.fixture
def mock_supabase():
    mock_client = mock.Mock()
    # Mocking the select for nas_file_index (checking if file is already indexed)
    mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    # Mocking other DB operations
    mock_client.table.return_value.upsert.return_value.execute.return_value = mock.Mock()
    mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = mock.Mock()
    mock_client.table.return_value.insert.return_value.execute.return_value = mock.Mock()
    return mock_client

@pytest.fixture
def mock_genai_client():
    with mock.patch('nas_vectorizer.genai.Client') as MockClient:
        mock_instance = MockClient.return_value
        # Mock embed_content to simulate successful API call
        mock_instance.models.embed_content.return_value = mock.Mock(
            embeddings=[mock.Mock(values=[0.1, 0.2, 0.3])]
        )
        yield mock_instance

def test_vectorizer_gemini_model_name(tmp_path, mock_supabase, mock_genai_client, monkeypatch):
    """
    TDD: Verify that process_nas_directory calls embed_content with the CORRECT model name string.
    Specifically checking against the 'models/models/...' double prefix issue.
    """
    # 1. Setup environment
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
    
    # 2. Create a dummy test file
    test_file = tmp_path / "important_doc.txt"
    test_file.write_text("This is 30% safety freight logic document for ELS.", encoding="utf-8")
    
    # 3. Run vectorizer
    result = process_nas_directory(mock_supabase, str(tmp_path), branch_name="TDD_TEST")
    
    # 4. Assertions
    assert result["processed"] == 1
    assert result["errors"] == 0
    
    # 5. Core Check: Verify the model name string used in the call
    # We expect 'text-embedding-004', NOT 'models/text-embedding-004' if the SDK handles it
    # OR we check if our previous redundant fix (adding models/) was indeed redundant.
    
    # Get all calls to embed_content
    calls = mock_genai_client.models.embed_content.call_args_list
    assert len(calls) > 0
    
    # Check the 'model' argument of the first call
    call_kwargs = calls[0].kwargs
    model_name = call_kwargs.get('model')
    
    print(f"\n[TDD DEBUG] Model name used in API call: {model_name}")
    
    # IF the user is using the SDK, 'text-embedding-004' is standard.
    # If the user saw 404 with 'models/text-embedding-004', then 'text-embedding-004' should be the fix.
    assert model_name == "text-embedding-004"
    assert "models/" not in model_name, "Redundant 'models/' prefix detected!"

def test_file_size_limit_respect(tmp_path, mock_supabase, mock_genai_client, monkeypatch):
    """
    Verify that files over 50MB are skipped as per the latest requirements.
    """
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-123")
    
    # Create a small file
    small_file = tmp_path / "small.txt"
    small_file.write_text("small content")
    
    # Create a 'large' file (mocking size)
    large_file = tmp_path / "too_big.txt"
    large_file.write_text("X" * 100) # Actual content small, but we will mock the stat
    
    # Mocking os.path.getsize or filepath.stat().st_size
    # In nas_vectorizer: filepath.stat().st_size
    
    original_stat = Path.stat
    def mock_stat(self):
        if self.name == "too_big.txt":
            return mock.Mock(st_size=60 * 1024 * 1024, st_mtime=123456789) # 60MB
        return original_stat(self)
        
    with mock.patch('nas_vectorizer.Path.stat', side_effect=mock_stat, autospec=True):
        result = process_nas_directory(mock_supabase, str(tmp_path), branch_name="SIZE_TEST")
        
    assert result["processed"] == 1 # Only small.txt
    assert result["skipped"] >= 1 # too_big.txt skipped
