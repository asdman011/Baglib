import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CandidateMatcher, TargetBookEvidence } from '../../../src/main/services/metadata/candidate-matcher';
import { BibliographicWork } from '../../../src/shared/types/bibliographic';

describe('CandidateMatcher & Ranking Engine Unit Tests', () => {
  const cleanCodeWork: BibliographicWork = {
    workId: 'OL12345W',
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    authors: ['Robert C. Martin'],
    firstPublishYear: 2008,
    editions: [
      {
        editionId: 'OL67890M',
        title: 'Clean Code',
        publisher: 'Prentice Hall',
        publishDate: '2008',
        isbn13: '9780132350884',
        isbn10: '0132350882',
        language: 'eng',
        sources: [{ provider: 'Open Library', providerId: 'OL67890M' }],
      },
      {
        editionId: 'OL99999M',
        title: 'Clean Code (Arabic Translation)',
        publisher: 'دار الكتب',
        publishDate: '2015',
        isbn13: '9789999999999',
        language: 'ara',
        sources: [{ provider: 'Open Library', providerId: 'OL99999M' }],
      },
    ],
  };

  const pragmaticWork: BibliographicWork = {
    workId: 'OL54321W',
    title: 'The Pragmatic Programmer: Your Journey to Mastery',
    authors: ['Andrew Hunt', 'David Thomas'],
    firstPublishYear: 1999,
    editions: [
      {
        editionId: 'OL11111M',
        title: 'The Pragmatic Programmer',
        publisher: 'Addison-Wesley',
        publishDate: '1999',
        isbn13: '9780201616224',
        isbn10: '020161622X',
        sources: [],
      },
    ],
  };

  it('ranks exact ISBN match with high certainty (+60 points and total score >= 70)', () => {
    const evidence: TargetBookEvidence = {
      isbn: '9780132350884',
      title: 'Clean Code',
    };

    const evaluations = CandidateMatcher.rankCandidates(evidence, [cleanCodeWork, pragmaticWork]);
    assert.strictEqual(evaluations.length, 2);
    assert.strictEqual(evaluations[0].candidate.workId, cleanCodeWork.workId);
    assert.strictEqual(evaluations[0].breakdown.isbnMatch, true);
    assert.strictEqual(evaluations[0].score >= 80, true);
    assert.strictEqual(evaluations[0].isCertainMatch, true);
    assert.strictEqual(evaluations[0].matchedEdition?.editionId, 'OL67890M');
  });

  it('discriminates between different editions of the same work', () => {
    // English edition evidence
    const enEvidence: TargetBookEvidence = {
      title: 'Clean Code',
      authors: ['Robert C. Martin'],
      publisher: 'Prentice Hall',
      publicationYear: 2008,
      language: 'eng',
    };
    const enEval = CandidateMatcher.evaluateCandidate(enEvidence, cleanCodeWork);
    assert.strictEqual(enEval.matchedEdition?.editionId, 'OL67890M');

    // Arabic translated edition evidence
    const arEvidence: TargetBookEvidence = {
      title: 'Clean Code',
      authors: ['Robert C. Martin'],
      publisher: 'دار الكتب',
      publicationYear: 2015,
      language: 'ara',
    };
    const arEval = CandidateMatcher.evaluateCandidate(arEvidence, cleanCodeWork);
    assert.strictEqual(arEval.matchedEdition?.editionId, 'OL99999M');
  });

  it('ranks title and author similarity when no ISBN is provided and discovers candidate ISBN', () => {
    const evidence: TargetBookEvidence = {
      title: 'The Pragmatic Programmer',
      authors: ['Andrew Hunt', 'David Thomas'],
    };

    const evaluations = CandidateMatcher.rankCandidates(evidence, [cleanCodeWork, pragmaticWork]);
    const topMatch = evaluations[0];
    assert.strictEqual(topMatch.candidate.workId, pragmaticWork.workId);
    assert.strictEqual(topMatch.breakdown.titleScore >= 25, true);
    assert.strictEqual(topMatch.breakdown.authorScore >= 15, true);
    assert.strictEqual(topMatch.score >= 50, true);
    // Discovers valid ISBN from the candidate edition
    assert.strictEqual(topMatch.discoveredIsbn, '9780201616224');
  });

  it('correctly matches Arabic titles across alef forms, tashkeel, and taa marbuta', () => {
    const arabicWork: BibliographicWork = {
      workId: 'OL-AR-1',
      title: 'مُقَدِّمَةُ ابْنِ خَلْدُون',
      authors: ['عبد الرحمن ابن خلدون'],
      firstPublishYear: 1377,
      editions: [
        {
          editionId: 'OL-AR-ED1',
          title: 'مقدمة ابن خلدون',
          publisher: 'دار الفكر',
          isbn13: '9789953250007',
          sources: [],
        },
      ],
    };

    // Query with normalized form, missing tashkeel, alternate alef/taa marbuta
    const queryEvidence: TargetBookEvidence = {
      title: 'مقدمه ابن خلدون',
      authors: ['ابن خلدون'],
    };

    const evalResult = CandidateMatcher.evaluateCandidate(queryEvidence, arabicWork);
    assert.strictEqual(evalResult.breakdown.titleScore >= 25, true);
    assert.strictEqual(evalResult.breakdown.authorScore >= 10, true);
    assert.strictEqual(evalResult.score >= 40, true);
    assert.strictEqual(evalResult.discoveredIsbn, '9789953250007');
  });

  it('classifies poor matches as rejected (<40 score)', () => {
    const evidence: TargetBookEvidence = {
      title: 'Advanced Quantum Physics',
      authors: ['Richard Feynman'],
    };

    const evalResult = CandidateMatcher.evaluateCandidate(evidence, cleanCodeWork);
    assert.strictEqual(evalResult.score < 40, true);
    assert.strictEqual(evalResult.isCertainMatch, false);
    assert.strictEqual(evalResult.isSuggestion, false);
  });
});
