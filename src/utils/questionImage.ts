export const MAX_QUESTION_IMAGE_BYTES = 2.8 * 1024 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;

export async function prepareQuestionImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('الصيغ المدعومة هي PNG وJPG وWEBP فقط.');
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error('حجم الصورة الأصلية كبير جداً. الحد الأقصى 15 ميجابايت.');

  const sourceUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذرت قراءة ملف الصورة.'));
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('تعذر تجهيز الصورة.'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('ملف الصورة تالف أو غير مدعوم.'));
    element.src = sourceUrl;
  });

  const maxDimension = 1800;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('تعذر معالجة الصورة على هذا الجهاز.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.88;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > MAX_QUESTION_IMAGE_BYTES * 1.37 && quality > 0.55) {
    quality -= 0.08;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > MAX_QUESTION_IMAGE_BYTES * 1.37) {
    throw new Error('تعذر ضغط الصورة إلى الحجم المسموح. اختر صورة أصغر.');
  }
  return result;
}
