'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUserRole } from '@/hooks/useUserRole';
import styles from './ask.module.css';

const QUICK_PROMPTS = [
    { label: '아산 부산 40ft 안전운임 알려줘', icon: '🚛' },
    { label: '현재 경유 가격은?', icon: '⛽' },
    { label: '안전운임 개정 조건이 뭐야?', icon: '📋' },
    { label: '과태료 감경 관련 규정 찾아줘', icon: '⚖️' },
    { label: '아산시 미세먼지 수치 어때?', icon: '🍃' },
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
                <a key={i} href={match[2]} style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 'bold' }}>
                    {match[1]}
                </a>
            );
        }
        return part;
    });
}

function MessageBubble({ msg, isNew }) {
    const isUser = msg.role === 'user';
    return (
        <div className={`${styles.messageRow} ${isUser ? styles.userRow : styles.assistantRow} ${isNew ? styles.newMessage : ''}`}>
            {!isUser && (
                <div className={styles.avatar} aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"/>
                        <path d="M3 14v1a9 9 0 0 0 18 0v-1"/>
                        <line x1="8" y1="21" x2="8" y2="22"/>
                        <line x1="16" y1="21" x2="16" y2="22"/>
                    </svg>
                </div>
            )}
            <div className={`${styles.bubble} ${isUser ? styles.userBubble : styles.assistantBubble}`}>
                {renderTextWithLinks(msg.content)}
            </div>
        </div>
    );
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
    const [isLoading, setIsLoading] = useState(false);
    const [newMsgIdx, setNewMsgIdx] = useState(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const bottomRef = useRef(null);
    const inputRef = useRef(null);
    const abortRef = useRef(null);

    const DEFAULT_INIT_MSG = {
        role: 'assistant',
        content: '안녕하세요! ELS 솔루션 AI 어시스턴트입니다.\n\n안전운임, 컨테이너 조회, 업무일지 등 ELS 업무에 관한 무엇이든 물어보세요!',
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
        const newId = Date.now().toString();
        setSessions([{ id: newId, title: '새로운 대화', messages: [DEFAULT_INIT_MSG] }]);
        setActiveId(newId);
    };

    useEffect(() => {
        const loadMemory = async () => {
            try {
                const res = await fetch('/api/chat/memory', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    let raw = data.messages || [];
                    if (raw.length > 0) {
                        if (raw[0].id && raw[0].messages) {
                            setSessions(raw);
                            setActiveId(raw[0].id);
                        } else {
                            const initId = Date.now().toString();
                            setSessions([{ id: initId, title: '기본 대화', messages: raw }]);
                            setActiveId(initId);
                        }
                        setIsLoaded(true);
                        return;
                    }
                }
            } catch (err) { }
            const initId = Date.now().toString();
            setSessions([{ id: initId, title: '새로운 대화', messages: [DEFAULT_INIT_MSG] }]);
            setActiveId(initId);
            setIsLoaded(true);
        };
        loadMemory();
    }, []);

    // Sync messages to DB
    useEffect(() => {
        if (isLoaded && sessions.length > 0) {
            fetch('/api/chat/memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: sessions })
            }).catch(() => {});
        }
    }, [sessions, isLoaded]);

    useEffect(() => {
        if (!authLoading && !role) router.replace('/login?next=/employees/ask');
    }, [role, authLoading, router]);

    useEffect(() => {
        const chatArea = document.getElementById('chat-area');
        if (chatArea) {
            chatArea.scrollTop = chatArea.scrollHeight;
        }
    }, [messages, isLoading]);

    const sendMessage = useCallback(async (text) => {
        const trimmed = (text ?? input).trim();
        if (!trimmed || isLoading) return;

        setInput('');
        const userMsg = { role: 'user', content: trimmed };
        
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
                    messages: [...messages.slice(1), userMsg].map((m) => ({
                        role: m.role,
                        parts: [{ text: m.content }],
                    })),
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

            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
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
            setIsLoading(false);
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
        <>
            <h2 className={styles.guideTitle}>📖 ELS 솔루션 AI 에이전트 지침서</h2>
            <div className={styles.guideBox}>
                <span className={styles.guideHighlight}>1. 전사 읽기 최고권한 Omni-Agent</span><br/>
                단순 대화형 챗봇이 아닌 <b>ELS Solution 전용 업무 에이전트</b>입니다. 사내 DB, NAS 자료, 외부 공식 API를 모두 연결하여 정확한 답변을 제공합니다.
            </div>

            <div className={styles.guideBox}>
                <span className={styles.guideHighlight}>2. 안전운임 전문 분석 시스템</span><br/>
                <div style={{fontSize: '0.8rem', color: '#475569', background: '#f0fdf4', padding: '8px', borderRadius: '6px', border: '1px solid #86efac', margin: '6px 0'}}>
                    <ul style={{paddingLeft: '16px', margin: 0, lineHeight: '1.5'}}>
                        <li><b>구간별 단가 조회</b>: &quot;아산 부산 40ft 안전운임&quot; → 즉시 금액 안내</li>
                        <li><b>할증 자동 계산</b>: 냉동(+30%), 공휴일(+20%), 플렉시백 등 서버가 직접 계산</li>
                        <li><b>이력 비교</b>: 6개 고시 기간 변동률 추적 (&quot;인상됐어?&quot;)</li>
                        <li><b>개정 사이클</b>: 분기별 경유가 ±50원 변동 시 자동 개정 안내</li>
                    </ul>
                </div>
            </div>

            <div className={styles.guideBox}>
                <span className={styles.guideHighlight}>3. 실시간 데이터 연동</span>
                <div style={{fontSize: '0.8rem', color: '#475569', background: '#f1f5f9', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '6px'}}>
                    <ul style={{paddingLeft: '16px', margin: 0, lineHeight: '1.5'}}>
                        <li><b>경유가/유가</b>: OPINET 실시간 전국 평균 경유·휘발유 가격</li>
                        <li><b>법령 조회</b>: K-Law API 실시간 법률·판례·행정규칙</li>
                        <li><b>교통/예매</b>: KTX/SRT 시간표 스마트 링크 제공</li>
                        <li><b>기상/환경</b>: 미세먼지, 한강 수위 정보 (K-SKILL)</li>
                        <li><b>스포츠/경제</b>: KBO/K리그 실시간 스코어, 주식 시세</li>
                    </ul>
                </div>
            </div>

            <div className={styles.guideBox}>
                <span className={styles.guideHighlight}>4. 사내 업무 데이터 접근</span><br/>
                <span style={{fontSize:'0.8rem', color:'#475569'}}>업무보고, 차량 관제, 연락처, 작업지 정보를 실시간 조회합니다.</span><br/>
                <b style={{fontSize:'0.8rem', color: '#e11d48'}}>※ NAS 자료실 PDF/엑셀 본문은 추후 크롤러 연동 예정입니다.</b>
            </div>
            
            <div style={{fontSize: '0.78rem', color: '#64748b', marginTop: '16px', textAlign: 'center'}}>
                Powered by Gemini 2.5 Flash &amp; Omni-Agent Ecosystem
            </div>
        </>
    );

    if (!isLoaded) return <div className={styles.loadingScreen}>로딩 중...</div>;

    return (
        <div className={styles.containerLayout}>
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
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={styles.newChatBtn} onClick={createNewSession} style={{ flex: 1 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        새 대화
                    </button>
                    <button onClick={clearAllHistory} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', padding: '0 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }} title="전체 삭제">
                        전체 삭제
                    </button>
                </div>
                <div className={styles.historyList}>
                    {sessions.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: s.id === activeId ? '#dbeafe' : 'transparent', borderRadius: '8px' }}>
                            <button 
                                className={`${styles.historyItem} ${s.id === activeId ? styles.active : ''}`}
                                onClick={() => setActiveId(s.id)}
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
            </div>

            <div className={styles.wrapper}>
                {/* 헤더 */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon} aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"/>
                                <path d="M3 14v1a9 9 0 0 0 18 0v-1"/>
                            </svg>
                        </div>
                        <div>
                            <h1 className={styles.headerTitle}>ELS AI 어시스턴트</h1>
                            <p className={styles.headerSub}>실시간 업무 · K-Law 연동 중</p>
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
                            <div className={styles.avatar} aria-hidden="true">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7H3a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z"/>
                                    <path d="M3 14v1a9 9 0 0 0 18 0v-1"/>
                                </svg>
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

                {/* 입력 영역 */}
                <div className={styles.inputArea}>
                    <div className={styles.inputBox}>
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
                            disabled={!input.trim() || isLoading}
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
