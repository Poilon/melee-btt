// Roles are private server records, never fields supplied by a browser or player file.
export async function isAdmin(store, user) {
  if (user?.provider !== 'password' || !/^[a-f0-9]{64}$/.test(user.id || '')) return false;
  return (await store.get(`roles/${user.id}.json`))?.role === 'admin';
}
