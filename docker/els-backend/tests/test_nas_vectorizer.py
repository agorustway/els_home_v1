import os
import shutil
from pathlib import Path
from unittest import mock

import pytest

# Import the module under test
from nas_vectorizer import (
    extract_text_pypdf,
    extract_text_docx,
    extract_text_xlsx,
    process_nas_directory,
)

# Helper to create dummy files with given extension
def create_dummy_file(tmp_path, name, content=b"dummy"):
    file_path = tmp_path / name
    file_path.write_bytes(content)
    return file_path

@pytest.fixture
def dummy_supabase():
    # Mock supabase client with minimal interface used in process_nas_directory
    mock_client = mock.Mock()
    mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = mock.Mock(data=[])
    mock_client.table.return_value.upsert.return_value.execute.return_value = None
    mock_client.table.return_value.delete.return_value.eq.return_value.execute.return_value = None
    mock_client.table.return_value.insert.return_value.execute.return_value = None
    return mock_client

def test_extraction_routing(monkeypatch, tmp_path, dummy_supabase):
    # Create dummy files for each supported extension
    pdf_file = create_dummy_file(tmp_path, "test.pdf")
    docx_file = create_dummy_file(tmp_path, "test.docx")
    xlsx_file = create_dummy_file(tmp_path, "test.xlsx")
    txt_file = create_dummy_file(tmp_path, "test.txt", b"plain text")
    img_file = create_dummy_file(tmp_path, "test.png")
    doc_file = create_dummy_file(tmp_path, "test.doc")

    # Mock extraction functions to verify they are called
    mock_pdf = mock.Mock(return_value="pdf text")
    mock_docx = mock.Mock(return_value="docx text")
    mock_xlsx = mock.Mock(return_value="xlsx text")
    mock_txt = mock.Mock(return_value="txt text")
    mock_img = mock.Mock(return_value="img text")
    mock_doc = mock.Mock(return_value="doc text")

    monkeypatch.setattr('nas_vectorizer.extract_text_pypdf', mock_pdf)
    monkeypatch.setattr('nas_vectorizer.extract_text_docx', mock_docx)
    monkeypatch.setattr('nas_vectorizer.extract_text_xlsx', mock_xlsx)
    monkeypatch.setattr('nas_vectorizer.pytesseract.image_to_string', mock_img)
    monkeypatch.setattr('nas_vectorizer.textract.process', mock_doc)
    # For txt we let the real code read the file, so no mock needed

    # Run the processing on the temporary directory
    result = process_nas_directory(dummy_supabase, str(tmp_path), branch_name="TEST")

    # Verify that each mock was called once
    assert mock_pdf.called
    assert mock_docx.called
    assert mock_xlsx.called
    assert mock_img.called
    assert mock_doc.called
    # The txt file should be read directly, no mock needed; ensure processed count includes it
    assert result["processed"] >= 5

    # Ensure no unexpected errors
    assert result["errors"] == 0
