// Uncompressed ZIP keeps JPEG bytes intact and works without a CDN dependency.
const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function header(size) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
export async function makeZip(files) {
  const parts = [], directory = []; let offset = 0, directorySize = 0;
  for (const { name, blob } of files) {
    const filename = new TextEncoder().encode(name), bytes = new Uint8Array(await blob.arrayBuffer()), crc = crc32(bytes);
    const local = header(30); local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x800, true);
    local.view.setUint32(14, crc, true); local.view.setUint32(18, bytes.length, true); local.view.setUint32(22, bytes.length, true); local.view.setUint16(26, filename.length, true);
    parts.push(local.bytes, filename, bytes);
    const central = header(46); central.view.setUint32(0, 0x02014b50, true); central.view.setUint16(4, 20, true); central.view.setUint16(6, 20, true); central.view.setUint16(8, 0x800, true);
    central.view.setUint32(16, crc, true); central.view.setUint32(20, bytes.length, true); central.view.setUint32(24, bytes.length, true); central.view.setUint16(28, filename.length, true); central.view.setUint32(42, offset, true);
    directory.push(central.bytes, filename); offset += 30 + filename.length + bytes.length; directorySize += 46 + filename.length;
  }
  const end = header(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, files.length, true); end.view.setUint16(10, files.length, true); end.view.setUint32(12, directorySize, true); end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.bytes], { type: 'application/zip' });
}
