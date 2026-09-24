import { describe, expect, it, vi } from 'vitest';
import { TrackingController } from './tracking.controller.js';

describe('TrackingController', () => {
  it('delegates geocoding and presents the resolved coordinates', async () => {
    const geocodeAddress = {
      execute: vi.fn().mockResolvedValue({
        latitude: -23.561414,
        longitude: -46.655881,
      }),
    };
    const unused = {} as never;
    const controller = new TrackingController(
      unused,
      geocodeAddress as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );

    await expect(
      controller.geocode({ address: 'Avenida Paulista, 1578' }),
    ).resolves.toEqual({
      latitude: -23.561414,
      longitude: -46.655881,
    });
    expect(geocodeAddress.execute).toHaveBeenCalledExactlyOnceWith(
      'Avenida Paulista, 1578',
    );
  });
});
