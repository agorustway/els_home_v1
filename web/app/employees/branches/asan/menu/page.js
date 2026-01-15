'use client';
import { useState, useRef, useEffect, use } from 'react';
import Header from '../../../../../components/Header';
import Footer from '../../../../../components/Footer';
import styles from './menu.module.css';
import { motion, AnimatePresence } from 'framer-motion';

const DEFAULT_NAMES = ['김종화', '박승철', '최병훈', '김명주', '박승기', '김송미', '임지언'];

export default function AsanMenuChoicePage({ params }) {
    const resolvedParams = use(params);

    const [names, setNames] = useState(DEFAULT_NAMES);
    const [newName, setNewName] = useState('');
    const [activeGame, setActiveGame] = useState('roulette');
    const [isSpinning, setIsSpinning] = useState(false);
    const [winner, setWinner] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [spinDuration, setSpinDuration] = useState(5);
    const canvasRef = useRef(null);
    const timerRef = useRef(null);

    // Ladder States
    const [winnerCount, setWinnerCount] = useState(1);
    const [ladderData, setLadderData] = useState(null);
    const [isLadderRunning, setIsLadderRunning] = useState(false);
    const [activePaths, setActivePaths] = useState([]);
    const [ladderResults, setLadderResults] = useState([]);

    // Roulette Logic
    const drawRoulette = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const count = names.length;
        if (count === 0) return;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 20;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

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
        setIsSpinning(false);
        setSpinDuration(5);
    };

    const spinRoulette = () => {
        if (isSpinning) {
            if (timerRef.current) clearTimeout(timerRef.current);
            setSpinDuration(0.3);
            handleRouletteEnd(rotation);
            return;
        }

        if (names.length < 2) return;

        setIsSpinning(true);
        setWinner(null);
        setSpinDuration(5);

        const additionalSpins = 5 + Math.floor(Math.random() * 5);
        const randomDegree = Math.floor(Math.random() * 360);
        const totalRotation = rotation + (additionalSpins * 360) + randomDegree;

        setRotation(totalRotation);

        timerRef.current = setTimeout(() => {
            handleRouletteEnd(totalRotation);
        }, 5000);
    };

    // Improved Ladder Logic
    const generateLadder = () => {
        const lines = names.length;
        if (lines < 2) return;
        const steps = 15;
        const matrix = Array.from({ length: steps }, () => Array(lines - 1).fill(false));

        for (let i = 1; i < steps - 1; i++) {
            for (let j = 0; j < lines - 1; j++) {
                if (Math.random() > 0.6) {
                    if (j === 0 || !matrix[i][j - 1]) {
                        matrix[i][j] = true;
                    }
                }
            }
        }

        const results = Array(lines).fill('꽝');
        const winners = [];
        const maxWinners = Math.min(winnerCount, lines - 1);
        while (winners.length < maxWinners) {
            const r = Math.floor(Math.random() * lines);
            if (!winners.includes(r)) {
                winners.push(r);
                results[r] = '당첨! 🎉';
            }
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

        setTimeout(() => {
            setIsLadderRunning(false);
            setActivePaths(prev => prev.map(p =>
                p.startIndex === startIndex
                    ? { ...p, isFinished: true, isWinner: ladderResults[currentPos].includes('당첨') }
                    : p
            ));
        }, 4200);
    };

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
                        <h1>아산지점 식단선택 시스템</h1>
                        <p>오늘의 당첨자는 누구일까요?</p>
                    </motion.div>

                    <div className={styles.layout}>
                        <aside className={styles.sidebar}>
                            <div className={styles.card}>
                                <h3>참여자 명단 ({names.length})</h3>
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
                        </aside>

                        <section className={styles.mainArea}>
                            <div className={styles.tabs}>
                                <button className={activeGame === 'roulette' ? styles.activeTab : ''} onClick={() => setActiveGame('roulette')}>🎡 룰렛</button>
                                <button className={activeGame === 'ladder' ? styles.activeTab : ''} onClick={() => { setActiveGame('ladder'); if (!ladderData) generateLadder(); }}>🪜 사다리</button>
                            </div>

                            <div className={styles.gameContainer}>
                                {activeGame === 'roulette' && (
                                    <div className={styles.rouletteBox}>
                                        <div className={styles.rouletteWrapper}>
                                            <div className={styles.pointerContainer}><div className={styles.pointerRed} /></div>
                                            <canvas
                                                ref={canvasRef}
                                                width={500}
                                                height={500}
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

                                                {/* Animated Animal Icons with Precise Path Tracking */}
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
                                                                {p.isFinished ? (p.isWinner ? '😆' : '😭') : p.animal}
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
                            </div>
                        </section>
                    </div>
                </main>
                <Footer />
            </div>
        </>
    );
}
