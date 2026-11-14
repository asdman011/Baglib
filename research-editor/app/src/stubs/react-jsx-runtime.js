// @blocksuite/icons ships React icon components next to its Lit icons. The editor only uses the Lit
// ones, so React is never bundled; calling a React icon by mistake fails loudly instead.
const unavailable = () => {
  throw new Error('React icons are not available in the BagLib research editor');
};
export const jsx = unavailable;
export const jsxs = unavailable;
export const Fragment = 'fragment';
