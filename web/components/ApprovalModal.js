'use client';

import { motion, AnimatePresence } from 'framer-motion';
import styles from './ApprovalModal.module.css';

export default function ApprovalModal({ isOpen, onClose }) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className={styles.modalOverlay} onClick={onClose}>
                <motion.div
                    className={styles.modalContent}
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                >
                    <span className={styles.modalIcon}>📢</span>
                    <h2 className={styles.modalTitle}>권한 승인 대기 안내</h2>
                    <p className={styles.modalDesc}>
                        현재 소속 지점 및 권한이 배정되지 않았습니다.<br />
                        임직원 전용 서비스를 이용하기 위해서는 <strong>지점 배정과 관리자의 최종 승인</strong>이 필요합니다.<br /><br />
                        가입 직후이거나 배정을 기다리고 계신 경우,<br />
                        관리자에게 승인 요청 문의를 해주시기 바랍니다.
                    </p>
                    <button
                        className={styles.modalBtn}
                        onClick={onClose}
                    >
                        확인하였습니다
                    </button>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
