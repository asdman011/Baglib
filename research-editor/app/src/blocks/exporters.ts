import type { ResearchSourceKind, ResearchSourceProps } from '../../../../src/shared/research-editor-sources';
type Ast = { type: string; [key: string]: unknown };
const text = (value: string): Ast => ({ type: 'text', value });
const element = (tagName: string, children: Ast[], properties: Record<string, unknown> = {}): Ast => ({ type: 'element', tagName, properties, children });
export function sourceMarkdownAst(kind: ResearchSourceKind, props: ResearchSourceProps): Ast {
  const lines = kind === 'verse' ? props.verses.map(v => [v.sadr, v.ajuz].filter(Boolean).join('  ***  ')) : props.text.split('\n');
  const children = lines.map(line => ({ type: 'paragraph', children: [text(kind === 'ayah' ? '﴿' + line + '﴾' : line)] }));
  children.push({ type: 'paragraph', children: [
    { type: 'link', url: props.url, children: [text(props.label)] },
    ...(props.grade ? [text(' · ' + props.grade)] : []),
  ] });
  return { type: 'blockquote', children };
}
export function sourceHtmlAst(kind: ResearchSourceKind, props: ResearchSourceProps): Ast {
  const content = kind === 'verse'
    ? element('table', [element('tbody', props.verses.map(v => element('tr', [element('td', [text(v.sadr)]), element('td', [text(v.ajuz)])])))], { dir: 'rtl', style: 'width:100%;table-layout:fixed;text-align:start' })
    : element('p', [text(kind === 'ayah' ? '﴿' + props.text + '﴾' : props.text)], { dir: 'auto', style: 'white-space:pre-wrap;line-height:2' });
  return element('blockquote', [content, element('p', [element('a', [text(props.label)], { href: props.url }), ...(props.grade ? [text(' · ' + props.grade)] : [])], { dir: 'auto' })], { dir: 'rtl', 'data-baglib-kind': kind });
}
