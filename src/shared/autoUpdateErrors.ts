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

export const extractAutoUpdateErrorMessage = (err: unknown): string =>
    readErrorMessage(err) || 'Unknown update error';

export const isRetryableAutoUpdateError = (err: unknown): boolean => {
    const message = extractAutoUpdateErrorMessage(err).toLowerCase();
    return message.includes('err_http2_server_refused_stream')
        || message.includes('econnreset')
        || message.includes('etimedout')
        || message.includes('socket hang up')
        || message.includes('timed out')
        || message.includes('timeout');
};

export const formatAutoUpdateErrorMessage = (err: unknown): string => {
    const message = extractAutoUpdateErrorMessage(err);
    const normalized = message.toLowerCase();

    if (normalized.includes('err_http2_server_refused_stream')) {
        return 'The update server temporarily refused the download stream. Please try again in a moment.';
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

    return message;
};
