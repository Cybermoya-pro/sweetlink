import { URL } from 'node:url';
export const LOOSE_PATH_SUFFIXES = ['home', 'index', 'overview'];
export function normalizeUrlForMatch(input) {
    if (!input) {
        return null;
    }
    try {
        return new URL(input);
    }
    catch {
        return null;
    }
}
export function trimTrailingSlash(path) {
    if (!path) {
        return '/';
    }
    const trimmed = path.replace(/\/+$/, '');
    if (!trimmed) {
        return '/';
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
export function extractPathSegments(path) {
    const normalized = trimTrailingSlash(path);
    if (normalized === '/' || normalized.length === 0) {
        return [];
    }
    return normalized.replace(/^\/+/, '').split('/');
}
export function suffixSegmentsAllowed(segments) {
    if (segments.length === 0) {
        return true;
    }
    return segments.every((segment) => LOOSE_PATH_SUFFIXES.includes(segment));
}
export function urlsRoughlyMatch(a, b) {
    const urlA = normalizeUrlForMatch(a);
    const urlB = normalizeUrlForMatch(b);
    if (!urlA || !urlB) {
        return a === b;
    }
    if (urlA.origin !== urlB.origin) {
        return false;
    }
    const pathA = trimTrailingSlash(urlA.pathname);
    const pathB = trimTrailingSlash(urlB.pathname);
    if (pathA === pathB) {
        return true;
    }
    const segmentsA = extractPathSegments(pathA);
    const segmentsB = extractPathSegments(pathB);
    const minLength = Math.min(segmentsA.length, segmentsB.length);
    for (let index = 0; index < minLength; index += 1) {
        if (segmentsA[index] !== segmentsB[index]) {
            return false;
        }
    }
    const remainderA = segmentsA.slice(minLength);
    const remainderB = segmentsB.slice(minLength);
    return suffixSegmentsAllowed(remainderA) && suffixSegmentsAllowed(remainderB);
}
export function buildWaitCandidateUrls(targetUrl, aliases) {
    const candidates = new Set([targetUrl]);
    const normalized = normalizeUrlForMatch(targetUrl);
    if (normalized) {
        const withoutQuery = new URL(normalized.toString());
        withoutQuery.search = '';
        candidates.add(withoutQuery.toString());
        const trimmedPath = trimTrailingSlash(withoutQuery.pathname);
        if (trimmedPath && trimmedPath !== '/') {
            for (const suffix of LOOSE_PATH_SUFFIXES) {
                if (trimmedPath.endsWith(`/${suffix}`)) {
                    continue;
                }
                const alternative = new URL(withoutQuery.toString());
                alternative.pathname = `${trimmedPath}/${suffix}`;
                candidates.add(alternative.toString());
            }
            if (trimmedPath === '/auth') {
                const signinVariant = new URL(withoutQuery.toString());
                signinVariant.pathname = '/auth/signin';
                candidates.add(signinVariant.toString());
            }
        }
        else if (trimmedPath === '/') {
            // Marketing shell redirects "/" launches to the timeline; seed common timeline paths so
            // the CLI keeps waiting for the redirected session instead of timing out.
            const timelineBase = new URL(withoutQuery.toString());
            timelineBase.pathname = '/timeline';
            candidates.add(timelineBase.toString());
            for (const suffix of LOOSE_PATH_SUFFIXES) {
                const alternative = new URL(timelineBase.toString());
                alternative.pathname = `/timeline/${suffix}`;
                candidates.add(alternative.toString());
            }
            const authSignin = new URL(withoutQuery.toString());
            authSignin.pathname = '/auth/signin';
            candidates.add(authSignin.toString());
        }
    }
    if (aliases) {
        for (const alias of aliases) {
            if (!alias) {
                continue;
            }
            candidates.add(alias);
        }
    }
    return [...candidates];
}
//# sourceMappingURL=url.js.map