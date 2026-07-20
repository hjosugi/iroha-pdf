import { ensureFixtures } from './fixtures';

export default async function globalSetup(): Promise<void> {
  await ensureFixtures();
}
