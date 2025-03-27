import type { SyncResolver } from 'jest-resolve';

const mjsResolver: SyncResolver = (path, options) => {
  const mjsExtRegex = /\.m?[jt]s$/i;
  const resolver = options.defaultResolver;
  if (mjsExtRegex.test(path)) {
    try {
      return resolver(path.replace(/\.mjs$/, '.mts').replace(/\.js$/, '.ts'), options);
    } catch {
      // use default resolver
    }
  }

  return resolver(path, options);
};

export default mjsResolver; 