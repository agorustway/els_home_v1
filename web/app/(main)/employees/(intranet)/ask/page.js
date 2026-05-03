'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserRole } from '@/hooks/useUserRole';
import styles from './ask.module.css';

const QUICK_PROMPTS = [
    { label: 'TCLU4255167 이력 조회', icon: null },
    { label: '아산지점 24년_운임표.xlsx 내용 요약', icon: null },
    { label: '[본사] 명함 신청서(이미지) 요약', icon: null },
    { label: '내일 아산 차량관리 주의사항', icon: null },
    { label: '부산 신항 40ft 안전운임', icon: null },
];

function TypingIndicator() {
    return (
        <div className={styles.typingIndicator}>
            <span /><span /><span />
        </div>
    );
}

// 마크다운 링크 파서
function renderTextWithLinks(text) {
    if (!text) return null;
    const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
    return parts.map((part, i) => {
        const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (match) {
            return (
                <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 'bold' }}>
                    {match[1]}
                </a>
            );
        }
        return part;
    });
}

function MessageBubble({ msg, isNew }) {
    const isUser = msg.role === 'user';
    const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: true }) : '';
    const [copied, setCopied] = useState(false);
    const pressTimer = useRef(null);

    const handleCopy = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!msg.content) return;
        
        // 텍스트 복사 (HTML 태그 제거 및 마크다운 정리)
        const cleanText = msg.content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
        navigator.clipboard.writeText(cleanText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            
            // 모바일 진동 피드백 (지원되는 경우)
            if (navigator.vibrate) navigator.vibrate(50);
        }).catch(err => {
            console.error('복사 실패:', err);
        });
    };

    // 모바일 롱프레스 핸들러
    const startPress = () => { pressTimer.current = setTimeout(handleCopy, 600); };
    const endPress = () => { if (pressTimer.current) clearTimeout(pressTimer.current); };

    return (
        <div className={`${styles.messageRow} ${isUser ? styles.userRow : styles.assistantRow} ${isNew ? styles.newMessage : ''}`}>
            {!isUser && (
                <div className={styles.avatar} aria-hidden="true" style={{ padding: 0, overflow: 'hidden', background: 'transparent' }}>
                    <img src="/images/EL_S_AI_LOGO.jpg" alt="ELS AI 엘스" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                </div>
            )}
            <div className={styles.bubbleContainer}>
                <div 
                    className={`${styles.bubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}
                    onTouchStart={startPress}
                    onTouchEnd={endPress}
                    onMouseDown={startPress}
                    onMouseUp={endPress}
                    onMouseLeave={endPress}
                    style={{ position: 'relative' }}
                >
                    {/* 복사 버튼 (데스크톱/모바일 공용) */}
                    <button 
                        className={styles.copyMessageBtn} 
                        onClick={handleCopy} 
                        title="메시지 복사"
                        aria-label="메시지 복사"
                    >
                        {copied ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                        )}
                    </button>

                    {renderTextWithLinks(msg.content)}
                    
                    {/* 첨부 파일(이미지/문서) 출력 */}
                    {msg.attachments && msg.attachments.length > 0 && (
                        <div className={styles.messageAttachmentContainer}>
                            {msg.attachments.map((att, idx) => {
                                const isImage = att.mime_type?.startsWith('image/');
                                // [v5.7.3] 데이터가 있는 경우만 이미지로 출력 (과거 기록은 용량상 데이터가 없을 수 있음)
                                if (isImage && att.data) {
                                    return (
                                        <img 
                                            key={idx} 
                                            src={`data:${att.mime_type};base64,${att.data}`} 
                                            className={styles.messageImage} 
                                            alt="첨부 이미지"
                                            onClick={(e) => { e.stopPropagation(); window.open(`data:${att.mime_type};base64,${att.data}`, '_blank'); }}
                                        />
                                    );
                                }
                                // 데이터가 없거나 문서인 경우 아이콘 표시
                                return (
                                    <div key={idx} className={styles.messageFileItem}>
                                        <div className={styles.fileIcon} style={{ background: isImage ? '#94a3b8' : '#2563eb' }}>
                                            {isImage ? 'IMG' : att.mime_type?.includes('pdf') ? 'PDF' : att.mime_type?.includes('sheet') ? 'XLS' : 'DOC'}
                                        </div>
                                        <div style={{display: 'flex', flexDirection: 'column'}}>
                                            <span className={styles.fileName}>{att.name || (isImage ? '이미지' : '첨부 파일')}</span>
                                            {!att.data && <span style={{fontSize: '0.6rem', color: '#94a3b8'}}>내용 미리보기 만료</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    
                    {copied && <div className={styles.copyBadge}>복사됨!</div>}
                </div>
                {timeStr && <span className={styles.messageTime}>{timeStr}</span>}
            </div>
        </div>
    );
}

/** ── 브라우저 단 이미지 압축 헬퍼 ── */
async function compressImage(file, maxWidth = 1024, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', quality);
                const [header, data] = base64.split(',');
                const mime = header.match(/:(.*?);/)[1];
                resolve({ mime_type: mime, data });
            };
        };
    });
}

export default function AskPage() {
    const { role, loading: authLoading } = useUserRole();
    const router = useRouter();
    const [sessions, setSessions] = useState([]);
    const [activeId, setActiveId] = useState('');
    
    const activeSession = sessions.find(s => s.id === activeId);
    const messages = activeSession?.messages || [];

    const setMessages = useCallback((updater) => {
        setSessions(prev => prev.map(s => {
            if (s.id === activeId) {
                return { ...s, messages: typeof updater === 'function' ? updater(s.messages) : updater };
            }
            return s;
        }));
    }, [activeId]);

    const [input, setInput] = useState('');
    const [selectedFiles, setSelectedFiles] = useState([]); // [{ file, preview, base64, mime_type, name, type: 'image'|'doc' }]
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false); // 모바일 히스토리 드로어 상태
    const [newMsgIdx, setNewMsgIdx] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const abortRef = useRef(null);

    const DEFAULT_INIT_MSG = {
        role: 'assistant',
        content: '안녕하세요! **더 똑똑해진 ELS AI 엘스(v5.10.0)**입니다.\n\n이제 사외 데이터(실시간 날씨, 미세먼지, 유가, KBO/K리그)와 사내 데이터(NAS 문서 수만 권, 이트랜스 이력, 차량 관제)를 통합하여 답변해 드립니다.\n\n사내 지식이나 실시간 현황에 대해 무엇이든 물어보세요!',
        timestamp: new Date().toISOString()
    };

    const createNewSession = () => {
        const id = Date.now().toString();
        setSessions(prev => [{ id, title: '새로운 대화', messages: [DEFAULT_INIT_MSG] }, ...prev].slice(0, 30));
        setActiveId(id);
    };

    const deleteSession = (id) => {
        if (!window.confirm('이 대화 기록을 삭제하시겠습니까?')) return;
        setSessions(prev => {
            const next = prev.filter(s => s.id !== id);
            if (next.length === 0) {
                const newId = Date.now().toString();
                next.push({ id: newId, title: '새로운 대화', messages: [DEFAULT_INIT_MSG] });
                setActiveId(newId);
            } else if (activeId === id) {
                setActiveId(next[0].id);
            }
            return next;
        });
    };

    const clearAllHistory = async () => {
        if (!window.confirm('모든 대화 기록을 일괄 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
        try {
            await fetch('/api/chat/memory', { method: 'DELETE' });
        } catch(e) {}
        try { localStorage.removeItem(LS_KEY); } catch {}
        const newId = Date.now().toString();
        setSessions([{ id: newId, title: '새로운 대화', messages: [DEFAULT_INIT_MSG] }]);
        setActiveId(newId);
    };

    // ─── localStorage 헬퍼 (동기적 · 즉시 · 확실) ────────────────────
    const LS_KEY = 'els_ai_sessions';
    const saveToLocal = useCallback((data) => {
        try {
            // [v5.7.2] 대용량 첨부파일 데이터(Base64) 제거 후 저장
            const optimized = data.map(s => ({
                ...s,
                messages: s.messages.map(m => {
                    if (m.attachments && m.attachments.length > 0) {
                        return { ...m, attachments: m.attachments.map(att => ({ ...att, data: undefined })) };
                    }
                    return m;
                })
            }));
            localStorage.setItem(LS_KEY, JSON.stringify(optimized));
        } catch (e) { console.error('[ELS-AI] localStorage 저장 실패:', e); }
    }, []);
    const loadFromLocal = useCallback(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) return parsed;
            }
        } catch {}
        return null;
    }, []);

    // ─── 세션 로드: DB 우선 → localStorage 폴백 → 빈 세션 ──────────
    useEffect(() => {
        const loadMemory = async () => {
            // [v5.8.8] 새 대화 시작 유틸리티
            const startNewIfNeeded = (existingSessions) => {
                if (!existingSessions || existingSessions.length === 0) {
                    const initId = Date.now().toString();
                    const initSessions = [{ id: initId, title: '새로운 대화', messages: [{ ...DEFAULT_INIT_MSG, timestamp: new Date().toISOString() }] }];
                    setSessions(initSessions);
                    setActiveId(initId);
                    return initSessions;
                }
                
                const lastSession = existingSessions[0];
                // 마지막 세션이 비어있지 않으면(메시지 1개 초과) 새 세션 생성
                if (lastSession.messages.length > 1) {
                    const newId = Date.now().toString();
                    const newSession = { id: newId, title: '새로운 대화', messages: [{ ...DEFAULT_INIT_MSG, timestamp: new Date().toISOString() }] };
                    const updated = [newSession, ...existingSessions].slice(0, 30);
                    setSessions(updated);
                    setActiveId(newId);
                    return updated;
                } else {
                    // 마지막 세션이 비어있으면 그대로 사용하되 타임스탬프만 갱신
                    setActiveId(lastSession.id);
                    return existingSessions;
                }
            };

            // 1차: localStorage에서 즉시 로드 (화면 깜빡임 방지)
            const localData = loadFromLocal();
            if (localData) {
                setSessions(localData);
                setActiveId(localData[0].id);
            }

            let finalSessions = localData;

            // 2차: DB에서 비동기 로드 (더 최신 데이터가 있으면 덮어씀)
            try {
                const res = await fetch('/api/chat/memory', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    let raw = data.messages || [];
                    if (raw.length > 0 && raw[0].id && raw[0].messages) {
                        const dbTotal = raw.reduce((sum, s) => sum + (s.messages?.length || 0), 0);
                        const localTotal = localData ? localData.reduce((sum, s) => sum + (s.messages?.length || 0), 0) : 0;
                        if (dbTotal >= localTotal) {
                            finalSessions = raw;
                            setSessions(raw);
                            saveToLocal(raw);
                        }
                    }
                }
            } catch (err) {
                console.warn('[ELS-AI] DB 로드 실패, localStorage 폴백 사용:', err.message);
            }

            // [v5.8.8] 형의 요청: 페이지 진입 시 항상 새 대화로 시작 (기존 기록은 보존)
            startNewIfNeeded(finalSessions);
            setIsLoaded(true);
        };
        loadMemory();
    }, []);

    // ─── 세션 저장: localStorage 즉시 + DB 디바운스 ──────────────────
    const saveTimerRef = useRef(null);
    const sessionsRef = useRef(sessions);
    sessionsRef.current = sessions;

    useEffect(() => {
        if (!isLoaded || sessions.length === 0) return;
        
        // localStorage는 즉시 저장 (동기적 — 절대 유실 안 됨)
        saveToLocal(sessions);
        
        // DB는 디바운스 저장 (네트워크 의존적 + 데이터 다이어트)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const optimized = sessions.map(s => ({
                ...s,
                messages: s.messages.map(m => {
                    if (m.attachments && m.attachments.length > 0) {
                        return { ...m, attachments: m.attachments.map(att => ({ ...att, data: undefined })) };
                    }
                    return m;
                })
            }));
            fetch('/api/chat/memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: optimized })
            }).catch((e) => console.warn('[ELS-AI] DB 저장 실패:', e.message));
        }, 2000); // 2초 디바운스

        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [sessions, isLoaded, saveToLocal]);

    // 페이지 이탈 시 DB에도 최종 저장 시도
    useEffect(() => {
        const saveBeforeLeave = () => {
            if (!isLoaded || sessionsRef.current.length === 0) return;
            saveToLocal(sessionsRef.current); // localStorage 확실히
            const payload = JSON.stringify({ messages: sessionsRef.current });
            if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/chat/memory', new Blob([payload], { type: 'application/json' }));
            }
        };
        const handleVisibility = () => { if (document.visibilityState === 'hidden') saveBeforeLeave(); };
        window.addEventListener('beforeunload', saveBeforeLeave);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.removeEventListener('beforeunload', saveBeforeLeave);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [isLoaded, saveToLocal]);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/ask');
    }, [role, authLoading, router]);

    useEffect(() => {
        const chatArea = document.getElementById('chat-area');
        if (chatArea) {
            chatArea.scrollTop = chatArea.scrollHeight;
        }
    }, [messages, isLoading, selectedFiles]);

    const handleFileSelect = async (eOrFiles) => {
        let files = [];
        if (eOrFiles.target && eOrFiles.target.files) {
            files = Array.from(eOrFiles.target.files);
        } else if (Array.isArray(eOrFiles)) {
            files = eOrFiles;
        }
        if (files.length === 0) return;

        if (selectedFiles.length + files.length > 10) {
            alert('파일은 한 번에 최대 10개까지 업로드 가능합니다.');
            return;
        }

        const newFiles = [];
        for (const file of files) {
            const isImage = file.type.startsWith('image/');
            const isDoc = file.type.includes('pdf') || file.type.includes('sheet') || file.type.includes('word') || file.type.includes('text') || file.name.endsWith('.txt');
            
            if (!isImage && !isDoc) {
                alert(`${file.name}은(는) 지원되지 않는 형식입니다. (이미지, PDF, 엑셀, 워드, 텍스트만 가능)`);
                continue;
            }

            if (isImage) {
                const preview = URL.createObjectURL(file);
                const compressed = await compressImage(file);
                newFiles.push({ file, preview, ...compressed, name: file.name, type: 'image' });
            } else {
                // 문서는 Base64로 직접 변환
                const base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                });
                newFiles.push({ file, name: file.name, mime_type: file.type || 'application/octet-stream', data: base64, type: 'doc' });
            }
        }
        setSelectedFiles(prev => [...prev, ...newFiles]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(Array.from(e.dataTransfer.files));
        }
    };

    const removeFile = (idx) => {
        setSelectedFiles(prev => {
            const next = [...prev];
            if (next[idx]?.preview) URL.revokeObjectURL(next[idx].preview);
            next.splice(idx, 1);
            return next;
        });
    };

    const sendMessage = useCallback(async (text) => {
        const trimmed = (text ?? input).trim();
        if ((!trimmed && selectedFiles.length === 0) || isLoading) return;

        setInput('');
        const attachmentsToSend = selectedFiles.map(f => ({ mime_type: f.mime_type, data: f.data, name: f.name }));
        setSelectedFiles([]);

        const userMsg = { 
            role: 'user', 
            content: trimmed,
            attachments: attachmentsToSend,
            timestamp: new Date().toISOString()
        };
        
        // 제목 자동 생성 로직 (첫 질문 시)
        const isFirstQuestion = messages.length <= 1;
        
        setSessions((prev) => prev.map(s => {
            if (s.id === activeId) {
                // 임시로 먼저 텍스트 일부를 제목으로 설정
                const tempTitle = isFirstQuestion ? (trimmed.slice(0, 15) + (trimmed.length > 15 ? '...' : '')) : s.title;
                return { ...s, title: tempTitle, messages: [...s.messages, userMsg] };
            }
            return s;
        }));

        // 백그라운드에서 AI 제목 생성 호출
        if (isFirstQuestion) {
            fetch('/api/chat/title', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: trimmed })
            }).then(res => res.json()).then(data => {
                if (data.title) {
                    setSessions(prev => prev.map(s => 
                        s.id === activeId ? { ...s, title: data.title } : s
                    ));
                }
            }).catch(() => {});
        }
        
        setIsLoading(true);
        setNewMsgIdx(null);

        // 이전 요청 취소
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // 첫 번째 고정 인사말(index 0)은 토큰 절약을 위해 제외하고 전송
                    messages: [...messages.slice(1), userMsg].map((m) => {
                        const parts = [{ text: m.content || '' }];
                        if (m.attachments && m.attachments.length > 0) {
                            m.attachments.forEach(att => {
                                parts.push({ inline_data: { mime_type: att.mime_type, data: att.data } });
                            });
                        }
                        return { role: m.role, parts };
                    }),
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `서버 오류 (${res.status})`);
            }

            // 스트리밍 처리
            const reader = res.body?.getReader();
            if (!reader) throw new Error('스트리밍을 지원하지 않습니다.');

            const decoder = new TextDecoder();
            let assistantText = '';
            const assistantIdx = messages.length + 1; // user msg 다음 인덱스

            setMessages((prev) => [...prev, { role: 'assistant', content: '', timestamp: new Date().toISOString() }]);
            setNewMsgIdx(assistantIdx);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                // SSE 파싱: "data: {...}\n\n" 포맷
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (raw === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(raw);
                        const delta = parsed.text ?? '';
                        assistantText += delta;
                        setMessages((prev) => {
                            const next = [...prev];
                            next[next.length - 1] = { role: 'assistant', content: assistantText };
                            return next;
                        });
                    } catch { /* 파싱 실패 시 무시 */ }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            let errMsg = err.message;
            if (errMsg.includes('429')) {
                errMsg = 'AI가 잠깐 쉬는 중입니다 (분당 요청 한도 초과).\n잠시 후 다시 질문해 주세요!';
            } else if (errMsg.includes('503')) {
                errMsg = 'AI 서비스가 일시적으로 불가합니다. (GEMINI_API_KEY 미설정)\n관리자에게 문의하세요.';
            } else if (errMsg.includes('502')) {
                errMsg = 'AI 서버 연결에 실패했습니다. 네트워크를 확인해 주세요.';
            }
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: errMsg },
            ]);
        } finally {
            setIsLoading(false);
            // AI 응답 완료 후 입력창에 자동 포커스 복원
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [input, isLoading, messages]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const [isMobileGuideOpen, setIsMobileGuideOpen] = useState(false);

    const clearHistory = async () => {
        if(confirm('현재 대화 내용을 지우시겠습니까?')) {
            setMessages([DEFAULT_INIT_MSG]);
        }
    };



    const GuideContent = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h2 className={styles.guideTitle} style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '8px', marginBottom: '8px' }}>ELS AI 가이드 (v5.10.0)</h2>
            
            <div className={styles.guideBox} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <span className={styles.guideHighlight} style={{ fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>배차 및 마감자료 분석</span>
                <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.6' }}>
                    엑셀 배차판과 실적 데이터를 정밀 검색합니다.
                    <ul style={{ paddingLeft: '20px', margin: '4px 0 0 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <li>&quot;1145 차량 4월 13일 작업지 어디야?&quot;</li>
                        <li>&quot;8163 수출리스트보고 3월 내역 찾아줘&quot;</li>
                    </ul>
                </div>
            </div>

            <div className={styles.guideBox} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <span className={styles.guideHighlight} style={{ fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>사내 문서 검색 (NAS)</span>
                <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.6' }}>
                    NAS에 저장된 방대한 문서를 검색하고 요약합니다.
                    <ul style={{ paddingLeft: '20px', margin: '4px 0 0 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <li>&quot;안전운임 고시 문서에서 대기료 규정 찾아줘&quot;</li>
                        <li>&quot;아산지점 최근 업무보고 내용 요약해줘&quot;</li>
                    </ul>
                </div>
            </div>

            <div className={styles.guideBox} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <span className={styles.guideHighlight} style={{ fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>안전운임 및 물류 관제</span>
                <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.6' }}>
                    <ul style={{ paddingLeft: '20px', margin: '0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <li>&quot;아산 부산 40ft 안전운임 얼마야?&quot;</li>
                        <li>&quot;TCLU1234567 컨테이너 위치 어디야?&quot;</li>
                        <li>&quot;의왕 반납 시 할증 포함 총 운임은?&quot;</li>
                    </ul>
                </div>
            </div>

            <div className={styles.guideBox} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px' }}>
                <span className={styles.guideHighlight} style={{ fontWeight: 'bold', color: '#0f172a', display: 'block', marginBottom: '4px' }}>멀티 도메인 연결 (Omni-RAG)</span>
                <div style={{ fontSize: '0.8rem', color: '#475569', lineHeight: '1.6' }}>
                    <ul style={{ paddingLeft: '20px', margin: '0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <li><b>기상-운송</b>: 결빙주의보 시 안전 가이드</li>
                        <li><b>유가-운임</b>: 실시간 경유가 및 운임 대응</li>
                        <li><b>법령-행정</b>: 과태료 감경 규정 실무 연계</li>
                    </ul>
                </div>
            </div>
            
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 'auto', textAlign: 'center', paddingTop: '16px' }}>
                <Link href="/employees/random-game" style={{ color: 'inherit', textDecoration: 'none', cursor: 'default' }}>
                    ELS Solution AI Assistant (Dedicated Build)
                </Link>
            </div>
        </div>
    );

    if (!isLoaded) return <div className={styles.loadingScreen}>로딩 중...</div>;

    const HistoryContent = () => (
        <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button className={styles.newChatBtn} onClick={() => { createNewSession(); setIsHistoryOpen(false); }} style={{ flex: 1 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    새 대화
                </button>
                <button onClick={clearAllHistory} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '0 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }} title="전체 삭제">
                    삭제
                </button>
            </div>
            <div className={styles.historyList}>
                {sessions.map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: s.id === activeId ? '#dbeafe' : 'transparent', borderRadius: '8px' }}>
                        <button 
                            className={`${styles.historyItem} ${s.id === activeId ? styles.active : ''}`}
                            onClick={() => { setActiveId(s.id); setIsHistoryOpen(false); }}
                            title={s.title}
                            style={{ flex: 1, background: 'transparent' }}
                        >
                            {s.title}
                        </button>
                        <button 
                            onClick={() => deleteSession(s.id)}
                            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '8px 10px', fontSize: '1rem', borderRadius: '4px' }}
                            title="이 대화 삭제"
                        >×</button>
                    </div>
                ))}
            </div>
        </>
    );

    return (
        <div className={styles.containerLayout}>
            {/* 모바일 히스토리 드로어 */}
            {isHistoryOpen && (
                <div className={styles.guideModalOverlay} onClick={() => setIsHistoryOpen(false)}>
                    <div className={styles.mobileHistoryDrawer} onClick={e => e.stopPropagation()}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                            <h3 style={{margin: 0, fontSize: '1.1rem', fontWeight: 800}}>대화 목록</h3>
                            <button onClick={() => setIsHistoryOpen(false)} style={{background: 'none', border: 'none', fontSize: '1.5rem', color: '#64748b', cursor: 'pointer'}}>×</button>
                        </div>
                        <HistoryContent />
                    </div>
                </div>
            )}
            {/* 모바일 모달 가이드 */}
            {isMobileGuideOpen && (
                <div className={styles.guideModalOverlay} onClick={() => setIsMobileGuideOpen(false)}>
                    <div className={styles.guideModalContent} onClick={e => e.stopPropagation()}>
                        <GuideContent />
                        <button 
                            onClick={() => setIsMobileGuideOpen(false)}
                            style={{marginTop: '20px', width: '100%', padding: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'}}
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}

            <div className={`${styles.historySidebar} ${styles.hiddenMobile}`}>
                <HistoryContent />
            </div>

            <div 
                className={styles.wrapper}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* [v5.7.7] 드래그 오버 시 오버레이 표시 */}
                {isDragging && (
                    <div className={styles.dragOverlay}>
                        <div className={styles.dragOverlayContent}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            <p>여기에 파일을 놓아 업로드하세요</p>
                        </div>
                    </div>
                )}
                {/* 헤더 */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button 
                            className={styles.headerIconBtn} 
                            onClick={() => setIsHistoryOpen(true)}
                            aria-label="대화 목록 열기"
                        >
                            <div className={styles.headerIcon} aria-hidden="true" style={{ padding: 0, overflow: 'hidden', background: 'transparent' }}>
                                <img src="/images/EL_S_AI_LOGO.jpg" alt="ELS AI 엘스" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            </div>
                        </button>
                        <div>
                            <h1 className={styles.headerTitle}>ELS AI 엘스 <span style={{fontSize: '0.7rem', color: '#2563eb', background: '#dbeafe', padding: '2px 6px', borderRadius: '4px', marginLeft: '6px'}}>v5.10.0</span></h1>
                            <p className={styles.headerSub}>Omni-Agent Infrastructure · Knowledge Link System</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, minWidth: 0 }}>
                        <button onClick={clearAllHistory} className={styles.statusBadge} style={{ background: '#fff', color: '#e11d48', border: '1px solid #fda4af', cursor: 'pointer' }} title="모든 기록 삭제">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            <span className={styles.headerBtnText}>기록 삭제</span>
                        </button>
                        <button onClick={clearHistory} className={styles.statusBadge} style={{ background: '#fff', color: '#475569', border: '1px solid #cbd5e1', cursor: 'pointer' }} title="현재 대화 비우기">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
                            <span className={styles.headerBtnText}>비우기</span>
                        </button>
                        <button onClick={() => setIsMobileGuideOpen(true)} className={styles.statusBadge} style={{ background: '#fff', color: '#475569', border: '1px solid #cbd5e1', cursor: 'pointer' }} title="가이드">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                            <span className={styles.headerBtnText}>가이드</span>
                        </button>
                        <div className={`${styles.statusBadge} ${styles.hideOnMobileXs}`}>
                            <span className={styles.statusDot} />
                            온라인
                        </div>
                    </div>
                </div>

                {/* 메시지 영역 */}
                <div className={styles.chatArea} id="chat-area">
                    {messages.map((msg, i) => (
                        <MessageBubble key={i} msg={msg} isNew={i === newMsgIdx} />
                    ))}
                    {isLoading && (
                        <div className={`${styles.messageRow} ${styles.assistantRow}`}>
                            <div className={styles.avatar} aria-hidden="true" style={{ padding: 0, overflow: 'hidden', background: 'transparent' }}>
                                <img src="/images/EL_S_AI_LOGO.jpg" alt="ELS AI 엘스" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            </div>
                            <div className={`${styles.bubble} ${styles.assistantBubble}`}>
                                <TypingIndicator />
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* 빠른 질문 (초기/메시지 2개 이하) */}
                {messages.length <= 2 && !isLoading && (
                    <div className={styles.quickPromptsArea}>
                        <p className={styles.quickLabel}>빠른 질문</p>
                        <div className={styles.quickPrompts}>
                            {QUICK_PROMPTS.map((q) => (
                                <button
                                    key={q.label}
                                    className={styles.quickBtn}
                                    onClick={() => sendMessage(q.label)}
                                    type="button"
                                >
                                    <span className={styles.quickIcon}>{q.icon}</span>
                                    {q.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 파일 미리보기 영역 */}
                {selectedFiles.length > 0 && (
                    <div className={styles.imagePreviewArea}>
                        {selectedFiles.map((f, idx) => (
                            <div key={idx} className={styles.previewItem} title={f.name}>
                                {f.type === 'image' ? (
                                    <img src={f.preview} className={styles.previewImg} alt="미리보기" />
                                ) : (
                                    <div className={styles.docPreview}>
                                        <div style={{fontSize: '0.6rem', fontWeight: 800, color: '#64748b'}}>
                                            {f.name.split('.').pop().toUpperCase()}
                                        </div>
                                        <div style={{fontSize: '0.5rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center'}}>
                                            {f.name}
                                        </div>
                                    </div>
                                )}
                                <button className={styles.removePreview} onClick={() => removeFile(idx)}>×</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* 입력 영역 */}
                <div className={styles.inputArea}>
                    <div className={styles.inputBox}>
                        <button 
                            type="button" 
                            className={styles.imageUploadBtn}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoading}
                            title="파일 업로드 (이미지, PDF, 엑셀, 워드, 텍스트)"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                            </svg>
                        </button>
                        <input 
                            ref={fileInputRef}
                            type="file" 
                            accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.txt" 
                            multiple 
                            style={{ display: 'none' }} 
                            onChange={handleFileSelect}
                        />
                        <textarea
                            ref={inputRef}
                            id="chat-input"
                            className={styles.textarea}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="메시지를 입력하세요... (Shift+Enter: 줄바꿈)"
                            rows={1}
                            disabled={isLoading}
                            aria-label="채팅 입력"
                        />
                        <button
                            id="chat-send-btn"
                            className={styles.sendBtn}
                            onClick={() => sendMessage()}
                            disabled={(!input.trim() && selectedFiles.length === 0) || isLoading}
                            type="button"
                            aria-label="전송"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="22" y1="2" x2="11" y2="13"/>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                            </svg>
                        </button>
                    </div>
                    <p className={styles.disclaimer}>AI 답변은 참고용입니다. 중요한 사항은 반드시 담당자에게 확인하세요.</p>
                </div>
            </div>
            {/* 데스크탑 가이드 패널 - 오른쪽 이동 */}
            <div className={`${styles.guidePanel} ${styles.hiddenMobile}`} style={{borderRight: 'none', borderLeft: '1px solid #e2e8f0'}}>
                <GuideContent />
            </div>
        </div>
    );
}
