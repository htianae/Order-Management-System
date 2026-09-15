const cjkPattern = /[\u3400-\u9fff]/
const mojibakePattern = /[\u00c0-\u00ff\u0080-\u009f]/

export function normalizeUploadedFilename(filename: string) {
  if (!filename || cjkPattern.test(filename) || !mojibakePattern.test(filename)) {
    return filename
  }

  const decoded = Buffer.from(filename, 'latin1').toString('utf8')

  return cjkPattern.test(decoded) ? decoded : filename
}
