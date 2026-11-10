'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Menu, type MenuItemProps } from '../ui/Menu';
import { NEW_OBJECT_ACTIONS } from './nav-model';
import { openStudyNote } from '../../utils/study-navigation';

export function runNewObjectAction(id: string, { setViewMode, setIsImportWizardOpen }: Pick<ReturnType<typeof useWorkspace>, 'setViewMode' | 'setIsImportWizardOpen'>) {
    switch (id) {
      case 'import-book':
        setIsImportWizardOpen(true);
        break;
      case 'add-physical-book':
        setViewMode('library');
        window.dispatchEvent(new CustomEvent('baglib:add-physical-book'));
        break;
      case 'new-note':
        openStudyNote({ content: '' });
        setViewMode('notes');
        break;
      case 'new-card':
        setViewMode('notes');
        window.dispatchEvent(new CustomEvent('baglib:new-card'));
        break;
      case 'new-task':
        setViewMode('planner');
        window.dispatchEvent(new CustomEvent('baglib:new-task'));
        break;
      case 'new-research':
        setViewMode('pathways');
        window.dispatchEvent(new CustomEvent('baglib:new-pathway'));
        break;
    }
}

export interface NewObjectMenuProps {
  collapsed?: boolean;
  className?: string;
  onActionComplete?: () => void;
}

export const NewObjectMenu: React.FC<NewObjectMenuProps> = ({
  collapsed = false,
  className = '',
  onActionComplete,
}) => {
  const { t, setViewMode, setIsImportWizardOpen } = useWorkspace();

  const handleAction = (id: string) => {
    runNewObjectAction(id, { setViewMode, setIsImportWizardOpen });
    onActionComplete?.();
  };

  const menuItems: MenuItemProps[] = NEW_OBJECT_ACTIONS.map((action) => {
    const Icon = action.icon;
    return {
      label: (
        <span className="flex items-center gap-2.5">
          <Icon className="w-4 h-4 shrink-0 text-primary-text" />
          <span>{t(action.labelKey)}</span>
        </span>
      ),
      onClick: () => handleAction(action.id),
    };
  });

  return (
    <div className={`relative ${className}`}>
      <Menu
        align="start"
        items={menuItems}
        trigger={(triggerProps) => (
          <button
            {...triggerProps}
            type="button"
            title={t('newObjectButton')}
            aria-label={t('newObjectButton')}
            className={`flex items-center justify-center font-bold text-xs rounded-xl bg-primary text-primary-contrast hover:bg-primary/90 shadow-md shadow-primary/20 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
              collapsed
                ? 'w-10 h-10 mx-auto p-0'
                : 'w-full py-2.5 px-3 gap-2'
            }`}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && (
              <span className="truncate leading-relaxed font-sans">{t('newObjectButton')}</span>
            )}
          </button>
        )}
      />
    </div>
  );
};
