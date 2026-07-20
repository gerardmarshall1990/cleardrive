/** Reads a File into { base64, mediaType } — strips the data: URL prefix, since
 * the backend's Claude Vision call expects raw base64 + a separate media type. */
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, mediaType, base64] = reader.result.match(/^data:(.+);base64,(.*)$/) || [];
      if (!base64) return reject(new Error('Could not read file'));
      resolve({ base64, mediaType: mediaType || file.type });
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
