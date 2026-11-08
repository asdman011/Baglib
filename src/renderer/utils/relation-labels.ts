import { STUDY_RELATIONS, type StudyRelation } from '../../shared/study-notes';
import type { TranslationKey } from '../translations';

const keys: Record<StudyRelation, TranslationKey> = {
  supports: 'relationSupports', refutes: 'relationRefutes', explains: 'relationExplains', answers: 'relationAnswers',
  example: 'relationExample', contrasts: 'relationContrasts', questions: 'relationQuestions',
};

/** Names of the known typed relationships (decision S4) in the interface language, plus the word "relationship". */
export function relationLabels(t: (key: TranslationKey) => string): Record<StudyRelation, string> & { relation: string; none: string; menuHint: string } {
  return { ...Object.fromEntries(STUDY_RELATIONS.map(relation => [relation, t(keys[relation])])) as Record<StudyRelation, string>, relation: t('relationWord'), none: t('relationNone'), menuHint: t('relationMenuHint') };
}

/** A relationship's name: a known one translated, a coined one as the note wrote it. */
export function relationLabel(t: (key: TranslationKey) => string, relation: string): string {
  return relation in keys ? t(keys[relation as StudyRelation]) : relation;
}
