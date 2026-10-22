import { LocalEmbedder, LOCAL_MODEL } from './local';

/**
 * Fetch the close-matches model into EMBEDDINGS_MODEL_DIR (the image build runs this, so the API never needs the
 * model's host at run time). Embeds one line to prove the files are whole.
 */
const dir = process.env.EMBEDDINGS_MODEL_DIR;
if (!dir) {
  console.error('EMBEDDINGS_MODEL_DIR is not set');
  process.exit(1);
}
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
