/**
 * Format a date string or Date object for display.
 * @param {string|Date} date
 * @param {object} options - Intl.DateTimeFormat options
 */
export function formatDate(date, options = {}) {
    if (!date) return '—';
    return new Intl.DateTimeFormat('en-KE', {
        year:  'numeric',
        month: 'short',
        day:   '2-digit',
        ...options,
    }).format(new Date(date));
}

export function formatDateTime(date) {
    return formatDate(date, { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function daysAgo(date) {
    if (!date) return null;
    return Math.floor((Date.now() - new Date(date)) / (1000 * 60 * 60 * 24));
}
