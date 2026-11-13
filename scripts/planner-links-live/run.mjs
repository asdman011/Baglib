import { runPlannerLive } from '../planner-live/runner.mjs';
import { setupThrowawayCorpus } from '../lib/corpus-copy.mjs';
await runPlannerLive({ script: 'scripts/planner-links-live/main.cjs', variable: 'BAGLIB_PLANNER_LINKS_DIR',
  corpusSetup: directory => setupThrowawayCorpus({ targetDir: directory, copyPoetry: false, includeMushafLayout: true }),
});
