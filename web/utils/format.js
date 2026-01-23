/**
 * Format phone numbers to have hyphens automatically.
 * Supports:
 * - Mobile: 010-1234-5678, 010-123-4567
 * - Landline (Seoul): 02-123-4567, 02-1234-5678
 * - Landline (Regional): 031-123-4567, 042-1234-5678, etc.
 * - Special/Corporate: 1588-1234, 0505-123-4567
 */
export const formatPhoneNumber = (value) => {
    if (!value) return value;

    // Remove all non-numeric characters
    const digits = value.replace(/\D/g, '');

    // Limits
    if (digits.length > 11) return value.substring(0, value.length - 1);

    // Seoul (02)
    if (digits.startsWith('02')) {
        if (digits.length <= 2) return digits;
        if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
        if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
        return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    // Mobile / National (010, 031, 042, 050, 070, etc)
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};
