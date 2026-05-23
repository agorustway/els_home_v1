import { formatKoreanPhoneNumber } from './koreanPhoneNumber.mjs';

/**
 * Format phone numbers to have hyphens automatically.
 * Supports:
 * - Mobile: 010-1234-5678, 010-123-4567
 * - Landline (Seoul): 02-123-4567, 02-1234-5678
 * - Landline (Regional): 031-123-4567, 042-1234-5678, etc.
 * - Special/Corporate: 1588-1234, 0505-123-4567
 */
export const formatPhoneNumber = (value) => {
    return formatKoreanPhoneNumber(value, {
        emptyValue: value,
        noDigitsValue: '',
    });
};
