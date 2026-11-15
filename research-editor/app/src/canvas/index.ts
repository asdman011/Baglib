import type { ExtensionType } from '@blocksuite/affine/store';
import { SlashMenuConfigExtension } from '@blocksuite/affine/widgets/slash-menu';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { arrangeSourcesOnCanvas, undoArrangeSources } from './arrange';
import { insertResearchKanban } from './kanban';

export * from './arrange';
export * from './kanban';

function isArabic(): boolean {
  return document.documentElement.lang === 'ar' || document.documentElement.dir === 'rtl';
}

export function canvasExtensions(): ExtensionType[] {
  return [
    SlashMenuConfigExtension('baglib:canvas', {
      items: () => [
        {
          name: isArabic() ? 'ترتيب المصادر على اللوحة' : 'Arrange Sources on Canvas',
          description: isArabic() ? 'نقل المصادر إلى إطارات مصنفة على لوحة الرسم' : 'Organize sources into titled frames on canvas',
          searchAlias: ['arrange', 'canvas', 'ترتيب', 'لوحة', 'مصادر', 'sources'],
          group: '1_Canvas@0',
          action: ({ model }) => {
            const editor = document.querySelector('affine-editor-container') as TestAffineEditorContainer | null;
            if (editor) {
              arrangeSourcesOnCanvas(model.store, editor, { lang: isArabic() ? 'ar' : 'en' });
            }
          },
        },
        {
          name: isArabic() ? 'تراجع عن ترتيب المصادر' : 'Undo Source Arrangement',
          description: isArabic() ? 'إعادة المصادر إلى مستند واحد وإلغاء الإطارات' : 'Restore sources back into a single document note',
          searchAlias: ['undo-arrange', 'revert', 'تراجع', 'إلغاء الترتيب'],
          group: '1_Canvas@1',
          action: ({ model }) => {
            const editor = document.querySelector('affine-editor-container') as TestAffineEditorContainer | null;
            if (editor) {
              undoArrangeSources(model.store, editor);
            }
          },
        },
        {
          name: isArabic() ? 'لوحة مهام البحث' : 'Research Tasks Kanban',
          description: isArabic() ? 'إدراج لوحة كانبان لإدارة مهام البحث والتحقيق' : 'Insert a Kanban board for research and investigation tasks',
          searchAlias: ['kanban', 'tasks', 'مهام', 'كانبان'],
          group: '1_Canvas@2',
          action: ({ model }) => {
            const parent = model.store.getParent(model);
            insertResearchKanban(model.store, parent?.id, { lang: isArabic() ? 'ar' : 'en' });
          },
        },
      ],
    }),
  ];
}
