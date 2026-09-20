/* The int8 dot product of `scanVectorIndex`, vectorized.
 *
 *  This is the one hot loop of a semantic query: 961,253 vectors x 256
 *  dimensions is ~246 million multiply-adds, and in JavaScript it costs ~82 ms
 *  on a developer machine and ~175 ms on the deployment. The arithmetic is
 *  trivially data-parallel and JavaScript has no portable way to say so, which
 *  is the entire reason this file exists.
 *
 *  **It computes scores and nothing else.** Ranking, the topK bound, the
 *  per-book ranges and the paragraph ids all stay in `vector-index.ts`. This
 *  function fills a caller-owned `float`... no: an `int32_t` array with one dot
 *  product per row and returns. Keeping the selection in TypeScript means the
 *  accelerated path and the pure path cannot disagree about *ranking* — only
 *  about arithmetic, which is integer and therefore exact either way.
 *
 *  Build (see `scripts/build-native.sh`):
 *    cc -O3 -shared -fPIC -o libvectorscan.<ext> vector-scan.c
 */

#include <stddef.h>
#include <stdint.h>

#if defined(__ARM_NEON) || defined(__ARM_NEON__)
#include <arm_neon.h>
#define VECTOR_SCAN_NEON 1
#elif defined(__AVX2__)
#include <immintrin.h>
#define VECTOR_SCAN_AVX2 1
#endif

/* One row's dot product. `dimensions` is 256 for every index the BVI1 format
 * describes, but the tail loop keeps this correct for any width rather than
 * silently reading past the row. */
static inline int32_t dot_row(const int8_t* v, const int8_t* q, int32_t dimensions) {
  int32_t i = 0;
  int32_t sum = 0;

#if defined(VECTOR_SCAN_NEON)
  int32x4_t acc = vdupq_n_s32(0);
  for (; i + 16 <= dimensions; i += 16) {
    int8x16_t a = vld1q_s8(v + i);
    int8x16_t b = vld1q_s8(q + i);
    /* Widening multiply to int16, then pairwise-accumulate into int32. An
     * int8 x int8 product fits in int16, and 256 of them cannot overflow
     * int32, so no saturation is possible anywhere in this chain. */
    acc = vpadalq_s16(acc, vmull_s8(vget_low_s8(a), vget_low_s8(b)));
    acc = vpadalq_s16(acc, vmull_s8(vget_high_s8(a), vget_high_s8(b)));
  }
  sum = vaddvq_s32(acc);
#elif defined(VECTOR_SCAN_AVX2)
  __m256i acc = _mm256_setzero_si256();
  for (; i + 32 <= dimensions; i += 32) {
    __m256i a = _mm256_loadu_si256((const __m256i*)(v + i));
    __m256i b = _mm256_loadu_si256((const __m256i*)(q + i));
    /* Sign-extend to int16 and multiply-add pairs into int32. */
    __m256i alo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(a));
    __m256i blo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(b));
    __m256i ahi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(a, 1));
    __m256i bhi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(b, 1));
    acc = _mm256_add_epi32(acc, _mm256_madd_epi16(alo, blo));
    acc = _mm256_add_epi32(acc, _mm256_madd_epi16(ahi, bhi));
  }
  __m128i half = _mm_add_epi32(_mm256_castsi256_si128(acc), _mm256_extracti128_si256(acc, 1));
  half = _mm_add_epi32(half, _mm_shuffle_epi32(half, 0x4E));
  half = _mm_add_epi32(half, _mm_shuffle_epi32(half, 0xB1));
  sum = _mm_cvtsi128_si32(half);
#endif

  for (; i < dimensions; i += 1) sum += (int32_t)v[i] * (int32_t)q[i];
  return sum;
}

/* Scores `count` consecutive rows starting at `offset`, writing one dot
 * product per row into `out`. The caller sizes `out` to at least `count`.
 *
 * Returns the number of rows scored, so the TypeScript side can assert the
 * accelerator did what it was asked rather than trusting a void call. */
int32_t vector_scan_range(
  const int8_t* vectors,
  const int8_t* query,
  int32_t dimensions,
  int32_t offset,
  int32_t count,
  int32_t* out
) {
  if (dimensions <= 0 || count <= 0 || offset < 0) return 0;
  for (int32_t row = 0; row < count; row += 1) {
    out[row] = dot_row(vectors + (size_t)(offset + row) * (size_t)dimensions, query, dimensions);
  }
  return count;
}

/* Which vector unit this build actually compiled to.
 * 2 = NEON, 1 = AVX2, 0 = scalar. A scalar build is correct but pointless, and
 * the loader logs this so a silently-unaccelerated deployment is visible. */
int32_t vector_scan_isa(void) {
#if defined(VECTOR_SCAN_NEON)
  return 2;
#elif defined(VECTOR_SCAN_AVX2)
  return 1;
#else
  return 0;
#endif
}
