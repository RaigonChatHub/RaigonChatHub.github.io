const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');

export function appPath(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${normalizedPath}` || '/';
}

export function appUrl(hash = '') {
  // Use NEXT_PUBLIC_APP_URL for auth redirects if set (e.g., for GitHub Pages production)
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (configuredUrl) {
    return `${configuredUrl}${appPath('/')}${hash}`;
  }
  // Fall back to current window origin for development
  if (typeof window === 'undefined') return appPath('/');
  return `${window.location.origin}${appPath('/')}${hash}`;
}
