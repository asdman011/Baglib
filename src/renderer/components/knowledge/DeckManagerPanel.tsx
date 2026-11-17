'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  FolderTree,
  Plus,
  Filter,
  Play,
  Settings2,
  Edit3,
  Trash2,
  Download,
  Eye,
  FolderInput,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { Button } from '../ui/Button';
import { DeckOptionsModal } from './DeckOptionsModal';
import { FilteredDeckModal } from './FilteredDeckModal';
import type { DeckTreeNode } from '../../../shared/srs';

export interface DeckManagerPanelProps {
  onStudyDeck?: (deckId: string) => void;
}

export const DeckManagerPanel: React.FC<DeckManagerPanelProps> = ({ onStudyDeck }) => {
  const { t, dir } = useWorkspace();
  const [tree, setTree] = useState<DeckTreeNode[]>([]);
  const [newDeckName, setNewDeckName] = useState('');
  const [parentDeckId, setParentDeckId] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveTargetParentId, setMoveTargetParentId] = useState<string>('');
  const [optionsDeck, setOptionsDeck] = useState<DeckTreeNode | null>(null);
  const [filteredModalOpen, setFilteredModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nodes = await window.electronAPI.knowledgeCards.deckTree();
      setTree(nodes);
      setError(null);
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    }
  }, [t]);

  useEffect(() => {
    const onChanged = () => void refresh();
    queueMicrotask(onChanged);
    window.addEventListener(KNOWLEDGE_CARD_SAVED, onChanged);
    window.addEventListener('baglib:srs-reviewed', onChanged);
    return () => {
      window.removeEventListener(KNOWLEDGE_CARD_SAVED, onChanged);
      window.removeEventListener('baglib:srs-reviewed', onChanged);
    };
  }, [refresh]);

  const flattenNormalDecks = (nodes: DeckTreeNode[]): DeckTreeNode[] => {
    const out: DeckTreeNode[] = [];
    const walk = (list: DeckTreeNode[]) => {
      for (const n of list) {
        if (n.kind === 'normal') {
          out.push(n);
          walk(n.children);
        }
      }
    };
    walk(nodes);
    return out;
  };

  const normalDecks = flattenNormalDecks(tree);

  const handleCreateDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeckName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await window.electronAPI.knowledgeCards.createDeck({
        name: newDeckName.trim(),
        parentId: parentDeckId || null,
      });
      setNewDeckName('');
      await refresh();
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleRenameSubmit = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await window.electronAPI.knowledgeCards.renameDeck(id, renameValue.trim());
      setRenamingId(null);
      await refresh();
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleMoveSubmit = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await window.electronAPI.knowledgeCards.moveDeck(id, moveTargetParentId || null);
      setMovingId(null);
      await refresh();
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDeck = async (node: DeckTreeNode) => {
    setBusy(true);
    setError(null);
    try {
      await window.electronAPI.knowledgeCards.deleteDeck(node.id, false);
      await refresh();
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch (err) {
      const msg = String((err as Error)?.message || '');
      if (msg.includes('deck-has-cards')) {
        if (window.confirm(t('deckDeleteConfirmCards'))) {
          try {
            await window.electronAPI.knowledgeCards.deleteDeck(node.id, true);
            await refresh();
            window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
          } catch (innerErr) {
            setError((innerErr as Error)?.message || t('knowledgeCardFailed'));
          }
        }
      } else {
        setError(msg || t('knowledgeCardFailed'));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUnburyDeck = async (deckId: string) => {
    setBusy(true);
    try {
      await window.electronAPI.knowledgeCards.unbury(deckId);
      await refresh();
      window.dispatchEvent(new CustomEvent('baglib:srs-reviewed'));
    } catch (err) {
      setError((err as Error)?.message || t('knowledgeCardFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleStudy = (deckId: string) => {
    if (onStudyDeck) {
      onStudyDeck(deckId);
    } else {
      window.dispatchEvent(new CustomEvent('baglib:start-review', { detail: { deckId } }));
    }
  };

  const renderNode = (node: DeckTreeNode, depth = 0): React.ReactNode => {
    const isBuiltIn = node.id === 'memorization';
    const displayName = isBuiltIn ? t('deckMemorizationBuiltIn') : node.name;

    return (
      <li
        key={node.id}
        data-deck-node={node.id}
        data-deck-fullname={node.fullName}
        className="space-y-1.5"
      >
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-subtle bg-canvas/70 px-3 py-2.5 hover:border-subtle/90 transition-colors"
          style={{ marginInlineStart: `${depth * 1.25}rem` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {node.kind === 'filtered' ? (
              <Filter className="size-4 text-amber-500 shrink-0" />
            ) : (
              <FolderTree className="size-4 text-primary-text shrink-0" />
            )}

            {renamingId === node.id ? (
              <div className="flex items-center gap-1.5">
                <input
                  dir="auto"
                  data-deck-rename-input={node.id}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void handleRenameSubmit(node.id);
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="rounded border border-subtle bg-surface px-2 py-1 text-xs text-main"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  data-deck-rename-save={node.id}
                  onClick={() => void handleRenameSubmit(node.id)}
                >
                  {t('save')}
                </Button>
              </div>
            ) : (
              <span dir="auto" className="font-semibold text-sm text-main truncate">
                {displayName}
              </span>
            )}

            <span
              className="text-xs px-2 py-0.5 rounded-full bg-surface border border-subtle tabular-nums text-muted"
              title={t('deckCountsBadge', {
                newCount: node.newCount,
                learningCount: node.learningCount,
                dueCount: node.dueCount,
              })}
            >
              <span data-deck-new={node.id} className="text-blue-600 dark:text-blue-400 font-semibold">
                {node.newCount}
              </span>
              {' / '}
              <span data-deck-learn={node.id} className="text-amber-600 dark:text-amber-400 font-semibold">
                {node.learningCount}
              </span>
              {' / '}
              <span data-deck-due={node.id} className="text-emerald-600 dark:text-emerald-400 font-semibold">
                {node.dueCount}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-deck-study={node.id}
              onClick={() => handleStudy(node.id)}
              icon={<Play className="size-3" />}
            >
              {t('deckStudyThis')}
            </Button>

            {node.buriedCount > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-deck-unbury={node.id}
                onClick={() => void handleUnburyDeck(node.id)}
                icon={<Eye className="size-3" />}
              >
                {t('deckUnburyBtn', { count: node.buriedCount })}
              </Button>
            )}

            {node.kind === 'normal' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-deck-options={node.id}
                onClick={() => setOptionsDeck(node)}
                title={t('deckOptionsBtn')}
                aria-label={t('deckOptionsBtn')}
                icon={<Settings2 className="size-3.5" />}
              />
            )}

            {node.kind === 'normal' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-deck-export={node.id}
                onClick={() => void window.electronAPI.knowledgeCards.exportDeck(node.id)}
                title={t('cardDeckExport')}
                aria-label={t('cardDeckExport')}
                icon={<Download className="size-3.5" />}
              />
            )}

            {!isBuiltIn && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-deck-rename={node.id}
                  onClick={() => {
                    setRenamingId(node.id);
                    setRenameValue(node.name);
                  }}
                  title={t('deckRenameBtn')}
                  aria-label={t('deckRenameBtn')}
                  icon={<Edit3 className="size-3.5" />}
                />
                {node.kind === 'normal' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    data-deck-move={node.id}
                    onClick={() => {
                      setMovingId(movingId === node.id ? null : node.id);
                      setMoveTargetParentId(node.parentId || '');
                    }}
                    title={t('deckMoveBtn')}
                    aria-label={t('deckMoveBtn')}
                    icon={<FolderInput className="size-3.5" />}
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-deck-delete={node.id}
                  onClick={() => void handleDeleteDeck(node)}
                  title={t('deckDeleteBtn')}
                  aria-label={t('deckDeleteBtn')}
                  icon={<Trash2 className="size-3.5 text-danger" />}
                />
              </>
            )}
          </div>
        </div>

        {movingId === node.id && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-lg border border-subtle bg-surface p-2 text-xs"
            style={{ marginInlineStart: `${(depth + 1) * 1.25}rem` }}
          >
            <span>{t('deckParentLabel')}:</span>
            <select
              data-deck-move-select={node.id}
              value={moveTargetParentId}
              onChange={e => setMoveTargetParentId(e.target.value)}
              className="rounded border border-subtle bg-canvas p-1 text-xs text-main"
            >
              <option value="">{t('deckTopLevel')}</option>
              {normalDecks
                .filter(d => d.id !== node.id && d.id !== 'memorization')
                .map(d => (
                  <option key={d.id} value={d.id}>
                    {d.fullName}
                  </option>
                ))}
            </select>
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-deck-move-save={node.id}
              onClick={() => void handleMoveSubmit(node.id)}
            >
              {t('save')}
            </Button>
          </div>
        )}

        {node.children.length > 0 && (
          <ul className="space-y-1.5">
            {node.children.map(child => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <section
      dir={dir}
      data-deck-manager
      className="rounded-xl border border-subtle bg-surface p-4 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FolderTree className="size-4 text-primary-text" />
          <h4 className="font-display font-bold text-sm text-main">{t('deckManagerTitle')}</h4>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-open-filtered-deck-btn
            onClick={() => setFilteredModalOpen(true)}
            icon={<Filter className="size-3.5" />}
          >
            {t('deckCreateFiltered')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-open-default-options-btn
            onClick={() => setOptionsDeck(tree[0] || null)}
            icon={<Settings2 className="size-3.5" />}
          >
            {t('deckOptionsBtn')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 border border-danger/30 p-2 text-xs text-danger">
          {error}
        </p>
      )}

      {/* Create Deck Form */}
      <form onSubmit={e => void handleCreateDeck(e)} className="flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[180px] flex flex-col gap-1 text-xs">
          <span className="text-muted">{t('cardDeckName')}</span>
          <input
            dir="auto"
            data-deck-create-name
            value={newDeckName}
            onChange={e => setNewDeckName(e.target.value)}
            placeholder={t('deckNamePlaceholder')}
            className="rounded-lg border border-subtle bg-canvas px-3 py-1.5 text-sm text-main"
          />
        </label>
        <label className="min-w-[160px] flex flex-col gap-1 text-xs">
          <span className="text-muted">{t('deckParentLabel')}</span>
          <select
            data-deck-create-parent
            value={parentDeckId}
            onChange={e => setParentDeckId(e.target.value)}
            className="rounded-lg border border-subtle bg-canvas px-2.5 py-1.5 text-sm text-main"
          >
            <option value="">{t('deckTopLevel')}</option>
            {normalDecks
              .filter(d => d.id !== 'memorization')
              .map(d => (
                <option key={d.id} value={d.id}>
                  {d.fullName}
                </option>
              ))}
          </select>
        </label>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={busy || !newDeckName.trim()}
          data-deck-create-btn
          icon={<Plus className="size-3.5" />}
        >
          {t('deckCreateNew')}
        </Button>
      </form>

      {/* Deck Tree List */}
      {tree.length > 0 && (
        <ul data-deck-tree-list className="space-y-2">
          {tree.map(node => renderNode(node, 0))}
        </ul>
      )}

      <DeckOptionsModal
        open={optionsDeck !== null}
        deck={optionsDeck}
        onClose={() => setOptionsDeck(null)}
        onSaved={() => {
          void refresh();
          window.dispatchEvent(new CustomEvent('baglib:srs-reviewed'));
        }}
      />

      <FilteredDeckModal
        open={filteredModalOpen}
        onClose={() => setFilteredModalOpen(false)}
        onCreated={deckId => {
          void refresh();
          handleStudy(deckId);
        }}
      />
    </section>
  );
};
