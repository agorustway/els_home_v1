'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';
import styles from './IntranetEditor.module.css';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(
    async () => {
        const { default: RQ } = await import('react-quill');
        return function Comp({ forwardedRef, ...props }) {
            return <RQ ref={forwardedRef} {...props} />;
        };
    },
    { ssr: false }
);

export default function IntranetEditor({ value, onChange, placeholder }) {
    const quillRef = useRef(null);
    const [uploading, setUploading] = useState(false);

    // Image handler function
    const imageHandler = () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;

            setUploading(true);
            const timestamp = Date.now();
            const key = `editor/${timestamp}_${file.name}`;
            const formData = new FormData();
            formData.append('file', file);
            formData.append('key', key);

            try {
                const res = await fetch('/api/s3/files', {
                    method: 'POST',
                    body: formData,
                });

                if (res.ok) {
                    // Use relative path for production compatibility
                    // Instead of full URL, stick to API path which works regardless of domain
                    const url = `/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`;

                    const quill = quillRef.current.getEditor();
                    const range = quill.getSelection(true);

                    // Insert image with max-width style class if possible, or just img tag
                    quill.insertEmbed(range.index, 'image', url);

                    // Move cursor to right after image
                    quill.setSelection(range.index + 1);
                } else {
                    alert('이미지 업로드 실패');
                }
            } catch (error) {
                console.error('Error uploading image:', error);
                alert('이미지 업로드 중 오류 발생');
            } finally {
                setUploading(false);
            }
        };
    };

    // Custom Paste Handler
    useEffect(() => {
        if (!quillRef.current) return;
        const quill = quillRef.current.getEditor();

        const handlePaste = async (e) => {
            const clipboardData = e.clipboardData || window.clipboardData;
            if (!clipboardData) return;

            const items = clipboardData.items;
            if (!items) return;

            let file = null;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    file = items[i].getAsFile();
                    break;
                }
            }

            if (file) {
                e.preventDefault(); // Prevent default paste (base64)

                // Show loading state/placeholder
                const range = quill.getSelection(true);
                quill.insertText(range.index, 'Uploading image...', 'bold', true);

                setUploading(true);
                const timestamp = Date.now();
                const key = `editor/${timestamp}_${file.name}`;
                const formData = new FormData();
                formData.append('file', file);
                formData.append('key', key);

                try {
                    const res = await fetch('/api/s3/files', {
                        method: 'POST',
                        body: formData,
                    });

                    if (res.ok) {
                        const url = `/api/s3/files?key=${encodeURIComponent(key)}&name=${encodeURIComponent(file.name)}`;

                        // Remove placeholder
                        quill.deleteText(range.index, 'Uploading image...'.length);

                        // Insert image
                        quill.insertEmbed(range.index, 'image', url);
                        quill.setSelection(range.index + 1);
                    } else {
                        quill.deleteText(range.index, 'Uploading image...'.length);
                        alert('이미지 업로드 실패');
                    }
                } catch (error) {
                    console.error('Error uploading image:', error);
                    quill.deleteText(range.index, 'Uploading image...'.length);
                    alert('이미지 업로드 중 오류 발생');
                } finally {
                    setUploading(false);
                }
            }
        };

        const root = quill.root;
        root.addEventListener('paste', handlePaste);
        return () => {
            root.removeEventListener('paste', handlePaste);
        };
    }, []);

    const modules = useMemo(() => ({
        toolbar: {
            container: [
                [{ header: [1, 2, false] }],
                ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                [{ list: 'ordered' }, { list: 'bullet' }],
                ['link', 'image'],
                ['clean'],
            ],
            handlers: {
                image: imageHandler,
            },
        },
        clipboard: {
            matchVisual: false,
        },
    }), []);

    const formats = [
        'header',
        'bold', 'italic', 'underline', 'strike', 'blockquote',
        'list', 'bullet',
        'link', 'image',
    ];

    return (
        <div className={styles.editorWrapper}>
            {uploading && <div className={styles.uploadOverlay}>이미지 업로드 중...</div>}
            <ReactQuill
                forwardedRef={quillRef}
                theme="snow"
                value={value}
                onChange={onChange}
                modules={modules}
                formats={formats}
                placeholder={placeholder}
                className={styles.pquill}
            />
        </div>
    );
}

// Custom CSS for Quill Editor overrides will be handled via global css or module css
