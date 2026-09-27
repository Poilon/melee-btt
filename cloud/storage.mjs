import { get, put, del, list } from '@vercel/blob';

export class CloudStore {
  async get(path) {
    const result = await get(path, { access: 'private', useCache: false });
    return result?.statusCode === 200 ? new Response(result.stream).json() : null;
  }
  async put(path, value, overwrite = false) {
    return put(path, JSON.stringify(value), { access: 'private', addRandomSuffix: false,
      allowOverwrite: overwrite, contentType: 'application/json', cacheControlMaxAge: 0 });
  }
  async delete(path) { await del(path); }
  async list(prefix) {
    let cursor; const result = [];
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      result.push(...page.blobs); cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return result;
  }
}
