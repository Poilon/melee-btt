import { get, put, del, list, BlobPreconditionFailedError } from '@vercel/blob';

export class CloudStore {
  constructor({ getBlob = get } = {}) { this.getBlob = getBlob; }
  async get(path) {
    const result = await get(path, { access: 'private', useCache: false });
    return result?.statusCode === 200 ? new Response(result.stream).json() : null;
  }
  async put(path, value, overwrite = false) {
    return put(path, JSON.stringify(value), { access: 'private', addRandomSuffix: false,
      allowOverwrite: overwrite, contentType: 'application/json', cacheControlMaxAge: 0 });
  }
  async readVersion(path) {
    // Compression changes strong ETags into weak validators (W/…), which
    // cannot satisfy Blob's If-Match conditional writes. Read the exact stored
    // representation so the value and its strong version come from one read.
    const result = await this.getBlob(path, { access: 'private', useCache: false, headers: { 'Accept-Encoding': 'identity' } });
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
