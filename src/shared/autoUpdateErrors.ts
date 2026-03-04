const readErrorMessage = (err: unknown): string => {
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (typeof err === 'object') {
        const message = (err as any).message;
        if (typeof message === 'string') return message;
        const stack = (err as any).stack;
        if (typeof stack === 'string' && stack.trim()) {
            return stack.split('\n')[0].trim();
        }
    }
    return '';
};

const summarizeAutoUpdateErrorMessage = (message: string): string => {
    const firstLine = String(message || '').split(/(?:\\n|[\r\n])+/)[0]?.trim() || '';
    if (!firstLine) return '';
    const dataIndex = firstLine.toLowerCase().indexOf(' data:');
    if (dataIndex > -1) {
        return firstLine.slice(0, dataIndex).trim();
    }
    return firstLine;
};

export const extractAutoUpdateErrorMessage = (err: unknown): string =>
    readErrorMessage(err) || 'Unknown update error';

export const isRetryableAutoUpdateError = (err: unknown): boolean => {
    const message = extractAutoUpdateErrorMessage(err).toLowerCase();
    return message.includes('err_http2_server_refused_stream')
        || message.includes('econnreset')
        || message.includes('etimedout')
        || message.includes('socket hang up')
        || message.includes('timed out')
        || message.includes('timeout')
        || message.includes('error: 502')
        || message.includes('error: 503')
        || message.includes('error: 504');
};

export const formatAutoUpdateErrorMessage = (err: unknown): string => {
    const message = extractAutoUpdateErrorMessage(err);
    const normalized = message.toLowerCase();
    const summary = summarizeAutoUpdateErrorMessage(message);

    if (normalized.includes('err_http2_server_refused_stream')) {
        return 'The update server temporarily refused the download stream. Please try again in a moment.';
    }
    if (
        (normalized.includes('error: 502') || normalized.includes('error: 503') || normalized.includes('error: 504'))
        && (normalized.includes('releases.atom') || normalized.includes('github.com'))
    ) {
        return 'GitHub temporarily failed to respond to the update check. Please try again in a moment.';
    }
    if (normalized.includes('timed out') || normalized.includes('timeout')) {
        return 'The update check timed out before the server responded. Please try again.';
    }
    if (
        normalized.includes('econnreset')
        || normalized.includes('etimedout')
        || normalized.includes('socket hang up')
    ) {
        return 'A temporary network error interrupted the update check. Please try again.';
    }

    return summary || message;
};
