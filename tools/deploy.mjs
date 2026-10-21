// Publish dist/ to GitHub Pages: the `main` branch holds only the built site (plus .nojekyll), force-pushed
// from a throwaway repo so the code history on `source` stays clean. Run with `npm run deploy` (it builds first).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REMOTE = 'https://github.com/Barabosik/Barabosik.github.io.git';
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();

// the deploy commit carries the same author as the code
const name = git(['config', 'user.name']);
const email = git(['config', 'user.email']);
const sha = git(['rev-parse', '--short', 'HEAD']);
if (git(['status', '--porcelain', '--', 'src', 'public', 'index.html', 'p3n', 'vite.config.js', 'package.json'])) {
  console.error('Uncommitted changes in the site: commit them first, so main matches a commit on source.');
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), 'site-deploy-'));
try {
  cpSync('dist', dir, { recursive: true });
  writeFileSync(join(dir, '.nojekyll'), '');
  git(['init', '-q', '-b', 'main'], dir);
  git(['add', '-A'], dir);
  git(['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', `Deploy ${sha}`], dir);
  git(['push', '-q', '-f', REMOTE, 'main'], dir);
  console.log(`Deployed ${sha} to https://nikita-andreiev.com (live in about a minute).`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
