import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { headRevision } from './knowledge-history';
import { boundedText, checkAnswer, invalid, MISTAKE_CATEGORIES, PRACTICE_RESULTS, validateQuestion, validateSourceRef, type AttemptQuery, type JudgeAttemptInput, type PracticeAttempt, type PracticeInput } from '../../shared/practice';
const SELECT = `SELECT p.id,p.knowledge_id AS knowledgeId,p.card_revision AS cardRevision,p.question_kind AS questionKind,
 p.answer_text AS answerText,p.result,p.check_method AS checkMethod,p.mistake_category AS mistakeCategory,
 p.confidence,p.duration_ms AS durationMs,p.source_ref AS sourceRef,p.context,p.created_at AS createdAt,
 CASE WHEN k.id IS NULL OR k.deleted_at IS NOT NULL THEN 1 ELSE 0 END AS deleted,
 CASE WHEN k.deleted_at IS NULL THEN COALESCE(json_extract(h.content, '$.details.card_detail.front'),c.front) ELSE NULL END AS question
 FROM practice_attempt p LEFT JOIN knowledge k ON k.id=p.knowledge_id LEFT JOIN card_detail c ON c.knowledge_id=k.id
 LEFT JOIN entity_version v ON v.entity_type='knowledge' AND v.entity_id=p.knowledge_id AND v.revision=p.card_revision
 LEFT JOIN history_blob h ON h.hash=v.snapshot_hash`;
const asAttempt = (row: unknown): PracticeAttempt => { const a = row as PracticeAttempt; return { ...a, deleted: !!a.deleted }; };
const validId = (id: unknown): id is string => boundedText(id, 500) && !!id;
function validateOutcome(result: unknown, mistake: unknown) {
    if (!PRACTICE_RESULTS.includes(result as never) || mistake !== undefined && (!MISTAKE_CATEGORIES.includes(mistake as never) || result === 'correct' || result === 'pending'))
        invalid();
}
export class PracticeService {
    constructor(private db: Database) { }
    record(input: PracticeInput): PracticeAttempt {
        if (!input || typeof input !== 'object' || !validId(input.knowledgeId) || !Number.isSafeInteger(input.cardRevision) || (input.cardRevision as number) < 0 || !boundedText(input.answerText) || !Number.isInteger(input.confidence) || input.confidence < 1 || input.confidence > 4 || input.durationMs !== undefined && (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 86400000) || input.context !== undefined && !['practice', 'section_check', 'challenge'].includes(input.context) || input.checkMethod !== undefined && !['auto', 'self', 'judgment'].includes(input.checkMethod))
            return invalid();
        return this.db.transaction(() => {
            const card = this.db.prepare(`SELECT c.* FROM card_detail c JOIN knowledge k ON k.id=c.knowledge_id WHERE k.id=? AND k.deleted_at IS NULL`).get(input.knowledgeId) as {
                question_kind: string;
                payload_json: string | null;
                source_ref: string | null;
            } | undefined;
            if (!card || headRevision(this.db, input.knowledgeId) !== input.cardRevision)
                throw new Error('review-changed');
            const { questionKind, payload } = validateQuestion(card.question_kind, card.payload_json ? JSON.parse(card.payload_json) : null);
            const automatic = questionKind === 'choice' || questionKind === 'numeric';
            const checkMethod = automatic ? 'auto' : input.checkMethod ?? 'self';
            if (automatic && input.checkMethod !== undefined && input.checkMethod !== 'auto' || !automatic && checkMethod === 'auto')
                return invalid();
            const result = automatic ? checkAnswer(questionKind, payload, input.answerText) : checkMethod === 'judgment' ? 'pending' : input.result;
            if (!automatic && checkMethod === 'self' && result === 'pending' || input.result !== undefined && automatic && input.result !== result || checkMethod === 'judgment' && input.result !== undefined && input.result !== 'pending')
                return invalid();
            validateOutcome(result, input.mistakeCategory);
            // Store the chosen option verbatim rather than exposing its internal index.
            const answerText = questionKind==='choice' && payload && 'options' in payload ? payload.options[Number(input.answerText)] : input.answerText;
            const id = randomUUID();
            // Legacy cards may use old coarse refs. Never silently turn them into precise evidence.
            let sourceRef: string | null = null;
            if (card.source_ref) {
                try {
                    sourceRef = validateSourceRef(card.source_ref);
                }
                catch {
                    sourceRef = null;
                }
            }
            this.db.prepare(`INSERT INTO practice_attempt(id,knowledge_id,card_revision,question_kind,answer_text,result,check_method,mistake_category,confidence,duration_ms,source_ref,context,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.knowledgeId, input.cardRevision || null, questionKind, answerText, result, checkMethod, input.mistakeCategory ?? null, input.confidence, input.durationMs ?? null, sourceRef, input.context ?? 'practice', new Date().toISOString());
            return this.get(id);
        })();
    }
    private get(id: string): PracticeAttempt { const row = this.db.prepare(`${SELECT} WHERE p.id=?`).get(id); if (!row)
        throw new Error('attempt-changed'); return asAttempt(row); }
    judge(input: JudgeAttemptInput): PracticeAttempt {
        if (!input || !validId(input.id) || input.result === 'pending' as string)
            return invalid();
        validateOutcome(input.result, input.mistakeCategory);
        return this.db.transaction(() => {
            const changed = this.db.prepare(`UPDATE practice_attempt SET result=?,mistake_category=? WHERE id=? AND result='pending' AND check_method='judgment'`).run(input.result, input.mistakeCategory ?? null, input.id);
            if (changed.changes !== 1)
                throw new Error('attempt-changed');
            return this.get(input.id);
        })();
    }
    list(query: AttemptQuery = {}): PracticeAttempt[] {
        if (!query || typeof query !== 'object' || query.knowledgeId !== undefined && !validId(query.knowledgeId) || query.offset !== undefined && (!Number.isSafeInteger(query.offset) || query.offset < 0 || query.offset > 1e7))
            return invalid();
        const sourceRef = query.sourceRef === undefined ? null : validateSourceRef(query.sourceRef);
        return this.db.prepare(`${SELECT} WHERE (? IS NULL OR p.knowledge_id=?) AND (? IS NULL OR p.source_ref=?) ORDER BY p.created_at DESC,p.rowid DESC LIMIT 100 OFFSET ?`).all(query.knowledgeId ?? null, query.knowledgeId ?? null, sourceRef, sourceRef, query.offset ?? 0).map(asAttempt);
    }
    clear(confirmed: boolean): void { if (confirmed !== true)
        return invalid(); this.db.prepare('DELETE FROM practice_attempt').run(); }
}
