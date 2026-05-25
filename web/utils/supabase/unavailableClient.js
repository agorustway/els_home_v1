const UNAVAILABLE_STATUS_TEXT = 'Supabase not configured';

function createUnavailableError(message) {
    return new Error(message || 'Supabase 환경변수가 설정되지 않았습니다.');
}

function createUnavailableResponse(error) {
    return {
        data: null,
        error,
        count: 0,
        status: 503,
        statusText: UNAVAILABLE_STATUS_TEXT,
    };
}

function createUnavailableQuery(error) {
    const getResult = () => Promise.resolve(createUnavailableResponse(error));
    let query;

    query = new Proxy(function unavailableQuery() {}, {
        get(_target, prop) {
            if (prop === 'then') return getResult().then.bind(getResult());
            if (prop === 'catch') return getResult().catch.bind(getResult());
            if (prop === 'finally') return getResult().finally.bind(getResult());
            if (prop === Symbol.toStringTag) return 'UnavailableSupabaseQuery';
            return () => query;
        },
        apply() {
            return query;
        },
    });

    return query;
}

function createUnavailableStorage(error) {
    const result = () => Promise.resolve(createUnavailableResponse(error));
    return {
        from() {
            return {
                upload: result,
                download: result,
                remove: result,
                list: result,
                createSignedUrl: result,
                createSignedUrls: result,
                getPublicUrl() {
                    return { data: { publicUrl: '' }, error };
                },
            };
        },
    };
}

function createUnavailableChannel() {
    return {
        on() {
            return this;
        },
        subscribe(callback) {
            if (typeof callback === 'function') callback('CHANNEL_ERROR');
            return this;
        },
        unsubscribe() {
            return Promise.resolve('ok');
        },
    };
}

export function createUnavailableSupabaseClient(message) {
    const error = createUnavailableError(message);
    const query = () => createUnavailableQuery(error);

    return {
        auth: {
            getUser: async () => ({ data: { user: null }, error }),
            getSession: async () => ({ data: { session: null }, error }),
            signOut: async () => createUnavailableResponse(error),
            signInWithPassword: async () => createUnavailableResponse(error),
            signInWithOAuth: async () => createUnavailableResponse(error),
            exchangeCodeForSession: async () => createUnavailableResponse(error),
            onAuthStateChange: () => ({
                data: {
                    subscription: {
                        unsubscribe() {},
                    },
                },
            }),
        },
        from: query,
        rpc: query,
        storage: createUnavailableStorage(error),
        channel: createUnavailableChannel,
        removeChannel: async () => ({ error: null }),
        getChannels: () => [],
    };
}
