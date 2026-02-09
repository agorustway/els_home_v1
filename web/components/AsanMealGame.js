'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './AsanMealGame.module.css';

/**
 * Constants & Helpers
 */
const DEFAULT_NAMES = ['김종화', '박승철', '최병훈', '김명주', '박승기', '김송미', '임지언'];

const CARRIER_CODES = [
    'APL', 'CMA', 'CNC', 'COS', 'EMC',
    'HAS', 'ZIM', 'HLC', 'HMM', 'HSD',
    'YML', 'KMD', 'KMS', 'MAE', 'MSC',
    'ONE', 'OOL', 'PCL', 'SIT', 'SKR',
    'SML', 'SNK', 'TCL', 'WDF', 'WHL',
];

const ANIMALS = ['🐻', '🦊', '🐶', '🐱', '🐭', '🐹', '🐰', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'];
const PATH_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#475569'];

const getRotationDegrees = (element) => {
    if (!element) return 0;
    const st = window.getComputedStyle(element, null);
    const tr = st.getPropertyValue("-webkit-transform") ||
        st.getPropertyValue("-moz-transform") ||
        st.getPropertyValue("-ms-transform") ||
        st.getPropertyValue("-o-transform") ||
        st.getPropertyValue("transform");
    if (tr === 'none' || !tr) return 0;
    const values = tr.split('(')[1].split(')')[0].split(',');
    const a = values[0];
    const b = values[1];
    const angle = Math.round(Math.atan2(b, a) * (180 / Math.PI));
    return (angle < 0) ? angle + 360 : angle;
};

/**
 * Ladder Game Component
 */
const LadderGame = ({ participants, onGameEnd }) => {
    const [rungs, setRungs] = useState([]);
    const [completedHistory, setCompletedHistory] = useState([]);
    const [animatingIndex, setAnimatingIndex] = useState(null);
    const [currentStepPath, setCurrentStepPath] = useState([]);
    const [markerPos, setMarkerPos] = useState({ x: 0, y: 0 });
    const [markerEmoji, setMarkerEmoji] = useState('🐻');
    const [winnerIndexAtBottom, setWinnerIndexAtBottom] = useState(0);

    const numCols = participants.length;
    const numRows = 14;

    const COL_SPACE = 100;
    const boardWidth = (numCols - 1) * COL_SPACE;
    const rowHeight = 500 / numRows;
    const paddingX = 60;

    const generateLadder = () => {
        const newRungs = [];
        for (let r = 1; r < numRows; r++) {
            for (let c = 0; c < numCols - 1; c++) {
                if (Math.random() > 0.6) {
                    if (!newRungs.some(rung => rung.r === r && (rung.c === c - 1 || rung.c === c + 1))) {
                        newRungs.push({ r, c });
                    }
                }
            }
        }
        setRungs(newRungs);
        setCompletedHistory([]);
        setAnimatingIndex(null);
        setCurrentStepPath([]);
        setWinnerIndexAtBottom(Math.floor(Math.random() * numCols));
    };

    useEffect(() => {
        generateLadder();
    }, [numCols]);

    const calculatePath = (startIndex) => {
        let currentC = startIndex;
        const path = [{ c: currentC, r: 0 }];
        for (let r = 1; r <= numRows; r++) {
            const leftRung = rungs.find(rg => rg.r === r && rg.c === currentC - 1);
            const rightRung = rungs.find(rg => rg.r === r && rg.c === currentC);
            if (leftRung) {
                path.push({ c: currentC, r });
                currentC--;
                path.push({ c: currentC, r });
            } else if (rightRung) {
                path.push({ c: currentC, r });
                currentC++;
                path.push({ c: currentC, r });
            } else {
                path.push({ c: currentC, r });
            }
        }
        return path;
    };

    const runLadder = async (index) => {
        if (animatingIndex !== null || completedHistory.some(h => h.startIndex === index)) return;

        const path = calculatePath(index);
        const originalEmoji = ANIMALS[index % ANIMALS.length];
        const pathColor = PATH_COLORS[index % PATH_COLORS.length];

        setAnimatingIndex(index);
        setMarkerEmoji(originalEmoji);

        const visiblePathPoints = [];

        for (let i = 0; i < path.length; i++) {
            const point = path[i];
            visiblePathPoints.push(point);
            setCurrentStepPath([...visiblePathPoints]);
            setMarkerPos({
                x: point.c * COL_SPACE + paddingX,
                y: point.r * rowHeight
            });
            await new Promise(resolve => setTimeout(resolve, i === 0 ? 300 : 180));
        }

        const finalCol = path[path.length - 1].c;
        const isWinner = finalCol === winnerIndexAtBottom;
        const prize = isWinner ? '당첨' : '통과';
        const finalEmoji = isWinner ? '😭' : '😆'; // Penalty = Crying, Pass = Laughing

        setMarkerEmoji(finalEmoji);

        setCompletedHistory(prev => [...prev, {
            startIndex: index,
            name: participants[index],
            path: path,
            emoji: finalEmoji,
            color: pathColor,
            isWinner: isWinner,
            prize: prize,
            finalPos: {
                x: finalCol * COL_SPACE + paddingX,
                y: 500
            }
        }]);

        setAnimatingIndex(null);
        setCurrentStepPath([]);
        onGameEnd('🪜 사다리', `${participants[index]} -> ${prize}`);
    };

    const runAllLadder = async () => {
        if (animatingIndex !== null) return;
        for (let i = 0; i < participants.length; i++) {
            if (!completedHistory.some(h => h.startIndex === i)) {
                // 비동기로 실행하되 약간의 시차를 둠
                runLadder(i);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
    };

    return (
        <div className={styles.ladderBox}>
            <div className={styles.gameActions}>
                <button className={styles.premiumBtn} onClick={generateLadder}>🔄 새 판짜기 (리셋)</button>
                <button
                    className={styles.runAllBtn}
                    onClick={runAllLadder}
                    disabled={animatingIndex !== null || completedHistory.length === participants.length}
                >
                    🚀 한번에 사다리 타기
                </button>
            </div>

            {completedHistory.length > 0 && (
                <div className={styles.ladderSummary}>
                    <div className={styles.summaryHeader}>📊 실시간 결과 요약</div>
                    <div className={styles.summaryGrid}>
                        {participants.map((name, i) => {
                            const history = completedHistory.find(h => h.startIndex === i);
                            return (
                                <div key={i} className={`${styles.summaryItem} ${history?.isWinner ? styles.summaryWinner : ''}`}>
                                    <span className={styles.summaryName}>{name}</span>
                                    <span className={styles.summaryResult}>
                                        {history ? `${history.emoji} ${history.prize}` : '-'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className={styles.scrollHint}>↔️ 좌우로 스크롤하여 전체 사다리를 확인하세요</div>

            <div className={styles.ladderViewport}>
                <div className={styles.ladderContainer} style={{ width: Math.max(boardWidth + (paddingX * 2) + 40, 300) }}>
                    <div className={styles.ladderHeaderRow}>
                        {participants.map((name, i) => {
                            const isCompleted = completedHistory.some(h => h.startIndex === i);
                            const historyItem = completedHistory.find(h => h.startIndex === i);
                            return (
                                <div
                                    key={i}
                                    className={styles.ladderNodeWrapper}
                                    style={{ left: i * COL_SPACE + paddingX }}
                                >
                                    <motion.div
                                        className={`${styles.node} ${styles.startNode}`}
                                        whileHover={!isCompleted ? { scale: 1.05 } : {}}
                                        onClick={() => runLadder(i)}
                                        style={{
                                            opacity: isCompleted && animatingIndex !== i ? 0.6 : 1,
                                            borderColor: isCompleted ? (historyItem.isWinner ? '#ef4444' : '#10b981') : '#e2e8f0',
                                            backgroundColor: animatingIndex === i ? '#f8fafc' : '#fff'
                                        }}
                                    >
                                        <div className={styles.nodeIcon}>{ANIMALS[i % ANIMALS.length]}</div>
                                        <div className={styles.nodeLabel}>{name}</div>
                                    </motion.div>
                                    {/* Connection Line Stub */}
                                    <div className={styles.connectionStub} />
                                </div>
                            );
                        })}
                    </div>

                    <div className={styles.ladderBoard}>
                        <svg className={styles.ladderLines}>
                            <g stroke="#cbd5e1" strokeWidth="2.5">
                                {Array.from({ length: numCols }).map((_, i) => (
                                    <line key={`v-${i}`} x1={i * COL_SPACE + paddingX} y1="-20" x2={i * COL_SPACE + paddingX} y2="100%" />
                                ))}
                                {rungs.map((rung, i) => (
                                    <line key={`h-${i}`} x1={rung.c * COL_SPACE + paddingX} y1={rung.r * rowHeight} x2={(rung.c + 1) * COL_SPACE + paddingX} y2={rung.r * rowHeight} />
                                ))}
                            </g>

                            {completedHistory.map((h, idx) => (
                                <path
                                    key={`h-${idx}`}
                                    d={`M ${h.path.map(p => `${p.c * COL_SPACE + paddingX},${p.r * rowHeight}`).join(' L ')}`}
                                    stroke={h.color}
                                    fill="none"
                                    strokeWidth="4"
                                    strokeLinecap="round"
                                    opacity="0.4"
                                    strokeDasharray="5,3"
                                />
                            ))}

                            {currentStepPath.length > 0 && (
                                <path
                                    d={`M ${currentStepPath.map(p => `${p.c * COL_SPACE + paddingX},${p.r * rowHeight}`).join(' L ')}`}
                                    stroke={PATH_COLORS[animatingIndex % PATH_COLORS.length]}
                                    fill="none"
                                    strokeWidth="6"
                                    strokeLinecap="round"
                                />
                            )}
                        </svg>

                        {completedHistory.map((h, idx) => (
                            <div key={`m-${idx}`} className={styles.staticMarker} style={{ left: h.finalPos.x, top: h.finalPos.y }}>
                                <span className={styles.emojiSmall}>{h.emoji}</span>
                            </div>
                        ))}

                        <AnimatePresence>
                            {animatingIndex !== null && (
                                <motion.div
                                    className={styles.activeMarker}
                                    animate={{ left: markerPos.x, top: markerPos.y }}
                                    transition={{ type: 'tween', ease: 'linear', duration: 0.18 }}
                                >
                                    <span className={styles.emojiLarge}>{markerEmoji}</span>
                                    <div className={styles.markerNameTag}>{participants[animatingIndex]}</div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className={styles.ladderFooterRow}>
                        {Array.from({ length: numCols }).map((_, i) => (
                            <div
                                key={i}
                                className={styles.ladderPrizeWrapper}
                                style={{ left: i * COL_SPACE + paddingX }}
                            >
                                <div className={`${styles.prizeTag} ${i === winnerIndexAtBottom ? styles.prizeWin : styles.prizePass}`}>
                                    <span>{i === winnerIndexAtBottom ? '당첨' : '통과'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * Bingo Game Component
 */
const BingoGame = ({ participants, onGameEnd }) => {
    const [grid, setGrid] = useState([]);
    const [marked, setMarked] = useState([]);
    const [bingoCount, setBingoCount] = useState(0);
    const [isWin, setIsWin] = useState(false);

    const initGame = () => {
        const shuffled = [...CARRIER_CODES].sort(() => 0.5 - Math.random()).slice(0, 25);
        const newGrid = Array(5).fill(null).map((_, r) =>
            Array(5).fill(null).map((_, c) => ({
                value: shuffled[r * 5 + c],
                row: r, col: c
            }))
        );
        setGrid(newGrid);
        setMarked([]);
        setBingoCount(0);
        setIsWin(false);
    };

    useEffect(() => {
        initGame();
    }, [participants]);

    const toggleCell = (r, c) => {
        if (isWin) return;
        const key = `${r}-${c}`;
        const newMarked = marked.includes(key) ? marked.filter(m => m !== key) : [...marked, key];
        setMarked(newMarked);

        let count = 0;
        for (let ri = 0; ri < 5; ri++) {
            if (Array(5).fill(0).every((_, ci) => newMarked.includes(`${ri}-${ci}`))) count++;
        }
        for (let ci = 0; ci < 5; ci++) {
            if (Array(5).fill(0).every((_, ri) => newMarked.includes(`${ri}-${ci}`))) count++;
        }
        if (Array(5).fill(0).every((_, i) => newMarked.includes(`${i}-${i}`))) count++;
        if (Array(5).fill(0).every((_, i) => newMarked.includes(`${i}-${4 - i}`))) count++;

        setBingoCount(count);
        if (count >= 3 && !isWin) {
            setIsWin(true);
            onGameEnd('🔢 빙고', '3줄 완성!');
        }
    };

    return (
        <div className={styles.bingoContainerFixed}>
            <div className={styles.bingoBoardOuter}>
                <div className={styles.bingoHeaderWide}>
                    <div className={styles.bingoTitleGroup}>
                        <h2>BINGO GAME</h2>
                        <span className={styles.bingoStatusLabel}>{bingoCount} / 3 줄 완성</span>
                    </div>
                    <button className={styles.bingoResetBtn} onClick={initGame}>새 게임</button>
                </div>
                <div className={styles.bingoGrid5x5}>
                    {grid.flat().map((cell, i) => (
                        <motion.div
                            key={i}
                            className={`${styles.bingoCellItem} ${marked.includes(`${cell.row}-${cell.col}`) ? styles.bingoMarkedItem : ''}`}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => toggleCell(cell.row, cell.col)}
                        >
                            {cell.value}
                        </motion.div>
                    ))}
                </div>
                <div className={styles.bingoGuideBottom}>
                    <p>💡 <b>게임 방법:</b> 무작위로 배치된 선사 코드를 클릭하여 가로, 세로, 혹은 대각선으로 <b>3줄</b>을 먼저 완성하면 승리합니다!</p>
                </div>
                <AnimatePresence>
                    {isWin && (
                        <motion.div
                            className={styles.bingoOverlay}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <motion.div
                                className={styles.bingoResultCard}
                                initial={{ scale: 0.8, y: 20 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                            >
                                <div className={styles.victoryIcon}>🎯</div>
                                <h2>BINGO!</h2>
                                <p>축하합니다!<br />3줄 완성을 달성했습니다.</p>
                                <div className={styles.bingoResultLineCnt}>{bingoCount}줄 완성</div>
                                <button className={styles.confirmBtn} onClick={() => setIsWin(false)}>확인</button>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

/**
 * Main AsanMealGame
 */
export default function AsanMealGame() {
    const [names, setNames] = useState(DEFAULT_NAMES);
    const [newName, setNewName] = useState('');
    const [activeGame, setActiveGame] = useState(null); // null means 'Lobby'
    const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Mobile Settings Toggle

    // Roulette States
    const [isSpinning, setIsSpinning] = useState(false);
    const [winner, setWinner] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [spinDuration, setSpinDuration] = useState(6);
    const [history, setHistory] = useState([]);

    const canvasRef = useRef(null);
    const rouletteTimerRef = useRef(null);
    const [rouletteSize, setRouletteSize] = useState(300);

    // Initial resize check and listener
    useEffect(() => {
        const handleResize = () => {
            const width = window.innerWidth;
            if (width < 380) setRouletteSize(280);
            else if (width < 480) setRouletteSize(320);
            else if (width < 768) setRouletteSize(360);
            else setRouletteSize(420);
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const addToHistory = (game, result) => {
        const now = new Date();
        const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setHistory(prev => [{ timestamp, game, result }, ...prev].slice(0, 10));
    };

    // ... (Roulette Logic: drawRoulette, stopRoulette, spinRoulette, useEffects kept same but moved inside)
    const drawRoulette = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const count = names.length;
        if (count === 0) return;

        const size = rouletteSize;
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = Math.min(centerX, centerY) - 10;

        ctx.clearRect(0, 0, size, size);
        names.forEach((name, i) => {
            const startAngle = (i * 2 * Math.PI) / count;
            const endAngle = ((i + 1) * 2 * Math.PI) / count;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            const colors = ['#4f46e5', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#1e293b'];
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(startAngle + Math.PI / count);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${size < 350 ? 12 : 16}px Outfit, sans-serif`;
            ctx.fillText(name, radius - (size < 350 ? 25 : 35), 6);
            ctx.restore();
        });
    };

    useEffect(() => {
        if (activeGame === 'roulette') {
            drawRoulette();
        }
    }, [names, activeGame, rouletteSize]);

    const stopRoulette = () => {
        const currentAngle = getRotationDegrees(canvasRef.current);
        if (rouletteTimerRef.current) clearTimeout(rouletteTimerRef.current);

        setRotation(currentAngle);
        setSpinDuration(0);
        setIsSpinning(false);

        let targetAngle = (270 - currentAngle) % 360;
        if (targetAngle < 0) targetAngle += 360;
        const segmentAngle = 360 / names.length;
        const winnerIndex = Math.floor(targetAngle / segmentAngle);
        const winnerName = names[winnerIndex];

        setTimeout(() => {
            setWinner(winnerName);
            addToHistory('🎡 룰렛', `${winnerName} 당첨!`);
        }, 150);
    };

    const spinRoulette = () => {
        if (isSpinning) {
            stopRoulette();
        } else {
            if (names.length === 0) return;
            setIsSpinning(true);
            setWinner(null);
            setSpinDuration(6);
            const newRotation = rotation + 360 * (10 + Math.random() * 5);
            setRotation(newRotation);

            rouletteTimerRef.current = setTimeout(() => {
                stopRoulette();
            }, 6000);
        }
    };

    const shuffleParticipants = () => {
        setNames(prev => [...prev].sort(() => Math.random() - 0.5));
    };

    // Game Lobby View
    if (!activeGame) {
        return (
            <div className={styles.lobbyContainer}>
                <div className={styles.lobbyHeader}>
                    <h3>오늘의 점심 내기! 🎲</h3>
                    <p>원하는 게임을 선택하세요</p>
                </div>

                <div className={styles.gameCardsGrid}>
                    <div className={styles.gameCard} onClick={() => setActiveGame('roulette')}>
                        <span className={styles.gameIcon}>🎡</span>
                        <span className={styles.gameName}>룰렛 돌리기</span>
                    </div>
                    <div className={styles.gameCard} onClick={() => setActiveGame('ladder')}>
                        <span className={styles.gameIcon}>🪜</span>
                        <span className={styles.gameName}>사다리 타기</span>
                    </div>
                    <div className={styles.gameCard} onClick={() => setActiveGame('bingo')}>
                        <span className={styles.gameIcon}>🔢</span>
                        <span className={styles.gameName}>코드 빙고</span>
                    </div>
                </div>

                {/* Quick Settings Preview */}
                <div className={styles.lobbySettings}>
                    <div className={styles.settingHeader}>
                        <span>참여자 ({names.length}명)</span>
                        <button onClick={() => setIsSettingsOpen(true)}>설정 ⚙️</button>
                    </div>
                    <div className={styles.nameCrops}>
                        {names.slice(0, 5).map((n, i) => <span key={i}>{n}</span>)}
                        {names.length > 5 && <span>+{names.length - 5}</span>}
                    </div>
                </div>

                {/* Settings Modal */}
                {isSettingsOpen && (
                    <div className={styles.settingsOverlay} onClick={(e) => { if (e.target === e.currentTarget) setIsSettingsOpen(false) }}>
                        <div className={styles.settingsModal}>
                            <div className={styles.modalHeader}>
                                <h3>참여자 설정</h3>
                                <button onClick={() => setIsSettingsOpen(false)}>✕</button>
                            </div>
                            <div className={styles.glassPanel}>
                                {/* Reuse existing panel content structure */}
                                <form onSubmit={e => {
                                    e.preventDefault();
                                    if (newName.trim()) { setNames([...names, newName.trim()]); setNewName(''); }
                                }} className={styles.addForm}>
                                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="이름 추가" />
                                    <button type="submit">추가</button>
                                </form>
                                <div className={styles.sidebarActions}>
                                    <button className={styles.shuffleBtn} onClick={shuffleParticipants}>🎲 섞기</button>
                                    <button className={styles.resetTinyBtn} onClick={() => setNames(DEFAULT_NAMES)}>🔄 초기화</button>
                                </div>
                                <div className={styles.nameChips}>
                                    {names.map((name, i) => (
                                        <div key={i} className={styles.chip}>
                                            <span>{ANIMALS[i % ANIMALS.length]}</span> {name}
                                            <button onClick={() => setNames(names.filter(n => n !== name))}>×</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Active Game View
    return (
        <div className={styles.activeGameContainer}>
            <div className={styles.activeGameHeader}>
                <button className={styles.backBtn} onClick={() => { setActiveGame(null); setWinner(null); }}>
                    ← 다른 게임
                </button>
                <div className={styles.activeGameTitle}>
                    {activeGame === 'roulette' ? '🎡 룰렛' : activeGame === 'ladder' ? '🪜 사다리' : '🔢 빙고'}
                </div>
                <button className={styles.settingToggleBtn} onClick={() => setIsSettingsOpen(true)}>⚙️</button>
            </div>

            <div className={styles.gameContentArea}>
                {activeGame === 'roulette' && (
                    <div className={styles.rouletteContainer}>
                        <div className={styles.rouletteWrapper} style={{ width: rouletteSize, height: rouletteSize }}>
                            <div className={styles.indicator}>▼</div>
                            <canvas ref={canvasRef} width={rouletteSize} height={rouletteSize} className={styles.canvasElement} style={{
                                transform: `rotate(${rotation}deg)`,
                                transition: `transform ${spinDuration}s cubic-bezier(0.1, 0, 0.1, 1)`
                            }} />
                            <AnimatePresence>
                                {winner && (
                                    <motion.div className={styles.winnerOverlayLocal} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <motion.div className={styles.winnerCardLocal} initial={{ scale: 0.8 }} animate={{ scale: 1 }}>
                                            <div className={styles.medalIconLarge}>👑</div>
                                            <h3>WINNER</h3>
                                            <h2>{winner}</h2>
                                            <button className={styles.confirmBtn} onClick={() => setWinner(null)}>OK</button>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        <div className={styles.rouletteControls}>
                            <button className={`${styles.spinBtn} ${isSpinning ? styles.btnSpinning : ''}`} onClick={spinRoulette}>
                                {isSpinning ? 'STOP' : 'START'}
                            </button>
                        </div>
                    </div>
                )}
                {activeGame === 'ladder' && <LadderGame participants={names} onGameEnd={addToHistory} />}
                {activeGame === 'bingo' && <BingoGame participants={names} onGameEnd={addToHistory} />}
            </div>

            {/* History Bar (Optional) */}
            {history.length > 0 && (
                <div className={styles.miniHistoryTicker}>
                    <span className={styles.tickerLabel}>최근 결과:</span>
                    <span className={styles.tickerValue}>{history[0].result}</span>
                </div>
            )}

            {/* Settings Modal (Reused) */}
            {isSettingsOpen && (
                <div className={styles.settingsOverlay} onClick={(e) => { if (e.target === e.currentTarget) setIsSettingsOpen(false) }}>
                    <div className={styles.settingsModal}>
                        <div className={styles.modalHeader}>
                            <h3>참여자 설정 ({names.length}명)</h3>
                            <button onClick={() => setIsSettingsOpen(false)}>✕</button>
                        </div>
                        <div className={styles.glassPanel}>
                            <form onSubmit={e => {
                                e.preventDefault();
                                if (newName.trim()) { setNames([...names, newName.trim()]); setNewName(''); }
                            }} className={styles.addForm}>
                                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="이름 추가" />
                                <button type="submit">추가</button>
                            </form>
                            <div className={styles.sidebarActions}>
                                <button className={styles.shuffleBtn} onClick={shuffleParticipants}>🎲 섞기</button>
                                <button className={styles.resetTinyBtn} onClick={() => setNames(DEFAULT_NAMES)}>🔄 초기화</button>
                            </div>
                            <div className={styles.nameChips}>
                                {names.map((name, i) => (
                                    <div key={i} className={styles.chip}>
                                        <span>{ANIMALS[i % ANIMALS.length]}</span> {name}
                                        <button onClick={() => setNames(names.filter(n => n !== name))}>×</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}