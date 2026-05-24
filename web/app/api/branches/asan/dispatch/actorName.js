function cleanActorText(value = '') {
    return String(value ?? '').trim();
}

function fallbackActorName(value = '') {
    const text = cleanActorText(value);
    if (!text) return '';
    if (text.includes('@')) return text.split('@')[0] || text;
    return text;
}

function metadataName(user = {}) {
    const metadata = user.user_metadata || {};
    return cleanActorText(metadata.full_name || metadata.name || metadata.display_name);
}

export async function resolveActorDisplayName(adminSupabase, actor = '') {
    const text = cleanActorText(actor);
    if (!text) return '';
    if (!text.includes('@')) return text;

    const email = text.toLowerCase();
    try {
        const { data: profile } = await adminSupabase
            .from('profiles')
            .select('full_name')
            .eq('email', email)
            .maybeSingle();
        const profileName = cleanActorText(profile?.full_name);
        if (profileName) return profileName;
    } catch { /* optional lookup */ }

    try {
        const { data: role } = await adminSupabase
            .from('user_roles')
            .select('name')
            .eq('email', email)
            .maybeSingle();
        const roleName = cleanActorText(role?.name);
        if (roleName) return roleName;
    } catch { /* optional lookup */ }

    return fallbackActorName(text);
}

export async function getCurrentUserActorName(adminSupabase, user = {}) {
    const name = metadataName(user);
    if (name) return name;
    return resolveActorDisplayName(adminSupabase, user.email || user.id || 'unknown');
}

export async function decorateActorFields(adminSupabase, row, fields = []) {
    if (!row) return row;
    const next = { ...row };
    for (const field of fields) {
        next[`${field}_name`] = await resolveActorDisplayName(adminSupabase, row[field]);
    }
    return next;
}
