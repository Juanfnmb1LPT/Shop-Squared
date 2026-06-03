import { ref } from 'vue';
import { hasSupabaseConfig, supabase } from './supabase';

// Reactive copy of the current Supabase Auth session. Null when signed out.
export const session = ref(null);

// True after the user arrives via an invite or password-reset link, until they
// choose a new password. The router uses this to force them to /set-password.
export const needsPasswordSet = ref(false);

let authReadyResolve;
// Resolves once the initial getSession() has completed, so the router can
// safely await it before deciding whether to allow a route.
export const authReady = new Promise((resolve) => {
    authReadyResolve = resolve;
});

let initialized = false;

// Call once on app boot. Hydrates the persisted session and keeps `session`
// in sync with sign-in / sign-out / token-refresh events.
export async function initAuth() {
    if (initialized) {
        return authReady;
    }
    initialized = true;

    if (!hasSupabaseConfig || !supabase) {
        authReadyResolve();
        return authReady;
    }

    await consumeAuthLinkFromUrl();

    const { data } = await supabase.auth.getSession();
    session.value = data?.session ?? null;
    authReadyResolve();

    supabase.auth.onAuthStateChange((_event, nextSession) => {
        session.value = nextSession ?? null;
    });

    return authReady;
}

// Invite and password-reset emails land here with the session tokens in the URL
// hash (implicit flow), e.g. `#access_token=...&type=invite`. Establish the
// session from them, flag that a password must be set, then scrub the hash so
// the hash-based router doesn't try to treat the tokens as a route.
async function consumeAuthLinkFromUrl() {
    const rawHash = window.location.hash || '';
    if (!rawHash.includes('access_token=') && !rawHash.includes('error=')) {
        return;
    }

    const params = new URLSearchParams(rawHash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (accessToken && refreshToken) {
        await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });
        if (type === 'invite' || type === 'recovery') {
            needsPasswordSet.value = true;
        }
    }

    // Drop the token hash and leave the router at the app root.
    window.location.hash = '#/';
}

export function isAuthenticated() {
    return Boolean(session.value);
}

export async function loginWithEmail(email, password) {
    const normalizedEmail = String(email || '').trim();
    const normalizedPassword = String(password || '');

    if (!normalizedEmail || !normalizedPassword) {
        return { ok: false, error: 'Email and password are required.' };
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Login is not configured. Missing Supabase settings.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
    });

    if (error) {
        return { ok: false, error: error.message || 'Invalid email or password.' };
    }

    session.value = data?.session ?? null;
    return { ok: true };
}

export async function sendPasswordReset(email) {
    const normalizedEmail = String(email || '').trim();

    if (!normalizedEmail) {
        return { ok: false, error: 'Enter your email to reset your password.' };
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Password reset is not configured. Missing Supabase settings.' };
    }

    // Send the user back to the app root; consumeAuthLinkFromUrl() picks up the
    // recovery tokens and routes them to /set-password.
    const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    if (error) {
        return { ok: false, error: error.message || 'Could not send reset email.' };
    }

    return { ok: true };
}

export async function updatePassword(newPassword) {
    const password = String(newPassword || '');

    if (password.length < 6) {
        return { ok: false, error: 'Password must be at least 6 characters.' };
    }

    if (!hasSupabaseConfig || !supabase) {
        return { ok: false, error: 'Not configured. Missing Supabase settings.' };
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
        return { ok: false, error: error.message || 'Could not update password.' };
    }

    needsPasswordSet.value = false;
    return { ok: true };
}

export async function logout() {
    if (hasSupabaseConfig && supabase) {
        await supabase.auth.signOut();
    }
    session.value = null;
    needsPasswordSet.value = false;
}
