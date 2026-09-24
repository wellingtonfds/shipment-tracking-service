import { describe, expect, it, vi } from 'vitest';
import { InvalidGeocodingAddressError } from '../../../domain/shipments/errors/invalid-geocoding-address.error.js';
import type { GeocodingPort } from '../ports/geocoding.port.js';
import { GeocodeAddressUseCase } from './geocode-address.use-case.js';

function harness() {
  const geocode = vi.fn().mockResolvedValue({
    latitude: -23.561414,
    longitude: -46.655881,
  });
  const geocoder: GeocodingPort = {
    geocode,
  };

  return {
    geocode,
    useCase: new GeocodeAddressUseCase(geocoder),
  };
}

describe('GeocodeAddressUseCase', () => {
  it('normalizes a valid address before geocoding it', async () => {
    const { geocode, useCase } = harness();

    await expect(
      useCase.execute('  Avenida Paulista, 1578  '),
    ).resolves.toEqual({
      latitude: -23.561414,
      longitude: -46.655881,
    });
    expect(geocode).toHaveBeenCalledExactlyOnceWith('Avenida Paulista, 1578');
  });

  it.each([
    ['fewer than 3 characters', ' x '],
    ['more than 255 characters', 'a'.repeat(256)],
  ])('rejects an address with %s', async (_description, address) => {
    const { geocode, useCase } = harness();

    await expect(useCase.execute(address)).rejects.toBeInstanceOf(
      InvalidGeocodingAddressError,
    );
    expect(geocode).not.toHaveBeenCalled();
  });
});
