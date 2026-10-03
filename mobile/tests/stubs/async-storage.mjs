const store = new Map();
const AsyncStorage = {
  __store: store,
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => { store.set(k, String(v)); },
  removeItem: async (k) => { store.delete(k); },
  multiSet: async (pairs) => { pairs.forEach(([k, v]) => store.set(k, String(v))); },
  multiRemove: async (keys) => { keys.forEach((k) => store.delete(k)); },
  getAllKeys: async () => [...store.keys()],
  clear: async () => { store.clear(); },
};
export default AsyncStorage;
