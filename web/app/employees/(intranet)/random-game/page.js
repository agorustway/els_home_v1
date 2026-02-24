'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './random-game.module.css';
import LadderGame from './LadderGame';

/**
 * Constants
 */
const DEFAULT_NAMES = ['김종화', '박승철', '최병훈', '김명주', '박승기', '김송미', '임지언'];
const CARRIER_CODES = ['APL', 'CMA', 'CNC', 'COS', 'EMC', 'HAS', 'ZIM', 'HLC', 'HMM', 'HSD', 'YML', 'KMD', 'KMS', 'MAE', 'MSC', 'ONE', 'OOL', 'PCL', 'SIT', 'SKR', 'SML', 'SNK', 'TCL', 'WDF', 'WHL'];
const ANIMALS = ['🐻', '🦊', '🐶', '🐱', '🐭', '🐹', '🐰', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];
const PATH_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#475569'];

const getRotationDegrees = (element) => {
    if (!element) return 0;
    const st = window.getComputedStyle(element, null);
    const tr = st.getPropertyValue("transform");
    if (tr === 'none' || !tr) return 0;
    const values = tr.split('(')[1].split(')')[0].split(',');
    return Math.round(Math.atan2(values[1], values[0]) * (180 / Math.PI)) + (Math.atan2(values[1], values[0]) < 0 ? 360 : 0);
};

const BingoGame = ({ onGameEnd }) => {
    const [grid, setGrid] = useState([]);
    const [marked, setMarked] = useState([]);
    const [showWin, setShowWin] = useState(false);
    const init = () => {
        const shuffled = [...CARRIER_CODES].sort(() => 0.5 - Math.random()).slice(0, 25);
        setGrid(Array(5).fill(null).map((_, r) => Array(5).fill(null).map((_, c) => ({ v: shuffled[r * 5 + c], r, c }))));
        setMarked([]); setShowWin(false);
    };
    useEffect(() => { init(); }, []);
    const handleToggle = (r, c) => {
        if (showWin) return;
        const key = `${r}-${c}`;
        const next = marked.includes(key) ? marked.filter(m => m !== key) : [...marked, key];
        setMarked(next);
        let lines = 0;
        for (let i = 0; i < 5; i++) {
            if ([0, 1, 2, 3, 4].every(j => next.includes(`${i}-${j}`))) lines++;
            if ([0, 1, 2, 3, 4].every(j => next.includes(`${j}-${i}`))) lines++;
        }
        if ([0, 1, 2, 3, 4].every(i => next.includes(`${i}-${i}`))) lines++;
        if ([0, 1, 2, 3, 4].every(i => next.includes(`${i}-${4 - i}`))) lines++;
        if (lines >= 3) { setShowWin(true); onGameEnd('🔢 빙고', '3줄 빙고 완성! 🎯'); }
    };
    return (
        <div className={styles.bingoWrapper}>
            <div className={styles.bingoBoardOuter}>
                <div className={styles.bingoGrid5x5}>{grid.flat().map((item, i) => (<div key={i} className={`${styles.bingoCellItem} ${marked.includes(`${item.r}-${item.c}`) ? styles.bingoMarkedItem : ''}`} onClick={() => handleToggle(item.r, item.c)}>{item.v}</div>))}</div>
            </div>
            <div className={styles.gameActions}>
                <button className={styles.premiumBtn} onClick={init}>🔄 게임판 리셋</button>
            </div>
            <AnimatePresence>{showWin && (<div className={styles.resultOverlay} onClick={() => setShowWin(false)}><motion.div className={styles.resultCard} initial={{ scale: 0.5 }} animate={{ scale: 1 }}><div style={{ fontSize: '5rem' }}>👑</div><h2>BINGO!</h2><p>축하합니다!<br />3줄 빙고를 완성했습니다.</p><button className={styles.confirmBtn}>확인</button></motion.div></div>)}</AnimatePresence>
        </div>
    );
};

