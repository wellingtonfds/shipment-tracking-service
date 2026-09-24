const excludedTrackingDtos = [
  'mark-shipment-delivered',
  'update-shipment-location',
  'update-shipment-status',
  'add-shipment-event',
  'create-shipment',
].map((name) => `src/infrastructure/http/tracking/dtos/${name}.dto.ts`);

const excludedTrackingDtoSet = new Set(excludedTrackingDtos);

export const coverageExclude = [
  'src/generated/**',
  'src/**/*.d.ts',
  'src/**/*.spec.ts',
  ...excludedTrackingDtos,
];

export function isMeasuredSourceFile(filePath: string): boolean {
  return (
    filePath.startsWith('src/') &&
    filePath.endsWith('.ts') &&
    !filePath.startsWith('src/generated/') &&
    !filePath.endsWith('.d.ts') &&
    !filePath.endsWith('.spec.ts') &&
    !excludedTrackingDtoSet.has(filePath)
  );
}
