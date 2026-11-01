/** Shared by the function and the local dev server after a Vercel service rewrite. */
export function unwrapApiPath(value = '/'): string {
  const url = new URL(value, 'http://internal.invalid');
  if (url.pathname !== '/api/index') return value;
  const paths = url.searchParams.getAll('__oncoflow_path');
  if (paths.length !== 1 || !/^\/api(?:\/[A-Za-z0-9/_-]+)?$/.test(paths[0]) || paths[0].includes('//')) {
    throw Object.assign(new Error('Invalid API path.'), { status: 400 });
  }
  url.searchParams.delete('__oncoflow_path');
  const query = url.searchParams.toString();
  return paths[0] + (query ? `?${query}` : '');
}
