declare module 'js-mdict' {
  export class MDX {
    constructor(path: string);
    header?: { Title?: string; Description?: string };
    lookup(word: string): { definition?: string; keyText?: string } | undefined;
    associate(prefix: string): { keyText?: string }[];
  }
  export class MDD {
    constructor(path: string);
    locate(key: string): { definition?: Buffer | string } | undefined;
  }
}
