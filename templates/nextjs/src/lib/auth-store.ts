// In-memory auth store for the starter template.
// Replace with a real database in production.

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  orgId: string;
  role: 'admin' | 'member';
}

const users = new Map<string, StoredUser>();

// --- Hashing helper (Web Crypto, works in Edge Runtime) ---

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- Seed the demo admin user ---

const SEED_PASSWORD = 'admin123';
const SEED_EMAIL = 'admin@example.com';

// We hash eagerly at module load. Since hashPassword is async we store a
// promise and resolve it lazily on first access.
let seeded = false;

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;

  const hash = await hashPassword(SEED_PASSWORD);
  users.set(SEED_EMAIL, {
    id: 'usr_demo_admin',
    email: SEED_EMAIL,
    name: 'Admin',
    passwordHash: hash,
    orgId: 'demo-org',
    role: 'admin',
  });
}

// --- Public API ---

export async function findUserByEmail(
  email: string,
): Promise<StoredUser | undefined> {
  await ensureSeeded();
  return users.get(email);
}

export async function createUser(
  email: string,
  password: string,
  name: string,
): Promise<StoredUser> {
  await ensureSeeded();

  if (users.has(email)) {
    throw new Error('User already exists');
  }

  const user: StoredUser = {
    id: `usr_${crypto.randomUUID().slice(0, 12)}`,
    email,
    name,
    passwordHash: await hashPassword(password),
    orgId: `org_${crypto.randomUUID().slice(0, 8)}`,
    role: 'member',
  };

  users.set(email, user);
  return user;
}

export async function verifyPassword(
  user: StoredUser,
  password: string,
): Promise<boolean> {
  const hash = await hashPassword(password);
  return hash === user.passwordHash;
}