export default function RandomGamePage() {
    const [names, setNames] = useState(DEFAULT_NAMES);
    const [newName, setNewName] = useState('');
    const [activeGame, setActiveGame] = useState('roulette');
    const [history, setHistory] = useState([]);
    const [isSpinning, setIsSpinning] = useState(false);
    const [winner, setWinner] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [spinDuration, setSpinDuration] = useState(6);
    const [isBroken, setIsBroken] = useState(false);
    const [isBreakingDown, setIsBreakingDown] = useState(false);
    const [showRouletteWin, setShowRouletteWin] = useState(false);
    const [isBreakdownPending, setIsBreakdownPending] = useState(false);
    const [fakeWinnerName, setFakeWinnerName] = useState(null);
    const [isConfirmClicked, setIsConfirmClicked] = useState(false);
    const canvasRef = useRef(null);
    const rouletteTimerRef = useRef(null);

    const addToHistory = (game, result) => {
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setHistory(prev => [{ timestamp: ts, game, result }, ...prev].slice(0, 10));
    };

    const drawRoulette = () => {
        const canvas = canvasRef.current; if (!canvas) return;
        const ctx = canvas.getContext('2d'); const count = names.length; if (count === 0) return;
        const size = 400; const cx = size / 2; const cy = size / 2; const radius = cx - 10;
        ctx.clearRect(0, 0, size, size);
        names.forEach((name, i) => {
            const start = (i * 2 * Math.PI) / count; const end = ((i + 1) * 2 * Math.PI) / count;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); ctx.closePath();
            ctx.fillStyle = PATH_COLORS[i % PATH_COLORS.length]; ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(start + Math.PI / count); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Outfit'; ctx.fillText(name, radius - 35, 6); ctx.restore();
        });
    };

    useEffect(() => { if (activeGame === 'roulette') drawRoulette(); }, [names, activeGame]);

    const handleSpinEnd = (deg) => {
        let target = (270 - deg) % 360; if (target < 0) target += 360;
        const winIdx = Math.floor(target / (360 / names.length));
        const winnerName = names[winIdx];

        setWinner(winnerName);
        setShowRouletteWin(true);

        if (Math.random() < 1 / 3) { // 33.3% 확률로 당첨 후 돌발 고장
            setIsBreakdownPending(true);
            setFakeWinnerName(winnerName);
        } else {
            setIsBreakdownPending(false);
            addToHistory('🎡 룰렛', `${winnerName} 당첨!`);
        }
    };

    const handleRouletteConfirm = () => {
        if (isConfirmClicked) return;

        if (isBreakdownPending) {
            setIsConfirmClicked(true);
            setTimeout(() => {
                setShowRouletteWin(false);
                setIsConfirmClicked(false);
                setIsBreakingDown(true); // 여기서 빨간 화면 오버레이 호출

                // 3초간 고장 문구 보여준 뒤 역회전 시작
                setTimeout(() => {
                    setIsBreakingDown(false);
                    setIsBroken(true);
                    setIsSpinning(true);
                    setSpinDuration(4); // 역회전은 속도감 있게

                    const deg = getRotationDegrees(canvasRef.current);
                    const reverseNextRot = deg - 4000 - Math.random() * 360;
                    setRotation(reverseNextRot);

                    rouletteTimerRef.current = setTimeout(() => {
                        setIsSpinning(false);
                        setIsBroken(false);
                        setIsBreakdownPending(false);

                        let finalTarget = (270 - reverseNextRot) % 360;
                        while (finalTarget < 0) finalTarget += 360;
                        const finalWinIdx = Math.floor(finalTarget / (360 / names.length));

                        setWinner(names[finalWinIdx]);
                        setShowRouletteWin(true); // 진짜 당첨자 팝업
                        addToHistory('🚨 룰렛 돌발상황!', `[역회전] ${fakeWinnerName} 취소 ➡️ ${names[finalWinIdx]} 당첨!`);
                    }, 4000);
                }, 3000);

            }, 500); // 0.5초 대기 후 취소 문구
        } else {
            setShowRouletteWin(false);
        }
    };

    const spin = () => {
        if (isBroken || isBreakingDown || showRouletteWin || isConfirmClicked) return;

        if (isSpinning) {
            const deg = getRotationDegrees(canvasRef.current);
            if (rouletteTimerRef.current) clearTimeout(rouletteTimerRef.current);
            setRotation(deg); setIsSpinning(false);
            setTimeout(() => { handleSpinEnd(deg); }, 150);
        } else {
            setIsSpinning(true); setWinner(null); setSpinDuration(6); setIsBroken(false); setIsBreakingDown(false);
            const nextRot = rotation + 3600 + Math.random() * 360; setRotation(nextRot);
            rouletteTimerRef.current = setTimeout(() => {
                setIsSpinning(false);
                handleSpinEnd(nextRot);
            }, 6000);
        }
    };

    return (
        <div className={styles.page}>
            {isBreakingDown && (
                <div className={styles.breakdownOverlay}>
                    <div className={styles.breakdownText}>🚨 돌발! 룰렛 기계 고장 🚨</div>
                    <div className={styles.breakdownSub}>[{fakeWinnerName}] 당첨 취소! 시스템 오류로 역회전합니다!!</div>
                </div>
            )}
            <div className={styles.headerBanner}>
                <h1 className={styles.title}>실시간 랜덤 게임 대시보드</h1>
                <p className={styles.subtitle}>동료들과 함께하는 즐거운 점심 내기 및 복불복 게임을 즐겨보세요.</p>
            </div>

            <div className={styles.splitLayout}>
                <aside className={styles.column}>
                    <div className={styles.card}>
                        <div className={styles.settingHeader}><h3>👤 참여자 설정 ({names.length}명)</h3><button className={styles.resetTinyBtn} onClick={() => setNames(DEFAULT_NAMES)}>초기화</button></div>
                        <form className={styles.addForm} onSubmit={e => { e.preventDefault(); if (newName.trim()) { setNames([...names, newName.trim()]); setNewName(''); } }}>
                            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="이름 입력" />
                            <button type="submit">참여자 추가</button>
                        </form>
                        <div className={styles.nameChips}>{names.map((n, i) => <div key={i} className={styles.chip}><span>{ANIMALS[i % ANIMALS.length]}</span> {n} <button onClick={() => setNames(names.filter(x => x !== n))}>×</button></div>)}</div>
                    </div>
                    <div className={styles.card}>
                        <h3 className={styles.sectionTitle}>💡 게임 팁</h3>
                        <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5, margin: 0 }}>사다리 타기는 이름표를 클릭하면 시작됩니다. 룰렛은 START를 누르고 원하는 시점에 STOP을 누르면 더 쫄깃하게 즐길 수 있습니다!</p>
                    </div>
                </aside>

                <main className={styles.column}>
                    <div className={styles.gameContentArea}>
                        {activeGame === 'roulette' && (
                            <div className={styles.rouletteContainer}>
                                <div className={styles.rouletteWrapper}><div className={styles.indicator}>▼</div><canvas ref={canvasRef} width={400} height={400} style={{ transform: `rotate(${rotation}deg)`, transition: isSpinning ? `transform ${spinDuration}s cubic-bezier(${isBroken ? '0.2, 0, 0.2, 1' : '0.1, 0, 0.1, 1'})` : 'none', borderRadius: '50%', border: '10px solid #fff', boxShadow: '0 20px 50px rgba(0,0,0,0.1)', width: '100%', height: 'auto', maxWidth: '400px', aspectRatio: '1/1' }} /></div>
                                <button className={`${styles.spinBtn} ${isSpinning ? styles.btnSpinning : ''} ${isBroken || isBreakingDown ? styles.btnBroken : ''}`} onClick={spin}>{isBreakingDown || isBroken ? '🛑 작동불가' : isSpinning ? 'STOP!' : 'START'}</button>
                                <div className={styles.gameActions} style={{ marginTop: '20px' }}>
                                    <button className={styles.premiumBtn} onClick={() => { if (!isSpinning && !isBreakingDown && !isBroken && !showRouletteWin) { setRotation(0); setNames([...names].sort(() => Math.random() - 0.5)); } }}>🔄 게임판 리셋</button>
                                </div>
                                <AnimatePresence>
                                    {showRouletteWin && (
                                        <div className={styles.resultOverlay}>
                                            <motion.div className={styles.resultCard} initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                                                <div style={{ fontSize: '5rem' }}>👑</div>
                                                <h2>{winner} 당첨!</h2>
                                                <p>{isBreakdownPending && isConfirmClicked ? '결과를 확인하는 중...' : '축하합니다!'}</p>
                                                <button className={styles.confirmBtn} onClick={handleRouletteConfirm} disabled={isConfirmClicked}>
                                                    {isConfirmClicked ? '앗...' : '확인'}
                                                </button>
                                            </motion.div>
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                        {activeGame === 'ladder' && <LadderGame participants={names} onGameEnd={addToHistory} />}
                        {activeGame === 'bingo' && <BingoGame onGameEnd={addToHistory} />}
                    </div>
                </main>

                <aside className={styles.column}>
                    <h2 className={styles.sectionTitle}>게임 선택</h2>
                    <div className={styles.gameSelector}>
                        <div className={`${styles.gameBtn} ${activeGame === 'roulette' ? styles.gameBtnActive : ''}`} onClick={() => setActiveGame('roulette')}>
                            <span className={styles.gameBtnIcon}>🎡</span>
                            <span className={styles.gameBtnName}>룰렛 돌리기</span>
                        </div>
                        <div className={`${styles.gameBtn} ${activeGame === 'ladder' ? styles.gameBtnActive : ''}`} onClick={() => setActiveGame('ladder')}>
                            <span className={styles.gameBtnIcon}>🪜</span>
                            <span className={styles.gameBtnName}>사다리 타기</span>
                        </div>
                        <div className={`${styles.gameBtn} ${activeGame === 'bingo' ? styles.gameBtnActive : ''}`} onClick={() => setActiveGame('bingo')}>
                            <span className={styles.gameBtnIcon}>🔢</span>
                            <span className={styles.gameBtnName}>코드 빙고</span>
                        </div>
                    </div>

                    <div className={styles.historyCardMini}>
                        <div className={styles.historyHeader}>🏆 최근 당첨 기록</div>
                        <div className={styles.historyList}>{history.length > 0 ? history.map((h, i) => (<div key={i} className={styles.historyItem}><span className={styles.historyTime}>{h.timestamp}</span><span className={styles.historyResult}>{h.result}</span></div>)) : <div className={styles.emptyHistory}>기록이 없습니다.</div>}</div>
                    </div>
                </aside>
            </div>
            <AnimatePresence>{winner && (<div className={styles.resultOverlay} onClick={() => setWinner(null)}><motion.div className={styles.resultCard} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}><div style={{ fontSize: '4rem', marginBottom: '10px' }}>🎊</div><h3>WINNER</h3><h2>{winner}</h2><button className={styles.confirmBtn}>확인</button></motion.div></div>)}</AnimatePresence>
        </div>
    );
}