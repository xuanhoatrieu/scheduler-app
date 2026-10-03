// Node ESM loader hooks: thay module native của React Native/Expo bằng bản giả để test bằng Node.
const STUBS = {
  'expo-notifications': 'expo-notifications.mjs',
  'react-native': 'react-native.mjs',
  '@react-native-async-storage/async-storage': 'async-storage.mjs',
  'expo-secure-store': 'expo-secure-store.mjs',
  'expo-task-manager': 'expo-task-manager.mjs',
};

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) {
    return { url: new URL(`./stubs/${STUBS[specifier]}`, import.meta.url).href, shortCircuit: true };
  }
  // Test ReminderSync: thay services/api bằng API giả điều khiển được
  if (
    process.env.STUB_API === '1' &&
    specifier === './api' &&
    context.parentURL &&
    (context.parentURL.endsWith('/services/reminderSync.js') || context.parentURL.endsWith('/services/pushRegistration.js'))
  ) {
    return { url: new URL('./stubs/api.mjs', import.meta.url).href, shortCircuit: true };
  }
  // Metro cho phép import tương đối không đuôi; Node ESM thì không → thử thêm .js
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?js$/.test(specifier)) {
    try {
      return await next(`${specifier}.js`, context);
    } catch (e) {
      // rơi xuống resolve mặc định
    }
  }
  return next(specifier, context);
}
