export default {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [{ release: 'patch', type: 'revert' }],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      { preset: 'conventionalcommits' },
    ],
    [
      '@semantic-release/github',
      {
        failComment: false,
        releasedLabels: false,
        successComment: false,
      },
    ],
  ],
};
