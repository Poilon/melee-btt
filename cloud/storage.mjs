import { get, put, del, list, BlobPreconditionFailedError } from '@vercel/blob';

export class CloudStore {
  async get(path) {
    const result = await get(path, { access: 'private', useCache: false });
    return result?.statusCode === 200 ? new Response(result.stream).json() : null;
  }
  async put(path, value, overwrite = false) {
    return put(path, JSON.stringify(value), { access: 'private', addRandomSuffix: false,
      allowOverwrite: overwrite, contentType: 'application/json', cacheControlMaxAge: 0 });
  }
  async readVersion(path) {
    const result = await get(path, { access: 'private', useCache: false });
    return result?.statusCode === 200 ? { value: await new Response(result.stream).json(), etag: result.blob.etag } : null;
  }
  async writeVersion(path, value, etag) {
    try {
      await put(path, JSON.stringify(value), { access: 'private', addRandomSuffix: false, ifMatch: etag,
        contentType: 'application/json', cacheControlMaxAge: 0 });
      return true;
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return false;
      throw error;
    }
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
