export function authoredQuestions(content: string): string[] {
  const prose = content.replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/gu,'\n')
    .replace(/`[^`\n]*`/gu,' ').replace(/^\s*>.*$/gmu,'')
    .replace(/https?:\/\/\S+|!?\[\[[\s\S]*?\]\]|\[[^\]]*\]\([^)]*\)/gu,' ')
    .replace(/«[^»]*»|“[^”]*”|"[^"\n]*"/gu,' ');
  return [...new Set((prose.match(/[^.!?؟\n]+[?؟]/gu)||[]).map(value=>value.trim()).filter(value=>value.length>2 && value.length<=2000))];
}
