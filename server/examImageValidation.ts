export function hasValidExamImagePayload(exam: any): boolean {
  if (!Array.isArray(exam?.sections)) return true;
  let totalBytes = 0;
  for (const section of exam.sections) {
    if (!Array.isArray(section?.questions)) continue;
    for (const question of section.questions) {
      const image = question?.imageDataUrl;
      if (image === undefined || image === null || image === '') continue;
      if (typeof image !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(image)) return false;
      if (image.length > 4_000_000) return false;
      totalBytes += image.length;
      if (totalBytes > 8_500_000) return false;
    }
  }
  return true;
}
