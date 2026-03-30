/** Fisher-Yates shuffle, returns a new array of original indices in shuffled order */
export function shuffledIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}
