import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalEmbedder, LOCAL_MODEL } from './local';
import { localModelDir } from './modelDir';

/**
 * Fetch the close-matches model into EMBEDDINGS_MODEL_DIR (the image build runs this, so the API never needs the
 * model's host at run time), or, left unset, into the main checkout's `.local/models`. Embeds one line to prove the
 * files are whole.
 */
const dir =
  process.env.EMBEDDINGS_MODEL_DIR ?? localModelDir(resolve(fileURLToPath(import.meta.url), '../../../../..'));
const embedder = new LocalEmbedder({ modelDir: dir, offline: false, quiet: true });
embedder
  .embed(['renew passport'])
  .then((v) => {
    console.log(`embeddings: ${LOCAL_MODEL} is in ${dir} (${v[0]!.length} numbers)`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('embeddings: the model did not download', err);
    process.exit(1);
  });
