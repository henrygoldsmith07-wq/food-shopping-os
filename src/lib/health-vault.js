export const HEALTH_VAULT_KEY = 'forq-health-vault-v1';
export const HEALTH_CREDENTIAL_KEY = 'forq-health-credential-v1';

export const HEALTH_FIELDS = [
  'body', 'measurements', 'vitals', 'sleep', 'stress', 'cycles', 'trackCycle',
  'photos', 'workouts', 'bloods', 'glucose',
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesToBase64 = (bytes) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const base64ToBytes = (value) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const randomBytes = (length = 16) => crypto.getRandomValues(new Uint8Array(length));

export const healthSnapshot = (state) =>
  Object.fromEntries(HEALTH_FIELDS.map((key) => [key, state[key]]));

export const withoutHealth = (state, emptyState) => ({
  ...state,
  ...Object.fromEntries(HEALTH_FIELDS.map((key) => [key, emptyState[key]])),
});

export async function deriveHealthKey(passphrase, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot encrypt local health data.');
  if (String(passphrase).length < 8) throw new Error('Use at least 8 characters.');
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptHealth(snapshot, key, salt) {
  const iv = randomBytes(12);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(snapshot)),
  );
  return {
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: 310000,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
  };
}

export async function createHealthVault(state, passphrase) {
  const salt = randomBytes();
  const key = await deriveHealthKey(passphrase, salt);
  return { key, salt, record: await encryptHealth(healthSnapshot(state), key, salt) };
}

export async function decryptHealth(record, passphrase) {
  try {
    const salt = base64ToBytes(record.salt);
    const key = await deriveHealthKey(passphrase, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(record.iv) },
      key,
      base64ToBytes(record.ciphertext),
    );
    return { key, salt, snapshot: JSON.parse(decoder.decode(plaintext)) };
  } catch {
    throw new Error('The passphrase is incorrect or the encrypted health record is damaged.');
  }
}

export const platformUnlockAvailable = () =>
  typeof window !== 'undefined'
  && typeof PublicKeyCredential !== 'undefined'
  && Boolean(navigator.credentials);

export async function registerPlatformUnlock(name = 'Forq user') {
  if (!platformUnlockAvailable()) return null;
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Forq' },
      user: {
        id: randomBytes(16),
        name,
        displayName: name,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60000,
      attestation: 'none',
    },
  });
  if (!credential) return null;
  const id = bytesToBase64(new Uint8Array(credential.rawId));
  localStorage.setItem(HEALTH_CREDENTIAL_KEY, id);
  return id;
}

export async function verifyPlatformUnlock() {
  const id = localStorage.getItem(HEALTH_CREDENTIAL_KEY);
  if (!id) return false;
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ id: base64ToBytes(id), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  });
  if (!credential) throw new Error('Device verification was cancelled.');
  return true;
}
