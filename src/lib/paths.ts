const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const basePath = rawBasePath === '/' ? '' : rawBasePath.replace(/\/$/, '');

export function appPath(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${basePath}${normalizedPath}` || '/';
}

export function appUrl(hash = '') {
  if (typeof window === 'undefined') return appPath('/');
  return `${window.location.origin}${appPath('/')}${hash}`;
}
