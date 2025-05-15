import { describe, it, expect, vi } from 'vitest';
import axios from 'axios';

describe('IPFS utils', () => {
  // Dynamically load the module after resetting to pick up env changes
  const loadModule = async () => {
    vi.resetModules();
    return await import('../src/ipfs');
  };

  it('getIPFSUrl constructs correct gateway URL', async () => {
    const { getIPFSUrl } = await loadModule();
    expect(getIPFSUrl('QmTestHash')).toBe('https://gateway.pinata.cloud/ipfs/QmTestHash');
  });

  it('throws error when PINATA_JWT is missing', async () => {
    delete process.env.VITE_PINATA_JWT;
    const { uploadToIPFS } = await loadModule();
    const file = new File([''], 'empty.txt');
    await expect(uploadToIPFS(file)).rejects.toThrow('IPFS upload configuration missing.');
  });

  it('uploads a File successfully and returns CID', async () => {
    process.env.VITE_PINATA_JWT = 'TEST_JWT';
    const { uploadToIPFS } = await loadModule();
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ data: { IpfsHash: 'CID123' } });
    const file = new File(['hello'], 'hello.txt');
    const result = await uploadToIPFS(file);
    expect(result).toBe('CID123');
    expect(postSpy).toHaveBeenCalledWith(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer TEST_JWT' }),
      })
    );
    postSpy.mockRestore();
  });

  it('throws when axios.post response missing IpfsHash', async () => {
    process.env.VITE_PINATA_JWT = 'TEST_JWT';
    const { uploadToIPFS } = await loadModule();
    vi.spyOn(axios, 'post').mockResolvedValue({ data: {} });
    const file = new File(['a'], 'a.txt');
    await expect(uploadToIPFS(file)).rejects.toThrow('IPFS upload failed: Invalid response from Pinata.');
  });

  it('throws when axios.post network error occurs', async () => {
    process.env.VITE_PINATA_JWT = 'TEST_JWT';
    const { uploadToIPFS } = await loadModule();
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network failure'));
    const file = new File([''], 'f.txt');
    await expect(uploadToIPFS(file)).rejects.toThrow('IPFS upload failed: Network failure');
  });

  it('uploads a data URL string successfully', async () => {
    process.env.VITE_PINATA_JWT = 'TEST_JWT';
    // Stub fetch to return a Blob
    globalThis.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['image'], { type: 'image/png' })),
    } as any);
    const { uploadToIPFS } = await loadModule();
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ data: { IpfsHash: 'DATAURLCID' } });
    const dataUrl = 'data:image/png;base64,AAAA';
    const result = await uploadToIPFS(dataUrl);
    expect(result).toBe('DATAURLCID');
    expect(postSpy).toHaveBeenCalled();
    postSpy.mockRestore();
  });

  it('uploads a remote URL string successfully', async () => {
    process.env.VITE_PINATA_JWT = 'TEST_JWT';
    // Stub axios.get to fetch Blob with JPEG content
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: new Blob(['remote'], { type: 'image/jpeg' }),
      headers: { 'content-type': 'image/jpeg' },
    } as any);
    const { uploadToIPFS } = await loadModule();
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ data: { IpfsHash: 'URLCID' } });
    const result = await uploadToIPFS('https://example.com/image.jpg');
    expect(result).toBe('URLCID');
    expect(axios.get).toHaveBeenCalledWith('https://example.com/image.jpg', { responseType: 'blob' });
    expect(postSpy).toHaveBeenCalled();
    axios.get.mockRestore();
    postSpy.mockRestore();
  });
});