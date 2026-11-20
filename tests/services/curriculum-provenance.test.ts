import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from '../helpers/test-db';
import { PathwayService, referenceText } from '../../src/main/services/pathways';
import { StudyNotesService } from '../../src/main/services/study-notes';
import { SqliteSettingsRepository } from '../../src/main/database/repositories/settings.repository';
import { SqliteKnowledgeRepository } from '../../src/main/database/repositories/knowledge.repository';
import { copyTemplate, templateFromPathway } from '../../src/shared/pathway-model';
import { validateTemplate } from '../../src/shared/pathways';
import { hasAiGeneratedMarker } from '../../src/shared/ai-principles';
import { exportableStudyNotes } from '../../src/shared/study-note-export';
import { translations } from '../../src/renderer/translations';

test('KEY-443: AI-generated curriculum templates keep aiGenerated across save, reload, and instantiation in ar and en', () => {
  const db = createTestDatabase();
  try {
    const service = new PathwayService(db);

    const aiTplInput = validateTemplate({
      name: 'منهج العقيدة',
      kind: 'curriculum',
      outline: '# التمهيد\nقراءة المتن',
      aiGenerated: true,
    });
    const savedAi = service.saveTemplate(aiTplInput);
    assert.equal(savedAi.aiGenerated, true);

    const userTplInput = validateTemplate({
      name: 'My Custom Curriculum',
      kind: 'curriculum',
      outline: '# Week 1\nRead chapter 1',
    });
    const savedUser = service.saveTemplate(userTplInput);
    assert.equal(savedUser.aiGenerated, undefined);

    // Reload templates from settings
    const reloaded = service.templates();
    const reloadedAi = reloaded.find(t => t.id === savedAi.id)!;
    const reloadedUser = reloaded.find(t => t.id === savedUser.id)!;
    assert.equal(reloadedAi.aiGenerated, true);
    assert.equal(reloadedUser.aiGenerated, undefined);

    // Copy into pathway in Arabic and English
    const arPathwayInput = copyTemplate(reloadedAi, undefined, translations.ar.aiGeneratedMarker);
    assert.equal(arPathwayInput.name, 'منهج العقيدة');
    assert.equal(arPathwayInput.description, translations.ar.aiGeneratedMarker);

    const enPathwayInput = copyTemplate(reloadedAi, undefined, translations.en.aiGeneratedMarker);
    assert.equal(enPathwayInput.description, translations.en.aiGeneratedMarker);

    const userPathwayInput = copyTemplate(reloadedUser, undefined, translations.en.aiGeneratedMarker);
    assert.equal(userPathwayInput.description, '');

    // Save pathway -> convert back to template -> preserves aiGenerated
    const createdAiPathway = service.save(arPathwayInput);
    const detailAi = service.get(createdAiPathway.id);
    const derivedAiTpl = templateFromPathway(detailAi);
    assert.equal(derivedAiTpl.aiGenerated, true);

    const createdUserPathway = service.save(userPathwayInput);
    const detailUser = service.get(createdUserPathway.id);
    const derivedUserTpl = templateFromPathway(detailUser);
    assert.equal(derivedUserTpl.aiGenerated, undefined);
  } finally {
    db.close();
  }
});

test('KEY-443: pathway export preserves AI-generated marker and never labels user-written pathways', () => {
  const db = createTestDatabase();
  try {
    const service = new PathwayService(db);
    const aiPathway = service.save({
      name: 'مسار الفقه',
      description: translations.ar.aiGeneratedMarker,
      kind: 'curriculum',
      outline: '# البداية\nدرس 1',
    });
    const userPathway = service.save({
      name: 'User Research',
      description: 'My own notes',
      kind: 'research',
      outline: '# Step 1\nRead',
    });

    const aiMd = service.exportText(aiPathway.id, 'markdown');
    assert.equal(aiMd.name, 'مسار الفقه');
    assert.ok(hasAiGeneratedMarker(aiMd.text));

    const aiBib = service.exportText(aiPathway.id, 'bibtex');
    assert.ok(hasAiGeneratedMarker(aiBib.text));

    const userMd = service.exportText(userPathway.id, 'markdown');
    assert.equal(hasAiGeneratedMarker(userMd.text), false);

    const userBib = service.exportText(userPathway.id, 'bibtex');
    assert.equal(hasAiGeneratedMarker(userBib.text), false);

    assert.equal(hasAiGeneratedMarker(referenceText('Plain', [], 'markdown')), false);
  } finally {
    db.close();
  }
});

test('KEY-443: older saved material keeps AI marker and ai-generated tag after reload and export', () => {
  const db = createTestDatabase();
  try {
    const settings = new SqliteSettingsRepository(db);
    const notes = new StudyNotesService(settings, db);
    const knowledgeRepo = new SqliteKnowledgeRepository(db);

    const aiNote = notes.save({
      title: 'ملخص الذكاء',
      content: `${translations.ar.aiGeneratedMarker}\n\nخلاصة الدرس.`,
      aliases: [],
      tags: ['ai-generated'],
    });
    const userNote = notes.save({
      title: 'ملاحظتي الشخصية',
      content: 'كتبت هذا بنفسي.',
      aliases: [],
      tags: ['fiqh'],
    });

    const reloaded = notes.list();
    const rAi = reloaded.find(n => n.id === aiNote.id)!;
    const rUser = reloaded.find(n => n.id === userNote.id)!;
    assert.ok(rAi.tags.includes('ai-generated'));
    assert.ok(hasAiGeneratedMarker(rAi.content));
    assert.equal(rUser.tags.includes('ai-generated'), false);
    assert.equal(hasAiGeneratedMarker(rUser.content), false);

    const exported = exportableStudyNotes(reloaded, knowledgeRepo.getAllKnowledge());
    const eAi = exported.find(n => n.id === aiNote.id)!;
    const eUser = exported.find(n => n.id === userNote.id)!;
    assert.ok(eAi.tags.includes('ai-generated'));
    assert.ok(hasAiGeneratedMarker(eAi.content));
    assert.equal(eUser.tags.includes('ai-generated'), false);
    assert.equal(hasAiGeneratedMarker(eUser.content), false);
  } finally {
    db.close();
  }
});
