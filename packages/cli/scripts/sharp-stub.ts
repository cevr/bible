/** `sharp`, as compiled into the CLI binary: absent on purpose.
 *
 *  `@huggingface/transformers` imports `sharp` for its *image* pipelines, and
 *  sharp's loader throws at require time inside a `bun build --compile` binary
 *  (its platform package and libvips dylib are not embeddable). The CLI's one
 *  use of transformers is text embedding — `AutoTokenizer` + `AutoModel` over
 *  EmbeddingGemma — which never touches an image, so the bundler resolves
 *  `sharp` to this stub instead. Anything that *does* reach for it fails with
 *  a named error rather than sharp's dlopen message.
 */

const unavailable = (): never => {
  // oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- bundler stub outside any Effect: if the unreachable image path is ever taken, crash loudly with a named reason
  throw new Error('sharp is not bundled into the compiled bible CLI (text-only build)');
};

export default unavailable;
