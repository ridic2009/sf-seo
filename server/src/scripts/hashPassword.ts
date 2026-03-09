import { hashPassword } from '../services/auth.js';

const password = process.argv[2];

if (!password) {
  console.error('Usage: npm run hash-password -- <password>');
  process.exit(1);
}

hashPassword(password)
  .then((passwordHash) => {
    console.log(passwordHash);
  })
  .catch((error) => {
    console.error('Failed to hash password:', error);
    process.exit(1);
  });