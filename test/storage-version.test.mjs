import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudStore} from '../cloud/storage.mjs';
test('version reads request the stored representation to retain a strong conditional-write ETag', async () => {
  const store = new CloudStore({getBlob: async (path, options) => {
    assert.equal(path, 'browser-btt/index/player.json');
    assert.equal(options.useCache, false);
    assert.equal(options.access, 'private');
    const identity = options.headers?.['Accept-Encoding'] === 'identity';
    return {statusCode:200,stream:new Response(JSON.stringify({runs:[{fighter:0,frames:905}]})).body,blob:{etag:identity ? '"version"' : 'W/"version"'}};
  }});
  assert.deepEqual(await store.readVersion('browser-btt/index/player.json'), {value:{runs:[{fighter:0,frames:905}]},etag:'"version"'});
});
test('missing versioned rows stay absent',async()=>{
  assert.equal(await new CloudStore({getBlob:async()=>null}).readVersion('missing'),null);
});
