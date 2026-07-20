import * as FileSystem from 'expo-file-system';

/** Reads an expo-image-picker asset into { base64, mediaType } for the backend's
 * Claude Vision fines-verification call, which expects raw base64 + a media type. */
export async function assetToBase64(asset) {
  const base64 = asset.base64 || (await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 }));
  const mediaType = asset.mimeType || 'image/jpeg';
  return { base64, mediaType };
}
