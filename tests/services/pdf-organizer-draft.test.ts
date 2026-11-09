import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ORGANIZER_DRAFT_PAGES,
  ORGANIZER_DRAFT_KEY_PREFIX,
  buildOrganizerDraft,
  isDefaultOrganizerPlan,
  organizerDraftKey,
  parseOrganizerDraft,
  resolveOrganizerDraftForSession,
  toPagePlanItems,
  type OrganizerDraftItemInput,
} from '../../src/shared/pdf-organizer-draft';

describe('pdf-organizer-draft', () => {
  it('constructs the settings key with pdf.organizerDraft.v1:<sourceId>', () => {
    assert.equal(ORGANIZER_DRAFT_KEY_PREFIX, 'pdf.organizerDraft.v1:');
    assert.equal(organizerDraftKey('src-123'), 'pdf.organizerDraft.v1:src-123');
    assert.equal(organizerDraftKey('  work-abc  '), 'pdf.organizerDraft.v1:work-abc');
    assert.equal(organizerDraftKey(''), null);
    assert.equal(organizerDraftKey(null), null);
  });

  it('detects when a page plan is identical to the unmodified default plan', () => {
    const unmodified: OrganizerDraftItemInput[] = [
      { id: 's-p-1', page: 1, rotation: 0 },
      { id: 's-p-2', page: 2, rotation: 0 },
      { id: 's-p-3', page: 3, rotation: 0 },
    ];
    assert.equal(isDefaultOrganizerPlan(unmodified, new Set(), 3), true);

    // Reordered
    assert.equal(
      isDefaultOrganizerPlan(
        [
          { id: 's-p-2', page: 2, rotation: 0 },
          { id: 's-p-1', page: 1, rotation: 0 },
          { id: 's-p-3', page: 3, rotation: 0 },
        ],
        new Set(),
        3,
      ),
      false,
    );

    // Rotated
    assert.equal(
      isDefaultOrganizerPlan(
        [
          { id: 's-p-1', page: 1, rotation: 90 },
          { id: 's-p-2', page: 2, rotation: 0 },
          { id: 's-p-3', page: 3, rotation: 0 },
        ],
        new Set(),
        3,
      ),
      false,
    );

    // Split boundary present
    assert.equal(isDefaultOrganizerPlan(unmodified, new Set(['s-p-1']), 3), false);

    // Blank page inserted
    assert.equal(
      isDefaultOrganizerPlan(
        [
          ...unmodified,
          { id: 'blank-1', blank: true, rotation: 0 },
        ],
        new Set(),
        3,
      ),
      false,
    );

    // Deleted page
    assert.equal(isDefaultOrganizerPlan(unmodified.slice(0, 2), new Set(), 3), false);
  });

  it('returns null when building a draft for an unmodified plan or oversized plan', () => {
    const items: OrganizerDraftItemInput[] = [
      { id: 'p1', page: 1, rotation: 0 },
      { id: 'p2', page: 2, rotation: 0 },
    ];
    assert.equal(
      buildOrganizerDraft({
        sourceId: 'src-1',
        sha256: 'a'.repeat(64),
        totalPages: 2,
        items,
        splitBoundaries: new Set(),
      }),
      null,
    );

    const oversized: OrganizerDraftItemInput[] = Array.from(
      { length: MAX_ORGANIZER_DRAFT_PAGES + 1 },
      (_, i) => ({ id: `p-${i + 1}`, page: (i % 2) + 1, rotation: 90 }),
    );
    assert.equal(
      buildOrganizerDraft({
        sourceId: 'src-1',
        sha256: 'a'.repeat(64),
        totalPages: 2,
        items: oversized,
        splitBoundaries: new Set(),
      }),
      null,
    );
  });

  it('serializes and parses a valid modified organizer draft with rotations, blanks, and splits', () => {
    const sha256 = 'b'.repeat(64);
    const items: OrganizerDraftItemInput[] = [
      { id: 'p2', page: 2, rotation: 90 },
      { id: 'blank-1', blank: true, rotation: 180 },
      { id: 'p1', page: 1, rotation: 0 },
    ];
    const draft = buildOrganizerDraft({
      sourceId: 'src-42',
      sha256,
      totalPages: 2,
      items,
      splitBoundaries: new Set(['p2']),
      now: 1700000000000,
    });
    assert.ok(draft);
    assert.equal(draft.version, 1);
    assert.equal(draft.sourceId, 'src-42');
    assert.equal(draft.sha256, sha256);
    assert.equal(draft.totalPages, 2);
    assert.equal(draft.updatedAt, 1700000000000);
    assert.deepEqual(draft.pages, [
      { page: 2, rotation: 90, splitAfter: true },
      { blank: true, rotation: 180 },
      { page: 1, rotation: 0 },
    ]);

    const parsed = parseOrganizerDraft(JSON.parse(JSON.stringify(draft)));
    assert.deepEqual(parsed, draft);

    const restored = toPagePlanItems(parsed!, { id: 'sess-9', filename: 'study.pdf' });
    assert.equal(restored.items.length, 3);
    assert.equal(restored.items[0].page, 2);
    assert.equal(restored.items[0].rotation, 90);
    assert.equal(restored.items[0].sessionId, 'sess-9');
    assert.equal(restored.items[0].filename, 'study.pdf');
    assert.equal(restored.splitBoundaries.has(restored.items[0].id), true);
    assert.equal(restored.items[1].blank, true);
    assert.equal(restored.items[1].rotation, 180);
    assert.equal(restored.items[2].page, 1);
    assert.equal(restored.items[2].rotation, 0);
  });

  it('discards a draft when the PDF file hash changed and never applies it', () => {
    const draft = buildOrganizerDraft({
      sourceId: 'src-42',
      sha256: '1'.repeat(64),
      totalPages: 2,
      items: [
        { id: 'p2', page: 2, rotation: 90 },
        { id: 'p1', page: 1, rotation: 0 },
      ],
      splitBoundaries: new Set(),
    });
    assert.ok(draft);

    const resolution = resolveOrganizerDraftForSession(draft, {
      id: 'sess-new',
      sourceId: 'src-42',
      filename: 'book.pdf',
      sha256: '2'.repeat(64),
      totalPages: 2,
    });
    assert.equal(resolution.status, 'discarded-changed');
  });

  it('restores a matching draft when sourceId, sha256, and page bounds are valid', () => {
    const sha256 = '3'.repeat(64);
    const draft = buildOrganizerDraft({
      sourceId: 'src-42',
      sha256,
      totalPages: 3,
      items: [
        { id: 'p3', page: 3, rotation: 270 },
        { id: 'p1', page: 1, rotation: 0 },
      ],
      splitBoundaries: new Set(['p3']),
    });
    const resolution = resolveOrganizerDraftForSession(draft, {
      id: 'sess-ok',
      sourceId: 'src-42',
      filename: 'book.pdf',
      sha256,
      totalPages: 3,
    });
    assert.equal(resolution.status, 'restored');
    if (resolution.status === 'restored') {
      assert.equal(resolution.items.length, 2);
      assert.equal(resolution.items[0].page, 3);
      assert.equal(resolution.items[0].rotation, 270);
      assert.equal(resolution.splitBoundaries.has(resolution.items[0].id), true);
      assert.equal(resolution.items[1].page, 1);
    }
  });

  it('rejects malformed or out-of-range drafts safely', () => {
    assert.equal(parseOrganizerDraft(null), null);
    assert.equal(parseOrganizerDraft({ version: 2 }), null);
    assert.equal(
      parseOrganizerDraft({
        version: 1,
        sourceId: 'src-1',
        sha256: '4'.repeat(64),
        totalPages: 2,
        updatedAt: Date.now(),
        pages: [{ page: 5, rotation: 0 }],
      }),
      null,
    );
  });
});
