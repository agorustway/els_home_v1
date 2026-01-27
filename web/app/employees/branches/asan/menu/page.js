'use client';
import { useState, useRef, useEffect } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import styles from './menu.module.css';
import { motion, AnimatePresence } from 'framer-motion';

const DEFAULT_NAMES = ['김종화', '박승철', '최병훈', '김명주', '박승기', '김송미', '임지언'];

// Top 25 Carriers (3-letter codes)
const CARRIER_CODES = [
    'APL', 'CMA', 'CNC', 'COS', 'EMC',
    'HAS', 'ZIM', 'HLC', 'HMM', 'HSD',
    'YML', 'KMD', 'KMS', 'MAE', 'MSC',
    'ONE', 'OOL', 'PCL', 'SIT', 'SKR',
    'SML', 'SNK', 'TCL', 'WDF', 'WHL',
];

export default function AsanMenuChoicePage({ params }) {
    const [names, setNames] = useState(DEFAULT_NAMES);
    const [newName, setNewName] = useState('');
    const [activeGame, setActiveGame] = useState('roulette');
    const [isSpinning, setIsSpinning] = useState(false);
    const [winner, setWinner] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [spinDuration, setSpinDuration] = useState(5);
    const canvasRef = useRef(null);
    const rouletteTimerRef = useRef(null);
    const ladderTimerRef = useRef(null);
    const spinStartRotation = useRef(0);
    const spinStartTime = useRef(0);
    const spinTargetRotation = useRef(0);
    const [rouletteSize, setRouletteSize] = useState(500);

    // Responsive Roulette Size
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 480) {
                setRouletteSize(320);
            } else if (window.innerWidth < 768) {
                setRouletteSize(400);
            } else {
                setRouletteSize(500);
            }
        };

        handleResize(); // Initial check
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (activeGame === 'roulette') drawRoulette();
    }, [rouletteSize]); // Re-draw on resize

    // Reset game states when switching games to prevent residue behavior
    useEffect(() => {
        setIsSpinning(false);
        setIsLadderRunning(false);
        setWinner(null);
        setActivePaths([]);
        if (rouletteTimerRef.current) clearTimeout(rouletteTimerRef.current);
        if (ladderTimerRef.current) clearTimeout(ladderTimerRef.current);
    }, [activeGame]);

    // Ladder States
    const [winnerCount, setWinnerCount] = useState(1);
    const [ladderData, setLadderData] = useState(null);
    const [isLadderRunning, setIsLadderRunning] = useState(false);
    const [activePaths, setActivePaths] = useState([]);
    const [ladderResults, setLadderResults] = useState([]);

    // Bingo States
    const [bingoGrid, setBingoGrid] = useState([]);
    const [bingoCount, setBingoCount] = useState(0);
    const [showBingoWin, setShowBingoWin] = useState(false);

    // History Log
    const [history, setHistory] = useState([]);

    const addToHistory = (game, result) => {
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
            `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        setHistory(prev => [{ timestamp, game, result }, ...prev].slice(0, 50)); // Keep last 50
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (rouletteTimerRef.current) clearTimeout(rouletteTimerRef.current);
            if (ladderTimerRef.current) clearTimeout(ladderTimerRef.current);
        };
    }, []);

    // Roulette Logic
    const drawRoulette = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const count = names.length;
        if (count === 0) return;

        const size = rouletteSize;
        const centerX = size / 2;
        const centerY = size / 2;
        const radius = Math.min(centerX, centerY) - 20;

        ctx.clearRect(0, 0, size, size);

        names.forEach((name, i) => {
            const startAngle = (i * 2 * Math.PI) / count;
            const endAngle = ((i + 1) * 2 * Math.PI) / count;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();

            const colors = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1d4ed8', '#1e40af', '#1e3a8a'];
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(startAngle + Math.PI / count);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Inter, sans-serif';
            ctx.fillText(name, radius - 40, 6);
            ctx.restore();
        });

        ctx.beginPath();
        ctx.arc(centerX, centerY, 15, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 4;
        ctx.stroke();
    };

    useEffect(() => {
        if (activeGame === 'roulette') drawRoulette();
    }, [names, activeGame]);

    const handleRouletteEnd = (finalRotation) => {
        const finalRotationNormalized = finalRotation % 360;
        let targetAngle = (270 - finalRotationNormalized) % 360;
        if (targetAngle < 0) targetAngle += 360;

        const segmentAngle = 360 / names.length;
        const winnerIndex = Math.floor(targetAngle / segmentAngle);

        setWinner(names[winnerIndex]);
        addToHistory('🎡 룰렛', `${names[winnerIndex]} 당첨!`);
        setIsSpinning(false);
        setSpinDuration(5);
    };

    const spinRoulette = () => {
        if (isSpinning) {
            if (rouletteTimerRef.current) clearTimeout(rouletteTimerRef.current);

            const elapsed = (Date.now() - spinStartTime.current) / 1000;
            const progress = Math.min(elapsed / 5, 1);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            const currentGuess = spinStartRotation.current + (spinTargetRotation.current - spinStartRotation.current) * easedProgress;

            // Natural "braking" with high randomness
            const stopRotation = currentGuess + 720 + Math.random() * 720; // 2~4 more turns
            const stopDuration = 3;

            setSpinDuration(stopDuration);
            setRotation(stopRotation);

            rouletteTimerRef.current = setTimeout(() => {
                handleRouletteEnd(stopRotation);
            }, 3000);
            return;
        }

        if (names.length < 2) return;

        setIsSpinning(true);
        setWinner(null);
        setSpinDuration(5);
        spinStartTime.current = Date.now();
        spinStartRotation.current = rotation;

        // Wider range of spins for better parity (10 to 20 full loops)
        const additionalSpins = 10 + Math.floor(Math.random() * 10);
        const randomDegree = Math.random() * 360; // Float for sub-degree precision
        const totalRotation = rotation + (additionalSpins * 360) + randomDegree;

        spinTargetRotation.current = totalRotation;
        setRotation(totalRotation);

        rouletteTimerRef.current = setTimeout(() => {
            handleRouletteEnd(totalRotation);
        }, 5000);
    };

    // Ladder Logic
    const generateLadder = () => {
        const lines = names.length;
        if (lines < 2) return;

        // Increase mixing steps from 15 to 22 for better chaos
        const steps = 22;
        const matrix = Array.from({ length: steps }, () => Array(lines - 1).fill(false));

        for (let i = 1; i < steps - 1; i++) {
            for (let j = 0; j < lines - 1; j++) {
                // Higher line density (55%) for more column switching
                if (Math.random() > 0.45) {
                    if (j === 0 || !matrix[i][j - 1]) {
                        matrix[i][j] = true;
                    }
                }
            }
        }

        // Robust winner distribution using independent bottom-index randomization
        const results = Array(lines).fill('꽝');
        const indices = Array.from({ length: lines }, (_, i) => i);

        // Fisher-Yates Shuffle for the goal positions
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }

        const maxWinners = Math.min(winnerCount, lines - 1);
        for (let i = 0; i < maxWinners; i++) {
            results[indices[i]] = '당첨! 🎉';
        }

        setLadderData(matrix);
        setLadderResults(results);
        setActivePaths([]);
        setIsLadderRunning(false);
    };

    const runLadder = (startIndex) => {
        if (isLadderRunning || !ladderData) return;

        setIsLadderRunning(true);

        let currentPos = startIndex;
        const path = [[currentPos, 0]];
        path.push([currentPos, 2]);

        for (let i = 0; i < ladderData.length; i++) {
            const y = 8 + (i * (84 / (ladderData.length - 1)));
            path.push([currentPos, y]);

            if (currentPos < names.length - 1 && ladderData[i][currentPos]) {
                currentPos++;
                path.push([currentPos, y]);
            } else if (currentPos > 0 && ladderData[i][currentPos - 1]) {
                currentPos--;
                path.push([currentPos, y]);
            }
        }

        path.push([currentPos, 100]);

        const pathColor = ['#2563eb', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'][startIndex % 6];
        const animalIcons = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻'];
        const animal = animalIcons[startIndex % animalIcons.length];

        const newPathObj = {
            startIndex,
            path,
            color: pathColor,
            animal,
            isFinished: false,
            isWinner: false
        };

        setActivePaths(prev => [...prev.filter(p => p.startIndex !== startIndex), newPathObj]);

        if (ladderTimerRef.current) clearTimeout(ladderTimerRef.current);
        ladderTimerRef.current = setTimeout(() => {
            setIsLadderRunning(false);
            const isWinner = ladderResults[currentPos].includes('당첨');

            addToHistory('🪜 사다리', `${names[startIndex]} -> ${isWinner ? '당첨! 🎉' : '꽝'}`);

            setActivePaths(prev => prev.map(p =>
                p.startIndex === startIndex
                    ? { ...p, isFinished: true, isWinner: isWinner }
                    : p
            ));
            ladderTimerRef.current = null;
        }, 4200);
    };

    // Bingo Logic
    const initBingo = () => {
        const shuffled = [...CARRIER_CODES].sort(() => Math.random() - 0.5);
        const grid = shuffled.map(code => ({ code, marked: false, isWinLine: false }));
        setBingoGrid(grid);
        setBingoCount(0);
        setShowBingoWin(false);
    };

    const toggleBingoCell = (index) => {
        if (showBingoWin) return;
        const newGrid = [...bingoGrid];
        newGrid[index].marked = !newGrid[index].marked;

        // Check for Bingo lines
        let lines = 0;
        const winCells = new Set();

        // Rows
        for (let i = 0; i < 5; i++) {
            let rowFull = true;
            for (let j = 0; j < 5; j++) {
                if (!newGrid[i * 5 + j].marked) rowFull = false;
            }
            if (rowFull) {
                lines++;
                for (let j = 0; j < 5; j++) winCells.add(i * 5 + j);
            }
        }

        // Columns
        for (let j = 0; j < 5; j++) {
            let colFull = true;
            for (let i = 0; i < 5; i++) {
                if (!newGrid[i * 5 + j].marked) colFull = false;
            }
            if (colFull) {
                lines++;
                for (let i = 0; i < 5; i++) winCells.add(i * 5 + j);
            }
        }

        // Diagonals
        let diag1Full = true;
        for (let i = 0; i < 5; i++) if (!newGrid[i * 5 + i].marked) diag1Full = false;
        if (diag1Full) {
            lines++;
            for (let i = 0; i < 5; i++) winCells.add(i * 5 + i);
        }

        let diag2Full = true;
        for (let i = 0; i < 5; i++) if (!newGrid[i * 5 + (4 - i)].marked) diag2Full = false;
        if (diag2Full) {
            lines++;
            for (let i = 0; i < 5; i++) winCells.add(i * 5 + (4 - i));
        }

        // Update grid win state
        newGrid.forEach((cell, idx) => {
            cell.isWinLine = winCells.has(idx);
        });

        setBingoGrid(newGrid);
        setBingoCount(lines);
        if (lines >= 5) setShowBingoWin(true);
    };

    useEffect(() => {
        if (activeGame === 'bingo' && bingoGrid.length === 0) {
            initBingo();
        }
    }, [activeGame]);

    const addName = (e) => {
        e.preventDefault();
        if (newName.trim() && !names.includes(newName.trim())) {
            setNames([...names, newName.trim()]);
            setNewName('');
            setLadderData(null);
        }
    };

    const removeName = (name) => {
        setNames(names.filter(n => n !== name));
        setLadderData(null);
    };

    return (
        <>
            <Header darkVariant={true} />
            <div className={styles.page}>
                <main className={styles.container}>
                    <motion.div className={styles.hero} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                        <h1>아산지점 식단선택 게임</h1>
                        <p>동료들과 즐거운 시간 보내세요!</p>
                    </motion.div>

                    <div className={styles.layout}>
                        <aside className={styles.sidebar}>
                            <div className={styles.card}>
                                <h3>게임 참여자 ({names.length})</h3>
                                <form onSubmit={addName} className={styles.addForm}>
                                    <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="이름 추가" />
                                    <button type="submit">추가</button>
                                </form>
                                <div className={styles.nameList}>
                                    {names.map((name, i) => (
                                        <div key={i} className={styles.nameTag}>
                                            <span>{name}</span>
                                            <button onClick={() => removeName(name)}>×</button>
                                        </div>
                                    ))}
                                </div>
                                <button className={styles.resetBtn} onClick={() => { setNames(DEFAULT_NAMES); setLadderData(null); }}>기본값 복원</button>
                            </div>

                            <div className={`${styles.card} ${styles.historyCard}`}>
                                <h3>최근 기록</h3>
                                <div className={styles.historyList}>
                                    {history.length === 0 ? (
                                        <p className={styles.emptyHistory}>기록이 없습니다.</p>
                                    ) : (
                                        history.map((h, i) => (
                                            <div key={i} className={styles.historyItem}>
                                                <div className={styles.historyMeta}>
                                                    <span className={styles.historyGame}>{h.game}</span>
                                                    <span className={styles.historyTime}>{h.timestamp}</span>
                                                </div>
                                                <div className={styles.historyResult}>{h.result}</div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                {history.length > 0 && (
                                    <button className={styles.clearHistoryBtn} onClick={() => setHistory([])}>전체 삭제</button>
                                )}
                            </div>
                        </aside>

                        <section className={styles.mainArea}>
                            <div className={styles.tabs}>
                                <button className={activeGame === 'roulette' ? styles.activeTab : ''} onClick={() => setActiveGame('roulette')}>🎡 룰렛</button>
                                <button className={activeGame === 'ladder' ? styles.activeTab : ''} onClick={() => { setActiveGame('ladder'); if (!ladderData) generateLadder(); }}>🪜 사다리</button>
                                <button className={activeGame === 'bingo' ? styles.activeTab : ''} onClick={() => setActiveGame('bingo')}>🔢 빙고</button>
                            </div>

                            <div className={styles.gameContainer}>
                                {activeGame === 'roulette' && (
                                    <div className={styles.rouletteBox}>
                                        <div className={styles.rouletteWrapper} style={{ width: rouletteSize, height: rouletteSize }}>
                                            <div className={styles.pointerContainer}><div className={styles.pointerRed} /></div>
                                            <canvas
                                                ref={canvasRef}
                                                width={rouletteSize}
                                                height={rouletteSize}
                                                style={{
                                                    transform: `rotate(${rotation}deg)`,
                                                    transition: `transform ${spinDuration}s cubic-bezier(0.1, 0, 0.1, 1)`
                                                }}
                                            />
                                        </div>
                                        <button
                                            className={`${styles.spinBtn} ${isSpinning ? styles.spinning : ''}`}
                                            onClick={spinRoulette}
                                            disabled={!isSpinning && names.length < 2}
                                        >
                                            {isSpinning ? '지금 멈추기!' : '룰렛 가동'}
                                        </button>
                                        <AnimatePresence>
                                            {winner && (
                                                <motion.div className={styles.resultOverlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                                    <motion.div className={styles.resultCard} initial={{ scale: 0.5 }} animate={{ scale: 1 }}>
                                                        <div className={styles.confetti}>🎊</div>
                                                        <span>당첨자</span>
                                                        <h2>{winner}</h2>
                                                        <button className={styles.closeBtn} onClick={() => setWinner(null)}>확인 완료</button>
                                                    </motion.div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                {activeGame === 'ladder' && (
                                    <div className={styles.ladderBox}>
                                        <div className={styles.ladderHeader}>
                                            <div className={styles.ladderSettings}>
                                                <label>당첨 수:</label>
                                                <input type="number" min="1" max={names.length - 1} value={winnerCount} onChange={(e) => setWinnerCount(parseInt(e.target.value) || 1)} className={styles.winnerInput} />
                                                <button className={styles.regenerateBtn} onClick={generateLadder}>사다리 재생성</button>
                                            </div>
                                            <p>이름을 클릭하여 결과를 확인하세요!</p>
                                        </div>

                                        <div className={styles.ladderContent}>
                                            <div className={styles.ladderHeaderRow}>
                                                {names.map((name, i) => (
                                                    <div key={i} className={styles.ladderStartNode} onClick={() => runLadder(i)}>{name}</div>
                                                ))}
                                            </div>

                                            <div className={styles.ladderBoard}>
                                                <svg className={styles.ladderSvgBackground}>
                                                    {names.map((_, i) => (
                                                        <line key={`v-${i}`} x1={`${(i / (names.length - 1)) * 100}%`} y1="0%" x2={`${(i / (names.length - 1)) * 100}%`} y2="100%" className={styles.bgLineV} />
                                                    ))}
                                                    {ladderData && ladderData.map((row, j) => (
                                                        row.map((active, i) => (
                                                            active && (
                                                                <line
                                                                    key={`h-${j}-${i}`}
                                                                    x1={`${(i / (names.length - 1)) * 100}%`}
                                                                    y1={`${8 + (j * (84 / (ladderData.length - 1)))}%`}
                                                                    x2={`${((i + 1) / (names.length - 1)) * 100}%`}
                                                                    y2={`${8 + (j * (84 / (ladderData.length - 1)))}%`}
                                                                    className={styles.bgLineH}
                                                                />
                                                            )
                                                        ))
                                                    ))}
                                                </svg>

                                                <svg className={styles.ladderSvgOverlay} viewBox="0 0 100 100" preserveAspectRatio="none">
                                                    {activePaths.map((p, idx) => (
                                                        <motion.polyline
                                                            key={p.startIndex}
                                                            points={p.path.map(([line, y]) => {
                                                                const x = (line / (names.length - 1)) * 100;
                                                                return `${x},${y}`;
                                                            }).join(' ')}
                                                            className={styles.activePath}
                                                            stroke={p.color}
                                                            initial={{ pathLength: 0, opacity: 0 }}
                                                            animate={{ pathLength: 1, opacity: 1 }}
                                                            transition={{ duration: 4, ease: "linear" }}
                                                        />
                                                    ))}
                                                </svg>

                                                {activePaths.map((p, idx) => {
                                                    const keyframesX = p.path.map(([line, y]) => `${(line / (names.length - 1)) * 100}%`);
                                                    const keyframesY = p.path.map(([line, y]) => `${y}%`);

                                                    return (
                                                        <motion.div
                                                            key={`animal-${p.startIndex}`}
                                                            className={styles.animalIcon}
                                                            initial={{ left: `${(p.startIndex / (names.length - 1)) * 100}%`, top: '0%' }}
                                                            animate={{
                                                                left: keyframesX,
                                                                top: keyframesY
                                                            }}
                                                            transition={{ duration: 4, ease: "linear" }}
                                                        >
                                                            <div className={styles.animalFace}>
                                                                {p.isFinished ? (p.isWinner ? '😭' : '😆') : p.animal}
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </div>

                                            <div className={styles.ladderFooterRow}>
                                                {ladderResults.map((res, i) => (
                                                    <div key={i} className={styles.ladderEndNode}>{res}</div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeGame === 'bingo' && (
                                    <div className={styles.bingoContainer}>
                                        <div className={styles.bingoBox}>
                                            <div className={styles.bingoHeader}>
                                                <h2>🚢 선사코드 5x5 빙고</h2>
                                                <p>국제 선사코드(3자리)를 클릭하여 5빙고를 완성하세요!</p>
                                                <div className={styles.bingoActions}>
                                                    <button className={styles.regenerateBtn} onClick={initBingo}>빙고판 재구성</button>
                                                </div>
                                            </div>

                                            <div className={styles.bingoGrid}>
                                                {bingoGrid.map((cell, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`${styles.bingoCell} ${cell.marked ? styles.marked : ''} ${cell.isWinLine ? styles.win : ''}`}
                                                        onClick={() => toggleBingoCell(idx)}
                                                    >
                                                        {cell.code}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className={styles.bingoCount}>
                                                {bingoCount} BINGO
                                            </div>

                                            <AnimatePresence>
                                                {showBingoWin && (
                                                    <motion.div
                                                        className={styles.bingoWinOverlay}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                    >
                                                        <div className={styles.bingoWinContent}>
                                                            <h2 style={{ fontSize: '4rem', marginBottom: '20px' }}>👑 BINGO!</h2>
                                                            <p style={{ fontSize: '1.5rem', marginBottom: '30px' }}>축하합니다! 5빙고를 달성했습니다.</p>
                                                            <button className={styles.closeBtn} onClick={() => setShowBingoWin(false)}>계속하기</button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>

                                        <aside className={styles.bingoManual}>
                                            <h3>게임설명서</h3>
                                            <div className={styles.manualList}>
                                                <div className={styles.manualItem}>
                                                    <span className={styles.manualNum}>1</span>
                                                    <p>무작위로 배치된 선사코드(3자리) 중 부르는 코드를 클릭하여 체크하세요.</p>
                                                </div>
                                                <div className={styles.manualItem}>
                                                    <span className={styles.manualNum}>2</span>
                                                    <p>체크된 칸들이 가로, 세로, 대각선으로 한 줄이 되면 1빙고가 완성됩니다.</p>
                                                </div>
                                                <div className={styles.manualItem}>
                                                    <span className={styles.manualNum}>3</span>
                                                    <p>총 5줄의 빙고를 먼저 완성하여 '5 BINGO'가 되면 승리합니다!</p>
                                                </div>
                                                <div className={styles.manualItem}>
                                                    <span className={styles.manualNum}>4</span>
                                                    <p>동료들과 함께 누가 먼저 5빙고를 외치는지 대결해 보세요.</p>
                                                </div>
                                            </div>
                                        </aside>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </main>
                <Footer />
            </div>
        </>
    );
}
