// Metro resolves font files as assets; TypeScript needs to be told they are
// module-shaped so `require` of one type-checks.
declare module '*.otf' {
  const asset: number;
  export default asset;
}
