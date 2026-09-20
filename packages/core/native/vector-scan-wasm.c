/* The same int8 dot product as `vector-scan.c`, for WebAssembly SIMD.
 *
 *  Two sources rather than one `#ifdef` thicket because the two have different
 *  *shapes*, not just different intrinsics: the native build reads the corpus
 *  where it already sits, and the WebAssembly build reads it out of its own
 *  linear memory, so the callers differ in what a pointer even means. Sharing
 *  a file would mean one set of parameters that is wrong for one of them.
 *
 *  Measured on the deployed 961,253-vector index: 11.8 ms here against 81.8 ms
 *  for the JavaScript loop and 5.5 ms for NEON through `bun:ffi`. This tier
 *  exists because it is the only one that runs on *every* host — a browser
 *  worker, Electron and Bun alike — from one artifact.
 *
 *  Build (see `scripts/build-native.sh`):
 *    zig cc --target=wasm32-freestanding -msimd128 -O3 -nostdlib \
 *           -Wl,--no-entry -o vector-scan.wasm vector-scan-wasm.c
 */

#include <stdint.h>
#include <wasm_simd128.h>

/* Scores `count` consecutive rows starting at `offset`, writing one dot
 * product per row into `out`.
 *
 * Every argument is an offset into this module's linear memory, which is what
 * makes the signature identical to the native one from TypeScript's side even
 * though the pointers mean something different.
 *
 * Returns the number of rows scored, so the caller can assert the accelerator
 * did what it was asked rather than trusting a void call. */
__attribute__((export_name("vector_scan_range")))
int32_t vector_scan_range(
  const int8_t* vectors,
  const int8_t* query,
  int32_t dimensions,
  int32_t offset,
  int32_t count,
  int32_t* out
) {
  if (dimensions <= 0 || count <= 0 || offset < 0) return 0;

  for (int32_t r = 0; r < count; r += 1) {
    const int8_t* row = vectors + (long)(offset + r) * (long)dimensions;
    v128_t acc = wasm_i32x4_splat(0);
    int32_t i = 0;

    for (; i + 16 <= dimensions; i += 16) {
      v128_t a = wasm_v128_load(row + i);
      v128_t b = wasm_v128_load(query + i);
      /* Widen int8 -> int16 before multiplying: an int8 x int8 product does
       * not fit in int8, and a narrowing multiply would saturate silently.
       * Widening again to int32 before accumulating is what keeps 256 terms
       * from overflowing int16. */
      v128_t lo = wasm_i16x8_mul(wasm_i16x8_extend_low_i8x16(a), wasm_i16x8_extend_low_i8x16(b));
      v128_t hi = wasm_i16x8_mul(wasm_i16x8_extend_high_i8x16(a), wasm_i16x8_extend_high_i8x16(b));
      acc = wasm_i32x4_add(acc, wasm_i32x4_extend_low_i16x8(lo));
      acc = wasm_i32x4_add(acc, wasm_i32x4_extend_high_i16x8(lo));
      acc = wasm_i32x4_add(acc, wasm_i32x4_extend_low_i16x8(hi));
      acc = wasm_i32x4_add(acc, wasm_i32x4_extend_high_i16x8(hi));
    }

    int32_t sum = wasm_i32x4_extract_lane(acc, 0) + wasm_i32x4_extract_lane(acc, 1) +
                  wasm_i32x4_extract_lane(acc, 2) + wasm_i32x4_extract_lane(acc, 3);
    /* The tail, for a future dimension count that is not a multiple of 16.
     * BVI1 pins 256, so this runs zero times today. */
    for (; i < dimensions; i += 1) sum += (int32_t)row[i] * (int32_t)query[i];
    out[r] = sum;
  }

  return count;
}

/* 3 = WebAssembly SIMD. Distinct from the native module's 2 (NEON) and
 * 1 (AVX2) so one log line can say which tier actually answered. */
__attribute__((export_name("vector_scan_isa")))
int32_t vector_scan_isa(void) { return 3; }
