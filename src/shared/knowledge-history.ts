export interface KnowledgeVersion { revision:number; action:string; createdAt:string; restoredFrom:number|null }
export interface VersionSnapshot { knowledge:Record<string,unknown>|null; details:Record<string,Record<string,unknown>|null>; annotation:Record<string,unknown>|null; tags:Record<string,unknown>[]; collections:Record<string,unknown>[]; comments:Record<string,unknown>[] }
export interface CapturedQuestion { id:string; text:string; status:'open'|'answered'|'dismissed'; source:string|null; sourcePresent:boolean }
export interface ReadingReflection { id:string; entryDate:string; mood:string|null; difficulty:number|null; rating:number|null; review:string; recommendations:string; lessons:string; revision:number }
export interface ReflectionInput { id?:string; workId:string; entryDate:string; mood:string; difficulty?:number; rating?:number; review:string; recommendations:string; lessons:string; expectedRevision?:number }
export interface BookReadingLog { title:string; source:'sessions'|'dwell'|'none'; sessions:{id:string; startedAt:string; endedAt:string; seconds:number; pages:number}[]; seconds:number; pages:number; secondsPerPage:number|null; firstRead:string|null; lastRead:string|null; progress:number|null; location:string|null; streak:number; skippedDays:number; completionDate:string|null; partial:boolean; reflections:ReadingReflection[];quotes:{id:string;text:string}[];actions:{id:string;title:string;status:string}[] }
export interface HistoryAPI {
  versions(id:string,before?:number):Promise<KnowledgeVersion[]>;
  snapshot(id:string,revision:number):Promise<VersionSnapshot>;
  restore(id:string,revision:number,expected:number,keepExistingAssociations:boolean):Promise<void>;
  trash():Promise<{id:string;title:string;revision:number}[]>;
  erase(id:string,removeManagedBackups:boolean):Promise<void>;
  questions():Promise<CapturedQuestion[]>;
  setQuestion(id:string,status:CapturedQuestion['status']):Promise<void>;
  captureEnabled():Promise<boolean>;
  setCapture(enabled:boolean):Promise<void>;
  conversionReport():Promise<{converted:number;issues:{key:string;reason:string}[];historyBytes?:number;historyVersions?:number}>;
  reading(workId:string):Promise<BookReadingLog>;
  saveReflection(input:ReflectionInput):Promise<void>;
  addAction(id:string,title:string):Promise<void>;
  addQuote(id:string,text:string):Promise<void>;
  addComment(id:string,text:string):Promise<void>;
}
